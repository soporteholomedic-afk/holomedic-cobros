# Musculoesqueletica PDF

Server-side PDF generation for the osteomuscular clinical evaluation form (JJC area). Renders a 9-page A4 document combining the interview (entrevista, pages 1–4) and clinical evaluation (evaluación, pages 5–9) into a single downloadable PDF.

## Architecture

```
Route (GET /api/areas/musculoesqueletica/jjc/[idAten]/pdf)
  → PdfService.generate()
    → Loaders: atencion + entrevista + evaluacion (SQL Server)
    → Page renderers: 9 × HTML template + token substitution
    → EdgePrinter: puppeteer-core → system Edge → single-page PDF per page
    → PdfLibMerger: merge 9 PDFs → final document
```

Each page is an offline HTML template with `{{kind:token}}` placeholders resolved against the clinical data. The pipeline never requires CDN access, bundled browsers, or React rendering.

## Token Kinds

| Kind | Resolution | Example |
|------|-----------|---------|
| `text` | Dot path → string, HTML-escaped | `{{text:empresa}}` |
| `check` | Dot path → boolean, renders `checked` attr | `{{check:sexo_m}}` |
| `figure` | Asset path → data URI (with optional marks overlay) | `{{figure:figure_hombro}}` |
| `image` | Asset path → data URI (no marks) | `{{image:firma_paciente}}` |

### Figure Marks Overlay

Figure tokens support an optional `marks` field: a dot path resolving to `{x,y}[]` (normalized 0..1 coordinates). When present, the renderer draws red X marks over the figure using an absolutely-positioned SVG overlay, mirroring the interactive `FigureAreaMarking` component.

Pages with markable figures:
- **Page 1**: `manos.png` (117×81) — mano/muñeca distribution marks
- **Page 2**: `manos.png` (117×81) — parestesia nocturna; `cuerpo_torso.png` (110×136) — parestesia diurna
- **Page 3**: `columna-media.jpg` (192×139) — cervical; `columna-completa.jpg` (207×235) — dorsal/lumbo-sacra

## Running Locally

```bash
# Start dev server
pnpm dev

# Generate PDF (requires system Edge or Chrome)
# Set EDGE_EXECUTABLE_PATH if Edge is not at the default Windows location:
#   EDGE_EXECUTABLE_PATH="/path/to/msedge" pnpm dev

# Download from: /areas/musculoesqueletica/jjc/{idAtencion}
```

The PDF endpoint requires authentication and the musculoesqueletica JJC permission.

## Offline Assets

All runtime assets are self-hosted under `public/`:

```
public/
├── musculoesqueletica-pdf/
│   ├── pages/           # 9 HTML templates (page1.html–page9.html)
│   └── assets/          # Print CSS (page1.print.css, pages-shared.print.css)
└── assets/images/musculo/
    └── entrevista/      # Canonical figure PNGs/JPGs used by templates
```

Templates use plain compiled CSS (Arial/Helvetica system stack, no webfonts, no Tailwind CDN). The `inlineAssets()` function converts local `<link>` and `<img>` references to data URIs at render time.

## SDK Sync

After code changes, sync to the Windows SDK:

```powershell
.\sync-sdk.ps1
```

This copies the project (including `public/` and `sigla-cli/`) to `\\172.16.10.12\INSTALADORES\HOLOMEDICSDK` via `robocopy /MIR`. The sync is **required** before running the app from the SDK on Windows.

**Important**: `public/assets/images/musculo/entrevista/` must be included in the sync — these are runtime dependencies for the PDF figure tokens.

## Template Source of Truth

Page templates are authored from `src/app/areas/musculoesqueletica/__temp__/page{N}.html` (top-level) and their corresponding `mapeo_datos-pgN.json` field dictionaries. The `__temp__/design_ui/` directory is **not authoritative** — it contains earlier design iterations that may differ from the current field model.

## Testing

```bash
# Run all musculoesqueletica-pdf tests
pnpm vitest run src/features/musculoesqueletica-pdf

# Run specific test groups
pnpm vitest run src/features/musculoesqueletica-pdf/infrastructure/templates/pageOwnership.test.ts
pnpm vitest run src/features/musculoesqueletica-pdf/infrastructure/templates/ninePageIntegration.test.ts
pnpm vitest run src/features/musculoesqueletica-pdf/infrastructure/templates/pageMarks.test.ts
```

## Page Ownership

| Pages | Data Root | Content |
|-------|-----------|---------|
| 1 | `entrevista.datosGenerales` + `entrevista.miembrosSuperiores` | General data, shoulder/elbow/hand |
| 2 | `entrevista.parestesiaNocturna` + `parestesiaDiurna` + `molestiaCervicalIrradiada` + `ausenciaYTrastornos` | Paresthesia, cervical radiation, work absence |
| 3 | `entrevista.columna` | Column disturbances (cervical/dorsal/lumbo-sacra) |
| 4 | `entrevista.lumbalgiaAguda` + `diagnosticoPatologiaColumna` + firma | Acute lumbago, column diagnosis, patient signature |
| 5–7 | `evaluacion.evaluacionClinicaOsteomuscular.miembrosSuperiores` | Scapulohumeral, elbow, wrist-hand, paresthesia tests |
| 8 | `evaluacion.evaluacionColumna` | Column observation + palpation |
| 9 | `evaluacion.evaluacionMotilidad` + `maniobraLasegue` + `maniobraWasserman` | Motility, Lasègue, Wasserman maneuvers |
