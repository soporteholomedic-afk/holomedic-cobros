# Feature: agente-ia-crm — La Guía (agente IA de conversaciones del CRM)

> Estado: **plan aprobado — sin implementar** · Creado: 2026-10-10
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

- [ ] E1 — Canal y conversaciones
  - [x] T1 Esquema CRM_Conversaciones/CRM_Mensajes + dominio (E.164) + repos + wiring — commit `dee1d09`
  - [x] T2 Webhook /api/webhooks/kapso (HMAC + idempotencia + ack<10s + async) — commit `94d8e51`
  - [ ] T3 Permiso crm_conversaciones + RUTAS_PROTEGIDAS + nav
  - [ ] T4 API bandeja + EnviadorWhatsappCrmPort (Kapso real + modo simulado) + simulador de entrada
  - [ ] T5 Vista /crm/conversaciones (bandeja estilo WhatsApp)
  - [ ] T6 Verificación final + sync SDK + doc + revisión RDD
- [ ] E2 — La Guía responde (memoria + RAG + autonomía básica)
- [ ] E3 — Ayuda humana y trabajo en paralelo
- [ ] E4 — Cierre autónomo + vistas de configuración
- [ ] E5 — Conocimiento, calidad y canal email
