# crm-contactos — rehearsal on the shared HOLOMEDIC database (S11, T7)

- Date: 2026-11-01 05:04 UTC.
- Server: 172.16.10.14, SQL Server 15.0.2180.2, database HOLOMEDIC, the app login.
- Migration: the exact SQL that `migrate()` sends at commit ab36ecb (8021 bytes; no DROP TABLE, DELETE, TRUNCATE or `CRM_`).
- Method: one batch on one connection: `SET XACT_ABORT ON; BEGIN TRAN ensayo;`, the migration SQL, read back the resulting catalog and rows, `ROLLBACK TRAN`. Fingerprint before and after: catalog of the 4 Crm tables, a hash of every row, and `modify_date` of every object.

## Backup (taken before the rehearsal)

`svrnode:~/backups-crm/crm-antes-de-contactos-2026-11-01T05-04-40-433Z.json` (mode 600, 4512 bytes): CrmSector 7 rows, CrmEmpresa 1, CrmContacto 1, plus the schema catalog. The earlier backup `crm-viejo-2026-10-31T16-25-59-420Z.json` is kept.

## Result

- Ran in 133 ms. `@@TRANCOUNT` 1 inside, 0 after the rollback.
- Rows inside the rehearsal: 7 sectors, 1 empresa, 1 contact, 0 interactions. The existing empresa keeps its RUC and stage, with `intentosSinRespuesta` 0 and the new fields NULL.
- After the rollback: schema identical, data identical, `modify_date` identical. The database was left exactly as before.

## What applying it changes (31 added, 5 removed)

Removed or replaced:
- `CK_CrmEmpresa_medio` (llamada, correo, whatsapp) → recreated with `otro`.
- `CrmEmpresa.ruc` NOT NULL → NULL. `UQ_CrmEmpresa_ruc` → `UX_CrmEmpresa_ruc` UNIQUE WHERE ruc IS NOT NULL. `CK_CrmEmpresa_ruc` (11 digits) stays.
- `CrmContacto.nombre` and `.telefono` NOT NULL → NULL.

Added:
- `CrmEmpresa`: medioOtro, intentosSinRespuesta (default 0), faltaResponderDesde, proximaAccionTipo (CHECK, 7 values), proximaAccionDetalle, proximaAccionFecha, origen (CHECK, 4 values), sugerenciaDescartadaEn.
- Table `CrmInteraccion` (10 columns, CHECKs on direccion, medio and resultado, FK to CrmEmpresa ON DELETE CASCADE, index on idEmpresa and fecha).

## Not done here

Applying the migration. That needs the user's OK (S11).
