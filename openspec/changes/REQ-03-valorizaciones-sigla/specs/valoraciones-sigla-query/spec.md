# Valoraciones SIGLA Query Specification

## Purpose

Read-only valorizaciones query against SIGLA, mirroring `RptFacturacionForm`: lookups, filters, table, auth; replaces the CSV flow.

## Requirements

### Requirement: Read-only pool with `sa` rejection

The module MUST use `getSiglaReadOnlyPool()` in `src/lib/db.ts` (`SIGLA_RO_*` env, fallback `DB_*`, login `explorar_datos`), rejecting configs resolving to `sa`.

#### Scenario: `sa` rejected

- GIVEN the resolved user is `sa`
- WHEN the repository requests a connection
- THEN a configuration error is raised, no query executes

### Requirement: SP smoke test before bind freeze

Before binds freeze, one EXPLORADOR_DATOS smoke test MUST verify `SP_RPT_REPFACTURACION` `@p…` parameter names, 38-column casing, nullability, and empty-result shape; findings correct binds. (Slice 1)

#### Scenario: Verified names drive binds

- GIVEN the smoke test finds a wrong parameter name
- WHEN binds are frozen
- THEN repository and tests use verified names

### Requirement: 11-filter query and mapping

`GET /api/valoraciones/sigla` MUST validate and execute the 11 REQ-03 §2 filters: periodo required (`FecIni 00:00:00`, `FecFin 23:59:59`); moneda required (`1`=SOLES, `2`=DOLARES); IndFac tri-state NULL/1/0 default No Facturados (`0`); date-mode false→`FecAte`, true→`FecSTA`; absent/`<=0` numerics become NULL. SP calls MUST use typed `request.input()` binds (no interpolated `EXEC`). Invalid input → 400; SP failures → user-safe 500 (no SP-name leakage). Rows map to `RepFacturacion` with exact casing (`FecSTA`, `VImpMN/MO`, `VVtaMN/MO`, `CodiEM`), ISO boundary dates, `dd/MM/yyyy` display.

#### Scenario: 11-filter query (Gherkin 1)

- GIVEN an operator with permiso `valoraciones`
- WHEN querying atención-mode dates, SOLES, No Facturados, plus optional filters
- THEN `SP_RPT_REPFACTURACION` runs via the read-only pool, returning rows

#### Scenario: Invalid period rejected

- WHEN the period is missing or inverted
- THEN the API returns 400 with no SP call

#### Scenario: Exact casing and NULLs

- GIVEN an SP row with `FecSTA = NULL`
- WHEN mapped
- THEN casing stays exact, NULL maps cleanly

### Requirement: Lookup endpoints

Lookups MUST use typed parameterized queries on the read-only pool: cliente/facturar-a autocomplete by name/RUC → `{codCli, nomCom, nroRuc}`; paciente by DNI or apellidos/nombres; destino by client (`IndReg=1`); tipo trabajador from SIGLA constants (hardcoded fallback); sedes.

#### Scenario: Cliente lookup returns RUC

- WHEN searching clients by name or RUC
- THEN results include `nroRuc` when populated

#### Scenario: Destino requires a client

- GIVEN no client selected
- WHEN destino lookup runs
- THEN results are empty

### Requirement: Filter panel mirrors RptFacturacionForm

The panel MUST mirror SIGLA's 11 controls: periodo defaults today; IndFac defaults No Facturados; client selection loads destinos and enables Consolidado, clearing resets both; Consolidado disabled in slice 1, enabled in slice 2.

#### Scenario: Client selection gates consolidado

- WHEN a client is selected then cleared
- THEN destinos load; Consolidado enables (slice 2) or stays disabled (slice 1); clearing resets both

### Requirement: Results table (detail and consolidado)

Detail mode (slice 1) MUST render grouped atenciones (importes, cantidades, estado), amounts moneda-aware via `CodMon` (`*MN`/`*MO`). Consolidado mode (slice 2) MUST call `SP_RPT_CONSOLIDADOFACTURACION` (dropping `pCodCFa`, `pCodMon`, `pInFsta`), apply the Adicionales ajuste (preocupacional `VVtaMn -= ValVta`; adicionales replace; `VImpMn -= ValImp`), with per-destino subtotals, 18% IGV, totals matching SIGLA.

#### Scenario: Detail table renders (Gherkin 1)

- GIVEN a query with `CodMon = 2`
- THEN grouped rows show `*MO` amounts, quantities, estado

#### Scenario: Consolidado parity (slice 2)

- GIVEN consolidado mode with a client selected
- THEN per-destino SubTotal, 18% IGV, and Total match SIGLA's report

### Requirement: Route protection (permiso `valoraciones`)

`RUTAS_PROTEGIDAS` MUST register `/api/valoraciones` (sigla, lookups, pdf, excel, send) under permiso `valoraciones`, plus the existing `/valoraciones` entry.

#### Scenario: Missing permiso denied

- GIVEN an authenticated user without permiso `valoraciones`
- WHEN calling `/api/valoraciones/sigla`
- THEN the proxy denies access and no SP executes

### Requirement: Legacy CSV flow retirement

Slice 1 MUST delete the CSV upload view, `/api/valoraciones/generate`, and CSV utilities (`valoracionesCore.ts`, `valoraciones.ts`), no fallback.

#### Scenario: Generate route removed

- WHEN POSTing to `/api/valoraciones/generate` after slice 1
- THEN the route 404s and no CSV code remains
