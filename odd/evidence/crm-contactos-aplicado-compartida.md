# crm-contactos — migration applied on the shared HOLOMEDIC database (S11, T7)

- Date: 2026-11-01 05:20 UTC. User OK: "Aplicarlo junto con la vista previa (recomendado)".
- Server: 172.16.10.14, SQL Server 15.0.2180.2, database HOLOMEDIC (the script aborts on any other database; SIGLA was not touched).
- SQL: the exact `migrate()` batch of commit ab36ecb (sha256 prefix 88d4d981663e0cfc), the same one rehearsed in `crm-contactos-ensayo-compartida.md`. `migrate.ts` and `entities.ts` are unchanged between ab36ecb and df00c75.

## Backup taken right before applying

`svrnode:~/backups-crm/crm-antes-de-aplicar-contactos-2026-11-01T05-20-32-712Z.json` (mode 600): CrmSector 7, CrmEmpresa 1, CrmContacto 1, plus the schema catalog.

## Result

- Applied in 76 ms; `@@TRANCOUNT` 0 afterwards.
- Schema change: 31 added, 5 removed, line by line the same list the rolled-back rehearsal predicted.
- Data: every original column value of the 7 + 1 + 1 rows is identical to the backup (compared column by column on the backup's columns). The script's whole-row hash differed only because the rows now carry the new columns (`intentosSinRespuesta` 0, the rest NULL).
- A second run changed nothing (schema, rows and `modify_date` identical).

## Preview deploy

- Server worktree `~/DEV/holomedic-cobros-worktrees/crm-simple` moved by fast-forward to `feature/crm-contactos` df00c75 through a git bundle (nothing pushed to GitHub). No dependency change since 3ea38d5.
- The running `next dev` on port 3001 recompiled. Without a session: `/crm` 307 to `/auth/login`, and every new route (`historial`, `entrantes`, `ruc`, `sugerencia`, `contactos`) answers 401 `{"success":false,"error":"No autenticado"}`.

## Not verified

The board with a real session in the browser: only the `soporte` user has the `crm` permission and its password is not available to the agent. No session was faked.
