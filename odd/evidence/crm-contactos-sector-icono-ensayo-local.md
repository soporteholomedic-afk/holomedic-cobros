# CRM contactos — local rehearsal of the sector icon migration (S12, T9)

- **Date:** 2026-11-01.
- **Under test:** the generated `migrate()` SQL of the T8 change (sha256 prefix `7836077fb203418a`, 8965 bytes). The "previous schema" is the SQL of e3f3694, which is the one applied on the shared DB (L11).
- **Method:** each scenario creates a throwaway database, runs the exact batch, checks the result and drops the database. The shared server (172.16.10.14) and the `HOLOMEDIC` database of `holomedic-dev-sql` were not touched.
- **Servers:**
  - SQL Server 2022 `16.0.4295.3` (`holomedic-dev-sql`, throwaway DBs only).
  - SQL Server 2019 CU18 `15.0.4261.1`, in a throwaway container on 127.0.0.1:14339 that was removed after the run.

## Result: 9/9 PASS on both servers

| Scenario | 2022 | 2019 |
|---|---|---|
| Fresh DB: the 6 initial sectors get their icons (Construcción casco, Minería y Energía pico, Fábrica y Producción fabrica, Transporte y Almacén camion, Comercio y Tiendas tienda, Oficinas y Servicios maletin) | PASS | PASS |
| Fresh DB: a second run is a no-op (data, columns and CHECKs identical) | PASS | PASS |
| Previous schema plus a sector created from the UI ("Educación") plus one empresa: the initial sectors get icons, "Educación" stays NULL | PASS | PASS |
| Previous schema: the empresa rows are identical before and after | PASS | PASS |
| Previous schema: a second run is a no-op | PASS | PASS |
| An icon already chosen (Construcción = edificio) is never overwritten | PASS | PASS |
| The CHECK rejects an icon outside the list (`cohete`) | PASS | PASS |
| The CHECK accepts a valid icon (`Salud y Clínicas` = salud) | PASS | PASS |
| A failure forced after the icon steps (THROW before COMMIT) rolls back everything: data, columns and CHECKs identical to before | PASS | PASS |

**About the first 2022 run:** the forced-failure row reported FAIL with "Invalid column name 'icono'". The cause was the fingerprint query of the rehearsal script itself, which read `icono` from the pre-migration schema. It now reads `SELECT *`, and the scenario passes.

## Shared database: backup and rolled-back rehearsal (2026-11-01 18:55 UTC)

- **Server:** SQL Server 15.0.2180.2, database `HOLOMEDIC` on 172.16.10.14. The script aborts unless `DB_NAME()` is `HOLOMEDIC`. SIGLA was not touched.
- **SQL:** the same batch, sha256 prefix `7836077fb203418a`. It ran from the preview server worktree, and both scripts were deleted afterwards.
- **Backup:** `svrnode:~/backups-crm/crm-antes-de-icono-sector-2026-11-01T18-55-16-780Z.json` (mode 600, 8400 bytes). It holds all the rows of CrmSector (7), CrmEmpresa (2), CrmContacto (2) and CrmInteraccion (1), plus the schema catalog. It was read back after writing.
- **Rehearsal:** `BEGIN TRAN` → migration → read back → `ROLLBACK`. It ran in 138 ms. Trancount was 1 inside and 0 after.
- **Changes the migration would make:** 2 added, 0 removed.
  - `col CrmSector.icono nvarchar(40) NULL`. The catalog reports bytes, so this is NVARCHAR(20).
  - `check CrmSector.CK_CrmSector_icono`, limited to the 12 icon keys.
- **Sectors as it would leave them:** Comercio y Tiendas tienda, Construcción casco, Fábrica y Producción fabrica, Minería y Energía pico, Oficinas y Servicios maletin, Transporte y Almacén camion. "Desarrollo de Software" was created from the UI and stays without an icon.
- **Row counts inside the rehearsal:** unchanged (7 / 2 / 2 / 1).
- **After the rollback:** schema, data and `modify_date` were all identical to before. Result: the database was left exactly as it was.

## Shared database: applied (2026-11-01 19:04 UTC)

- **User OK:** "Aplicarlo y actualizar la vista previa (recomendado)".
- **Fresh backup first:** `svrnode:~/backups-crm/crm-antes-de-aplicar-icono-sector-2026-11-01T19-04-53-730Z.json` (8400 bytes), with every row of the 4 Crm tables.
- **SQL:** sha256 prefix `7836077fb203418a`, the same batch as the rehearsal. It ran in 72 ms, and trancount afterwards was 0.
- **Changes:** 2 added and 0 removed, as rehearsed:
  - `CrmSector.icono` NVARCHAR(20) NULL.
  - `CK_CrmSector_icono`.
- **Data:**
  - CrmEmpresa, CrmContacto and CrmInteraccion are identical to before.
  - In CrmSector, every original column is identical to the backup, row by row.
  - Icons now: Construcción casco, Minería y Energía pico, Fábrica y Producción fabrica, Transporte y Almacén camion, Comercio y Tiendas tienda, Oficinas y Servicios maletin. "Desarrollo de Software" has none.
- **Second run:** a no-op.
- **SIGLA:** untouched. The script aborts unless it is connected to `HOLOMEDIC` on 172.16.10.14.
- **Preview:**
  - The server worktree `crm-simple` was fast-forwarded through a git bundle to 5acb9ba.
  - On http://172.16.10.20:3001, `/auth/login` answers 200, and `/api/crm/sectores` and `/api/crm/entrantes` answer 401 without a session.
  - Production on :3000 is unchanged and answers 200.
