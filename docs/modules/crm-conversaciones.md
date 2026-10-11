# Módulo crm-conversaciones (bandeja)

> Ubicación: `src/features/crm/` · Rutas: `/crm/conversaciones` (permiso `crm_conversaciones`) y APIs `/api/crm/conversaciones*`, `/api/webhooks/kapso` · El agente IA que responde estas conversaciones: [crm-conversaciones-agente](./crm-conversaciones-agente.md)

## Propósito

La bandeja de conversaciones WhatsApp del CRM: el operador ve el listado con filtros por estado, abre el hilo completo de cada conversación, vincula las conversaciones sin match de contacto a un contacto/empresa, y responde manualmente desde el hilo. Un simulador dev permite ejercitar el circuito completo sin Kapso.

## Piezas

| Capa | Responsabilidad | Archivos clave |
|---|---|---|
| `application/` | Casos de uso de la bandeja | `procesarMensajeWhatsapp.ts` (ingesta compartida webhook/simulador), `listarConversaciones.ts`, `obtenerHiloConversacion.ts`, `vincularConversacion.ts`, `responderConversacion.ts` (toma implícita a `TOMADA_HUMANO`), `simularMensajeEntrante.ts` |
| `infrastructure/` | SQL Server (`SqlServerConversacionRepository`, `SqlServerMensajeRepository`), WhatsApp (`crearEnviadorWhatsapp` → Kapso real o simulado) | `infrastructure/sqlserver/`, `infrastructure/whatsapp/` |
| `presentation/` | Bandeja completa | `presentation/components/conversaciones/`: `BandejaConversaciones.tsx` (orquesta), `ListaConversaciones.tsx`, `HiloConversacion.tsx` (burbujas; las IA muestran score + fuentes), `PanelVinculacion.tsx`, `SimuladorEntrada.tsx` (solo-dev) |

## Circuito de entrada

1. Kapso hace `POST /api/webhooks/kapso` — endpoint **público** (no está en `RUTAS_PROTEGIDAS`): la credencial es la firma `X-Webhook-Signature` (HMAC-SHA256 hex sobre el raw body, sin prefijo `sha256=`). Sin `KAPSO_WEBHOOK_SECRET` configurado responde 503 — nunca procesa sin firma. Soporta batching (`X-Webhook-Batch: true`).
2. `ProcesarMensajeWhatsappUseCase`: dedup por `X-Idempotency-Key` (fallback wamid; índice único en `CRM_Mensajes`) → rutea a la conversación por teléfono E.164 o `identificadorCanal` → si no existe, nace `ACTIVA_IA` con exactamente 1 candidato de vínculo, si no `PENDIENTE_VINCULACION` → persiste el mensaje IN (cuerpo truncado a 4000 chars con marca visible `…[truncado]`) → tick de contadores de bandeja.
3. El 200 sale **después** de persistir: un fallo responde 503 y Kapso reintenta (at-least-once, seguro por el dedup).
4. La bandeja lista y filtra conversaciones; el operador vincula (`POST /api/crm/conversaciones/[id]/vincular`) o responde (`POST /api/crm/conversaciones/[id]/mensajes` — espejo outbox-lite: OUT `PENDIENTE` → envío → `ENVIADO`/`FALLIDO`).
5. El simulador (`POST /api/crm/conversaciones/simular`, body `{telefono, texto}`) sintetiza el mismo evento `whatsapp.message.received` y corre el pipeline real; existe **solo** con modo simulado activo (si no, 404 antes de tocar auth/body/DB).

## Estados (resumen)

`PENDIENTE_VINCULACION` → `ACTIVA_IA` (born IA) → `REQUIERE_HUMANO` (escalado del motor) → `TOMADA_HUMANO` (toma implícita al responder manual) · `PAUSADA` (reservada) · `CERRADA`. El detalle de quién dispara cada transición y el circuito del agente están en [crm-conversaciones-agente](./crm-conversaciones-agente.md).

## Configuración

| Variable | Default | Semántica |
|---|---|---|
| `KAPSO_MODO` | — | `real` → enviador Kapso (requiere `KAPSO_API_KEY` + `KAPSO_PHONE_NUMBER_ID`); `simulado` → simulador (opt-in consciente, también en prod); sin valor en dev → simulado (warn); sin valor en prod → **fail-closed** (`KAPSO_NO_CONFIGURADO`) |
| `KAPSO_WEBHOOK_SECRET` | — | Secreto HMAC del webhook; falta → 503, nunca procesa unsigned |
| `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID` | — | Credenciales del canal Kapso (modo real) |
| `HOLOMEDIC_DB_*` | — | Pool SQL Server compartido del CRM (tablas `CRM_Conversaciones`, `CRM_Mensajes`) |

## Gotchas

- El simulador es una herramienta **solo-dev**, removible cuando Kapso esté configurado; la tarjeta del UI y la ruta comparten el mismo flag (`esModoSimulado`).
- Una conversación sin teléfono E.164 no puede recibir respuestas (ni IA ni manual: guard `SIN_TELEFONO`).
- Los logs del webhook y de la bandeja nunca llevan cuerpos de mensajes — solo ids y códigos tipados.
