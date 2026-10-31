# crm-simple
Simple CRM rebuilt from scratch after the AI/WhatsApp/email CRM was discarded. Branch `feature/crm-simple` (worktree `~/DEV/holomedic-cobros-worktrees/crm-simple`), no push.
Chosen design: `design/crm-kanban/02-panel-lateral.html` (design PC, not in this repo).

## Specs
- S1: "quiero tener una opción en el sidebar: CRM."
- S2: "Al abrir, que me muestre un tablero Kamban con una lista de empresa a las que puedo contactar."
- S3: "Ademas de tener un formulario para crear contactos (empresas nuevas)"
- S4: Form shown as a right side panel that floats OVER the board without moving it (the board keeps the exact same position and size with the panel open or closed; it only covers the right part). The user chose "02 · Panel lateral (recomendada)" and commented: "A la hora de mostrar el panel, pero no tiene que mover el contenido de atras". Fields as drawn in that artboard: Razón social*, RUC* (11 digits), Sector, Nombre*, Teléfono*, Correo (opcional), Notas (opcional). A new empresa lands in the first column.
- S5: Columns, exactly: Por contactar / Contactado / En seguimiento / Cliente. The user answered "Sí, dejarlas así". A card can be moved between columns (drag or buttons, as drawn).
- S6: "elimina las tablas antiguas y vamos a crear una nuevas" — old CRM_* tables are already dropped (see L3); new storage uses new tables.

## Tasks
- T1 (S6): Storage. Domain entity + port + `migrate()` + SQL Server repository + `getCrmDb` for `dbo.CrmEmpresa`. Table name MUST NOT start with `CRM_` (the old CRM in production recreates `CRM_*` idempotently and SQL Server names are case-insensitive). Route: inline. Commit: 853f827
- T2 (S3, S4, S5): Use cases `crearEmpresa` (trim, RUC exactly 11 digits, required fields, duplicate RUC rejected, starts in "Por contactar"), `listarEmpresas`, `moverEmpresa` (only the four stages). Route: inline. Commit: 827b6f5
- T3 (S2, S3, S5): API `GET/POST /api/crm/empresas` and `PATCH /api/crm/empresas/[id]/etapa`, gated by the existing `crm` permiso (no new permiso). Route: inline. Commit: f26186c
- T4 (S1, S2, S3, S4, S5): Page `/crm` with the board and the side panel, moving cards persists through T3. Route: inline. Commit: 605ee48
- T5 (S1): Sidebar "CRM" entry already exists and links to `/crm`; verify it end to end with T4. Route: inline. Commit: pending

## Log
- L1: "Para empezar, quiero tener una opción en el sidebar: CRM. Al abrir, que me muestre un tablero Kamban con una lista de empresa a las que puedo contactar. Ademas de tener un formulario para crear contactos (empresas nuevas)"
- L2: Design choice answers: direction "02 · Panel lateral (recomendada)"; columns "Sí, dejarlas así"; data: "elimina las tablas antiguas y vamos a crear una nuevas".
- L3: Event, not a requirement: on 2026-10-31 the 22 `CRM_*` tables (321 rows) were dropped from the shared HOLOMEDIC database after explicit user authorization ("Sí, borrar ahora"). Backup (data + columns, not DDL): `~/backups-crm/crm-viejo-2026-10-31T16-25-59-420Z.json` on the server, sha256 df0644d9ba5dc93b…. Production still runs image `holomedic-cobros:84c3a53` with the old CRM code, which may recreate empty `CRM_*` tables if its CRM page is opened.
- L4: Scope decision (mine, to be confirmed by use): one table `CrmEmpresa` holding the empresa and its principal contact, no separate contacts table, since the requested form creates "empresas nuevas" with one principal contact.
- L5: Design comment pr6cscqf on 02-panel-lateral.html (verbatim): "A la hora de mostrar el panel, pero no tiene que mover el contenido de atras". Applied to the artboard and measured in a browser: board geometry identical with the panel open and closed.
- L6: Verified with a real browser against the artboard: board geometry identical with the panel open or closed (artboard). In the running app, the proxy returns 307 to login for /crm and 401 for the three /api/crm routes without a session; the logged-in board has NOT been checked by me (only `soporte` holds the `crm` permiso and I do not have its password).
