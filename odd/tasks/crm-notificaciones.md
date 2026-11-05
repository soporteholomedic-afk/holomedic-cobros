# Notificaciones CRM (panel "Tu día")

Un solo frente: superficie in-app en `/crm`, calculada en vivo, sin tablas nuevas. El frente de navegador fue descartado por decisión de producto (Log L5).

## Specs

- **S1**: "no vamos a utilizar las notificaciones de navegador si no utilizaremos notificaciones que están dentro del sistema será mejor y así no hacemos cosas raras en el mismo browser" → único frente: panel "Tu día" en `/crm`; sin Web Notifications API, sin banner, sin switch.
- **S2**: Descartado — el banner de activación (originalmente "si el usuario no las activa, el bagner no desparece de la parte superior de navbar") se eliminó junto con el frente navegador.
- **S3**: Disparadores — "Ambas señales (recomendado)": próxima acción vencida o que vence hoy + entrante esperando respuesta >48 h (`faltaResponderDesde`).
- **S4**: Persistencia — "Calculadas en vivo": la API calcula desde `CrmEmpresa`; sin tablas nuevas, sin cron; gestionar la empresa apaga la alerta sola.
- **S5**: Audiencia y ubicación — "Todos los de CRM" (permiso `crm`) y "Panel dentro de `/crm`".

## Tareas

| ID | Specs | Ruta | Commit |
|---|---|---|---|
| T1 | S3, S4 | `application/calcularAlertas.ts` + tests (RED→GREEN) | 1 |
| T2 | S3, S4 | `app/api/crm/alertas/route.ts` (GET, `usuarioCrm`) | 1 |
| T3 | S1, S3, S5 | `presentation/components/PanelDia.tsx` + `useAlertasDia.ts` + wiring `CrmBoard` + tests | 2 |
| ~~T4~~ | — | Frente navegador (eliminado por decisión de producto, Log L5) | revertido en 4 |
| T5 | S1-S5 | Verificación: tests/lint de afectados, sync SDK, cierre por S# | — |
| T6 | S1 | Remover frente navegador: hook + banner + tests + wiring SessionShell | 4 |

## Evidencia

- T1+T2 → `64660a9` (feat(crm): pending-alert computation and /api/crm/alertas endpoint)
- T3 → `4047125` (feat(crm): Tu día panel above the board)
- T4 → `4864e4d` (feat(crm): browser notifications with opt-in switch and persistent banner), revertido
- T6 → `5838da8` (fix banner states, iteración previa) y el commit de remoción

## Reglas de dominio (T1)

- `accion_vencida`: etapa ∈ {contactado, en_seguimiento}, `proximaAccion != null`, `fecha < hoy`; `atraso` = días completos de atraso.
- `accion_hoy`: igual con `fecha === hoy`.
- `sin_responder`: `faltaResponderDesde != null`, etapa ≠ perdido, espera ≥ 48 h; `atraso` = horas completas esperando.
- Orden: vencidas (más vieja primero), hoy, sin responder (más vieja primero).

## Log

- L1: "vamos a trabajar en el modulo de CRM, quiero implementar un sistema de notificaciones, ayudame a aterrizar la idea para hacer una buena feature. Crea una skill pata desarrollar feature pensando en el producto y usuario. Luego continua con el desarrollo"
- L2: decisiones de producto (batch): ambas señales; calculadas en vivo; todos los de CRM; panel dentro de /crm.
- L3: "quiero que lq notificacion se en 2 frentes. En el misma plataforma y otra a nivel de navegador, las notificaciones deben poder activarse con un switch. si el usuario no las activa, el bagner no desparece de la parte superior de navbar" → agrega frente navegador + switch + banner permanente; S1/S2 reescritas; T4 abierta.
- L4 (verificación T5): RED→GREEN por tarea (calcularAlertas 14 tests, PanelDia 5, CrmBoard.dia 2, hook navegador 7, banner 5); suite afectada crm+componentes 700/700; ESLint limpio en todos los tocados; tsc sin errores en src/ (resto: artefactos pre-existentes de .next/dev y temp/); RDD assess: autoverificación del writer, sin verificador independiente; sync SDK en dry-run — la ejecución live queda como decisión de entrega (reflejar esta rama borra del share archivos de otra rama).
- L5: "déjalo así no vamos a utilizar las notificaciones de navegador si no utilizaremos notificaciones que están dentro del sistema será mejor y así no hacemos cosas raras en el mismo browser" → se elimina el frente navegador (T4 revertida, S1/S2 reescritas, T6 abierta); el usuario accede por IP (contexto inseguro, sin Notification API) y prefiere no depender del browser.

## No-goals (v1)

- **Notificaciones de navegador** — descartadas por decisión de producto (L5): solo notificaciones dentro del sistema; sin APIs del browser, sin switch, sin banner.
- Notificaciones cuando la pestaña está cerrada (service worker / push).
- Preferencia por usuario en servidor.
- Asignación gestor↔empresa y alertas por persona.
- Email / WhatsApp.
