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
