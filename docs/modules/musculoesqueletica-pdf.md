# Módulo Musculoesqueletica PDF

> Ubicación: `src/features/musculoesqueletica-pdf/` · Rutas: API `GET /api/areas/musculoesqueletica/jjc/[idAten]/pdf` · Descarga desde `/areas/musculoesqueletica/jjc` (lista de atenciones)

## Propósito

Genera en el servidor el PDF clínico osteomuscular de 9 páginas A4 (entrevista páginas 1–4 + evaluación páginas 5–9) renderizando plantillas HTML offline con sustitución de tokens, imprimiéndolas con el Edge del sistema vía `puppeteer-core` y uniéndolas con `pdf-lib`. El pipeline no requiere red, navegadores empaquetados ni React en tiempo de render.

## Arquitectura interna

| Capa | Responsabilidad | Archivos clave |
|---|---|---|
| `domain/` | Entidades y puertos del pipeline + errores tipados | `domain/entities.ts` (`PdfSourceData`, `PdfTokenSpec`, `PdfPageManifest`, `PdfPrinter`, `PdfMerger`), `domain/errors.ts` (`PdfServiceError` y 7 subclases) |
| `application/` | Orquestación y motor de tokens | `application/pdfService.ts` (`PdfService`, interfaz `PageRenderer`), `application/renderer.ts` (`renderTemplate`, `resolvePath`, `escapeHtml`, overlay de marcas SVG) |
| `infrastructure/` | Adaptadores: inlining de assets, plantillas, impresión y fusión | `infrastructure/assets.ts` (`inlineAssets`, `loadImageAsDataUri`, `mimeForPath`), `infrastructure/templates/index.ts` + `page{1..9}.ts` (manifiestos), `infrastructure/printer/edgePrinter.ts` (`EdgePrinter`, `resolveEdgeExecutablePath`), `infrastructure/merger.ts` (`PdfLibMerger`) |
| `composition/` | Composition root y políticas de assets | `composition/container.ts` (`buildPdfService`, `buildPageRenderer`, límites de imágenes), `composition/assetRoots.ts` (`buildFirmaHuellaRoots`) |
| `testing/` | Fuente de datos de muestra para tests | `testing/sampleSource.ts` |

Referencia canónica interna: `src/features/musculoesqueletica-pdf/README.md` (propiedad de páginas, tokens, operación local).

## Puntos de entrada

### API

| Método y ruta | Handler | Comportamiento |
|---|---|---|
| `GET /api/areas/musculoesqueletica/jjc/[idAten]/pdf` | `src/app/api/areas/musculoesqueletica/jjc/[idAten]/pdf/route.ts` | 200 con `application/pdf` (attachment `musculoesqueletica-jjc-{id}.pdf`), 400 sin `idAten`, 404 atención/datasets no encontrados, 502 BD o Edge no disponible, 500 error de plantilla/render/merge |

Único consumidor de UI: la celda de descarga del listado JJC (`src/app/areas/musculoesqueletica/jjc/page.tsx`, prop `apiPath`).

### Exportados

| Export | Archivo | Consumidores |
|---|---|---|
| `buildPdfService` | `composition/container.ts` | Ruta API del PDF |
| `renderTemplate`, `escapeHtml`, `resolvePath` | `application/renderer.ts` | `buildPageRenderer` y tests |
| `inlineAssets`, `loadImageAsDataUri`, `mimeForPath`, `dataUriFromBytes` | `infrastructure/assets.ts` | `buildPageRenderer` y tests |
| `EdgePrinter`, `resolveEdgeExecutablePath` | `infrastructure/printer/edgePrinter.ts` | `buildPdfService` |
| `PdfLibMerger` | `infrastructure/merger.ts` | `buildPdfService` |
| `ALL_PAGE_MANIFESTS`, `TOTAL_PAGES`, `PAGE_TEMPLATE_PATHS` | `infrastructure/templates/index.ts` | `buildPdfService` y tests |

## Flujo de datos

Happy path de `PdfService.generate(idAten)`:

1. La ruta API valida `idAten` y construye el servicio con `buildPdfService()`.
2. `loadSource` carga en paralelo los tres datasets: atención (`jjc-mapper`), entrevista (`entrevista-osteomuscular`) y evaluación (`evaluacion-osteomuscular`). Atención faltante → `AtencionNotFoundError`; entrevista o evaluación faltante → `DatasetNotFoundError`; fallo de BD → `DataSourceUnavailableError`.
3. Por cada manifiesto de `ALL_PAGE_MANIFESTS` (9 páginas en orden determinista), `buildPageRenderer` lee la plantilla HTML de `public/musculoesqueletica-pdf/pages/page{N}.html`.
4. `inlineAssets` convierte el HTML en un documento offline: `<link rel="stylesheet">` locales → bloques `<style>` con sus `url(...)` como data URIs, y `<img src>` locales → data URis. Una referencia remota (`http(s)://` o `//`) lanza `TemplateError`.
5. `renderTemplate` sustituye cada token `{{kind:name}}` contra `PdfSourceData` según el manifiesto de la página: `text` (dot-path, HTML-escaped), `check` (booleano o comparación `match`), `figure`/`image` (asset → data URI vía `loadImageAsDataUri`; `figure` puede superponer marcas "X" rojas con un SVG absoluto). Tokens desconocidos o de tipo no declarado → `TemplateError`.
6. `EdgePrinter.print` lanza el navegador (`EDGE_EXECUTABLE_PATH` → rutas Edge de Windows → Chromium de Linux), espera `document.fonts.ready` y el decodificado de imágenes, y produce un PDF A4 de una página con márgenes cero.
7. `PdfLibMerger.merge` une las 9 páginas en orden con `pdf-lib`.
8. La ruta devuelve el binario con `Content-Disposition: attachment`; en fallo mapea el error tipado a 404/502/500 sin exponer datos clínicos.

## Dependencias

| Tipo | Dependencia | Uso |
|---|---|---|
| Interna | `features/jjc-mapper` | `buildGetAtencionDetalle()` (datos de la atención, `rutaFirma`/`rutaHuella`) |
| Interna | `features/entrevista-osteomuscular` | `buildLoadEntrevistaOsteomuscular()` (páginas 1–4) |
| Interna | `features/evaluacion-osteomuscular` | `buildLoadEvaluacionOsteomuscular()` (páginas 5–9) |
| Interna | `lib/platform` (`FILE_SERVER_BASE_PATH`) | Raíz del file server SIGLA para firma/huella (`\\172.16.10.12\sigla` en Windows, `/mnt/sigla` en Linux) |
| Externa | `puppeteer-core` | Impresión HTML→PDF con el Edge/Chromium del sistema (sin navegador empaquetado) |
| Externa | `pdf-lib` | Fusión de PDFs por página |
| Externa | `mssql` (transitivo vía loaders) | Lectura de HOLOMEDIC |
| Assets | `public/musculoesqueletica-pdf/pages/*.html`, `public/musculoesqueletica-pdf/assets/*.css`, `public/assets/images/musculo/entrevista/*` | Plantillas, CSS de impresión y figuras (dependencia en tiempo de ejecución) |

## Configuración

| Variable / constante | Propósito | Dónde se lee |
|---|---|---|
| `EDGE_EXECUTABLE_PATH` (env, opcional) | Override de la ruta del ejecutable del navegador; si no, se prueban rutas Edge de Windows y Chromium de Linux | `infrastructure/printer/edgePrinter.ts` (`resolveEdgeExecutablePath`) |
| `HOLOMEDIC_DB_*` (`.env.local`) | Conexión de los loaders (transitivo) | `src/lib/db.ts` |
| `MAX_IMAGE_BYTES = 512 * 1024` | Límite de tamaño por imagen tokenizada (512 KB) | `composition/container.ts` |
| `ALLOWED_IMAGE_EXTENSIONS = ['.png','.jpg','.jpeg','.webp','.svg']` | Extensiones permitidas para tokens `figure`/`image` | `composition/container.ts` |
| `CANONICAL_FIGURE_ROOT = assets/images/musculo/entrevista` | Raíz canónica de figuras dentro de `public/` | `composition/container.ts` |
| `ASSET_ROOTS = ['musculoesqueletica-pdf', 'assets']` | Raíces permitidas para assets del feature bajo `public/` | `composition/container.ts` |
| `FILE_SERVER_BASE_PATH` | Raíz permitida para firma/huella del paciente | `src/lib/platform.ts` vía `composition/assetRoots.ts` |

## Cómo probarlo

```bash
pnpm vitest run src/features/musculoesqueletica-pdf
```

Archivos de test del módulo:

- `application/pdfProof.test.ts`
- `application/pdfService.test.ts`
- `application/renderer.test.ts`
- `composition/assetRoots.test.ts`
- `infrastructure/assets.test.ts`
- `infrastructure/assets.integration.test.ts`
- `infrastructure/merger.test.ts`
- `infrastructure/printer/edgePrinter.test.ts`
- `infrastructure/templates/page1.test.ts`
- `infrastructure/templates/pageMarks.test.ts`
- `infrastructure/templates/pageOwnership.test.ts`
- `infrastructure/templates/ninePageIntegration.test.ts`

## Gotchas

- **Las constantes de seguridad viven en `composition/container.ts`, no en `infrastructure/`**: `MAX_IMAGE_BYTES`, `CANONICAL_FIGURE_ROOT` y `ALLOWED_IMAGE_EXTENSIONS` se definen en el composition root y se inyectan en `loadImageAsDataUri`. `infrastructure/assets.ts` solo define el mecanismo, no la política.
- **Dos políticas de fallo distintas para imágenes**: `inlineAssets` lanza `TemplateError` si la plantilla referencia una imagen/CSS remoto (fallo explícito, el render no puede depender de la red), pero `loadImageAsDataUri` devuelve `null` ante path fuera de raíces, extensión no permitida, archivo mayor al límite o error de lectura (el token se pinta en blanco). Un asset que "desaparece" del PDF sin error casi siempre es esto.
- **`renderRealPage1` no es código de producción**: es un helper local dentro de `application/pdfProof.test.ts` para pruebas end-to-end del pipeline. El render real de producción es `buildPageRenderer` en `composition/container.ts`.
- **Firma y huella tienen resolución especial**: los tokens `firma_paciente`/`huella_paciente` no usan el path del manifiesto sino `atencion.rutaFirma`/`rutaHuella`, ya mapeados por el adaptador SQL al file server SIGLA; sus raíces permitidas las construye `buildFirmaHuellaRoots` (file server + dos raíces públicas para fixtures).
- **No confundir pipelines de PDF**: este módulo solo sirve a `/api/areas/musculoesqueletica/jjc/[idAten]/pdf`. La ruta `/api/areas/medicina/jjc/[idAten]/pdf` llena un AcroForm con `pdf-lib` (`public/PLANTILLA_JJC_MEDICINA.pdf`, módulo `jjc-mapper`), y `/api/generate-pdfs` (página `/generador-pdfs`) ejecuta `sigla-cli/SIGLA.PdfCli.exe`. Tres mecanismos distintos.
- **`resolvePath` es prototype-safe**: solo recorre propiedades propias; rutas que atraviesen miembros de prototipo devuelven `undefined` (y el token se pinta vacío) — decisión de seguridad deliberada.
- **Orden y propiedad de páginas**: `ALL_PAGE_MANIFESTS` es la fuente de verdad del orden (1–9); páginas 1–4 leen `entrevista.*`, páginas 5–9 leen `evaluacion.*` (verificado por `pageOwnership.test.ts`). El diseño autoritativo de cada plantilla vive en `src/app/areas/musculoesqueletica/__temp__/page{N}.html` + `mapeo_datos-pgN.json`; `__temp__/design_ui/` NO es autoritativo.
- **Requisitos de entorno**: hace falta un Edge o Chromium instalado (o `EDGE_EXECUTABLE_PATH`); sin navegador, la ruta devuelve 502 (`EdgeUnavailableError`). Los assets de `public/` deben llegar al SDK de Windows vía `sync-sdk` — sin ellos los tokens `figure` se pintan en blanco.
- **Marks overlay**: las marcas del paciente se guardan normalizadas 0..1 (mismo contrato que `FigureAreaMarking` en la entrevista); el overlay SVG usa las dimensiones intrínsecas del asset declaradas en el manifiesto (`imageWidth`/`imageHeight`), que deben coincidir con el PNG real o las X se descentran.
