# PDF Valoraciones — Tabla única (sin división por proyecto)

Feature: `pdf-valoraciones-tabla-unica`
Branch: `feature/pdf-valoraciones-tabla-unica` (desde `develop`; mergeado fast-forward a `develop` como `1a2a2ad`/`1a2a1ad`)
Fecha: 2026-02-27

## Objetivo

El PDF de valoraciones (`/api/valoraciones/pdf` y el adjunto de `/api/valoraciones/send`)
deja de dividir el reporte en una tabla por proyecto (destino `DesDes`) y pasa a mostrar
**una sola tabla** con todas las filas.

## Decisión de layout (elegida por el usuario — Opción A)

- Tabla única, filas en el orden original de la consulta.
- Se agrega la columna **Destino** inmediatamente después de **CR** (14 columnas totales).
- Un único pie global: SubTotal / IGV 18% / Total (calculado con `totalesDe` del dominio).
- Se eliminan los `<h2>` por destino y los subtotales por grupo.
- Destino vacío → `SIN DESTINO` (misma semántica que `agruparPorDestino`).
- El Excel NO cambia (no usa `agruparPorDestino`).

## Contrato de columnas (14, exacto y en orden)

N°. Ficha | Doc. Iden | ¿Conv.? | N° Conv | Nombres | Ocupación | Fecha examen |
Tipo examen | CR | Anexo 7D | **Destino** | Solicitado Por | Costos | Doc.Fac

## Tareas

- [x] T1 — RED: reescribir `template.test.ts` al contrato de tabla única (un solo
  `<thead>`, 14 columnas con Destino tras Anexo 7D, pie global SubTotal/IGV/Total con
  totales agregados; sin `<h2>` por destino) + `destinoDe` en `agrupacion.test.ts`
  + ajustar input de `realEdgeHarness.test.ts`.
- [x] T2 — GREEN: `template.ts` tabla única (14 columnas, pie global con `totalesDe`),
  `ValoracionPdfInput.grupos: DestinoGrupo[]` → `rows: RepFacturacion[]`,
  `renderValoracionesPdf.ts` pasa filas planas, `agrupacion.ts` exporta `destinoDe`.
- [x] T3 — Chequeos enfocados: vitest sobre archivos afectados + eslint sobre archivos
  modificados (modo sdd-apply: nada global).
- [x] T4 — Work-unit commit (Conventional Commit) en el feature branch.
- [x] T5 — Revisión nativa RDD (inspect → start → capture) y cierre.

## Evidencia

- RED observado: `template.test.ts` 12/12 fallando contra la implementación vieja;
  `agrupacion.test.ts` 2 fallos (`destinoDe is not a function`).
- GREEN: suites afectadas 4 archivos / 38 tests OK (`template`, `agrupacion`,
  `realEdgeHarness` (skip sin Edge), `HtmlValoracionPdfPrinter`); eslint limpio en los
  6 archivos modificados.
- Commit: `1a2a1ad` — `feat(valoraciones): render PDF as a single table with Destino column`
  (6 files, +148/−114).
- Revisión nativa RDD: lineage `review-c45011fa3d139d61`, tier medium, lens
  `review-reliability` → **approved**, acknowledgement quemado
  (`gentle-ai.review-acknowledged/v1`, authority burned, delivery: ordinary-repository-policy).
- Hallazgos del reviewer (informativos, NO bloqueantes — trabajo futuro separado):
  - `R3-destinode-coverage` (SUGGESTION): cobertura de `destinoDe` en
    `agrupacion.ts:91-95`.
  - `R3-global-footer-mixed-simbol` (WARNING): el pie global usa el `Simbol` de la
    primera fila (`template.ts:126-137`); si un mismo export mezclara símbolos de
    moneda, el rótulo del pie no reflejaría la mezcla (hoy el filtro `codMon` acota
    la export a una moneda).
- Nota de layout: el orden autoritativo de columnas es el del mockup elegido —
  `CR | Anexo 7D | Destino | Solicitado Por` (Destino después de Anexo 7D).
- Infra RDD: se creó `~/.pi/gentle-ai/models.json` asignando `zai/glm-5.3` a los 4
  lenses de review (no existía y el relay rechazaba lanzar el reviewer).
- Delivery (autorizado por el usuario): merge fast-forward a `develop` (`1a2a1ad`),
  promoción a `master` (`b4e7662`), push de ambos; `develop` reconciliado con el
  trabajo remoto de plantillas (`f794a2e`). Integración combinada verificada:
  48/48 tests en los 4 archivos afectados. feature branch local conservado.
