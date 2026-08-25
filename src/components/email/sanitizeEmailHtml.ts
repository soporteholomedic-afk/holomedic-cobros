import DOMPurify from 'dompurify';

/**
 * Allowlist sanitizer for email preview HTML (shared email module).
 *
 * Client-side only: the preview is a browser render, and SMTP html is
 * dispatched as authored (no server-side sanitization by design).
 * During the SSR pass of client components there is no window, so the
 * input is returned as-is; the client render sanitizes before the
 * preview becomes interactive/visible after hydration.
 */

const ALLOWED_TAGS = [
  'a', 'b', 'br', 'blockquote', 'code', 'div', 'em',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img',
  'li', 'ol', 'p', 'pre', 'span', 'strong',
  'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
];

const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'style',
  'cellpadding', 'cellspacing', 'align', 'valign', 'colspan', 'rowspan',
];

const CACHE_MAX_ENTRIES = 256;
const cache = new Map<string, string>();

export function sanitizeEmailHtml(html: string): string {
  const cached = cache.get(html);
  if (cached !== undefined) {
    return cached;
  }

  let clean: string;
  if (typeof window === 'undefined') {
    // SSR pass of a client component — no DOM available. The browser
    // render below is the one operators see; see note above.
    clean = html;
  } else {
    clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
    });
  }

  if (cache.size >= CACHE_MAX_ENTRIES) {
    cache.clear();
  }
  cache.set(html, clean);
  return clean;
}
