# CRM: vista Inactivas (clientes SIGLA sin actividad 4+ meses)

Dentro de la página `/crm` agregar una segunda vista (tab) que lista exclusivamente las
empresas clientes de SIGLA que hace 4 o más meses no envían pacientes, ordenadas por
antigüedad. El kanban actual queda intacto como tab "Pipeline".

## Specs

- S1: El usuario pidió dos vistas dentro de CRM: «dentro de la pestaña crm o sea dentro de ese de la vista crm tendría una vista para ver kanban y otra para ver solo las que están inactivas». Tab switch "Pipeline" | "Inactivas"; el kanban actual no cambia.
- S2: Alcance de "inactivas" (respuesta del usuario, verbatim): «cuentan como inactivas las empresas que tenemos agregadas en el Sigla, osea que ya don nuestros clientes, pero ya hace mas de 4 meses que no enviar pacientes a la clinica». Derivado: empresas CRM con `relacion='cliente'` y `ruc` no nulo; estado computado con `estadoActividadServicios` (domain/actividadServicios.ts) usando `ultimaAtencion` de SIGLA (`Cliente.NroRuc`, `IndReg=1`, `MAX(O.FecAte)`). Entran `'sin_actividad'` (≥ UMBRAL_MESES_INACTIVIDAD=4 meses) y `'pendiente_primera'` (RUC sin ninguna atención en SIGLA, incluye RUC desconocido para SIGLA — regla S6.7 existente: jamás se rotulan "inactivos", van al final de la lista). `'sin_informacion'` (cliente sin RUC) se excluye del listado y se muestra como contador informativo; los prospectos quedan fuera de la vista por completo.
- S3: Formato elegido: lista priorizada (tabla). Orden: meses sin actividad descendente — la más abandonada arriba; las "nunca atendidas" (`pendiente_primera`) al final. Columnas: razón social · sector · meses sin actividad · última atención (fecha o "nunca") · último contacto CRM (fecha/días o "—") · acción "Registrar contacto". Badge con contador en el tab: `Inactivas (N)`.
- S4: Umbral fijo en 4 meses (elección del usuario): constante `UMBRAL_MESES_INACTIVIDAD`, sin UI de configuración.
- S5: Datos: nuevo método bulk en el port de atenciones — una consulta SQL por lote de RUCs (chunks), misma semántica que `ultimaAtencion(ruc)` individual. Endpoint `GET /api/crm/empresas/inactivas` con la misma política de auth que las rutas `/api/crm` existentes y 503 con JSON si SIGLA falla (patrón de `/api/crm/empresas/[id]/atencion`).
- S6: La acción "Registrar contacto" reutiliza el flujo existente (`registrarActividad` / panel actual). Al guardar se refresca el último contacto CRM de la fila; la fila NO sale de la lista: solo desaparece cuando SIGLA registre una nueva atención (el contacto CRM no mueve SIGLA).

## Tasks

- T1 (S2,S4,S5) dominio/aplicación: port `ultimaAtencionPorRucs(rucs: string[])`; implementación SQL Server bulk con chunks; use case `listarEmpresasInactivas` (clientes con ruc → bulk → estados → filtro `sin_actividad`+`pendiente_primera` → orden → resumen excluidas). Tests unitarios con fakes in-memory (RED→GREEN). Route: feat(crm)
- T2 (S5) endpoint `GET /api/crm/empresas/inactivas` + auth según `RUTAS_PROTEGIDAS`/modelo `/api/crm` + 503 SIGLA. Test del handler. Route: feat(crm)
- T3 (S1,S3) UI: tab switcher en `/crm` (patrón `ConsolidadosViewSwitch`), componente `CrmInactivas.tsx` (tabla, loading, error, vacío, contador excluidas, badge en tab). Tests de componente. Route: feat(crm)
- T4 (S6) acción "Registrar contacto" cableada al panel existente + columna último contacto CRM + refresh tras registrar. Test. Route: feat(crm)
- T5 (S1) docs: actualizar `docs/ux-crm-flujo-y-pantallas.md` con la nueva tab/vista. Route: docs

## Log

- L1 (pedido original, verbatim): «vamos a trabajar en el crm que tenemos actualmente bueno en la vista del crm que ya tenemos actualmente tengo una vista kanban en la cual puedo ver por columnas el por contactar contactado cotizados en seguimiento perdido ganado etcétera Pero ahora lo que quiero es poder visualizar solamente las empresas a las quelas empresas con las que aún no tengo contacto desde hace 4 meses una vista exclusiva solo para ellas Pero dentrode la pestaña crm o sea dentro de ese de la vista crm tendría una vista para ver kanban y otra para ver solo las que están inactivasComo qué ideas me propones con respecto a esa nueva pestaña o tab»
- L2 (decisiones del usuario): formato «Lista priorizada (recomendada)»; alcance custom (verbatim en S2); umbral «Fijo en 4 meses».
- L3 (hallazgos de exploración): atenciones se consultan EN VIVO contra SIGLA producción (`Cliente`+`Orden` por `CodCli`, link CRM↔SIGLA solo por RUC); hoy solo existe `ultimaAtencion(ruc)` por empresa (N+1 imposible para lista); `estadoActividadServicios` ya implementa el umbral de 4 meses; no hay endpoint bulk ni lista de inactivas; tab patterns existentes: `ConsolidadosViewSwitch.tsx`, `FilesTabs.tsx`.
- L4 (decisión de diseño): la fila permanece tras registrar contacto CRM (la inactividad la define SIGLA); se agrega columna de último contacto CRM para visibilizar quién está siendo trabajado (S6).
