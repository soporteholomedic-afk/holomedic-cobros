/**
 * The new interpolation orchestrator (PR 4 — design Decisions i, j).
 *
 *   `interpolate(html, subject, ctx, registry)` → `{ html, subject }`
 *
 * Algorithm (mirrors the design):
 *   1. Parse `html` + `subject` looking for `{{...}}` placeholders.
 *   2. For each placeholder:
 *      a. If it matches `{{tabla:NAME:COL1,COL2}}` → call
 *         `registry.resolveTable(NAME, COLS, ctx)`.
 *      b. Else if it matches `{{key}}` → call
 *         `registry.resolveToken(key, ctx)`.
 *      c. Else → unknown → empty string.
 *   3. Apply replacements:
 *      a. Non-empty → string `replaceAll` (the common fast path; this is
 *         behaviour-preserving with the prior `interpolateSpitch`).
 *      b. Empty → client-side `DOMParser` walks the rendered HTML and
 *         removes the containing block per Decision i (configurable
 *         set of block tags; `td`/`th` are excluded).
 *   4. Strip inline `color: #xxx;` declarations (preserves the prior
 *      `interpolateSpitch` theme-aware colour behaviour).
 *
 * Pure: no I/O, no React, no module state. `DOMParser` is available
 * in browsers + jsdom; tests run in jsdom so they exercise the real
 * DOM path. The function is client-side — `EmailEditor.handleSpitchSelect`
 * calls the thin wrapper `interpolateSpitch(params)`, which builds the
 * registry + context and calls this orchestrator.
 */
import type { InterpolationContext, TokenResolverRegistry } from './tokenResolvers/types';

const TABLE_TOKEN_RE = /\{\{tabla:([^:}]+):([^}]*)\}\}/g;
const SIMPLE_TOKEN_RE = /\{\{([^{} :}]+)\}\}/g;

/**
 * Tags whose ENTIRE block is safe to remove when they become empty
 * after token replacement. `td`/`th` are EXCLUDED (removing a cell
 * breaks table layout). Spec scenarios "Empty token removes containing
 * block" + "Empty token in td keeps cell" pin this set.
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
  'TR',
  'TABLE',
];

/**
 * Run the orchestrator.
 */
export function interpolate(
  html: string,
  subject: string,
  ctx: InterpolationContext,
  registry: TokenResolverRegistry,
): { html: string; subject: string } {
  // 1. Compute the replacement map by running the regexes in order
  //    (table first so the simple regex doesn't partially consume
  //    `tabla:...` form).
  const tableReplacements = new Map<string, string>();
  const tableSeen = new Set<string>();
  for (const m of html.matchAll(TABLE_TOKEN_RE)) {
    const full = m[0];
    const name = m[1] ?? '';
    const colsRaw = m[2] ?? '';
    if (tableSeen.has(full)) continue;
    tableSeen.add(full);
    const cols = colsRaw ? colsRaw.split(',').map((c) => c.trim()).filter(Boolean) : [];
    const value = registry.resolveTable(name, cols, ctx);
    tableReplacements.set(full, value);
  }
  // Also scan the subject for table tokens (subject rarely uses them,
  // but the behaviour is symmetric).
  for (const m of subject.matchAll(TABLE_TOKEN_RE)) {
    const full = m[0];
    if (tableSeen.has(full)) continue;
    tableSeen.add(full);
    const name = m[1] ?? '';
    const colsRaw = m[2] ?? '';
    const cols = colsRaw ? colsRaw.split(',').map((c) => c.trim()).filter(Boolean) : [];
    tableReplacements.set(full, registry.resolveTable(name, cols, ctx));
  }

  const simpleReplacements = new Map<string, string>();
  const simpleSeen = new Set<string>();
  for (const m of html.matchAll(SIMPLE_TOKEN_RE)) {
    const full = m[0];
    if (tableSeen.has(full)) continue; // don't double-replace table form
    if (simpleSeen.has(full)) continue;
    simpleSeen.add(full);
    simpleReplacements.set(full, registry.resolveToken(m[1] ?? '', ctx));
  }
  for (const m of subject.matchAll(SIMPLE_TOKEN_RE)) {
    const full = m[0];
    if (tableSeen.has(full)) continue;
    if (simpleSeen.has(full)) continue;
    simpleSeen.add(full);
    simpleReplacements.set(full, registry.resolveToken(m[1] ?? '', ctx));
  }

  // 2. Apply non-empty replacements via string replaceAll (fast, behaviour-preserving).
  let resultHtml = html;
  let resultSubject = subject;
  for (const [placeholder, value] of tableReplacements) {
    if (value !== '') {
      resultHtml = resultHtml.split(placeholder).join(value);
      resultSubject = resultSubject.split(placeholder).join(value);
    }
  }
  for (const [placeholder, value] of simpleReplacements) {
    if (value !== '') {
      resultHtml = resultHtml.split(placeholder).join(value);
      resultSubject = resultSubject.split(placeholder).join(value);
    }
  }

  // 3. For each empty replacement, remove the containing block via DOMParser.
  const emptyTokens: string[] = [];
  for (const [placeholder, value] of tableReplacements) {
    if (value === '') emptyTokens.push(placeholder);
  }
  for (const [placeholder, value] of simpleReplacements) {
    if (value === '') emptyTokens.push(placeholder);
  }
  if (emptyTokens.length > 0) {
    resultHtml = removeEmptyBlocks(resultHtml, emptyTokens);
  }

  // 4. Strip hardcoded `color: #xxx;` inline styles (theme-aware rendering).
  resultHtml = resultHtml.replace(/color:\s*#[0-9a-fA-F]+;?/g, '');

  return { html: resultHtml, subject: resultSubject };
}

/**
 * Walk the HTML, remove the containing block for each empty-resolving
 * token. Client-side only (`DOMParser` required). `td`/`th` are kept
 * (empty cell) so table layout is preserved.
 */
function removeEmptyBlocks(html: string, emptyTokens: string[]): string {
  if (typeof DOMParser === 'undefined') {
    // SSR / non-browser — no DOM to walk. Tokens stay as `{{...}}`
    // in the output (matches the prior behaviour for unknown tokens).
    return html;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // First pass: remove the token text nodes themselves (all branches).
  // If the containing block becomes empty as a result, the second pass
  // removes the block. If not, the text is just gone (e.g. `td`).
  for (const token of emptyTokens) {
    removeTokenTextNodes(doc.body, token);
  }

  // Second pass: remove the block for tokens that were the only content.
  const candidates = doc.querySelectorAll(REMOVABLE_BLOCK_TAGS.join(','));
  // Collect first, then mutate (NodeList is live).
  const toRemove: Element[] = [];
  candidates.forEach((el) => {
    if (el.textContent?.trim().length === 0) {
      toRemove.push(el);
    }
  });
  for (const el of toRemove) {
    el.remove();
  }

  return doc.body.innerHTML;
}

/**
 * Remove every text node whose data contains the literal `{{token}}`
 * placeholder. Walks the entire subtree.
 */
function removeTokenTextNodes(root: Element, token: string): void {
  const walker = root.ownerDocument?.createTreeWalker(root, /* SHOW_TEXT */ 4);
  if (!walker) return;
  const toRemove: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    if (text.data.includes(token)) {
      toRemove.push(text);
    }
    current = walker.nextNode();
  }
  for (const node of toRemove) {
    const parent = node.parentNode;
    if (!parent) continue;
    // Replace the text node's content so surrounding siblings survive
    // (e.g. `Prefix {{firma}} suffix` → `Prefix  suffix`).
    node.data = node.data.split(token).join('');
    // If the text node is now empty AND its parent has no other
    // children, drop the text node entirely.
    if (node.data === '') {
      parent.removeChild(node);
    }
  }
}
