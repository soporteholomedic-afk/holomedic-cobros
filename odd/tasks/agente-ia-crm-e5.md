# Feature: agente-ia-crm-e5 — Cierre autónomo del trato + vistas de configuración

> Rama: `feature/agente-ia-crm-e5` (desde `develop`) · Creado: 2026-10-17 · Entregable E5 de `odd/tasks/agente-ia-crm.md`

## Objetivo
La Guía cierra sola el trato (resultado + etapa + tipo + confirmación al cliente) y el admin opera el sistema desde `/admin/crm/configuracion` (Canal Kapso, Agente, Memoria, Conocimiento) con kill switch global en caliente.

## Decisiones (usuario, 2026-10-17)
1. **Orden**: dos tandas — primero B (configuración), luego A (cierre autónomo). A depende del kill switch en caliente.
2. **Evento de cierre**: nuevo evento de pipeline para aceptación *inbound* (CADENCIA→ACEPTADO). No se toca la semántica outbound-only de `AceptaciónOutbound` (test `maquinaEstados.test.ts:186`).
3. **Señal de cierre**: híbrido — el LLM propone (tipo de cierre + confianza) y una regla determinista valida (umbral, contacto vinculado, etapa válida, guardrails/kill switch).
4. **Cifrado**: AES-256-GCM con clave maestra `CRM_CONFIG_KEY` (env, nunca sincronizada), fail-closed en prod.

## Hallazgos de exploración
- Config del agente hoy solo env (`configAgente.ts` `crearConfigAgente`), sin cambio en caliente. No existe `CRM_Config`, cifrado ni `/admin/crm/configuracion`.
- Dominio de pipeline reutilizable: `maquinaEstados.ts`, `registrarTransicion.ts` (rechaza T16), `cambiarTipo.ts`, `sqlServerPipelineRepository.ts`.
- Patrón de página admin: `src/app/admin/crm/conocimiento/page.tsx`. Permisos: `PERMISOS` (`auth/domain/entities.ts`) + `RUTAS_PROTEGIDAS` (`auth/domain/routes.ts`).

## Tareas

### Tanda B — Configuración
- [x] T1 Cifrado AES-256-GCM (`CRM_CONFIG_KEY`, fail-closed) + tests
- [x] T2 Esquema `CRM_Config` (+ auditoría de cambios) + port/repo SQL + migrate idempotente + tests
- [ ] T3 Config del agente en caliente (DB con fallback env) + kill switch auditado; motor y `ajustesConversacion` la consumen
- [ ] T4 Permiso `crm_configuracion` + `RUTAS_PROTEGIDAS` + APIs Agente y kill switch
- [ ] T5 APIs Canal Kapso y Memoria (secretos cifrados, probar conexión, enmascarados al leer) + factories leen config
- [ ] T6 Vista `/admin/crm/configuracion` (4 pestañas, kill switch fijo en la barra)

### Tanda A — Cierre autónomo
- [ ] T7 Dominio: evento de aceptación inbound + efectos + tests de la máquina
- [ ] T8 Señal de cierre: `ResultadoAgente` + contrato JSON del prompt + generador simulado + golden set
- [ ] T9 Use case `cerrarTratoAgente`: validación híbrida, transición, conversión de tipo, confirmación al cliente, auditoría
- [ ] T10 Integración en el motor (post-envío, respeta guardrails/kill switch) + marcador en el hilo
- [ ] T11 Verificación final: suite scoped + tsc + build + sync SDK + docs módulo + demo DoD

## Criterios de aceptación (DoD de E5)
Flujo completo en vivo (ingreso → gestión → pedido de ayuda → cierre solo con etapa y tipo cambiando) + admin configurando el canal desde cero y probando el kill switch.

## Reglas de ejecución
Test-first en cambios de comportamiento; tests/lint solo de archivos modificados (modo apply); pnpm; nunca commitear `.env*`; un work-unit commit por tarea (Conventional Commits); sin push/PR/merge sin pedido del usuario.

## Progreso / Evidencia
- 2026-10-17: rama creada, plan bloqueado con 4 decisiones del usuario.
- 2026-10-17 T1 done: RED observado (módulo inexistente) → GREEN `cifradoSecretos.test.ts` 14/14 · eslint del directorio limpio · tsc 0 errores en `infrastructure/config`. Payload `v1:<iv>:<tag>:<ct>`; clave base64 o hex de 32 bytes; sin fallback en claro; errores sin material sensible; `enmascararSecreto` para la UI. Commit `47f2880`.
- 2026-10-17 T2 done: RED (repo inexistente) → GREEN `sqlServerConfigRepository.test.ts` 8/8 + `migrate.test.ts` (34/34 juntos, integración DB dev real) · tsc 0 · eslint limpio · residuo cero verificado. Tablas `CRM_Config` (PK clave) + `CRM_ConfigAuditoria` (sin FK: la traza sobrevive al borrado). Upsert+auditoría en UNA transacción con UPDLOCK/HOLDLOCK; los secretos NUNCA entran a la auditoría (valores NULL); `listar` escapa comodines LIKE. Contenedor `getCrmDb().config`. Commit `0312d0d`.
