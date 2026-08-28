# Smoke Test Findings — REQ-03 (Task 1.0)

Date: 2026-08-27 · Profile: **EXPLORADOR_DATOS only** (`explorar_datos` @ 172.16.10.14, DB `SIGLA`) · Read-only probes (sys metadata + SP sources via `VIEW DEFINITION`).

## 1. SP_RPT_REPFACTURACION — verified parameter names (BIND FREEZE)

From `sys.parameters` **and** the SP source (`sys.sql_modules`, readable via database-wide `VIEW DEFINITION` grant):

| # | Parameter | Type | mssql bind |
|---|-----------|------|-----------|
| 1 | `@FecIni` | `DATETIME` | `mssql.DateTime` |
| 2 | `@FecFin` | `DATETIME` | `mssql.DateTime` |
| 3 | `@CodCli` | `INT` | `mssql.Int` |
| 4 | `@CodCFa` | `INT` | `mssql.Int` |
| 5 | `@CodDes` | `INT` | `mssql.Int` |
| 6 | `@CodPac` | `INT` | `mssql.Int` |
| 7 | `@CodSed` | `INT` | `mssql.Int` |
| 8 | `@IndFac` | `BIT` | `mssql.Bit` |
| 9 | `@TipTra` | `INT` | `mssql.Int` |
| 10 | `@CodMon` | `INT` | `mssql.Int` |
| 11 | `@InFSTA` | `BIT` | `mssql.Bit` |

**Corrections vs design D2:**
- ❌ Design assumed `@p…`-prefixed names → **actual names have NO `p` prefix**.
- ❌ Design said `indFac Int` → **actual type is `BIT`** (tri-state: `NULL` | `true` | `false`).
- ⚠️ Exact casing matters: `@InFSTA` (not `@pInFsta`), `@CodCFa` (capital F), `@FecIni/@FecFin`.

## 2. Result set shape

Final statement: `SELECT * FROM #tmpFacturacion [WHERE FecSTA IS NOT NULL AND ItemEx <> 0] ORDER BY FecAte, ItemEx` (the `WHERE` applies when `@InFSTA = 1`).

- **`SELECT *` returns 45 columns**, not 38: the reader-consumed set (39 — the design's "38" was off by one) plus 6 internal columns `Identi, CodEmp, CodSed, CodTCl, NumOrd, NumSSe`. The mapper reads by exact name; extras are ignored.
- Reader-consumed columns (exact casing, verified against the temp-table DDL): `NomCFa, NomCom, DesDes, CenCos, NroDId, Pacien, EdaPac, FecNac, DesPue, DsTiTr, FecAte, FecSTA, DesTCh, NomPro, Result, Anex7D, CodMon, DesMon, Simbol, VImpMN, VImpMO, VVtaMN, VVtaMO, Solici, Admini, IdAten, ItemEx, TipDov, NumDov, EstCob, NomCli, IndCon, IdConv, CodSeC, NumCob, NroVal, NroOPe, CodiEM, FecRec`.
- Nullability (from DDL + SP logic): `FecSTA`, `FecNac`, `FecRec`, `NumDov`, `CodSeC`, `NumCob` are nullable. Adicional rows (inserted by the SP loop) have `FecNac = NULL`, `DsTiTr = NULL`, and carry the service name in `DesTCh` with `ItemEx =` adicional index.
- **Empty-result shape**: plain `[]` (same 45-column metadata) — no special empty marker.
- `NUMERIC(14,4)` amounts → JS numbers via mssql.
- SP-internal transforms to keep in mind for the UI:
  - `NroDId` = `TipDId + ' ' + NroDId` (doc-type prefix, e.g. `"DNI 46145583"`).
  - `EstCob` remapped inside the SP: `T→C`, `P→PP`, `N→P`.
  - **Adicionales are already applied inside the SP** (extra rows inserted + parent `VVta/VImp` decremented). Slice 2's manual ajuste is only needed for `SP_RPT_CONSOLIDADOFACTURACION`, not the detail query.

## 3. ⚠️ Grants reality (OPS ACTION REQUIRED)

`explorar_datos` today has:
- DB-level: `CONNECT` + `VIEW DEFINITION` granted; `INSERT`/`UPDATE`/`DELETE` **DENIED** (read-only by construction ✓).
- Table/view `SELECT`: works (Cliente, Destino, Constante, TipoConstante, Persona, VW_SEDE, Tbl_Moneda, INFORMATION_SCHEMA, sys views).
- **`EXECUTE` is DENIED on `SP_RPT_REPFACTURACION` and `SP_SEL_SEDE`** (and, presumably, every SP). The SP execution path cannot run until ops grants:

```sql
GRANT EXECUTE ON dbo.SP_RPT_REPFACTURACION TO explorar_datos;
GRANT EXECUTE ON dbo.SP_RPT_CONSOLIDADOFACTURACION TO explorar_datos; -- slice 2
```

The repository binds are frozen from verified metadata above; the runtime `/api/valoraciones/sigla` call will surface a user-safe 500 until the grant lands. Lookups do NOT depend on the grant (direct typed queries).

## 4. Lookup sources (verified)

| Lookup | Source (verified) | Notes |
|---|---|---|
| Clientes / facturar-a | `Cliente` (`CodCli INT`, `NomCom`, `NroRuc`, `IndReg BIT`) | RUC populated **3547/3551** (99.9%). Search `NomCom LIKE` or `NroRuc LIKE`, filter `IndReg = 1`. Facturar-a is the same table (bound to `@CodCFa`). |
| Pacientes | **`Persona`** (no `Paciente` table exists) — `CodPer INT`, `ApePat`, `ApeMat`, `NomPer`, `NroDId`, `IndPac BIT`, `IndReg BIT` | `VW_FACTURACION` joins `Persona P ON P.CodPer = O.CodPac`. Filter `IndPac = 1 AND IndReg = 1`; name = `ApePat + ApeMat + NomPer` (SIGLA's own composition drops empty `ApeMat`); search by `NroDId` or name. |
| Destinos by client | `Destino` (`CodDes INT`, `CodCli INT`, `DesDes`, `IndReg BIT`) | `WHERE CodCli = @x AND IndReg = 1 ORDER BY DesDes` — verified sample rows. |
| Tipo trabajador | `Constante` (`CodCon INT`, `CodTCo INT`, `DesCon`, `IndReg`) | **`CodTCo = 62` = "TIPO DE TRABAJADOR"**: `620001 OBRERO`, `620002 EMPLEADO` (only active values). Hardcoded fallback (D7) = these two. |
| Sedes | **`VW_SEDE`** (`CodSed INT`, `NomSed`, `IndReg`) — `SP_SEL_SEDE` is just `SELECT * FROM VW_SEDE [+WHERE][+ORDER]` via dynamic SQL, and EXECUTE is denied | Query the view directly: `WHERE IndReg = 1 ORDER BY CodSed` (typed static SQL — also safer than the SP's dynamic WHERE). Sample: 1 SEDE SURQUILLO, 2 CAMPAÑA (HISTORICO), 3 CAMPAÑA. |
| Moneda | `Tbl_Moneda`: `1 SOLES s/.`, `2 DOLARES $` | Hardcoded 1/2 constants per design (verified values). |

## 5. Other verified facts

- `VW_FACTURACION` exposes all 11 filter columns (`FecAte, FecSTA, CodCli, CodCFa, CodDes, CodPac, CodSed, IndFac, TipTra, CodMon`) — consistent with the SP's WHERE clause.
- SIGLA DB objects confirmed reachable read-only: `sys.procedures`, `sys.parameters`, `sys.sql_modules`, `INFORMATION_SCHEMA.*`, `Cliente`, `Destino`, `Constante`, `TipoConstante`, `Persona`, `VW_SEDE`, `Tbl_Moneda`.
- Probe scripts (temp, not committed): `%LOCALAPPDATA%\Temp\opencode\smoke-req03*.js`.

## 6. Bind corrections applied to implementation

- `REPFACTURACION_BINDS` uses the verified no-prefix names with `mssql.Bit` for `IndFac`/`InFSTA`.
- `SiglaValoracionesRepository.buscarSedes()` queries `VW_SEDE` directly (no SP dependency, no EXECUTE grant needed).
- Paciente lookup targets `Persona` with `IndPac = 1 AND IndReg = 1`.
- Tipo trabajador runtime query uses `CodTCo = 62`; fallback constant = OBRERO/EMPLEADO pair.
- Entity `RepFacturacion` maps the 39 reader columns; the 6 extra `SELECT *` columns are documented as ignored.
