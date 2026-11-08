# Módulo crm (rediseño Empresa / Oportunidad / Actividad)

> Ubicación: `src/features/crm/` · Página `/crm` · API `/api/crm/*` · Feature doc: `odd/tasks/crm-oportunidades.md`

## Propósito

Gestión comercial separando tres conceptos que antes vivían en una sola tarjeta:

| Concepto | Qué es | Dónde vive |
|---|---|---|
| **Empresa** | Ficha permanente de la organización con la que Holomedic tiene una relación comercial. Una sola ficha por empresa. | `dbo.CrmEmpresa` + `dbo.CrmContacto` — con `relacion` (`prospecto`/`cliente`); **nunca** es una tarjeta del tablero |
| **Oportunidad** | Un negocio concreto que se busca conseguir o cerrar. Una empresa puede tener varias simultáneamente, incluso con distintos responsables. | `dbo.CrmOportunidad` — **es** la tarjeta del Kanban |
| **Actividad** | Cada interacción comercial (llamada, correo, WhatsApp, medio, resultado, resumen, próxima acción). Pertenece al historial de la empresa y puede vincularse a una oportunidad. | `dbo.CrmInteraccion` — `idOportunidad` NULL = actividad general |

Reglas base (documento `docs/subidos/2026-11-07-20-06-19-Mejoras-CRM.txt`): una empresa nunca se considera perdida porque una negociación fracase; ganar una oportunidad no implica que se realizó un servicio; la relación (Prospecto/Cliente) solo cambia manualmente; las oportunidades perdidas conservan su motivo e historial; una nueva negociación es una oportunidad nueva, nunca sobrescribe la anterior.

## Tablero Kanban (`/crm`)

Columnas = `ETAPAS_OPORTUNIDAD`: **Por contactar → Contactado → En seguimiento → Cotizado → Ganada / Perdida**. La etapa "Cliente" salió del tablero (es la relación de la empresa); "Cotizado" distingue propuestas presentadas de conversaciones; "Ganada" reemplaza al viejo estado Cliente como resultado de la oportunidad.

- La tarjeta muestra: empresa + nombre del negocio, RUC/sector, servicio de interés, responsable, monto estimado, origen, estado de seguimiento, próxima acción, motivo (Perdida), chip «Migrada» para deals creados por la migración.
- Mover: `PATCH /api/crm/oportunidades/[id]/etapa` — a **Perdida** exige motivo (diálogo), a **Contactado** desde Por contactar exige medio (diálogo), **Ganada** no pide nada; cerrar limpia la próxima acción. Una empresa puede verse en varias columnas (varios negocios).
- Búsqueda filtra por empresa, negocio, RUC, servicio y responsable.

## Ficha de empresa (panel de detalle)

Orden: encabezado (razón social, RUC con autocompletado SUNAT, sector, **relación con toggle manual** → `PATCH /api/crm/empresas/[id]/relacion`) → **Actividad de servicios** (leída en vivo de SIGLA) → **Último contacto** → **Oportunidades · N registradas** (cada una con etapa, medio editable y motivo si está perdida) → Contactos → Historial completo (cada fila indica el negocio vinculado o «General») → Notas.

### Actividad de servicios (SIGLA en vivo)

`GET /api/crm/empresas/[id]/atencion` consulta SIGLA read-only (`Cliente.NroRuc → Orden.CodCli → MAX(Orden.FecAte)`, implementado en `SqlServerAtencionesRepository` sobre el pool `DB_*`). Estados derivados (`domain/actividadServicios.ts`): **Sin información** (sin RUC o prospecto), **Pendiente de primera atención** (cliente con RUC y cero atenciones en SIGLA — nunca «inactiva»), **reciente / Sin actividad de servicios reciente** (umbral `UMBRAL_MESES_INACTIVIDAD = 4` meses por **servicios**, no por llamadas). La señal solo se actualiza con atenciones reales; una llamada reciente no la limpia.

## Flujos (S4)

| Acción | Comportamiento |
|---|---|
| Nueva empresa | Crea la ficha (sin oportunidad obligatoria) y **ofrece** crear su primera oportunidad en el mismo formulario |
| Nos contactaron | Busca la empresa; si existe crea una oportunidad vinculada; si no, registra empresa + primera oportunidad (`existente` en la respuesta) |
| Registrar actividad | Antes «Registrar contacto»; permite vincularla a una oportunidad o dejarla general |
| Mover tarjeta | Mueve una oportunidad, no la empresa |
| Ver empresa | Información general, oportunidades, contactos e historial completo |
| Importar empresas | Crea fichas; nunca genera oportunidades automáticas |

## Esquema y migración

`migrate.ts` (batch idempotente autoejecutado en el primer request, `sp_getapplock`) creó `dbo.CrmOportunidad` (etapa/medio/motivo/seguimiento/`migrada`), agregó `CrmEmpresa.relacion`, `CrmInteraccion.idOportunidad` (FK) y **retiró** las 14 columnas de la era-etapa de `CrmEmpresa`. Migración de datos (decisión del usuario, S8 del feature doc): etapas abiertas → oportunidad con la misma etapa + próxima acción + origen copiados; `perdido` → oportunidad `perdida` conservando el motivo; `cliente` → solo relación, **sin tarjeta sintética**; todo lo migrado lleva `migrada = 1` y nombre «Gestión comercial inicial». Ensayada de punta a punta en contenedor SQL Server local (upgrade + instalación fresca).

## API principal

`/api/crm/empresas` (GET/POST/PATCH `[id]`, `[id]/relacion`, `[id]/atencion`, `[id]/actividades`, `[id]/historial`, `[id]/ruc`), `/api/crm/oportunidades` (GET/POST, `[id]`, `[id]/etapa`, `[id]/seguimiento`, `[id]/sugerencia`), `/api/crm/entrantes`, `/api/crm/alertas`, `/api/crm/importar/*`, `/api/crm/sectores`, `/api/crm/ruc/[ruc]`, `/api/crm/configuracion/apifacturacion/*`. Autenticación: permiso `crm` (sin cambios); `crm_configuracion` sigue solo para la config SUNAT (ver `crm-consulta-sunat.md`).

## Tests

Dominio + aplicación + infraestructura + API + presentación por capa (`__tests__/` junto a cada módulo; 224 tests de rutas, 252 de aplicación, 87 de infraestructura SQL, 87 de tablero, 117 de ficha y los suites de flujos). La migración cuenta además con ensayo de integración en contenedor documentado en el feature doc (L9).
