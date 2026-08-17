import { describe, it, expect } from 'vitest';
import { renderTemplate, escapeHtml, resolvePath } from './renderer';
import { TemplateError } from '../domain/errors';
import { sampleEntrevista, sampleSource } from '../testing/sampleSource';
import type { PdfTokenManifest } from '../domain/entities';

const noImages = () => null;

describe('escapeHtml', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Juan Pérez 123')).toBe('Juan Pérez 123');
  });
});

describe('resolvePath', () => {
  it('resolves nested own-property paths', () => {
    expect(resolvePath(sampleSource, 'entrevista.datosGenerales.empresa')).toBe(
      'ACME & Sons <CIA>',
    );
  });

  it('returns undefined for prototype members (own-property only)', () => {
    expect(resolvePath(sampleSource, 'entrevista.toString')).toBeUndefined();
    expect(resolvePath(sampleSource, 'constructor')).toBeUndefined();
    expect(resolvePath(sampleSource, 'hasOwnProperty')).toBeUndefined();
  });

  it('returns undefined for missing or null intermediate segments', () => {
    expect(resolvePath(sampleSource, 'entrevista.datosGenerales.noExiste')).toBeUndefined();
    expect(resolvePath(sampleSource, 'evaluacion.fechaEvaluacion')).toBeUndefined();
  });

  it('returns undefined when a segment value is a primitive', () => {
    expect(resolvePath(sampleSource, 'atencion.edad.anything')).toBeUndefined();
  });
});

describe('renderTemplate', () => {
  it('renders text tokens with HTML escaping', () => {
    const html = '<p>{{text:empresa}}</p>';
    const manifest = {
      empresa: { kind: 'text', path: 'entrevista.datosGenerales.empresa' },
    } satisfies PdfTokenManifest;
    expect(renderTemplate(html, manifest, sampleSource, noImages)).toBe(
      '<p>ACME &amp; Sons &lt;CIA&gt;</p>',
    );
  });

  it('renders null/undefined paths as empty text', () => {
    const html = '[{{text:vacio}}]';
    const sourceSinArea = {
      ...sampleSource,
      entrevista: {
        ...sampleEntrevista,
        datosGenerales: { ...sampleEntrevista.datosGenerales, area: null as unknown as string },
      },
    };
    const manifest = {
      vacio: { kind: 'text', path: 'entrevista.datosGenerales.area' },
    } satisfies PdfTokenManifest;
    expect(renderTemplate(html, manifest, sourceSinArea, noImages)).toBe('[]');
    expect(
      renderTemplate(
        html,
        { vacio: { kind: 'text', path: 'evaluacion.fechaEvaluacion' } },
        sampleSource,
        noImages,
      ),
    ).toBe('[]');
  });

  it('renders numeric values as strings', () => {
    const html = '{{text:edad}}';
    const manifest = { edad: { kind: 'text', path: 'entrevista.datosGenerales.edad' } } satisfies PdfTokenManifest;
    expect(renderTemplate(html, manifest, sampleSource, noImages)).toBe('35');
  });

  it('renders deterministic checks from boolean values', () => {
    const html = '<input type="checkbox" {{check:hombro_dolor_movimiento_dx}}>|<input type="checkbox" {{check:hombro_dolor_movimiento_ix}}>';
    const manifest = {
      hombro_dolor_movimiento_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.dolorMovimiento.dx' },
      hombro_dolor_movimiento_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.dolorMovimiento.ix' },
    } satisfies PdfTokenManifest;
    expect(renderTemplate(html, manifest, sampleSource, noImages)).toBe(
      '<input type="checkbox" checked>|<input type="checkbox" >',
    );
  });

  it('renders checks with an explicit match value (radio semantics)', () => {
    const html = '<input name="sexo" value="M" {{check:sexo_m}}><input name="sexo" value="F" {{check:sexo_f}}>';
    const manifest = {
      sexo_m: { kind: 'check', path: 'entrevista.datosGenerales.sexo', match: 'M' },
      sexo_f: { kind: 'check', path: 'entrevista.datosGenerales.sexo', match: 'F' },
    } satisfies PdfTokenManifest;
    expect(renderTemplate(html, manifest, sampleSource, noImages)).toBe(
      '<input name="sexo" value="M" checked><input name="sexo" value="F" >',
    );
  });

  it('renders figure tokens as data-URI images when resolvable', () => {
    const html = '{{figure:hombro}}';
    const manifest = {
      hombro: { kind: 'figure', path: 'musculoesqueletica-pdf/assets/hombro.png' },
    } satisfies PdfTokenManifest;
    const images = (p: string) => (p === 'musculoesqueletica-pdf/assets/hombro.png' ? 'data:image/png;base64,QUFB' : null);
    expect(renderTemplate(html, manifest, sampleSource, images)).toBe(
      '<img src="data:image/png;base64,QUFB" alt="" data-figure>',
    );
  });

  it('renders image tokens as plain data-URI images', () => {
    const html = '{{image:firma}}';
    const manifest = {
      firma: { kind: 'image', path: 'musculoesqueletica-pdf/assets/firma.png' },
    } satisfies PdfTokenManifest;
    const images = (p: string) => (p === 'musculoesqueletica-pdf/assets/firma.png' ? 'data:image/png;base64,QkI=' : null);
    expect(renderTemplate(html, manifest, sampleSource, images)).toBe(
      '<img src="data:image/png;base64,QkI=" alt="">',
    );
  });

  it('renders figure/image tokens blank when the image cannot be resolved', () => {
    const html = '[{{figure:hombro}}][{{image:firma}}]';
    const manifest = {
      hombro: { kind: 'figure', path: 'musculoesqueletica-pdf/assets/hombro.png' },
      firma: { kind: 'image', path: 'musculoesqueletica-pdf/assets/firma.png' },
    } satisfies PdfTokenManifest;
    expect(renderTemplate(html, manifest, sampleSource, noImages)).toBe('[][]');
  });

  it('throws TemplateError for unknown token kinds', () => {
    const html = '{{wat:entrevista.datosGenerales.empresa}}';
    expect(() => renderTemplate(html, {}, sampleSource, noImages)).toThrow(TemplateError);
  });

  it('throws TemplateError for tokens missing from the manifest', () => {
    const html = '{{text:no_mappeado}}';
    expect(() => renderTemplate(html, {}, sampleSource, noImages)).toThrow(TemplateError);
  });

  it('leaves HTML without tokens unchanged', () => {
    const html = '<h1>Evaluación de Miembros Superiores</h1>';
    expect(renderTemplate(html, {}, sampleSource, noImages)).toBe(html);
  });
});