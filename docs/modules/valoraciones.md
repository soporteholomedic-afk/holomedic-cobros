# Módulo Valoraciones

> Ubicación: `src/features/valoraciones/` · Rutas: `/valoraciones`, `/api/valoraciones/*`

## Propósito

Consulta las valoraciones (evaluaciones médicas facturables) por empresa desde el sistema SIGLA mediante el stored procedure `SP_RPT_REPFACTURACION`, las agrupa con subtotales + IGV 18% + total por empresa, y permite exportarlas a PDF/Excel o enviarlas por correo con esos adjuntos.

**Lo esencial en tres líneas:**

1. La fuente de datos es **solo lectura** sobre el pool SIGLA (`DB_*`, base `ICCGSA`): el repositorio ejecuta `SP_RPT_REPFACTURACION` y consultas de lookups contra tablas/vistas base (`Cliente`, `Persona`, `Destino`, `Constante`, `VW_SEDE`).
2. Los estados de negocio de la tabla de detalle (`PAGO CONFORME` / `PAGO POR CONFIRMAR` / `CREDITO`) son un **mapeo puro** de los códigos `EstCob` del SP (`C` / `PP` / `P`), aplicado en el boundary del repositorio (`estadoFromEstCob`); los códigos crudos nunca cruzan hacia el dominio.
3. Las exportaciones son dos caminos distintos: **Excel con `exceljs`** (builder puro) y **PDF vía HTML → EdgePrinter** (impresión headless de Edge/Chromium, con footer de numeración). No existe ninguna librería "versexcel" en el proyecto.

## Arquitectura interna

| Capa | Responsabilidad | Archivos clave |
|---|---|---|
| `domain/` | Entidades espejo del SP (`RepFacturacion`), filtro de 11 parámetros, mapeo de estados, agrupación/consolidado con IGV y parseo del DTO | `domain/entities.ts`, `domain/estado.ts`, `domain/agrupacion.ts`, `domain/consolidado.ts`, `domain/parseFiltroDto.ts`, `domain/fixtures.ts` |
| `application/` | (sin capa propia: las rutas API orquestan el repositorio directamente) | — |
| `infrastructure/sqlserver/` | Adaptador `ISiglaValoracionesRepository`: ejecución del SP con binds tipados, lookups y mapeo fila→entidad (fechas ISO, estados) | `infrastructure/sqlserver/SiglaValoracionesRepository.ts` |
| `infrastructure/` (resto) | Singleton de repositorio, generador Excel (exceljs), render PDF (HTML + EdgePrinter), cabecera de cliente/membrete y nombres de archivo | `infrastructure/getValoracionesDb.ts`, `infrastructure/excel/valoracionesExcelReport.ts`, `infrastructure/pdf/renderValoracionesPdf.ts`, `infrastructure/pdf/HtmlValoracionPdfPrinter.ts`, `infrastructure/pdf/template.ts`, `infrastructure/clientHeaderResolver.ts`, `infrastructure/filename.ts` |
| `presentation/` | Hooks dueños del fetch y componentes de UI | `hooks/useValoraciones.ts`, `hooks/useConsolidado.ts`, `hooks/useLookup.ts`, `hooks/useExportarValoraciones.ts`, `hooks/useEnviarValoraciones.ts`; `components/FiltersPanel.tsx`, `EmpresaList.tsx`, `EmpresaDetailModal.tsx`, `ConsolidadoTable.tsx`, `EnviarValoracionesModal.tsx`, `ClienteAutocomplete.tsx`, `PacienteAutocomplete.tsx`; `helpers/format.ts` |

## Puntos de entrada

### Páginas

| Ruta | Archivo | Notas |
|---|---|---|
| `/valoraciones` | `src/app/valoraciones/page.tsx` | Cliente; compone `FiltersPanel` + `EmpresaList` + `EmpresaDetailModal` + `EnviarValoracionesModal`; requiere permiso `valoraciones` |

### API

Todas bajo el prefijo `/api/valoraciones`, que exige permiso `valoraciones` (entrada en `RUTAS_PROTEGIDAS`):

| Método y ruta | Handler | Notas |
|---|---|---|
| `GET /api/valoraciones/sigla` | `src/app/api/valoraciones/sigla/route.ts` | Búsqueda principal: ejecuta `buscarValoraciones` (o el par de consolidados si `?consolidado=1`) |
| `GET /api/valoraciones/lookups/[tipo]` | `src/app/api/valoraciones/lookups/[tipo]/route.ts` | `tipo` ∈ `clientes` (con `?q=`) / `pacientes` (`?q=`) / `destinos` (`?codCli=`) / `tipos-trabajador` / `sedes` |
| `GET /api/valoraciones/contactos?codCli=` | `src/app/api/valoraciones/contactos/route.ts` | Resuelve el RUC del cliente vía SIGLA y devuelve el par de contactos memorizado (delega en `getContactDb` del módulo cobranza) |
| `POST /api/valoraciones/excel` | `src/app/api/valoraciones/excel/route.ts` | Descarga XLSX; body con el filtro (`parseExportFiltroDto`) |
| `POST /api/valoraciones/pdf` | `src/app/api/valoraciones/pdf/route.ts` | Descarga PDF; re-ejecuta la SP desde el filtro (nunca confía en filas del cliente) |
| `POST /api/valoraciones/send` | `src/app/api/valoraciones/send/route.ts` | Envío por correo con adjuntos PDF+XLSX regenerados; máx. 10 destinatarios |

### Exportados

| Export | Archivo | Uso |
|---|---|---|
| `RepFacturacion`, `ValoracionesFilter`, `EstadoEmpresa`, `EmpresaGrupo`, tipos de lookup, `MONEDAS` | `domain/entities.ts` | Contrato de datos del módulo |
| `estadoFromEstCob`, `ESTADOS_EMPRESA`, `ESTADO_SIN_DATOS` | `domain/estado.ts` | Mapeo códigos SP → estados de negocio |
| `agruparPorEmpresa`, `agruparPorDestino`, `nombreEmpresa`, `totalesDe`, `IGV_PORCENTAJE` | `domain/agrupacion.ts` | Agrupación y totales (IGV fijo 18%) |
| `parseFiltroDto`, `parseExportFiltroDto`, `parseEmpresaField` | `domain/parseFiltroDto.ts` | Validación del body de las rutas de exportación/envío |
| `getValoracionesDb` | `infrastructure/getValoracionesDb.ts` | Singleton del repositorio (consumido por todas las rutas) |
| `renderValoracionesPdf`, `nombrePdf` | `infrastructure/pdf/renderValoracionesPdf.ts` | Render compartido por descarga y envío (bytes idénticos) |
| `generarValoracionesExcelBuffer` | `infrastructure/excel/valoracionesExcelReport.ts` | Generación del XLSX |
| `resolveClienteCabecera`, `readLogoBuffer`, `MEMBRETE_HOLOMEDIC`, `fechaEmisionHoy` | `infrastructure/clientHeaderResolver.ts` | Cabecera institucional compartida PDF/Excel |

## Flujo de datos

Consulta y exportación (happy path):

1. El usuario arma el filtro en `FiltersPanel` (fechas obligatorias, moneda 1=SOLES / 2=DOLARES, `indFac` tri-estado: `null`=Todos / `1`=Facturados / `0`=No facturados, más lookups opcionales).
2. `useValoraciones.buscar(filtro)` hace `GET /api/valoraciones/sigla?...`; la ruta obtiene el repositorio con `getValoracionesDb()` (pool SIGLA compartido, cached promise).
3. `SiglaValoracionesRepository.buscarValoraciones()` bindea los 11 parámetros tipados (`FecIni`/`FecFin` como `DateTime` con límites `00:00:00`/`23:59:59`, ids `Int`, `IndFac`/`InFSTA` como `Bit`) y ejecuta `SP_RPT_REPFACTURACION`.
4. Cada fila cruda se mapea con `rowToRepFacturacion`: fechas → ISO-8601 y `EstCob` → `EstadoEmpresa` vía `estadoFromEstCob` (`C`→`PAGO CONFORME`, `PP`→`PAGO POR CONFIRMAR`, `P`→`CREDITO`, resto/nulo → `'—'`).
5. En el cliente, `agruparPorEmpresa` (domain) agrupa por "facturar a" (`NomCFa` con fallback `NomCli`) y calcula cantidad, subtotal, IGV 18% y total con `round2` — los grupos son **derivados**, nunca estado almacenado.
6. Para exportar, `useExportarValoraciones` hace `POST /api/valoraciones/{pdf|excel}` con el filtro (y opcionalmente la `empresa` de la fila, exportación por-empresa). La ruta **re-ejecuta la SP** desde el filtro (decisión de diseño D4: no confiar en filas que retiene el cliente), scoping en memoria a la empresa cuando corresponde.
7. PDF: `renderValoracionesPdf` arma el HTML membrete (A4 landscape) y lo imprime `HtmlValoracionPdfPrinter` (EdgePrinter con footer `Página X de Y`). Excel: `generarValoracionesExcelBuffer` produce el libro exceljs (hoja `VALORACIONES`, 15 columnas + bloque SubTotal/IGV/Total). El envío por correo (`POST /api/valoraciones/send`) regenera ambos adjuntos desde el filtro — descarga y envío producen bytes idénticos.

## Dependencias

| Tipo | Dependencia | Uso |
|---|---|---|
| Interna | `src/lib/db.ts` → `getPool()` | Pool SQL Server SIGLA (`DB_*`, base default `ICCGSA`) |
| Interna | `features/cobranza` → `getContactDb`, `RUC_PATTERN`, `EmpresaContacto` | Directorio de contactos para el prefill del envío (`/api/valoraciones/contactos`) |
| Interna | `features/musculoesqueletica-pdf` → `EdgePrinter`, `PdfPrinter`, `EdgeUnavailableError` | Impresión HTML→PDF headless (Edge) |
| Externa | `mssql` | Acceso a SQL Server |
| Externa | `exceljs` | Generación del XLSX |
| Externa | `nodemailer` (vía `@/utils/sendEmail`) | Envío del correo con adjuntos |
| BD (SIGLA, solo lectura) | `SP_RPT_REPFACTURACION`, `SP_RPT_CONSOLIDADOFACTURACION`(+`_ADICIONALES`), tablas `Cliente`, `Persona`, `Destino`, `Constante` (CodTCo=62), vista `VW_SEDE` | Datos y lookups |

## Configuración

| Variable / constante | Propósito | Dónde se lee |
|---|---|---|
| `DB_*` (`DB_NAME` default `ICCGSA`) | Pool SIGLA de solo lectura para runtime | `src/lib/db.ts` (`getPool`) |
| `HOLOMEDIC_DB_USER=explorar_datos` (perfil `EXPLORADOR_DATOS`) | **Solo para exploración interactiva/inspección** por agentes y personas; la aplicación en runtime usa su propio usuario `DB_*` | Convención de `.env.local` (ver `AGENTS.md`) |
| `REPFACTURACION_BINDS` | Tabla congelada de binds del SP (nombres sin prefijo `p`; verificado contra `sys.parameters`) | `infrastructure/sqlserver/SiglaValoracionesRepository.ts` |
| `IGV_PORCENTAJE = 18` | IGV aplicado en totales | `domain/agrupacion.ts` |
| `MONEDAS` (`1`=SOLES `s/.`, `2`=DOLARES `$`) | Catálogo de monedas espejo de `Tbl_Moneda` | `domain/entities.ts` |
| Variables SMTP (vía `@/utils/sendEmail`) | Correo saliente para `/api/valoraciones/send` | `src/utils/sendEmail.ts` |
| Binario de Edge/Chromium | Impresión del PDF (si falta, `EdgeUnavailableError`) | `features/musculoesqueletica-pdf/infrastructure/printer/edgePrinter` |

## Cómo probarlo

```bash
pnpm test src/features/valoraciones
```

Archivos de test del módulo:

- `domain/__tests__/agrupacion.test.ts`
- `domain/__tests__/consolidado.test.ts`
- `domain/__tests__/estado.test.ts`
- `domain/__tests__/parseFiltroDto.test.ts`
- `infrastructure/__tests__/clientHeaderResolver.test.ts`
- `infrastructure/__tests__/filename.test.ts`
- `infrastructure/__tests__/getValoracionesDb.test.ts`
- `infrastructure/excel/__tests__/valoracionesExcelReport.test.ts`
- `infrastructure/pdf/__tests__/HtmlValoracionPdfPrinter.test.ts`
- `infrastructure/pdf/__tests__/realEdgeHarness.test.ts`
- `infrastructure/pdf/__tests__/template.test.ts`
- `infrastructure/sqlserver/__tests__/SiglaValoracionesRepository.test.ts`
- `presentation/components/__tests__/ConsolidadoTable.test.tsx`, `EmpresaDetailModal.test.tsx`, `EmpresaList.test.tsx`, `EnviarValoracionesModal.test.tsx`, `FiltersPanel.test.tsx`
- `presentation/hooks/__tests__/useConsolidado.test.ts`, `useEnviarValoraciones.test.ts`, `useExportarValoraciones.test.tsx`, `useLookup.test.ts`, `useValoracionesFilters.test.ts`, `useValoraciones.test.ts`

## Gotchas

- **El PDF no usa ExcelJS ni "versexcel"**: Excel es `exceljs`; el PDF se genera imprimiendo HTML con Edge headless (`EdgePrinter` del módulo `musculoesqueletica-pdf`, decorado con footer de numeración). Si el binario de Edge falta en el host, `POST /pdf` y `/send` fallan con `EdgeUnavailableError` (mapeado a respuesta user-safe en la ruta).
- **El read-only es a nivel de QUERY, no de credencial**: el módulo usa el pool estándar de la app (`DB_*`) y simplemente nunca escribe (solo `SELECT`/`EXEC` de SPs de reporte). El perfil `EXPLORADOR_DATOS` es una convención de exploración para agentes/operadores, no el usuario de runtime.
- **Los SPs de consolidado no existen en la BD live** (probe 2026-08-27: "Could not find stored procedure"). `SP_RPT_CONSOLIDADOFACTURACION` y `_ADICIONALES` están congelados por convención/nombre y forma verificada contra el reader C# de SIGLA; re-verificar contra `sys.parameters` cuando ops los despliegue.
- **El casing del SP es exacto y contractual**: `FecSTA`, `VImpMN/MO`, `VVtaMN/MO`, `CodiEM`. El `SELECT *` del SP devuelve 45 columnas; el mapper ignora 6 internas (`Identi`, `CodEmp`, `CodSed`, `CodTCl`, `NumOrd`, `NumSSe`).
- **Descarga y envío deben producir bytes idénticos**: `renderValoracionesPdf` es la única verdad compartida; cualquier cambio debe mantener ese invariante (ambos endpoints re-ejecutan la SP desde el filtro, decisión D4).
- **Exportación por-empresa (U6)**: el scoping a una empresa es un filtro **en memoria** sobre las filas re-consultadas, con la clave de grupo `nombreEmpresa` (`NomCFa` con fallback `NomCli`).
- **`VW_SEDE` en vez de SP_SEL_SEDE**: el login de solo lectura no tiene grants `EXECUTE`, por eso los lookups van directo a la vista; el combo de tipos de trabajador tiene un fallback hardcodeado (`OBRERO`/`EMPLEADO`, `Constante.CodTCo=62`) para nunca devolver 500.
- **Ids opcionales `<= 0` se envían como NULL** al SP (significan "sin filtro"); `indFac` viaja como tri-state BIT (`null` = Todos).
- **Cliente desconocido en cabecera**: `resolveClienteCabecera` aplica la cadena de fallback; si no hay cliente, se omite la fila de cabecera — nunca se inventa un cliente.
- **Logo opcional**: si el asset del logo falta, la exportación sale sin logo en vez de fallar.
