# Módulo envio-resultados

> Ubicación: `src/features/envio-resultados/` · Rutas: `/consolidados`, `/consolidados/envio-resultados`, `/consolidados/historial-envios` y sus APIs bajo `/api/consolidados/*`, `/api/files/*`, `/api/informes/*`

## Propósito

Permite al operador enviar por correo los resultados médicos (CAMO/EMO) de los pacientes de una empresa: selecciona pacientes y archivos desde el share LAN de SIGLA, genera los PDF faltantes invocando el runtime .NET `SIGLA.PdfCli.exe` (Crystal Reports), compone el correo con plantillas y firma, y registra cada envío en un historial auditable (`dbo.envios_consolidados`).

## Arquitectura interna

| Capa | Responsabilidad | Archivos clave |
|---|---|---|
| `domain/` | Entidades y puertos hexagonales. Subdominios puros: árbol de archivos (Composite GoF), archivos "ready" (parseo/renombrado), archivos generados | `domain/ports.ts` (`IFileRepository`, `IEmailService`, `IEnvioHistoryRepository`, `ICompanyRepository`, `IPatientRepository`, `IPdfCompressor`, `PdfCompressionResult`), `domain/entities.ts` (`SelectedFileRef`, `EnvioHistoryInsert`, `EmailAttachment`), `domain/file-system/` (`FileSystemNode`, `FileNode`, `FolderNode`), `domain/ready-files/` (`parseReadyFile`, `renameReadyFile`, `isReadyFile`, `normalizeTipoExamen`), `domain/generated-files/renameGeneratedCertificate.ts` |
| `application/` | Casos de uso que orquestan los puertos | `application/sendResults.ts` (`SendResultsUseCase` — pipeline completo de envío con historial write-then-send), `application/getCompanies.ts`, `application/getPatientsByCompany.ts`, `application/searchEnvios.ts` (buscador del historial) |
| `infrastructure/` | Adaptadores: SMTP, share UNC, SQL Server, CLI de PDFs, compresión de PDFs | `infrastructure/email/emailService.ts` (`EmailService` → `@/utils/sendEmail` con `purpose: 'consolidados'`), `infrastructure/files/UncFileRepository.ts` + `getFileRepository.ts` (singleton) + `patientPathResolver.ts`, `infrastructure/sqlserver/SqlServerEnvioHistoryRepository.ts` + `migrate.ts` + `getEnvioHistoryDb.ts` (pool `HOLOMEDIC`), `infrastructure/pdf/` (`PdfLibCompressorAdapter.ts` — compresión lossless fail-open, `constants.ts` — kill switch `PDF_COMPRESSION_ENABLED` y `PDF_COMPRESS_TIMEOUT_MS`), `infrastructure/informes/constants.ts` + `outputDirResolver.ts` + `parseManifest.ts` + `matchTransientAuthError.ts`, `infrastructure/mock/` (repos de desarrollo) |
| `presentation/` | Wizard de 4 pasos, editor de correo, explorador de archivos, visores, hooks y resolvers de tokens | `presentation/components/EnvioResultadosWizard.tsx` + `wizard/Step1Pacientes…Step4Resumen.tsx` + `WizardStepper.tsx`, `EmailEditor.tsx`, `FilesModal.tsx` + `FilesGeneratePane/FilesReadyPane/FilesExplorerPane/FilesPreviewPane`, `viewers/` (`viewerFor.ts`, `PdfViewer`, `ImageViewer`, `TxtViewer`, `NoPreviewViewer`), `hooks/` (`useEnvioWizard`, `useSendResults`, `useGenerarPdf`, `useFileTree`, `useUnifiedResults`, `useEnviosHistory`, …), `helpers/tokenResolvers/buildTokenResolverRegistry.ts` (+ resolvers `tablaCobranza`, `tablaValoraciones`, `examenes`, `documentos*`), `utils/aggregateDocumentStatuses.ts` |

## Puntos de entrada

### Páginas

| Ruta | Archivo |
|---|---|
| `/consolidados` | `src/app/consolidados/page.tsx` |
| `/consolidados/envio-resultados` | `src/app/consolidados/envio-resultados/page.tsx` (monta `WorkerDetailTable`) |
| `/consolidados/historial-envios` | `src/app/consolidados/historial-envios/page.tsx` |

### API

| Endpoint | Método | Handler / uso del módulo |
|---|---|---|
| `/api/consolidados/send-results` | POST | `SendResultsUseCase` + `UncFileRepository` + `EmailService` + `SqlServerEnvioHistoryRepository` |
| `/api/consolidados/envios` | GET | Búsqueda del historial (`searchEnvios`) |
| `/api/consolidados/envios/[id]` | GET | Detalle de un envío (incluye `bodyHtml`) |
| `/api/files/list-folder`, `/api/files/download`, `/api/files/preview`, `/api/files/download-all` (GET/POST), `/api/files/check-legajos` (POST) | GET/POST | Acceso al share vía `IFileRepository` |
| `/api/informes/[idAten]/generar` | POST | Spawn de `SIGLA.PdfCli.exe` + lectura de `manifest.json` |
| `/api/informes/[idAten]/lookup`, `/api/informes/[idAten]/plantillas` | GET | Consulta de exámenes/plantillas del paciente |
| `/api/generate-pdfs` | POST | Generación masiva standalone (ZIP) reutilizando `CLI_EXE_PATH` |

### Exportados

| Símbolo | Archivo |
|---|---|
| `SendResultsUseCase`, `MAX_FILES`, `MAX_FILE_BYTES` | `application/sendResults.ts` |
| `MAX_READ_BYTES_WITH_COMPRESSION` (60 MB — tope de lectura cuando hay compresión) | `application/sendResults.ts` |
| `CLI_EXE_PATH`, `FILE_SERVER_BASE_PATH`, `SUPPORTED_IDEPME`, `buildOutputDir` | `infrastructure/informes/constants.ts` |
| `resolveOutputDir` | `infrastructure/informes/outputDirResolver.ts` |
| `parseManifest`, `countManifest` | `infrastructure/informes/parseManifest.ts` |
| `PdfLibCompressorAdapter`, `PDF_COMPRESS_TIMEOUT_MS` | `infrastructure/pdf/` |
| `EnvioResultadosWizard` | `presentation/components/EnvioResultadosWizard.tsx` |
| `buildTokenResolverRegistry`, `FIRMA_FALLBACK_HTML` | `presentation/helpers/tokenResolvers/buildTokenResolverRegistry.ts` |

## Flujo de datos

Envío consolidado (happy path):

1. En `/consolidados` el operador elige empresa y rango de fechas; los hooks (`useConsolidadosResults`, `useUnifiedResults`) consultan `/api/consolidados/results*` y `/api/consolidados/sedes`.
2. Navega a `/consolidados/envio-resultados?companyName=…`; `WorkerDetailTable` abre el `EnvioResultadosWizard` (Paso 1 pacientes → Paso 2 archivos CAMO → Paso 3 archivos EMO → Paso 4 resumen).
3. En el Paso 4, "Continuar al envío" ejecuta `buildEmailViewDataFromWizard` y monta el `EmailEditor` con plantilla interpolada por tokens (`buildTokenResolverRegistry`) y la firma del usuario (ver módulo `firma-correo`).
4. `EmailEditor` hace POST a `/api/consolidados/send-results` con `fileRefs` (share LAN) + adjuntos locales + `html`.
5. La ruta inyecta `SendResultsUseCase(UncFileRepository, EmailService, SqlServerEnvioHistoryRepository)`; el caso de uso sanitiza cada ref, calcula los nombres de entrega (`renameReadyFile`) e **inserta primero** la fila de historial `pendiente` (write-then-send).
6. Lee cada archivo del share como stream (máx. 10 refs). Con compresión activa (default), el tope de lectura sube a 60 MB y cada PDF se comprime **best-of en RAM** (`PdfLibCompressorAdapter`: recarga pdf-lib sin metadatos; si el resultado no queda menor, se adjuntan los bytes originales); el tope de 30 MB se aplica sobre el **resultado** — un archivo que siga sobre el tope aborta solo ese envío con un error por archivo que cita ambos tamaños (original y comprimido). La compresión es **fail-open**: ante cualquier error/timeout se adjuntan los bytes originales y el envío continúa. Sin compresión (kill switch OFF), el pipeline es byte-idéntico al legado, incluido el ordenamiento del tope (30 MB verificados pre-compresión). Ensambla `EmailAttachment[]` y despacha por `EmailService.sendWithAttachments` → `@/utils/sendEmail` con `purpose: 'consolidados'`.
7. Actualiza la fila de historial a `enviado`/`error`; la UI consulta el historial en `/consolidados/historial-envios`.

Generación de PDFs (branch del `FilesGeneratePane`):

1. El panel lista los exámenes soportados (`SUPPORTED_IDEPME`) y hace POST a `/api/informes/[idAten]/generar`.
2. La ruta valida el body, resuelve `OutputDir` (`resolveOutputDir`: carpeta `LEGAJOS` particular si existe, si no `\\<share>\<ruc>\<dni>\<idAten>\LEGAJOS`) y hace pre-flight del padre UNC y del ejecutable.
3. Invoca `execFileAsync(CLI_EXE_PATH, args)` (timeout 120 s) — flags antes de posicionales; `--idepme` con valor en arg separado; booleanos .NET como `'true'/'false'` literales.
4. Lee `manifest.json` del `OutputDir`, lo parsea (`parseManifest`) y, si hay error transitorio de autenticación de dominio Windows, reintenta (máx. 3 intentos, backoff 2 s/4 s).
5. Responde 200 con el manifiesto por plantilla y el resumen (`generated/failed/skipped/exitCode/retries`); los PDF quedan en el share para el envío posterior.

## Dependencias

| Tipo | Dependencia | Uso |
|---|---|---|
| Interna | `@/utils/sendEmail` | Transporte Nodemailer (`purpose: 'consolidados'`) |
| Interna | `@/lib/db` (`getHolomedicPool`) | Pool SQL Server `HOLOMEDIC` para el historial |
| Interna | `@/lib/sanitize-filename`, `@/lib/normalize-dni` | Sanitización de rutas/nombres contra path traversal |
| Interna | `@/lib/auth` (`getSession`) | Sesión JWT (`sentBy` del historial) |
| Interna | `features/firma-correo` | `EmailEditor` consume `useFirmaCorreo`/`replaceFirmaFallback` para la firma |
| Interna | `features/plantillas-editor` | `usePlantillas` lista las plantillas por área |
| Externa | `SIGLA.PdfCli.exe` (`sigla-cli/`) | Render de PDFs Crystal Reports (runtime .NET, **git-trackeado**, 20 archivos) |
| Externa | Share UNC `\\172.16.10.12\sigla` | Lectura/escritura de legajos y PDFs |
| Externa | SMTP (`SMTP_HOST`/`SMTP_PORT` + `SMTP_USER_CONSOLIDADOS`/`SMTP_PASS_CONSOLIDADOS`) | Envío de correos |
| Externa | SQL Server `HOLOMEDIC` (`HOLOMEDIC_DB_*`) | Tabla `dbo.envios_consolidados` |

## Configuración

| Variable / constante | Propósito | Dónde se lee |
|---|---|---|
| `PDFCLI_EXE_PATH` | Override de la ruta del CLI (default `path.resolve(process.cwd(), 'sigla-cli', 'SIGLA.PdfCli.exe')`) | `infrastructure/informes/constants.ts` |
| `FILE_SERVER_BASE_PATH` | Raíz del share UNC (default `\\172.16.10.12\sigla`) | `infrastructure/informes/constants.ts` |
| `PDFCLI_RETRY_TRANSIENT_AUTH` | Feature flag del retry (`'0'` lo desactiva; ON por defecto) | `infrastructure/informes/constants.ts` |
| `PDF_COMPRESSION_ENABLED` | Feature flag de compresión de PDFs en el envío (`'false'`/`'0'` la desactiva; ON por defecto; OFF = comportamiento legacy byte-idéntico, incluido el ordenamiento de tope legacy: 30 MB se verifican ANTES de cualquier compresión) | `infrastructure/pdf/constants.ts` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER_CONSOLIDADOS`, `SMTP_PASS_CONSOLIDADOS` | Credenciales SMTP del purpose `consolidados` | `src/utils/sendEmail.ts` |
| `HOLOMEDIC_DB_*` | Pool SQL Server del historial | `infrastructure/getEnvioHistoryDb.ts` → `@/lib/db` |
| `CLI_TIMEOUT_MS` (120 000 ms), `PDFCLI_RETRY_MAX_ATTEMPTS` (3), `PDFCLI_RETRY_BACKOFF_MS` ([2000, 4000]) | Política de invocación/retry del CLI | `infrastructure/informes/constants.ts` |
| `SUPPORTED_IDEPME` (8 IdePMe) | Exámenes renderizables por el CLI; el resto se muestra "No soportado" | `infrastructure/informes/constants.ts` |
| `MAX_FILES` (10), `MAX_FILE_BYTES` (30 MB) | Límites del caso de uso de envío | `application/sendResults.ts` |

## Cómo probarlo

```bash
# Solo los tests del módulo (vitest, jsdom, sin paralelismo de archivos)
pnpm vitest run src/features/envio-resultados
```

Los tests viven en carpetas `__tests__/` junto a cada pieza: `application/__tests__/sendResults.test.ts`, `infrastructure/informes/__tests__/` (constants, outputDirResolver, parseManifest, matchTransientAuthError), `infrastructure/files/__tests__/UncFileRepository.test.ts`, `infrastructure/sqlserver/__tests__/`, `presentation/components/__tests__/` (wizard, EmailEditor, FilesModal, panes), `presentation/hooks/__tests__/` y `presentation/helpers/__tests__/` (incluye `tokenResolvers/`).

## Gotchas

- La compresión de PDFs en el envío es **solo una optimización de transporte**: opera sobre el buffer en RAM del correo; el share clínico (UNC) **nunca se muta** — ni bytes, ni nombre, ni mtime del archivo fuente.
- `sigla-cli/` es una **runtime dependency git-trackada a propósito** (20 archivos: `SIGLA.PdfCli.exe` + `Negocio.dll`/`Entidad.dll`/`Datos.dll` + `rpt/`). No la ignores ni la borres; el exe necesita las DLL y `rpt/` al mismo nivel.
- El contrato de args del CLI es frágil: los flags van **antes** de los posicionales, `--idepme` toma el valor como argumento separado, y los booleanos .NET solo aceptan `'true'/'false'` literales (no `0/1`).
- Defaults `EmiAfi=0` / `IncExp=1` (`DEFAULT_EMI_AFI`/`DEFAULT_INC_EXP`): es la combinación que resuelve el IdePMe 39183 en `SP_SEL_PLANTILLAMEDICAXCLIENTE`.
- El historial es **write-then-send y best-effort**: la fila `pendiente` se inserta antes de despachar; un crash entre INSERT y UPDATE deja una huérfana honesta (decisión de diseño D2). Una falla de BD de historial nunca bloquea el envío.
- `outputDirResolver.ts` es **server-only** (importa `node:fs`); `constants.ts` se mantiene pura para que los bundles cliente puedan importarla.
- Los paths del share se componen con `path.win32` para producir backslashes incluso corriendo los tests en POSIX.
- El error intermitente de autenticación del controlador de dominio Windows se reintenta automáticamente; `CLI_NOT_FOUND` y `MANIFEST_MISSING` son fallas deterministas que **no** se reintentan.
- `infrastructure/mock/` contiene repositorios de desarrollo (empresas/pacientes) — no son producción.
- No confundir este módulo con `/api/usuarios/[id]/firma` (imagen de firma del CRUD de usuarios, módulo `auth`).
- Permiso de ruta: `/consolidados` y `/api/consolidados/envios` requieren el permiso `consolidados` (ver `src/features/auth/domain/routes.ts`).
