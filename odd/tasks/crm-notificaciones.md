# Notificaciones CRM (panel "Tu día" + notificaciones de navegador)

Dos frentes de notificación sobre las señales existentes del CRM: superficie in-app en `/crm` y notificaciones a nivel de navegador con switch de activación. Calculadas en vivo, sin tablas nuevas.

## Specs

- **S1**: "quiero que lq notificacion se en 2 frentes. En el misma plataforma y otra a nivel de navegador, las notificaciones deben poder activarse con un switch." → dos frentes: (a) plataforma: panel "Tu día" en `/crm`; (b) navegador: Web Notifications API con switch.
- **S2**: "si el usuario no las activa, el bagner no desparece de la parte superior de navbar" → banner de activación fijo en la parte superior que permanece visible mientras el switch esté desactivado (leído "bagner" como "banner").
- **S3**: Disparadores — "Ambas señales (recomendado)": próxima acción vencida o que vence hoy + entrante esperando respuesta >48 h (`faltaResponderDesde`).
- **S4**: Persistencia — "Calculadas en vivo": la API calcula desde `CrmEmpresa`; sin tablas nuevas, sin cron; gestionar la empresa apaga la alerta sola.
- **S5**: Audiencia y ubicación — "Todos los de CRM" (permiso `crm`) y "Panel dentro de `/crm`"; el banner vive en la parte superior del shell para usuarios con `crm`.

## Tareas

| ID | Specs | Ruta | Commit |
|---|---|---|---|
| T1 | S3, S4 | `application/calcularAlertas.ts` + tests (RED→GREEN) | 1 |
| T2 | S3, S4 | `app/api/crm/alertas/route.ts` (GET, `usuarioCrm`) | 1 |
| T3 | S1, S3, S5 | `presentation/components/PanelDia.tsx` + `useAlertasDia.ts` + wiring `CrmBoard` + tests | 2 |
| T4 | S1, S2 | `useNotificacionesNavegador.ts` + `BannerNotificaciones.tsx` + wiring `SessionShell` + tests | 3 |
| T5 | S1-S5 | Verificación: tests/lint de afectados, sync SDK, cierre por S# | — |

## Evidencia

- T1+T2 → `64660a9` (feat(crm): pending-alert computation and /api/crm/alertas endpoint)
- T3 → `4047125` (feat(crm): Tu día panel above the board)

## Reglas de dominio (T1)

- `accion_vencida`: etapa ∈ {contactado, en_seguimiento}, `proximaAccion != null`, `fecha < hoy`; `atraso` = días completos de atraso.
- `accion_hoy`: igual con `fecha === hoy`.
- `sin_responder`: `faltaResponderDesde != null`, etapa ≠ perdido, espera ≥ 48 h; `atraso` = horas completas esperando.
- Orden: vencidas (más vieja primero), hoy, sin responder (más vieja primero).

## Log

- L1: "vamos a trabajar en el modulo de CRM, quiero implementar un sistema de notificaciones, ayudame a aterrizar la idea para hacer una buena feature. Crea una skill pata desarrollar feature pensando en el producto y usuario. Luego continua con el desarrollo"
- L2: decisiones de producto (batch): ambas señales; calculadas en vivo; todos los de CRM; panel dentro de /crm.
- L3: "quiero que lq notificacion se en 2 frentes. En el misma plataforma y otra a nivel de navegador, las notificaciones deben poder activarse con un switch. si el usuario no las activa, el bagner no desparece de la parte superior de navbar" → agrega frente navegador + switch + banner permanente; S1/S2 reescritas; T4 abierta.

## No-goals (v1)

- Notificaciones cuando la pestaña está cerrada (service worker / push).
- Preferencia por usuario en servidor (el switch vive en `localStorage` por navegador).
- Asignación gestor↔empresa y alertas por persona.
- Email / WhatsApp.
