# Módulo crm-conversaciones-agente (la Guía)

> Ubicación: `src/features/crm/` · Rutas que drenan la cola: `POST /api/webhooks/kapso`, `POST /api/crm/conversaciones/simular`, `POST /api/crm/conversaciones/[id]/vincular` · Bandeja del operador: [crm-conversaciones](./crm-conversaciones.md)

## Qué es

La Guía es el agente IA del CRM: responde **sola** las conversaciones en estado `ACTIVA_IA` por WhatsApp, apoyada en la base de conocimiento curada (`CRM_Conocimiento`) y la memoria episódica (Engram). Cuando no puede responder con confianza, **deriva**: envía un texto seguro y pasa la conversación a `REQUIERE_HUMANO`. No cierra tratos ni negocia condiciones — el cierre comercial es alcance de E4 (ver [Limitaciones](#limitaciones-de-e2)).

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
| `TOMADA_HUMANO` | **Toma implícita** — respuesta manual exitosa del operador desde `ACTIVA_IA` o `REQUIERE_HUMANO` (`responderConversacion`) |
| `PAUSADA` | Reservada (retención / kill switch) — sin flujo activo todavía |
| `CERRADA` | Cierre de la conversación; `responderConversacion` la rechaza con `CONVERSACION_CERRADA` |

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
- **Sin editor de KB**: `CRM_Conocimiento` es de solo lectura hasta E5 (el script de siembra es la única vía).
- **Sin tomar/devolver explícitos**: solo la toma implícita al responder manual; los botones llegan en E3.

## Observabilidad

- **`CRM_AgenteTareas`**: `estado` (PENDIENTE/PROCESANDO/COMPLETADA/FALLIDA), `intentos`, `error` (≤500 chars), `reclamadaEn` (timestamp de cooling), `procesadaEn`.
- **`CRM_Mensajes`**: columnas de auditoría RAG — `fuentes` (JSON `[{id, tipo:'KB', titulo}]`), `score` (`DECIMAL(4,3)`) y `modelo`; la bandeja las muestra en las burbujas IA.
- **Logs sin PII**: el motor y la cola loguean solo ids y códigos de error tipados — jamás cuerpos de mensajes.
