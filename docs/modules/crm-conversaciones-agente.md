# Módulo crm-conversaciones-agente (la Guía)

> Ubicación: `src/features/crm/` · Rutas que drenan la cola: `POST /api/webhooks/kapso`, `POST /api/crm/conversaciones/simular`, `POST /api/crm/conversaciones/[id]/vincular`, `POST /api/crm/conversaciones/[id]/indicacion` · Bandeja del operador: [crm-conversaciones](./crm-conversaciones.md)

## Qué es

La Guía es el agente IA del CRM: responde **sola** las conversaciones en estado `ACTIVA_IA` por WhatsApp, apoyada en la base de conocimiento curada (`CRM_Conocimiento`) y la memoria episódica (Engram). Cuando no puede responder con confianza, **deriva**: envía un texto seguro y pasa la conversación a `REQUIERE_HUMANO`. No cierra tratos ni negocia condiciones — el cierre comercial es alcance de E4 (ver [Limitaciones](#limitaciones-de-e2)). E3 agrega el **patrón de ayuda**: la derivación queda persistida como solicitud, el operador responde con una indicación y la Guía retoma (ver [Patrón de ayuda](#patrón-de-ayuda-e3)).

## Circuito

1. **Entra un mensaje** por el webhook `POST /api/webhooks/kapso` (HMAC-SHA256 sobre el raw body, dedup por `X-Idempotency-Key`) o por el simulador `POST /api/crm/conversaciones/simular` (solo con modo simulado activo).
2. **`procesarMensajeWhatsapp`** (use case compartido por ambas entradas): dedup → rutea a la conversación (teléfono E.164, luego `identificadorCanal`; nace `ACTIVA_IA` si hay exactamente un candidato, si no `PENDIENTE_VINCULACION`) → persiste el mensaje IN → **crea la tarea** en `CRM_AgenteTareas` (UNIQUE `conversacionId + mensajeId + tipo`, tipo `GENERAR_RESPUESTA`) — escritura rápida *awaited antes del ack* del webhook. La vinculación manual (E1) también encola la tarea por el último mensaje del cliente.
3. **Drenaje fire-and-forget** en la misma ruta + **barredor lazy de 20 s** como backstop (`iniciarBarredorTareas`: un intervalo por proceso, `unref`). El trabajo lento del LLM nunca corre en el path del ack.
4. **Motor** (`GenerarRespuestaAgenteUseCase`) — guardrails en orden: solo `ACTIVA_IA` → kill switch → horario local (overnight wrap si `hasta < desde`) → sin teléfono en la conversación → límite de intercambios (cuenta los mensajes IA de **todo** el hilo, no solo la ventana de historial). Cada guard es un no-op sin efectos secundarios: la tarea se reencola y el mensaje espera.
5. **Recall**: KB top-4 (`recuperarConocimiento`, ranker determinista) + memoria Engram (`contexto` + `buscar`, top-5 combinados) + historial del hilo (últimos 10 mensajes, oldest→newest).
6. **PII mask**: los teléfonos (rachas de ≥8 dígitos) se enmascaran como `[teléfono]` **solo en la entrada del LLM** (consulta + historial); los cuerpos persistidos, enviados y destilados quedan verbatim.
7. **LLM** (`GeneradorRespuestaPort`) → **decisión por umbral**: responde solo si `enScope` y ¬`requiereAyudaHumana` y `scoreConfianza ≥ umbral` (.60, inclusivo). Si no, envía el texto de escalado.
8. **Envío outbox-lite** (espeja `responderConversacion`): crea el mensaje OUT/IA `PENDIENTE` con las columnas de auditoría (`fuentes`/`score`/`modelo`) **antes** de enviar → envía WhatsApp → `ENVIADO`/`FALLIDO` → tick OUT de bandeja best-effort. El flip a `REQUIERE_HUMANO` ocurre **solo tras un envío exitoso**; un `FALLIDO_ENVIO` conserva `ACTIVA_IA` y el reintento reenvía la misma respuesta (no re-consulta el LLM).
9. **Destilación post-envío** (solo `RESPONDIDO` con empresa): destila el intercambio original → guarda observaciones tipadas con `operationId` determinista (`dest-<conv>-<msg>-<índice>`) → pinea si el modelo lo pide. Best-effort: un fallo jamás altera el resultado ya enviado.

### Mapeo de resultados en la cola (`procesarTareasAgente`)

| Resultado del motor | Transición de la tarea |
|---|---|
| `RESPONDIDO` \| `ESCALADO` \| `CONVERSACION_NO_ACTIVA_IA` | `COMPLETADA` — la tarea muere (re-ejecutar duplicaría envío) |
| `FUERA_DE_HORARIO` \| `AGENTE_DESHABILITADO` | reencolada — **sin** intento contado; espera el cooling de 60 s hasta que abra la ventana o se encienda el switch |
| `FALLIDO_ENVIO` \| throw del motor | `fallar` — intento contado; al 3.er intento `FALLIDA` (terminal), si no vuelve a `PENDIENTE` con cooling |

Un `PROCESANDO` reclamado hace más de 5 minutos se considera de un run muerto y se reclama (crash recovery). El claim es un `UPDATE … OUTPUT` atómico: state flip y filas devueltas son la misma operación.

## Estados de conversación

| Estado | Quién dispara la transición |
|---|---|
| `PENDIENTE_VINCULACION` | Nace así un mensaje nuevo con 0 o >1 contactos candidatos (E1); el operador vincula desde la bandeja |
| `ACTIVA_IA` | **Born IA** — nace así todo mensaje con exactamente 1 candidato, y toda vinculación manual |
| `REQUIERE_HUMANO` | **Escalado por el motor**, tras enviar el texto seguro (score < umbral, fuera de scope, pide humano, o límite de intercambios) |
| `TOMADA_HUMANO` | **Toma implícita** — respuesta manual exitosa del operador desde `ACTIVA_IA` o `REQUIERE_HUMANO` (`responderConversacion`); E3 agrega la toma **explícita** (`tomar`) y la devolución (`devolver` → `ACTIVA_IA`) |
| `PAUSADA` | Reservada (retención / kill switch) — sin flujo activo todavía |
| `CERRADA` | Cierre de la conversación; `responderConversacion` la rechaza con `CONVERSACION_CERRADA` |

## Patrón de ayuda (E3)

Cuando la Guía deriva, deja registro durable y el operador la **instruye** — nunca escribe la respuesta del cliente por ella.

### Solicitud de ayuda y tarjeta de indicación

Al escalar, el motor persiste una fila `CRM_SolicitudesAyuda` **PENDIENTE** (mejor-esfuerzo, nunca apilada): la `consulta` que derrotó al RAG, los `terminosBuscados` del prefilter y el `score` auditado. La bandeja la muestra en la **tarjeta de ayuda** al pie del hilo (`TarjetaAyuda`): consulta citada, términos como chips y el score, con **un** campo para la indicación.

`POST /api/crm/conversaciones/[id]/indicacion` (`aplicarIndicacion`) aplica la indicación en este orden: memoria best-effort primero (observación `indicacion_humana` del chat, **pineada** — enriquecimiento, nunca dependencia), luego tres escrituras CORE: hueco de KB `ABIERTO`, solicitud `RESUELTA` (con `indicacion` y `resueltaPor`) y tarea idempotente `RESPONDER_CON_INDICACION`. Tras aplicar, la ruta drena la cola fire-and-forget — la Guía retoma en el acto.

### Reanudación (`RESPONDER_CON_INDICACION`)

El worker relee la indicación desde la fila resuelta (fuente de verdad durable) y la pasa al motor. Semántica cerrada: la indicación **autoriza contenido, no ventanas de autonomía** — el gate scope/umbral se salta solo para esa respuesta, y una conversación que llegó como `REQUIERE_HUMANO` vuelve a `ACTIVA_IA` (retoma). El mensaje OUT lleva el marker `{tipo:'indicacion_humana'}` en su JSON de `fuentes` — la auditoría siempre muestra de dónde salió la autoridad.

### Ficha viva

La destilación de cada intercambio puede extraer datos de ficha (`cargo`, `trabajadores`, `sedes`) a `CRM_ExtraccionesFicha` con origen `IA` y sin confirmar. La ficha del hilo (`FichaContacto` + `GET …/ficha`) fusiona: **la columna canónica gana si está seteada**; si no, la última extracción. El operador confirma (`POST …/ficha` con `{campo, valor}`): cae fila `HUMANO` confirmada en la **misma** clave del upsert y promociona a la columna canónica — por eso **el confirmado humano siempre gana**: una re-extracción IA posterior nunca la pisa.

| Campo | Llave de la fila | Promoción al confirmar |
|---|---|---|
| `cargo` | `contactoId` | `CRM_Contactos.cargo` |
| `trabajadores` | `empresaId` | `CRM_Empresas.cantidadTrabajadores` (entero ≥ 1) |
| `sedes` | `empresaId` | ninguna — solo ficha (diseño cerrado) |

### Memorias del chat

`GET|POST /api/crm/conversaciones/[id]/memorias` — el panel del operador (`MemoriasPanel`) lista TODAS las observaciones del proyecto Engram de la empresa (sesión incluida, para acotar por conversación) y permite **pinear**, **eliminar** (soft-delete, scope por proyecto) y **guardar** manual (observación nueva). Editar una memoria = eliminar + guardar — no hay update in-place por diseño.

### Ajustes por chat

`GET|POST /api/crm/conversaciones/[id]/ajustes` — el único setting por conversación es `memoriaActiva` (toggle de privacidad): en `false` la Guía no lee ni escribe memoria Engram para ese hilo (ni recall ni destilación); el recall de KB queda intacto. El GET también devuelve chips de solo-lectura con la config **pública** del agente (umbral, máx. intercambios, horario) — nada secreto cruza.

### Tomar / devolver / escalar

- **tomar** (`POST …/tomar`): `ACTIVA_IA | REQUIERE_HUMANO` → `TOMADA_HUMANO`, con `asignadaA` = login del operador (no el sub opaco) y `modo` `HUMANO`.
- **devolver** (`POST …/devolver`): → `ACTIVA_IA` + `asignadaA` NULL + `modo` `IA`. Si el último mensaje IN quedó **sin** respuesta posterior, se re-encola una tarea `GENERAR_RESPUESTA` idempotente — un IN ya respondido no se re-encola jamás.
- **escalar** (`POST …/escalar` con `{usuarioId}`): reasigna la conversación tomada a **otro** operador (queda `TOMADA_HUMANO`); el target debe ser un usuario asignable con permiso `crm_conversaciones`.

### Notificaciones

`GET /api/crm/conversaciones/notificaciones` — conteos (`requiereAyuda`, `pendienteVinculacion`, `total`, `ultimaActividad`) en un solo roundtrip + detalle top-5 de escaladas (etiqueta + consulta pendiente). El Sidebar hace poll cada 15 s (pestaña oculta no polea; un fallo silencioso conserva el último resumen): badge sobre el ícono, **toasts de una sola vez por solicitud** («La Guía necesita tu ayuda · <etiqueta>», ~80 chars de la consulta) y deep-link «Ver conversación» que abre la bandeja en ese hilo.

### Huecos de conocimiento (KB)

Cada indicación aplicada deja una fila `CRM_ConocimientoHuecos` `ABIERTO`: la consulta que la KB no pudo responder + los términos buscados, enlazada a la solicitud (`origenSolicitudId`, sobrevive con SET NULL). Es la **cola del curador**: el admin de triage llega en E5 (curar → nueva entrada `CRM_Conocimiento`; descartar).

### Rutas nuevas de E3

| Método y ruta | Uso |
|---|---|
| `GET /api/crm/conversaciones/notificaciones` | Resumen + detalle top-5 para badge y toasts |
| `POST /api/crm/conversaciones/[id]/indicacion` | Aplicar la indicación a la solicitud pendiente |
| `POST /api/crm/conversaciones/[id]/tomar` | Toma explícita (asignadaA = login) |
| `POST /api/crm/conversaciones/[id]/devolver` | Devolución a la Guía (+ re-encola si hay IN sin respuesta) |
| `POST /api/crm/conversaciones/[id]/escalar` | Reasignar a otro operador |
| `GET \| POST /api/crm/conversaciones/[id]/ficha` | Leer la ficha fusionada / confirmar un dato (promociona) |
| `GET \| POST /api/crm/conversaciones/[id]/memorias` | Listar / gestionar (pinear, eliminar, guardar) |
| `GET \| POST /api/crm/conversaciones/[id]/ajustes` | Leer ajustes+chips / toggle `memoriaActiva` |

Todas piden permiso `crm_conversaciones` y devuelven `CrmErrorResponse` tipado (404 conversación, 400 body, 409 estado/solicitud).

### Esquema que agrega E3

| Tabla / columna | Uso |
|---|---|
| `CRM_SolicitudesAyuda` | Solicitud por escalado: `PENDIENTE` → `RESUELTA` (indicación + resueltaPor) |
| `CRM_ConocimientoHuecos` | Hueco de KB `ABIERTO` → `CURADO`/`DESCARTADO` (E5) |
| `CRM_ExtraccionesFicha` | Filas de ficha por campo, origen `IA`/`HUMANO` + `confirmado` |
| `CRM_Conversaciones.asignadaA` / `.modo` / `.memoriaActiva` | Ciclo humano y toggle de privacidad |

E3 **no agrega variables de entorno**: reutiliza `ENGRAM_CRM_*`, los guardrails del agente y `AGENTE_TEXTO_ESCALADO` (el texto seguro que acompaña cada solicitud).

## Configuración

### LLM (`GeneradorRespuestaPort`)

| Variable | Default | Semántica |
|---|---|---|
| `LLM_API_KEY` | — | **Selector único**: seteada → adaptador OpenAI-compatible en cualquier entorno; vacía + dev → generador simulado (warn 1×/proceso); vacía + prod → **fail-closed** (`GENERADOR_NO_CONFIGURADA`: producción nunca simula) |
| `LLM_BASE_URL` | `https://api.z.ai/api/paas/v4/` | Endpoint OpenAI-compatible (Z.ai) |
| `LLM_MODELO` | `glm-5.3-flash` | Modelo bloqueado por decisión E2 (E4 lo mueve a DB + admin UI) |
| `LLM_TIMEOUT_MS` | `30000` | Timeout por llamada |
| `LLM_MAX_TOKENS` | `700` | Tope de tokens de la respuesta |

### Guardrails del agente (todos opcionales; valor inválido → default, nunca crash)

| Variable | Default | Semántica |
|---|---|---|
| `AGENTE_HABILITADO` | ON | Kill switch global. Solo `1`/`true`/`si`/`yes` (case-insensitive) enciende; **cualquier otro valor apaga** (falla hacia humano) |
| `AGENTE_UMBRAL_CONF` | `0.60` | Score mínimo para responder; clamp a (0, 1] |
| `AGENTE_MAX_INTERCAMBIOS` | `8` | Máx. respuestas IA en UNA conversación antes de escalar (≥1) |
| `AGENTE_HORARIO_DESDE` / `AGENTE_HORARIO_HASTA` | `8` / `18` | Ventana de respuesta en hora local del servidor; `hasta < desde` = ventana overnight |
| `AGENTE_TEXTO_ESCALADO` | texto seguro por defecto | Se envía en cada escalado |

### Memoria (`MemoriaConversacionPort`)

| Variable | Default | Semántica |
|---|---|---|
| `ENGRAM_CRM_URL` | — | **Selector único**: seteada → adapter HTTP en cualquier entorno (instancia dedicada, típicamente `http://127.0.0.1:7438`); vacía + dev → memoria simulada; vacía + prod → **fail-closed** (`MEMORIA_NO_CONFIGURADA`) |
| `ENGRAM_CRM_TOKEN` | — | Bearer opcional |
| `ENGRAM_CRM_TIMEOUT_MS` | `5000` | Timeout por llamada HTTP |

## Base de conocimiento (KB)

Tabla `dbo.CRM_Conocimiento` (base `HOLOMEDIC`, pool compartido del CRM):

| Columna | Tipo | Uso |
|---|---|---|
| `titulo` / `contenido` | NVARCHAR | El fragmento que la Guía cita (español, client-facing) |
| `etiquetas` | CSV | Tags de tópico; la etiqueta `semilla` marca las filas del script de siembra |
| `vigenciaDesde` / `vigenciaHasta` | DATETIME2 NULL | Ventana inclusiva — el ranker descarta lo vencido |
| `activo` | BIT | `0` = fuera del recall (el repositorio también filtra) |

Siembra — `scripts/crm-sembrar-conocimiento.mjs` (12 entradas con hechos reales extraídos de los docs del repo; nada inventado):

```bash
node scripts/crm-sembrar-conocimiento.mjs           # DRY-RUN default: imprime el plan, no escribe (perfil EXPLORADOR_DATOS)
node scripts/crm-sembrar-conocimiento.mjs --apply   # inserta SOLO las faltantes (WHERE NOT EXISTS por titulo — idempotente; perfil DB_*)
node scripts/crm-sembrar-conocimiento.mjs --limpiar # borra SOLO filas con la etiqueta 'semilla' (match exacto de elemento CSV)
```

Ranking (`recuperarConocimiento`): prefilter LIKE **por términos** (NFD, >2 chars, máx 8, OR sobre titulo/contenido — una frase completa nunca matchea) → puntuación pura: cada término de la consulta suma ×2 si aparece en `titulo` y ×1 si aparece en `contenido`, dividido por el total de términos (stopwords ES eliminadas); se descartan vigencia vencida, `activo=0` y puntaje 0; orden `puntaje DESC, id ASC`; top-4 al prompt.

## Memoria de conversación (Engram)

- **Instancia dedicada** en el puerto `:7438` (`ENGRAM_CRM_URL`); aislamiento por proyecto `crm-emp-<empresaId>` — una empresa nunca ve las memorias de otra.
- **Niveles**: sesión `chat-<conversacionId>` (nivel chat) y sesión fija `empresa` (nivel empresa). La destilación guarda `acuerdo`/`compromiso` a nivel empresa; todo lo demás a nivel chat.
- **API consumida**: `GET /context` (solo el bloque pineados) + `GET /search` para el recall; `save` con `operation_id` idempotente + poll de commit; `PUT /observations/{id}/pin`. Un 404 `unknown_project` es el estado vacío normal de una empresa nueva, no un error.
- **Retención**: 12 meses — el job de purga llega en E5.

## Cerebro de calidad (E4)

### Prompt v2 modular y versionado (`application/prompt/promptGeneracion.ts`)

El armado del prompt es dueño de la capa aplicación — los adapters LLM son transporte puro. `armarPromptGeneracion(entrada)` compone system base (persona La Guía/Holomedic, voseo cálido, formato WhatsApp, anti-invención dura, cierre con próximo paso) + bloques condicionales (indicación → PRIORIDAD MÁXIMA, contactoNuevo → PRESENTACIÓN INICIAL, KB hit → fragmentos `[id N]` / miss → FUERA DE COBERTURA, memorias vs primera interacción) sobre el user de secciones etiquetadas (INDICACIÓN → CONSULTA → SINTESIS DEL HILO → HISTORIAL → CONOCIMIENTO → MEMORIAS → CONTACTO NUEVO).

- `PROMPT_VERSION='v2'` se estampa en `CRM_Mensajes.promptVersion` junto a score/modelo/fuentes — cada iteración de prompt queda auditada y comparable en el hilo.
- Contrato JSON de generación: `{texto, scoreConfianza, fidelidad, enScope, requiereAyudaHumana, idsConocimiento}` — `fidelidad` es el self-score de apego a fuentes (clamp [0,1]; ausente → NULL = sin dato, nunca 0).
- Destilación v2: observaciones autocontenidas (con sujeto y contexto), títulos accionables ≤8 palabras, `pinear` solo acuerdos/compromisos que obligan a una parte, jamás datos sensibles, montos/fechas literales.

### Recall híbrido de memorias (`rankearMemorias`)

`puntaje = 2.0·léxico + frescura·exp(−días/30) + nivel(chat +0.5) + 2.0 pineado` sobre candidatos de `buscar` (top-10), con dedup (título normalizado o contención de contenido; pineado siempre sobrevive) y presupuestos por bloque `MAX_MEMORIAS_PINEADOS=3 / EMPRESA=3 / CHAT=5`. La síntesis del hilo (`sintetizarHilo`) agrega memoria de trabajo determinista (intercambios, temas tratados según memorias de chat, último pedido del cliente) sin llamada LLM extra.

### Calidad medible

- **Marcar respuesta deficiente** (1 click en la burbuja IA): `POST /api/crm/conversaciones/[id]/deficiente {mensajeId}` → valida emisor IA → hueco en `CRM_ConocimientoHuecos` con `origenMensajeId` + `deficiente=1` en el mensaje (409 si ya estaba). La curación de la cola sigue en E6.
- **Panel `/crm/calidad`** (permiso `crm_conversaciones`): respuestas IA, score promedio, fidelidad promedio, % con fuentes, marcadas deficiente, solicitudes de ayuda, huecos abiertos, intervenciones humanas — ventana fija 30 días; NULL = sin dato.

### Información subible (`/admin/crm/conocimiento`, permiso `crm_conocimiento`)

Pegar texto o subir PDF/TXT/DOCX (≤5 MB) → extracción en upload (`pdf-parse`/`mammoth`) → `CRM_IngestasConocimiento` PENDIENTE → tarea `INGESTAR_CONOCIMIENTO` en la cola del agente (dedup `conversacionId NULL + mensajeId=ingestaId`; drenaje inmediato + barredor 20s backstop) → chunking por párrafos (~900 chars, solape ~150, tope 200) → entradas en `CRM_Conocimiento` con `origen='SUBIDO'`, etiquetas sugeridas + `subido`, vigencia heredada → mismo RAG, uso inmediato. Estado en vivo por polling (5s) mientras hay ingestas en curso. El editor CRUD completo llega en E6.

## Golden set del prompt (E4)

`src/features/crm/application/prompt/goldenSet/` es la vara para medir cada iteración del prompt: un corpus de 13 preguntas típicas de Holomedic (`casos.ts`, etiquetado con `PROMPT_GOLDEN_VERSION`) + un evaluador determinista puro (`evaluarRespuestaGolden.ts`) que puntúa cada respuesta por cobertura de términos clave (`termino_faltante`), no-invención — nada de precios/cifras que no estén en las fuentes del caso (`dato_inventado`, `termino_prohibido`, con whitelist de los números que las propias fuentes ya traen) —, formato WhatsApp (`formato_*`, `largo_excesivo`) y presencia (`respuesta_vacia`, `respuesta_corta`). Dos niveles de ejecución:

- **CI (siempre)**: `pnpm vitest run src/features/crm/application/prompt/__tests__/goldenSet.test.ts` — cada caso contra el builder v2 (verifica que la entrada arma exactamente los bloques condicionales esperados) y contra el generador simulado (determinista), sin red ni API key. El evaluador debe dar **cero falsos positivos** con el simulado: si un caso falla legítimamente, se corrige el CASO o la precisión del evaluador, jamás el comportamiento del simulado.
- **Live (opcional, no falla en CI)**: con `E4_GOLDEN_LIVE=1` **y** `LLM_API_KEY` seteadas, la misma suite corre los casos contra el LLM real vía `crearGeneradorRespuesta()` (config del env, igual que la factory) e imprime la tabla `resumenGolden` al final. Sin saldo (hoy, Z.ai) la suite se saltea en silencio.

Regla de iteración: **cada cambio de prompt = bump de `PROMPT_VERSION` (y de `PROMPT_GOLDEN_VERSION` si cambia el corpus o sus expectativas) + golden en verde antes de commitear.** Un caso fallido señala la edición: `termino_faltante` → el prompt no está logrando citar la fuente esperada (revisá el bloque condicional o la regla de uso del CONOCIMIENTO); `dato_inventado`/`termino_prohibido` → la respuesta promete datos sin respaldo (endurecé la regla anti-invención); `formato_*`/`largo_excesivo` → violación del contrato WhatsApp; `respuesta_corta`/`respuesta_vacia` → la Guía dejó de responder (o escaló una cortesía). Los fragmentos de KB y memorias de los casos son fixtures autocontenidos escritos a mano — el golden set nunca lee la base.

## Demo (DoD de E2)

1. `pnpm dev` y sembrar la KB: `node scripts/crm-sembrar-conocimiento.mjs` (dry-run) → `--apply`.
2. En `/crm/conversaciones`, abrir el **simulador** (tarjeta solo-dev) y enviar un mensaje con el teléfono de un contacto con candidato único → la conversación nace `ACTIVA_IA`.
3. Pregunta cubierta — p. ej. «¿en cuánto tiempo están listos los certificados médicos?» → burbuja IA con **score y fuentes** (títulos de KB) en el hilo.
4. Pregunta fuera de scope — p. ej. «¿lloverá mañana?» → texto de escalado + conversación pasa a `REQUIERE_HUMANO`.
5. Memorias visibles: `curl 'http://127.0.0.1:7438/search?project=crm-emp-<empresaId>&q=certificados&limit=5'` (o la TUI de Engram).

> **Horario**: fuera de la ventana 8–18 la tarea queda **reencolada** (cooling de 60 s) y la conversación no se toca. Para una demo nocturna, seteá `AGENTE_HORARIO_DESDE`/`AGENTE_HORARIO_HASTA` en `.env.local`.

## Limitaciones de E2

- **LLM simulado sin key**: determinista — cita el mejor fragmento KB; no conversa de verdad.
- **Score del simulado fijo en `.8`** (y `.1` al escalar sin recall): no mide confianza real.
- **Horario duro**: la ventana es muro, no soft limit.
- **Sin editor de KB**: `CRM_Conocimiento` es de solo lectura hasta E5 (el script de siembra es la única vía); los huecos `ABIERTO` de E3 esperan esa cola.
- ~~**Sin tomar/devolver explícitos**~~: resuelto en E3 — `tomar`/`devolver`/`escalar` con `asignadaA`.

## Observabilidad

- **`CRM_AgenteTareas`**: `estado` (PENDIENTE/PROCESANDO/COMPLETADA/FALLIDA), `intentos`, `error` (≤500 chars), `reclamadaEn` (timestamp de cooling), `procesadaEn`.
- **`CRM_Mensajes`**: columnas de auditoría RAG — `fuentes` (JSON `[{id, tipo:'KB', titulo}]`), `score` (`DECIMAL(4,3)`) y `modelo`; la bandeja las muestra en las burbujas IA.
- **Logs sin PII**: el motor y la cola loguean solo ids y códigos de error tipados — jamás cuerpos de mensajes.
