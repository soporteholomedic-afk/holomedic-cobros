import type { MockPreviewData } from '../../infrastructure/areaConfigRegistry';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Regex matching a `{{tabla:name:cols}}` placeholder (table form). The
 * inner captures are the table name and the comma-joined columns. Used by
 * the preview to render a simple placeholder for table tokens — the FULL
 * table resolver (HTML `<table>` with only the selected columns) is PR 4.
 */
const TABLE_TOKEN_RE = /\{\{tabla:([^:}]+):([^}]*)\}\}/g;

/**
 * Regex matching a `{{simple}}` placeholder (non-table). Runs AFTER the
 * table regex so table tokens are not partially consumed. The capture is
 * the token key.
 */
const SIMPLE_TOKEN_RE = /\{\{([^ {}:}:]+)\}\}/g;

/**
 * Block-level elements whose ENTIRE removal is safe when they become empty
 * after token replacement. `td`/`th` are EXCLUDED (removing a cell breaks
 * table layout) — the spec scenario "Empty token in td keeps cell" pins
 * this. PR 4 makes this set configurable; PR 3 uses a sensible fixed set.
 */
const REMOVABLE_BLOCK_TAGS = [
  'P',
  'LI',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'PRE',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'MAIN',
];

/**
 * Build the preview HTML for the editor's sandboxed iframe `srcDoc`.
 *
 * PR 3 SIMPLE client-side preview (design Decision i, scoped per the PR 3
 * task note):
 *  1. Replace `{{empresa}}` / `{{fecha}}` / `{{firma}}` with the mock values
 *     from `mockPreviewData`.
 *  2. Replace `{{tabla:name:cols}}` with a readable placeholder listing the
 *     table + columns. The FULL HTML `<table>` resolver is PR 4.
 *  3. Simple empty-block removal: parse the result with `DOMParser` and
 *     remove block-level elements whose `textContent` is empty/whitespace-
 *     only after replacement. `td`/`th` are kept (empty cell) so table
 *     layout is not broken. PR 4 generalises this with a configurable
 *     block-ancestor set and nested-block rules.
 *
 * Unknown tokens (no mock value) are left as `{{token}}` so the user sees
 * the placeholder in the preview rather than a silent disappearance.
 *
 * Pure: takes a string + mock data, returns a string. Uses `DOMParser`
 * (available in the browser + jsdom). No React, no BlockNote.
 */
export function buildPreviewHtml(
  bodyHtml: string,
  mock: MockPreviewData,
): string {
  // 1. Table tokens first (so the simple regex does not partially consume
  //    the `tabla:...` form).
  const afterTable = bodyHtml.replace(
    TABLE_TOKEN_RE,
    (_match, name: string, cols: string) =>
      `[Tabla: ${name} (${cols})]`,
  );

  // 2. Simple tokens — look up the mock value by key.
  const afterSimple = afterTable.replace(
    SIMPLE_TOKEN_RE,
    (match, key: string) => {
      const value = lookupMockValue(key, mock);
      return value === undefined ? match : value;
    },
  );

  // 3. Simple empty-block removal via DOMParser.
  return removeEmptyBlocks(afterSimple);
}

/** Map a simple token key to its mock value, or `undefined` if unknown. */
function lookupMockValue(key: string, mock: MockPreviewData): string | undefined {
  switch (key) {
    case 'empresa':
      return mock.companyName;
    case 'fecha':
      return mock.today;
    case 'firma':
      return mock.firma;
    case 'dni':
      return mock.pacienteDni;
    case 'nombrePaciente':
      return mock.pacienteNombre;
    case 'listaPacientes':
      return mock.patientNames.length > 0
        ? `<ol>${mock.patientNames.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ol>`
        : '<em>[Lista vacía]</em>';
    default:
      return undefined;
  }
}

/**
 * Remove block-level elements whose text content is empty/whitespace-only.
 * `td`/`th` are kept (empty cell) so table layout is preserved. Runs in the
 * browser/jsdom via `DOMParser`; no server DOM dependency.
 */
function removeEmptyBlocks(html: string): string {
  if (typeof DOMParser === 'undefined') return html; // SSR guard (preview is client-only).
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const candidates = doc.querySelectorAll(REMOVABLE_BLOCK_TAGS.join(','));
  candidates.forEach((el) => {
    if (el.textContent?.trim().length === 0) {
      el.remove();
    }
  });
  // Serialize the body's inner HTML (drop the wrapper <html>/<head>/<body>).
  return doc.body.innerHTML;
}
