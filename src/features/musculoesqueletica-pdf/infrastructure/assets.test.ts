import { describe, it, expect } from 'vitest';
import path from 'path';
import { inlineAssets, loadImageAsDataUri } from './assets';
import { TemplateError } from '../domain/errors';

const FIXTURE_DIR = path.join(__dirname, '__fixtures__');
const FIXTURE_ASSETS = path.join(FIXTURE_DIR, 'assets');

describe('inlineAssets', () => {
  const baseHtml = '<html><head><link rel="stylesheet" href="assets/site.css"></head><body><img src="assets/pic.png" alt="x"><h1>Hola</h1></body></html>';

  it('inlines local stylesheets, font url() refs and img srcs as data URIs without network URLs', () => {
    const out = inlineAssets(baseHtml, FIXTURE_DIR);

    // Stylesheet is inlined
    expect(out).toContain('<style>');
    expect(out).toContain('@font-face');
    // Font url() rewritten to a data URI
    expect(out).toContain('data:font/woff2;base64,');
    expect(out).not.toContain('url(../fonts/f.woff2)');
    // Image src rewritten to a data URI
    expect(out).toContain('<img src="data:image/png;base64,');
    expect(out).not.toContain('src="assets/pic.png"');
    // No network URL remains anywhere
    expect(out).not.toMatch(/https?:\/\//);
  });

  it('throws TemplateError when the stylesheet references a remote URL', () => {
    const html = '<link rel="stylesheet" href="https://cdn.tailwindcss.com?plugins=forms">';
    expect(() => inlineAssets(html, FIXTURE_DIR)).toThrow(TemplateError);
  });

  it('throws TemplateError when an img references a remote URL', () => {
    const html = '<img src="https://lh3.googleusercontent.com/xyz.png">';
    expect(() => inlineAssets(html, FIXTURE_DIR)).toThrow(TemplateError);
  });

  it('leaves data URIs and fragments untouched', () => {
    const html = '<img src="data:image/png;base64,QUFB"><a href="#seccion">ir</a>';
    const out = inlineAssets(html, FIXTURE_DIR);
    expect(out).toContain('data:image/png;base64,QUFB');
    expect(out).toContain('href="#seccion"');
  });
});

describe('loadImageAsDataUri', () => {
  const opts = {
    baseDir: FIXTURE_DIR,
    roots: [FIXTURE_ASSETS],
    allowedExtensions: ['.png', '.jpg', '.webp'],
    maxBytes: 1024,
  };

  it('loads an allowed image inside the allowed root as a data URI', () => {
    const uri = loadImageAsDataUri('assets/pic.png', opts);
    expect(uri).toBe(`data:image/png;base64,${Buffer.from('FAKE-PNG-BYTES').toString('base64')}`);
  });

  it('returns null for paths outside the allowed roots (traversal)', () => {
    expect(loadImageAsDataUri('../page.html', opts)).toBeNull();
    expect(loadImageAsDataUri('../../package.json', opts)).toBeNull();
  });

  it('returns null for disallowed extensions', () => {
    expect(loadImageAsDataUri('assets/site.css', opts)).toBeNull();
  });

  it('returns null for files exceeding the size limit', () => {
    const small = { ...opts, maxBytes: 4 };
    expect(loadImageAsDataUri('assets/pic.png', small)).toBeNull();
  });

  it('returns null for missing files', () => {
    expect(loadImageAsDataUri('assets/nope.png', opts)).toBeNull();
  });
});