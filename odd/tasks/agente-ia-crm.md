# Feature: agente-ia-crm — La Guía (agente IA de conversaciones del CRM)

> Estado: **E1 completo y revisado (promovido a develop) · E2 en curso** · Creado: 2026-10-10
> Registro maestro de diseño: Engram tópico `agente-ia-crm` (obs 825, revisiones al día).
> Prototipos visuales: `http://172.16.10.20:1226/` (index · mockup · flujo-guia · configuracion).

## Objetivo

Cuando entre un chat (WhatsApp vía Kapso primero; email después), **la Guía lo gestiona de punta a punta**: responde sola con su memoria (Engram dedicado) y su conocimiento (KB en HOLOMEDIC), **pide ayuda al humano solo si hace falta** (notificación + indicación, no respuesta por ella), y si no necesita ayuda **cierra el trato ella sola** — registra resultado, avanza etapa y convierte tipo. Todo auditado; el humano nunca pierde visibilidad ni control (kill switch global).

## Decisiones bloqueadas (resumen)

1. Canal WhatsApp vía Kapso; webhook público `/api/webhooks/kapso` (HMAC-SHA256 + X-Idempotency-Key, ack <10s, proceso async). SDK `@kapso/whatsapp-cloud-api`.
2. Autonomía total con guardrails: scope solo-KB, umbral confianza .60, límite de intercambios, horario 8–18h, kill switch, auditoría (fuentes+score+modelo por mensaje).
3. Conocimiento en 2 capas: KB curada en **base HOLOMEDIC** (`CRM_Conocimiento`) + memoria episódica Engram (instancia dedicada `:7438`, 2 niveles `chat:<id>` + `empresa:<id>`, observaciones destiladas tipadas, retención 12 meses).
4. **Persistencia 100% en base HOLOMEDIC** (patrón `getCrmDb()` → `getHolomedicPool()`, migraciones idempotentes en `migrate.ts`). Nada en SIGLA.
5. UX: bandeja estilo WhatsApp (buscador | hilo | columna derecha con ficha que la Guía llena sola + memorias + settings del chat). Patrón de ayuda: notificación → tarjeta "¿cómo sigo?" → indicación humana → se guarda y la Guía continúa → humano vuelve a su chat con borrador intacto.
6. Estados conversación: ACTIVA_IA / REQUIERE_HUMANO / TOMADA_HUMANO / PAUSADA / PENDIENTE_VINCULACION / CERRADA. Permiso nuevo `crm_conversaciones` + rutas en `RUTAS_PROTEGIDAS`.

---

## Los 5 entregables

Cada entregable es un hito **demoable de punta a punta** y cierra con work-unit commits (Conventional Commits) sobre feature branch desde `develop`. Test-first en todo cambio de comportamiento (tests por archivo modificado, nunca globales en modo apply).

### E1 — Canal y conversaciones (la fundación)

**Qué**: todo el circuito del canal sin agente. La mesa humana ya puede operar.

- Migración HOLOMEDIC: `CRM_Conversaciones` (empresaId, contactoId, canal, estado, asignadaA, modo) y `CRM_Mensajes` (conversacionId, direccion IN/OUT, emisor CLIENTE/IA/HUMANO, cuerpo, canal, idempotenciaKey, creadoEn).
- `POST /api/webhooks/kapso`: ruta pública (fuera del prefix `/api/crm`), verificación firma HMAC con raw body, deduplicación por `X-Idempotency-Key`, ack inmediato + procesamiento async.
- Vinculación por teléfono → `CRM_Contactos` (normalización E.164); sin match → `PENDIENTE_VINCULACION` + vista de vinculación (crear contacto / asociar existente).
- Vista `/crm/conversaciones`: lista estilo WhatsApp con buscador en vivo (empresa/contacto/teléfono), hilo central, respuesta manual que sale por Kapso (`EnviadorWhatsappCrmPort` + adapter).
- Permiso `crm_conversaciones` en `PERMISOS` + `RUTAS_PROTEGIDAS`.

**Demo (DoD)**: se escribe al WhatsApp real de la cuenta Kapso → aparece en la bandeja vinculado → un humano responde a mano → el cliente lo recibe → reproducir no duplica mensajes (idempotencia) → firma inválida rechazada (401/403).

**Simulación Kapso (agregado 2026-10-11)**: Kapso real aún no está configurado (puede demorar días). E1 se desarrolla y demuestra **mock-first**, sin cambiar el diseño:
- `EnviadorWhatsappCrmPort` con DOS adapters: Kapso real (`@kapso/whatsapp-cloud-api`) y `SimuladorWhatsappCrm` (envío simulado con wamid sintético `sim.*`). Selección por `KAPSO_MODO` (`real`|`simulado`, default `simulado`).
- Simulador de entrada (solo con `KAPSO_MODO=simulado`): genera eventos `whatsapp.message.received` y ejecuta el mismo use case del webhook (sin HTTP propio), permitiendo probar ingesta → vinculación → bandeja → respuesta manual sin Kapso.
- El webhook `/api/webhooks/kapso` se implementa igual (HMAC + idempotencia sobre raw body) y se testea con fixtures firmadas; al llegar las credenciales solo se setean env vars.
- DoD alternativo (hasta tener Kapso): simulador emite mensaje firmado → bandeja → respuesta manual → mensaje OUT registrado → replay no duplica → firma inválida 401.

### E2 — La Guía responde: memoria + RAG + autonomía básica

**Qué**: el agente entra en escena. Responde sola o deriva; nada de cierre de trato aún.

- Motor de respuesta (worker async): recall acotado → `GET /context` (pineados) + `GET /search` en `chat:<id>` y `empresa:<id>` de Engram `:7438` + top-k de KB + cola del hilo; generación con fuentes y score; guardrails (umbral .60, scope solo-KB, límite intercambios, horario).
- Memoria Engram: port `MemoriaConversacionPort` + adapter HTTP (siempre `project` explícito; `operation_id` idempotente); destilación post-envío tipada (`hecho_cliente`, `acuerdo`, `compromiso`, `preferencia`, `objecion`); pin de acuerdos.
- KB semilla: carga inicial de entradas (script SQL) — el editor viene en E5.
- Auditoría en `CRM_Mensajes` (fuentes, score, modelo) y registro de la actividad de respuesta en el pipeline (solo lo que la máquina ya deriva).
- Vista: hilo muestra emisor IA con score + fuentes; estados ACTIVA_IA / REQUIERE_HUMANO en bandeja.

**Demo (DoD)**: cliente pregunta algo cubierto → la Guía responde sola con fuentes visibles → pregunta fuera de scope → mensaje seguro de escalado + conversación REQUIERE_HUMANO → la memoria muestra observaciones destiladas y pineadas del intercambio.

### E3 — Ayuda humana y trabajo en paralelo

**Qué**: el patrón de ayuda con indicaciones y la ficha viva. El mockup `mockup.html` hecho real.

- Notificación al usuario (badge en panel + toast) con contexto; nunca destruye el borrador en curso.
- Tarjeta de ayuda dentro del thread: qué preguntaron, qué buscó la Guía, input de **indicación** ("cómo seguir").
- La indicación se guarda: observación pineada `indicación_humana` en Engram + candidato de hueco en KB + la Guía continúa sola redactando la respuesta al cliente.
- Tomar / devolver conversación (patrón espejo de `asignar/devolver`); escalar a otro usuario (handoff).
- Columna derecha completa: 📇 datos del contacto que **la Guía llena sola** (extracción: cargo, trabajadores, sedes; tag 🤖; campos pending) + 🧠 memorias (editar/eliminar/pinear) + 🤖 settings del chat.

**Demo (DoD)**: guion del mockup en vivo: escribís en tu chat → llega notificación → indicación → la Guía retoma → volvés con borrador intacto → la ficha muestra el dato extraído automáticamente.

### E4 — Cierre autónomo del trato + vistas de configuración

**Qué**: la Guía cierra sola y el admin opera todo el sistema (prototipo `configuracion.html` hecho real).

- Cierre autónomo: registro de resultado (`AceptaciónOutbound`, `ConfirmaciónPresentación`, `ConversiónProspectoACliente`), avance de etapa del pipeline (CADENCIA→ACEPTADO→DATOS) y conversión tipo Prospecto→Cliente, con confirmación al cliente por el canal.
- Vista `/admin/crm/configuracion`: pestaña **Canal Kapso** (API key cifrada + probar, número conectado + estado, webhook con secret HMAC + registro + estado en vivo, plantillas aprobadas) · pestaña **Agente** (modo autonomía, kill switch global fijo en la barra, umbral, límite intercambios, horario, texto de escalado) · pestaña **Memoria** (URL/token/test, retención) · pestaña **Conocimiento** (stats + link a editor).
- Kill switch global: autónomo → solo borradores instantáneo, auditado.

**Demo (DoD)**: flujo completo `flujo-guia.html` en vivo (ingreso → gestión → un pedido de ayuda → cierre solo con etapa y tipo cambiando) + admin configurando el canal desde cero y probando el kill switch.

### E5 — Conocimiento, calidad y canal email

**Qué**: la sostenibilidad: curación de KB, circuito de calidad, retención y el segundo canal.

- Editor `/admin/crm/conocimiento` (patrón `plantillas-editor`): CRUD con vigencia (desde/hasta), etiquetas por tema, activación, stats de uso/calidad por entrada.
- Circuito de calidad: marcar respuesta deficiente en el hilo → hueco de KB (cola admin) → curación → la respuesta mejora.
- Canal **email**: entrada (ingesta de respuestas del buzón crm) y salida multi-canal desde la misma conversación; datos de canal en `CRM_Conversaciones`/`CRM_Mensajes` ya modelados en E1.
- Job de retención: chat cerrado + 12 meses → purga Engram (`engram delete project --hard`) + log de purgas; corrección humana de memorias (DELETE puntual) desde la vista.
- Métricas de productividad: intervenciones humanas por conversación, tratos cerrados por la Guía, tiempo de respuesta.

**Demo (DoD)**: admin cura un hueco nacido de una respuesta deficiente → la Guía responde bien la próxima · email entra como conversación y se responde por el mismo hilo · una memoria vieja se purga por retención y queda en el log.

---

## Criterios transversales

- **Repositorio**: TypeScript estricto, arquitectura hexagonal por feature (`domain`/`application`/`infrastructure`/`presentation`), tests junto al fuente, pnpm único package manager, lint/test solo archivos modificados (modo apply), PowerShell para comandos del entorno Windows, `scripts/sync-sdk.mjs` tras cambios (nunca commitear `.env*`).
- **Git**: feature branch desde `develop` (`feature/agente-ia-crm`), work-unit commits con tests+docs juntos, solo `master`/`develop` en remoto.
- **Seguridad**: secretos en `.env.local` (`KAPSO_API_KEY`, `KAPSO_WEBHOOK_SECRET`, `ENGRAM_CRM_URL`, `ENGRAM_CRM_TOKEN`), firma siempre verificada, PII mínima al modelo, no loguear secretos.
- **Revisión**: cada entregable cierra con revisión del candidato (commits del feature) bajo el switch RDD del usuario.

## Riesgos vigentes

1. Aprobación de plantillas en Meta (lead time externo) — mitigar pidiéndolas durante E1.
2. Números de teléfono en texto libre hoy → normalización E.164 obligatoria en E1 (vinculación).
3. FTS5 léxico (no vectorial) para memoria: depende de disciplina de destilación; evaluar hybrid en E5 si el recall falla.
4. LLM del motor (E2): definir proveedor/modelo + presupuesto de tokens antes de arrancar E2.

## Registro de avance

### Remediación de advisories (E1·T7, 2026-10-11)
Los 25 hallazgos advisory quedaron atendidos (24 remediados + 1 verificado ya-resuelto). Commits: `9815d5a` (repos SQL: escape LIKE, COUNT(*) OVER atómico, wamid condicional, truncado explícito, + 14 tests integración DB real), `ee4f516` (timeout Kapso 15s vía race, fail-closed en prod sin config, ruta simular 404 fuera de modo simulado, PII log enmascarado, + 19 tests adapter/factory/ruta), `c54e418` (mensaje confirmado en respuesta, actividad best-effort separada, trim consistente, marcar-leído condicional, + tests hilo use case), `d81926c` (parsearIdConversacion estricto compartido en 4 rutas, await refetch simulador, +6 tests hook hilo), `c68fbe7` (clave dedup uniforme por wamid en single y batch). Notas: R3-estado-composer-de-fila ya estaba resuelto (referencia del reviewer desactualizada, verificado); R3-scan-tabla-completa MITIGADO (TOP 5000 + warn + deuda: resolución completa = columna telefonoNormalizado escrita por el feature de contactos, E2+). Verificación: 2891/2892 scoped (1 fallo preexistente ajeno sqlServerEmpresaRepository), tsc ✓, build ✓, sync SDK ✓.

- [x] E1·T7 Remediación de los 25 advisories — completa

### Revisión nativa RDD (E1)
El candidato completo (51 archivos) excedió el presupuesto de contexto (`lens_context_budget_exceeded`) → dividido en 3 rebanadas encadenadas (decisión del usuario 2026-10-11), revisadas en worktrees dedicados:
- **Rebanada A** f794a2e..94d8e51 (T1+T2: esquema+dominio+webhook) — **APROVADA** (línea `review-8344e417cd1670f5`, ack quemado). Halló 1 CRITICAL (R3: ack antes de persistir → pérdida de mensajes en fallo async) corregido en `25037fc` (persist-before-ack + 503 para reintento de Kapso + backstop de carrera 2601/2627, 179 líneas diff). Advisory NO bloqueantes (seguimiento futuro): R3-adapters-sql-sin-tests (WARNING), R3-clave-batch-inconsistente (WARNING), R3-cuerpo-truncado-silencioso (SUGGESTION), R3-scan-tabla-completa-candidatos (WARNING).
- **Rebanada B** 94d8e51..b65fed7 (T3+T4: permisos+backend bandeja) — **APROVADA** vía línea sucesora `review-37741e99f78e5c42` (ack quemado) tras recover scope_changed. Halló 1 CRITICAL (R4: send-then-persist sin idempotencia de salida → duplicados al cliente) corregido en `5bd9e27` (outbox-lite: intención PENDIENTE→enviar→confirmar ENVIADO/FALLIDO + actualizarEnvio + CHECK 3 valores, 170 líneas diff). El recover nativo directo falló por base-ref inconsistente del proveedor; la transacción sucesora fresca consumó la recuperación. Advisory NO bloqueantes: 17 hallazgos informativos (ver lineage review-37741e99f78e5c42; destacados: kapso-no-timeout, default-simulado-silent, hilo-read-write-coupling, lenient-id-parse).
- **Rebanada C** b65fed7..52b2174 (T5: UI+docs) — **APROVADA** (línea `review-9b110dc0fee9ba27`, ack quemado, sin correcciones). Advisory NO bloqueantes: R3-cobertura-hilo-vinculacion (WARNING), R3-estado-composer-de-fila (SUGGESTION), R3-like-wildcards-sin-escape (WARNING), R3-simular-refetch-sin-await (SUGGESTION).

- [x] E1 — Canal y conversaciones — **COMPLETO y REVISADO** (3/3 rebanadas aprobadas; fixes R3 `25037fc` + R4 `5bd9e27` integrados; branch `feature/agente-ia-crm` lista para promoción a develop/master por decisión del usuario)
  - [x] T1 Esquema CRM_Conversaciones/CRM_Mensajes + dominio (E.164) + repos + wiring — commit `dee1d09`
  - [x] T2 Webhook /api/webhooks/kapso (HMAC + idempotencia + ack<10s + async) — commit `94d8e51`
  - [x] T3 Permiso crm_conversaciones + RUTAS_PROTEGIDAS + nav — commit `ee80452`
  - [x] T4 API bandeja + EnviadorWhatsappCrmPort (Kapso real + modo simulado) + simulador de entrada — commits `d2dd964` (SDK) + `b65fed7`
  - [x] T5 Vista /crm/conversaciones (bandeja estilo WhatsApp) — commit `409f3ff`
  - [x] T6 Verificación final + sync SDK + doc + revisión RDD — suite E1 89/89 ✓ · tsc ✓ · build ✓ · sync SDK ✓ (3 corridas) · revisión nativa 3/3 rebanadas APROBADAS

**Cómo demorar E1 (modo simulado, sin Kapso)**: 1) `pnpm dev` → entrar a `/crm/conversaciones` (usuario con permiso `crm_conversaciones`). 2) El panel "Simulador de entrada — modo simulado" (arriba de la lista) → teléfono `0981 234 567` + texto → Enviar. 3) El mensaje aparece en la bandeja; si el teléfono matchea 1 contacto existente se autovincula (TOMADA_HUMANO), sino queda PENDIENTE_VINCULACION → panel de vinculación (asociar o crear). 4) Responder a mano desde el hilo → burbuja OUT/HUMANO. 5) Webhook real: `POST /api/webhooks/kapso` con headers `X-Webhook-Signature` (HMAC-SHA256 hex del raw body con `KAPSO_WEBHOOK_SECRET`) + `X-Idempotency-Key` → mismo circuito; replay no duplica; firma inválida → 401. Al llegar Kapso real: setear `KAPSO_MODO=real` + `KAPSO_API_KEY` + `KAPSO_PHONE_NUMBER_ID` + `KAPSO_WEBHOOK_SECRET` en `.env.local` y registrar el webhook en Kapso.

**Limitaciones conocidas E1**: preview del último mensaje ausente en la lista (opcional, se suma en E2/E3); "Crear contacto" del panel de vinculación usa `GET /api/crm/empresas` que exige permiso `crm` además de `crm_conversaciones`; test de integración preexistente `sqlServerEmpresaRepository.test.ts` falla contra la DB dev compartida por datos reales acumulados (ajeno a este feature).
- [x] E2 — La Guía responde (memoria + RAG + autonomía básica) — **COMPLETO (T1–T8)** — ver registro E2 abajo

  **Decisiones E2 (arquitecto, 2026-10-10)**:
  - **Nacimiento IA**: las conversaciones nuevas nacen `ACTIVA_IA` (modo IA) — reemplaza el default E1 `TOMADA_HUMANO`; la vinculación (auto o manual) preserva `ACTIVA_IA`.
  - **Toma implícita**: una respuesta manual del humano en `ACTIVA_IA`/`REQUIERE_HUMANO` pasa la conversación a `TOMADA_HUMANO` (E3 formaliza tomar/devolver/escalar).
  - **Cola durable**: `CRM_AgenteTareas` (dedup UNIQUE conversación+mensaje+tipo; claim `UPDATE … OUTPUT`; PENDIENTE/PROCESANDO/COMPLETADA/FALLIDA con reintentos). Disparo best-effort inmediato tras persistir + barredor lazy (setInterval 20s, singleton Node) como backstop. El webhook sigue ack<10s SIN trabajo LLM dentro.
  - **Config por env (bootstrap hasta E4)**: `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODELO` (default `glm-5.3-flash` @ `https://api.z.ai/api/paas/v4/`), `AGENTE_HABILITADO` (kill switch provisorio), `AGENTE_UMBRAL_CONF` (.60), `AGENTE_MAX_INTERCAMBIOS` (8), `AGENTE_HORARIO_DESDE/HASTA` (8/18), `AGENTE_TEXTO_ESCALADO`. E4 los mueve a DB + admin UI.
  - **Generador simulado**: sin `LLM_API_KEY` en dev → adapter simulado determinista (DoD demo sin API key); prod sin config → fail-closed tipado (patrón KAPSO_MODO). Llegada la key: solo env vars.
  - **Destilación** = 2ª llamada LLM tipada (`hecho_cliente`/`acuerdo`/`compromiso`/`preferencia`/`objecion`) post-envío + pin de acuerdos; en modo simulado, destilador determinista. Idempotencia por `operation_id`.
  - **PII**: teléfonos enmascarados antes de ir al modelo; solo consulta + cola corta del hilo (últimos N) + recall viajan al LLM.
  - **Ranking KB** en aplicación (solapamiento de términos + vigencia); el repo SQL hace prefilter LIKE escapado (lección E1: escapar `%_[`).
  - **Datos de prueba**: autorización explícita del usuario (2026-10-10) para llenar y quitar datos en la DB dev — scripts con `--apply`/`--limpiar` y probes autolimpiados.

  - [x] E2·T1 KB: tabla `CRM_Conocimiento` + port/repo SQL (lectura + prefilter LIKE) + ranking top-k en aplicación + script siembra `scripts/crm-sembrar-conocimiento.mjs` (dry-run default, `--apply`, `--limpiar`; contenido Holomedic desde docs del repo) — 12 entradas sembradas; 28 tests ✓ — commit `329b1ea`
  - [x] E2·T2 Memoria: `MemoriaConversacionPort` + adapter HTTP Engram `:7438` (contexto/buscar/guardar/pinear, project explícito `crm-emp-<id>`, `operation_id` idempotente + poll de commit, timeout) + factory (fail-closed prod, simulado dev) — contrato 3.3.2 verificado en vivo; 30 tests ✓ + humo real — commit `001eba3`
  - [x] E2·T3 LLM: `GeneradorRespuestaPort` (generar + destilar) + adapter OpenAI-compatible + simulado determinista + factory fail-closed (patrón KAPSO) — 40 tests ✓ — commit `ca4c57e`
  - [x] E2·T4 Motor: use case `generarRespuestaAgente` (recall memoria+KB, prompt PII-safe, guardrails umbral/scope/límite/horario/kill switch, envío outbox-lite emisor IA con fuentes/score/modelo, escalado → `REQUIERE_HUMANO` + mensaje seguro, destilación+pin, registrarActividad) — 70 tests ✓ — commit `b7f0502`
  - [x] E2·T5 Cola+integración: `CRM_AgenteTareas` + repo (crearSiNoExiste/reclamar/completar/fallar) + hook post-persist en `procesarMensajeWhatsapp` + barredor lazy + nacimientos `ACTIVA_IA` + toma implícita en `responderConversacion` — 89 tests ✓ — commits `e17a22a` + `7b129ce`

  **Ensayo live de pipeline completo (post-T5)**: contra DB dev real + Engram :7438 real + LLM/WhatsApp simulados — nace `ACTIVA_IA` → drenaje → `RESPONDIDO` con fuentes/score/modelo → destilación visible en Engram; fuera de scope → texto seguro + `REQUIERE_HUMANO`. Cazó 2 bugs reales (fix `7b129ce`): (1) Engram 404 `unknown_project` en /context y /search es estado vacío NORMAL de empresa nueva (devolvía `MEMORIA_ERROR` y quemaba reintentos); (2) prefilter KB por frase completa jamás matcheaba preguntas naturales (recall siempre vacío → todo escalaba) → reescrito por términos OR (NFD, >2 chars, máx 8). El humo quedó en `temp/e2e-agente.smoke.test.ts` (git-ignored, reutilizable en T7).
  - [x] E2·T6 UI: burbujas IA con score+fuentes ("La Guía"), preview último mensaje en lista (OUTER APPLY), guard `PENDIENTE` en `esMensajeCrm` — 32 tests ✓ — commit `5e65d5b`
  - [x] E2·T7 Verificación final: suite scoped + tsc + build + sync SDK + docs módulo + demo DoD (simulador: cubierto→responde con fuentes; fuera de scope→escalado `REQUIERE_HUMANO`; memorias destiladas/pineadas visibles) — suite E2-scope 2974/2975 (1 fallo preexistente documentado sqlServerEmpresaRepository, ajeno) · tsc ✓ · build ✓ 50s · sync SDK ✓ (dry-run + live, 53/0) · docs `crm-conversaciones.md` + `crm-conversaciones-agente.md` + índice — commit `8c4be49`
  - [x] E2·T8 (deuda E1): columna `telefonoNormalizado` en `CRM_Contactos` + índice filtrado + seek exacto con fallback acotado + importador escribe ambas columnas + script backfill `--apply` (4 filas normalizadas en dev) — 51 tests ✓ — commit `62ef6f1`

### Revisión nativa RDD (E2) — 4/4 REBANADAS APROBADAS Y QUEMADAS (2026-10-11)
El candidato completo (58 rutas) excedió `lens_context_budget_exceeded` → dividido en 4 rebanadas encadenadas (decisión del usuario), revisadas en worktrees dedicados bajo `temp/wt-e2*`:
- **Rebanada A** `dd02c03..001eba3` (T1+T2: KB + memoria Engram, 18 archivos/2602 líneas) — **APROVADA** (línea `review-db8182a2f12cc883`, ack quemado). 2 corridas de revisor rechazadas por eco corrupto del subject_hash (defecto transitorio del relay; tercera limpia). Advisories NO bloqueantes: R3-buscar-fila-invalida-fatal (WARNING), R3-guardar-poll-timeout-fatal (WARNING), R3-fecha-engram-silenciosa (SUGGESTION), R3-simulada-reloj-no-inyectado (SUGGESTION).
- **Rebanada B** `001eba3..b7f0502` (T3+T4: generador LLM + motor, 13 archivos/3175 líneas) — **APROVADA** (línea `review-c136eb355e0ee223`, ack quemado). Advisories: R3-envio-throw-sin-manejo (WARNING), R3-pii-distilacion-sin-mascarar (WARNING — deliberado: la destilación preserva el hecho real), R3-horario-desde-igual-hasta (SUGGESTION), R3-patron-telefono-greedy (SUGGESTION).
- **Rebanada C** `b7f0502..7b129ce` (T5: cola durable + fixes del ensayo, 27 archivos/2286 líneas) — **APROVADA** (línea `review-46916e87bf2bb4ba`, ack quemado). Advisories: R3-toma-parcial-flip (WARNING), R3-vincular-post-efecto (WARNING), R3-test-claim-global (WARNING), R3-fallida-derivada-stale (SUGGESTION), R3-conocimiento-sin-stopwords (SUGGESTION).
- **Rebanada D** `7b129ce..62ef6f1` (T6+docs+T8: UI + módulos + telefonoNormalizado, 20 archivos/1639 líneas) — **APROVADA** (línea `review-0d0d77b02f555e03`, ack quemado). Advisories: R3-score-undefined-crash (WARNING), R3-candidatos-two-query-window (SUGGESTION), R3-dup-normalizer-drift (SUGGESTION).

Todos los hallazgos son advisory informativos NO bloqueantes (ninguna corrección exigida) — seguimiento futuro agrupado, no bloquea promoción.

  - [x] E2·T9 (corrección en vivo del usuario): atender números desconocidos — born `PENDIENTE_VINCULACION` con modo IA + tareas IA para ambos estados + motor acepta no-vinculadas (contactoNuevo en el prompt: junta nombre/empresa naturalmente) + saludos/cortesía SIEMPRE respondidos (adiós escalado por «Hola») + identificación best-effort post-envío (`extraerIdentificacion` → match exacto único de `CRM_Empresas` → crearContacto+vincular+ACTIVA_IA; 0/>1 matches sin efecto, panel del operador sigue disponible) — 122 tests ✓ — commits `d0a3ed6`+`759657b`

**Revisión nativa RDD (E2.1)**: rebanada `fc7105b..759657b` (14 archivos/1007 líneas) — **APROVADA** (línea `review-11e94169228219b3`, ack quemado, usuario dio OK del flujo). Advisories NO bloqueantes: R3-dup-contacto-race (WARNING), R3-flag-asymmetry (SUGGESTION), R3-sim-null-identification (SUGGESTION). **Promovida a develop** (fast-forward, 40 commits locales vs origin, push pendiente del usuario).

### E2.1 — notas de operación (2026-10-11)
- **Z.ai saldo agotado** (error 1113 «Insufficient balance», mapeado a HTTP 429) tras las corridas de revisión + humo: `LLM_API_KEY` quedó COMENTADA en `.env.local` → el generador simulado atiende (incluye el flujo de contacto nuevo). Al recargar: descomentar la key y reiniciar → GLM real retoma (verificado en vivo antes de agotarse: respuesta con fuentes + escalado correcto).
- Demo activa en DB: empresa `DEMO MEMORIA LA GUÍA SA` (id 4055, contacto María Demo `+598 99 471 2233`) + memoria ficticia tipada en Engram `crm-emp-4055` (acuerdo/compromiso pineados). Limpieza cuando termine: `engram delete project crm-emp-4055 --hard` + baja de la empresa.

### E2 — COMPLETO (2026-10-11)

**Commits** (branch `feature/agente-ia-crm-e2`, base develop `dd02c03`): `329b1ea` T1 KB · `001eba3` T2 memoria Engram · `ca4c57e` T3 generador LLM · `b7f0502` T4 motor+guardrails · `e17a22a` T5 cola durable+nacimientos+toma implícita · `7b129ce` fixes del ensayo live (Engram 404 vacío + prefilter por términos) · `5e65d5b` T6 UI · `8c4be49` docs. Total ~9.900 líneas nuevas, ~290 tests nuevos.

**DoD demo (verificado en vivo por el ensayo `temp/e2e-agente.smoke.test.ts`)**: pregunta cubierta → La Guía responde sola con fuentes visibles y score; fuera de scope → mensaje seguro + `REQUIERE_HUMANO`; observaciones destiladas quedan en Engram (`crm-emp-<id>`, pineado para acuerdos). Con `pnpm dev` + permiso `crm_conversaciones` el simulador de la bandeja reproduce el circuito completo sin Kapso ni API key.

**Observaciones**: sync-sdk no excluye `odd/` (el registro interno cae al share Windows — cosmético, ya ocurría en E1; decisión del usuario excluirlo); horario 8-18 reencola tareas fuera de ventana (para demo nocturna: `AGENTE_HORARIO_DESDE/HASTA`); Engram :7438 no exige token (bind 127.0.0.1) pero el adapter lo envía si está configurado.
### E3 — Ayuda humana y trabajo en paralelo (plan bloqueado 2026-10-11)

**Decisiones E3 (arquitecto, sobre diseño locked + `temp/diagrama-flujo/mockup.html`)**:
- **Solicitud de ayuda persistida**: tabla `CRM_SolicitudesAyuda` (conversacionId, mensajeId, consulta, terminosBuscados JSON, score, estado PENDIENTE/RESUELTA, indicacion, resueltaPor, timestamps). El motor la crea al escalar (hoy esos datos se pierden); la tarjeta del hilo la lee de acá.
- **Indicación**: use case `aplicarIndicacion` — valida PENDIENTE → guarda observación pineada tipo `indicacion_humana` (nuevo literal en `TipoObservacionDestilada`) en scope chat → crea candidato de hueco (`CRM_ConocimientoHuecos`: consulta, terminos, estado ABIERTO; la cola admin viene en E5) → marca RESUELTA → encola tarea `RESPONDER_CON_INDICACION` (payload {solicitudId, indicacion}); el motor re-corre con la indicación inyectada prominentemente en el prompt (además del pin de memoria). Toast "✓ Indicación guardada — la Guía continúa con el cliente".
- **Ficha viva**: extracción piggyback en la destilación (misma llamada LLM, JSON tipado ampliado: cargo/trabajadores/sedes) → tabla `CRM_ExtraccionesFicha` (contactoId/empresaId nullable, campo, valor, origen IA/HUMANO, confirmado, actualizadoEn). Confirmar promueve a columna canónica cuando existe (`contacto.cargo`, `empresa.cantidadTrabajadores`); `sedes` queda como dato de ficha (sin columna canónica). Pendiente se muestra "— por detectar —" con tag 🤖 en lo extraído.
- **Memorias**: port gana `eliminar(id)` + `despinear(id)` (editar = eliminar+guardar); API proxy por conversación. **Verificar soporte DELETE del Engram :7438 antes de T3** (riesgo del scout).
- **Tomar/devolver/escalar**: tomar explícito (→ TOMADA_HUMANO + asignadaA + modo HUMANO) y devolver (TOMADA_HUMANO→ACTIVA_IA + re-encolar GENERAR_RESPUESTA solo si hay mensaje IN sin OUT posterior); escalar = asignar `asignadaA` a otro usuario con permiso (nuevo GET usuarios-asignables, id+nombre). `asignadaA` recibe su primer escritor real.
- **Notificaciones**: polling ligero cada 15s desde el shell (solo con permiso `crm_conversaciones`) a `GET /api/crm/conversaciones/notificaciones` → {requiereAyuda, pendienteVinculacion, version}; badge en sidebar (nuevo ítem Conversaciones) + toast sonner con contexto (empresa + preview) cuando sube el contador; click navega al hilo; toasts nunca navegan solos ni tocan el composer (borrador intacto por diseño).
- **Settings del chat**: chips read-only de config global (umbral, intercambios, horario, memoria chat+empresa) + controles per-chat: modo (tomar/devolver) y `memoriaActiva` BIT nuevo en `CRM_Conversaciones` (default 1; el motor salta recall Engram cuando 0).

- [x] E3·T1 Esquema+dominio: `CRM_SolicitudesAyuda` + `CRM_ConocimientoHuecos` + `CRM_ExtraccionesFicha` + `CRM_Conversaciones.memoriaActiva` (migrate idempotente) + entidades/ports/repos + tests — 57/57 scoped (integración real dev DB, self-cleanup) · tsc ✓ · 3 desviaciones razonadas: FKs INT (error 1778 SQL Server), `memoriaActiva`/métodos de port opcionales (precedente fakes `implements`) · CHECK `CK_CRM_AgenteTareas_Tipo` ensanchado a RESPONDER_CON_INDICACION
- [ ] E3·T2 Motor: crear solicitud al escalar + use case `aplicarIndicacion` (memoria pineada + hueco + RESUELTA + encolado) + tarea `RESPONDER_CON_INDICACION` con indicación en prompt + tests
- [ ] E3·T3 APIs: `POST /[id]/indicacion`, `POST /[id]/tomar|devolver|escalar`, `GET usuarios-asignables`, `GET notificaciones`, memorias (GET/DELETE/pin/despinar) + tests de ruta
- [ ] E3·T4 Ficha viva backend: extracción en destilación (JSON ampliado) + upsert extracciones + confirmación (promueve a columnas) + endpoint ficha + tests
- [ ] E3·T5 UI hilo: tarjeta de ayuda (qué preguntaron / qué buscó / input indicación; borrador intacto) + columna derecha completa (📇 ficha 🤖/pending/confirmar · 🧠 memorias editar/eliminar/pinear · 🤖 settings) + tomar/devolver/escalar + tests RTL
- [ ] E3·T6 UI global: badge sidebar + toast con contexto + marcador "⚠ AYUDA" en bandeja + tests
- [ ] E3·T7 Verificación final: suite scoped + tsc + build + sync SDK + docs módulo + demo DoD (guion mockup) + revisión RDD
- [ ] E4 — Cierre autónomo + vistas de configuración
- [ ] E5 — Conocimiento, calidad y canal email

## E2 — Decisión LLM (bloqueada 2026-10-11, revisada 2× por el usuario)

- **DESARROLLO Y PRODUCCIÓN usan la API de GLM**: Z.ai `glm-5.3-flash` (`https://api.z.ai/api/paas/v4/`, $0.15/$0.50 por 1M → ~$0.60/mes). Mismo modelo en todo el ciclo — sin sorpresas de comportamiento entre ambientes.
- **Google Gemini**: SOLO como opción seleccionable desde la **configuración de la plataforma** (E4, `/admin/crm/configuracion`): key CIFRADA + probar conexión + proveedor/modelo cambiables desde el admin SIN redeployar. Endpoint compatible-OpenAI: `https://generativelanguage.googleapis.com/v1beta/openai/`.
- **Arquitectura**: único adapter OpenAI-compatible (`GeneradorRespuestaPort`); proveedor/modelo/key = CONFIGURACIÓN (DB + admin UI en E4); env solo bootstrap (key Z.ai para dev; prod sin config → fail-closed, patrón KAPSO_MODO).
- **Pendiente usuario**: API keys — Z.ai (dev+prod) y Google AI (para cargar en la config) — no bloquea la construcción (tests con fakes).
- Presupuesto estimado: ~1.000 resp/mes ≈ 3M tokens entrada + 0,3M salida → GLM ~$0.60/mes.
