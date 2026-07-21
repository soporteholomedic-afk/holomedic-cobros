# JJC Medicina — PDF Fill & Download: Manual Verification Checklist

**Change**: `jjc-medicina-pdf-fill-download`  
**PR**: 3 of 3 (integration + manual verification)  
**Branch**: `feature/jjc-medicina-pdf-fill-download-pr3`  
**Tracker**: `feature/jjc-medicina-pdf-fill-download`  

Run these steps on **Windows** (the project's primary dev OS). The Linux sandbox cannot run the dev server or the PDF viewers.

---

## Pre-merge Checklist

### 1. Prerequisites

```powershell
# Fresh checkout or after pulling the chain
git checkout feature/jjc-medicina-pdf-fill-download
pnpm install
```

Make sure `public\PLANTILLA_JJC_MEDICINA.pdf` exists in the checkout. It is **not tracked by git** (see `.gitignore`). If missing, copy it from a previous working copy or from the SDK share:

```powershell
copy \\172.16.10.12\INSTALADORES\HOLOMEDICSDK\public\PLANTILLA_JJC_MEDICINA.pdf .\public\
```

### 2. Dev Server Smoke Test

```powershell
pnpm dev
```

Open `http://localhost:3000/areas/medicina/jjc` in your browser.

1. Enter a date range (e.g., today or a recent workday) and click **Filtrar**.
2. Wait for the patient rows to load.
3. In the last column (header **PDF**), click the download button (FileDown icon) on any row.
4. The browser should save a file named `jjc-{idAten}.pdf` (the filename is set by the route's `Content-Disposition` header).

| What to verify | Expected |
|----------------|----------|
| Browser downloads a `.pdf` file | File saved to `Downloads` folder |
| Filename pattern | `jjc-{idAten}.pdf` (e.g., `jjc-00012345.pdf`) |
| Loading state | Button shows reduced opacity + `aria-busy="true"` while fetch is pending; returns to normal after success/error |
| 404 response | Toast: "Atención no encontrada" (shouldn't happen with real data) |
| 502 response | Toast: "No se pudo conectar a la base de datos, reintentá" |
| Generic 5xx | Toast: "Error al generar el PDF" |

### 3. Adobe Reader — Field-by-Field Verification

Open the downloaded PDF in **Adobe Reader** (not Chrome's viewer — Adobe Reader renders AcroForm fields faithfully).

Verify **every field** in the table below:

**Patient identity fields** (`AtencionDetalle`):

| Source | PDF field | Expected value |
|--------|-----------|----------------|
| `atencion.dni` | `txt_dni` | Patient's DNI (e.g., `40123456`) |
| `atencion.paciente` | `txt_nombre_completo` | Patient's full name |
| `atencion.empresa` | `txt_empresa` | Company name |
| `atencion.puesto` | `txt_ocupacion` | Job position |
| `atencion.area` | `txt_area` | Area name |
| `atencion.fechaAtencion` (formatted `dd/MM/yyyy`) | `txt_fecha_examen` | Exam date |
| constant `"HOLOMEDIC"` | `txt_lugar` | `HOLOMEDIC` |

**Cuestionario fields** (from `JjcEvaluacion` — only if the row has a saved evaluation):

| Source | PDF field(s) | Expected |
|--------|-------------|----------|
| `cuestionario.sufreEnfermedadesPiel.respuesta` | `cbk_1_si` / `cbk_1_no` | One checked, the other unchecked |
| `cuestionario.sufreEnfermedadesPiel.detalle` | `txt_1_response` | Text detail |
| `cuestionario.alergiaMedicamentos.respuesta` | `cbk_2_si` / `cbk_2_no` | As above |
| `cuestionario.alergiaMedicamentos.detalle` | `txt_2_response` | Text detail |
| `cuestionario.cirugiasPrevias.respuesta` | `cbk_3_si` / `cbk_3_no` | As above |
| `cuestionario.cirugiasPrevias.detalle` | `txt_3_response` | Text detail |
| `cuestionario.tratamientoMedico.respuesta` | `cbk_4_si` / `cbk_4_no` | As above |
| `cuestionario.tratamientoMedico.detalle` | `txt_4_response` | Text detail |
| `cuestionario.usoProtectorSolar.respuesta` | `cbk_5_si` / `cbk_5_no` | As above |
| `cuestionario.usoProtectorSolar.detalle` | `txt_5_response` | Text detail |
| `cuestionario.cancerPiel.respuesta` | `cbk_6_si` / `cbk_6_no` | As above |
| `cuestionario.cancerPiel.detalle` | `txt_6_response` | Text detail |
| `cuestionario.antecedentesFamiliares.respuesta` | `cbk_7_si` / `cbk_7_no` | As above |
| `cuestionario.antecedentesFamiliares.detalle` | `txt_7_response` | Text detail |

**Fototipo** (from `JjcEvaluacion.fototipo`):

| Source | PDF field | Expected |
|--------|-----------|----------|
| `fototipo` value | `cbk_tipo_piel_i` through `cbk_tipo_piel_vi` | Exactly one radio-style checkbox checked |

**Lesion counts** (derived from `JjcEvaluacion.puntos[]`):

| Source | PDF field | Expected |
|--------|-----------|----------|
| Count of points with `type:"L"` | `txt_count_lunar` | e.g., `2` |
| Count of points with `type:"M"` | `txt_count_mancha` | e.g., `1` |
| Count of points with `type:"P"` | `txt_count_peca` | e.g., `1` |
| Count of points with `type:"C"` | `txt_count_cicatriz` | e.g., `0` |

**Observaciones** (from `JjcEvaluacion.observaciones`):

| Source | PDF field | Expected |
|--------|-----------|----------|
| `observaciones` chunk 1 (≤160 chars) | `Observaciones 1` | First ~160 chars, word-boundary break |
| `observaciones` chunk 2 (≤160 chars) | `Observaciones 2` | Next ~160 chars (if applicable) |
| `observaciones` chunk 3 (remaining) | `Observaciones 3` | Remaining chars (if applicable) |

**Describa positivo** (from `JjcEvaluacion.describaPositivo`):

| Source | PDF field | Expected |
|--------|-----------|----------|
| `describaPositivo` chunk 1 (≤200 chars) | `Describa...positiva 1` | First ~200 chars |
| `describaPositivo` chunk 2 (remaining) | `Describa...positiva 2` | Remaining chars (if applicable) |

**Fields left at template defaults** (NOT filled):

| PDF field | Why blank |
|-----------|-----------|
| `txt_fotoprotector` | No data source (v1) |
| `img_firma` | Not filled — patient signs by hand after printing (v1) |
| `img_firma_medico` | Not filled — v1 scope |
| `img_huella` | Not filled — v1 scope |

### 4. Cross-Viewer Smoke Test (Chrome built-in PDF viewer)

Open the **same downloaded file** by dragging it into a Chrome tab (or `Ctrl+O` → select the file).

| What to verify | Expected |
|----------------|----------|
| All text fields render | Same values as in Adobe Reader |
| Checkbox `/AP` rendering | Checkboxes (e.g., `cbk_1_si`) show a visible checkmark. Chrome's built-in viewer may render AcroForm checkboxes differently from Adobe Reader — if the checkmark is visible and in the correct position, it's acceptable |
| No layout shifts or missing characters | The font renders cleanly |

> **Known issue**: Chrome's built-in PDF viewer has incomplete AcroForm support. If the checkbox `✓` does not appear in Chrome but does appear in Adobe Reader, **this is acceptable** for v1. The spec requires the checkbox to render in at least one viewer (Adobe Reader is the primary target).

### 5. SDK Sync

Run the sync script from **PowerShell** (not WSL):

```powershell
.\sync-sdk.ps1
```

This copies the source to `\\172.16.10.12\INSTALADORES\HOLOMEDICSDK`.

| What to verify | Expected |
|----------------|----------|
| New files at SDK path | `src\app\api\areas\medicina\jjc\[idAten]\pdf\route.ts` exists at `\\172.16.10.12\INSTALADORES\HOLOMEDICSDK\src\...` |
| Template at SDK path | `public\PLANTILLA_JJC_MEDICINA.pdf` exists at the SDK (copy it manually if gitignored) |
| Old files preserved | All existing files remain (robocopy `/MIR` preserves the full tree) |

After syncing, open the app from the SDK path (e.g., `http://localhost:3000/areas/medicina/jjc`) and run the same smoke test as step 2 above to confirm the route works from the deployed location.

### 6. Sign-Off

In the PR description or a comment, confirm:

```
- [ ] Dev server smoke test passed
- [ ] Adobe Reader field-by-field verification completed
- [ ] Chrome cross-viewer check completed
- [ ] SDK sync completed and verified
- [ ] Rollback plan documented and understood
```

---

## Rollback Plan

If any verification step fails and cannot be fixed with a targeted hotfix:

### Revert the Entire Feature Branch Chain

```bash
git checkout master
git branch -D feature/jjc-medicina-pdf-fill-download
git branch -D feature/jjc-medicina-pdf-fill-download-pr1
git branch -D feature/jjc-medicina-pdf-fill-download-pr2
git branch -D feature/jjc-medicina-pdf-fill-download-pr3
```

### Remove the pdf-lib Dependency

```bash
pnpm remove pdf-lib
```

### Sync the Rollback to Windows SDK

```powershell
.\sync-sdk.ps1
```

This removes the new route file and the template from the SDK share.

### What Survives Rollback

- The `public/PLANTILLA_JJC_MEDICINA.pdf` template file (gitignored, stays on disk if already present).
- The `PacientePorEmpresaRow` data model (unchanged).
- All patient data in the SIGLA database (no migration was needed).
- All other routes, components, and business logic.

### What the Rollback Removes

- `src/app/api/areas/medicina/jjc/[idAten]/pdf/route.ts` — the PDF generation route.
- `src/app/api/areas/medicina/jjc/[idAten]/pdf/mapAtencionToPdfFields.ts` — the field mapper.
- `src/app/api/areas/medicina/jjc/[idAten]/pdf/chunkLongText.ts` — the text chunker.
- `src/app/areas/medicina/jjc/DownloadCell.tsx` — the download UI component.
- The 8th PDF column in `src/app/areas/medicina/jjc/page.tsx`.
- `pdf-lib` dependency from `package.json` and `pnpm-lock.yaml`.
- `docs/jjc-medicina-pdf-fill-download-manual-verification.md` — this document.

---

## Known Limitations (v1)

| Limitation | Impact | Future work |
|------------|--------|-------------|
| `img_firma`, `img_firma_medico`, `img_huella` not filled | Patient signs by hand after printing | Fill from signature capture |
| `txt_fotoprotector` not filled | Field stays blank | Add data source in v2 |
| No download audit log | Cannot track who downloaded what | Add audit middleware |
| No auth check on the download route | Same access model as the rest of JJC | Future auth layer |
| Cross-viewer checkbox appearance varies | Chrome built-in viewer may not show `/AP` render | Acceptable per spec — Adobe Reader is the primary viewer |
