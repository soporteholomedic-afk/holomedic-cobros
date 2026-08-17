import fs from 'fs';
import path from 'path';
import { TemplateError } from '../domain/errors';

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.css': 'text/css',
};

export function mimeForPath(filePath: string): string | null {
  return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? null;
}

export function dataUriFromBytes(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

export interface ImageLoadOptions {
  /** Directory used to resolve relative asset paths. */
  baseDir: string;
  /** Absolute directories the resolved file must live under. */
  roots: readonly string[];
  /** Allowed file extensions (with dot). */
  allowedExtensions: readonly string[];
  /** Maximum accepted file size in bytes. */
  maxBytes: number;
}

/**
 * Load a local image as a data URI under strict restrictions: the resolved
 * path must live inside one of the allowed roots, the extension must be
 * allowed, and the file must not exceed the size limit. Any violation or
 * read failure returns `null` (the caller renders a blank slot).
 */
export function loadImageAsDataUri(assetPath: string, opts: ImageLoadOptions): string | null {
  const resolved = path.resolve(opts.baseDir, assetPath);
  const withinRoot = opts.roots.some((root) => {
    const normalizedRoot = path.resolve(root);
    return resolved === normalizedRoot || resolved.startsWith(normalizedRoot + path.sep);
  });
  if (!withinRoot) return null;

  const mime = mimeForPath(resolved);
  if (!mime || !opts.allowedExtensions.includes(path.extname(resolved).toLowerCase())) {
    return null;
  }

  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile() || stat.size > opts.maxBytes) return null;
    return dataUriFromBytes(fs.readFileSync(resolved), mime);
  } catch {
    return null;
  }
}

const STYLESHEET_PATTERN = /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
const IMG_SRC_PATTERN = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
const CSS_URL_PATTERN = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;

function isRemoteUrl(url: string): boolean {
  return /^(https?:)?\/\//i.test(url);
}

/** Inline one local CSS file into a <style> block, inlining its local urls. */
function inlineStylesheet(href: string, htmlDir: string): string {
  if (isRemoteUrl(href)) {
    throw new TemplateError(`Remote stylesheet "${href}" is not allowed in an offline template`);
  }
  const cssPath = path.resolve(htmlDir, href);
  const cssDir = path.dirname(cssPath);
  const css = fs.readFileSync(cssPath, 'utf8');

  const inlined = css.replace(CSS_URL_PATTERN, (_full, rawUrl: string) => {
    const url = rawUrl.trim();
    if (url.startsWith('data:') || url.startsWith('#') || isRemoteUrl(url)) {
      return `url(${rawUrl})`;
    }
    const assetPath = path.resolve(cssDir, url);
    const mime = mimeForPath(assetPath);
    if (!mime) return `url(${rawUrl})`;
    try {
      return `url(${dataUriFromBytes(fs.readFileSync(assetPath), mime)})`;
    } catch {
      return `url(${rawUrl})`;
    }
  });

  return `<style>${inlined}</style>`;
}

/**
 * Convert a template into a fully offline document:
 *
 * - local `<link rel="stylesheet">` files are inlined as `<style>` blocks and
 *   their local `url(...)` font/image references become data URIs;
 * - local `<img src="...">` references become data URIs.
 *
 * Remote (`http(s)://` / `//`) references are rejected with `TemplateError`
 * so a template can never silently depend on the network at render time.
 */
export function inlineAssets(html: string, htmlDir: string): string {
  let out = html.replace(STYLESHEET_PATTERN, (_full, href: string) => {
    return inlineStylesheet(href, htmlDir);
  });

  out = out.replace(IMG_SRC_PATTERN, (full, src: string) => {
    if (isRemoteUrl(src)) {
      throw new TemplateError(`Remote image "${src}" is not allowed in an offline template`);
    }
    if (src.startsWith('data:')) return full;
    const imgPath = path.resolve(htmlDir, src);
    const mime = mimeForPath(imgPath);
    if (!mime) return full;
    try {
      const dataUri = dataUriFromBytes(fs.readFileSync(imgPath), mime);
      return full.replace(`src="${src}"`, `src="${dataUri}"`);
    } catch {
      return full;
    }
  });

  return out;
}