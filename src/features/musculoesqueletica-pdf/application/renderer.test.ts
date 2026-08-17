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

describe('renderTemplate — figure marks overlay', () => {
  const img = (p: string) =>
    p === 'assets/images/musculo/entrevista/manos.png' ? 'data:image/png;base64,Q0I=' : null;

  const sourceWithMarks = {
    ...sampleSource,
    entrevista: {
      ...sampleEntrevista,
      miembrosSuperiores: {
        ...sampleEntrevista.miembrosSuperiores,
        manoMuneca: {
          ...sampleEntrevista.miembrosSuperiores.manoMuneca,
          areaDistribucionAnotaciones: [
            { id: 'm1', x: 0.25, y: 0.5 },
            { id: 'm2', x: 0.75, y: 0.25 },
          ],
        },
      },
    },
  };

  const figureSpec = {
    kind: 'figure',
    path: 'assets/images/musculo/entrevista/manos.png',
    marks: 'entrevista.miembrosSuperiores.manoMuneca.areaDistribucionAnotaciones',
    imageWidth: 117,
    imageHeight: 81,
  } satisfies PdfTokenManifest['mano'];

  it('renders a figure with an absolutely-positioned SVG overlay drawing red X marks at normalized coordinates', () => {
    const html = '{{figure:mano}}';
    const manifest = { mano: figureSpec };

    const rendered = renderTemplate(html, manifest, sourceWithMarks, img);

    // Figure is wrapped in a relative container.
    expect(rendered).toContain('<div style="position:relative">');
    expect(rendered).toContain('<img src="data:image/png;base64,Q0I=" alt="" data-figure>');
    // SVG overlay with the intrinsic viewBox and object-contain matching.
    expect(rendered).toContain('viewBox="0 0 117 81"');
    expect(rendered).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(rendered).toContain('pointer-events:none');
    expect(rendered).toContain('position:absolute');
    expect(rendered).toContain('width:100%');
    expect(rendered).toContain('height:100%');
    // Red X marks drawn as crossed lines centered at normalized coords scaled
    // by the intrinsic size (X half-length 5).
    expect(rendered).toContain('stroke="#cc0000"');
    // Mark 1: center (0.25*117, 0.5*81) = (29.25, 40.5) → lines span ±5.
    expect(rendered).toContain('x1="24.25" y1="35.5" x2="34.25" y2="45.5"');
    expect(rendered).toContain('x1="34.25" y1="35.5" x2="24.25" y2="45.5"');
    // Mark 2: center (0.75*117, 0.25*81) = (87.75, 20.25) → lines span ±5.
    expect(rendered).toContain('x1="82.75" y1="15.25" x2="92.75" y2="25.25"');
    expect(rendered).toContain('x1="92.75" y1="15.25" x2="82.75" y2="25.25"');
    // Overlay closes before the container closes.
    expect(rendered).toMatch(/<\/svg><\/div>$/);
  });

  it('renders a plain figure without any overlay when there are no marks', () => {
    const html = '{{figure:mano}}';
    const manifest = { mano: figureSpec };

    const sourceNoMarks = {
      ...sampleSource,
      entrevista: {
        ...sampleEntrevista,
        miembrosSuperiores: {
          ...sampleEntrevista.miembrosSuperiores,
          manoMuneca: {
            ...sampleEntrevista.miembrosSuperiores.manoMuneca,
            areaDistribucionAnotaciones: [],
          },
        },
      },
    };

    const rendered = renderTemplate(html, manifest, sourceNoMarks, img);

    expect(rendered).not.toContain('<svg');
    expect(rendered).not.toContain('preserveAspectRatio');
    expect(rendered).toContain('data-figure');
  });

  it('clamps out-of-range mark coordinates to 0..1', () => {
    const html = '{{figure:mano}}';
    const manifest = { mano: figureSpec };
    const sourceClamped = {
      ...sourceWithMarks,
      entrevista: {
        ...sourceWithMarks.entrevista!,
        miembrosSuperiores: {
          ...sourceWithMarks.entrevista!.miembrosSuperiores,
          manoMuneca: {
            ...sourceWithMarks.entrevista!.miembrosSuperiores.manoMuneca,
            areaDistribucionAnotaciones: [
              { id: 'lo', x: -0.5, y: 1.4 },
              { id: 'hi', x: 2, y: -1 },
            ],
          },
        },
      },
    };

    const rendered = renderTemplate(html, manifest, sourceClamped, img);

    // clamp(-0.5*117)=0, clamp(1.4*81)=81 → center (0,81) → lines span ±5.
    expect(rendered).toContain('x1="-5" y1="76" x2="5" y2="86"');
    // clamp(2*117)=117, clamp(-1*81)=0 → center (117,0) → lines span ±5.
    expect(rendered).toContain('x1="112" y1="-5" x2="122" y2="5"');
  });

  it('renders a plain figure when the marks path is missing or not an array', () => {
    const html = '{{figure:mano}}';
    const manifest = { mano: figureSpec };

    const sourceMissing = {
      ...sourceWithMarks,
      entrevista: {
        ...sourceWithMarks.entrevista!,
        miembrosSuperiores: {
          ...sourceWithMarks.entrevista!.miembrosSuperiores,
          manoMuneca: {
            ...sourceWithMarks.entrevista!.miembrosSuperiores.manoMuneca,
            areaDistribucionAnotaciones: 'not-an-array' as unknown as never,
          },
        },
      },
    };
    expect(renderTemplate(html, manifest, sourceMissing, img)).not.toContain('<svg');

    const sourceNull = {
      ...sourceWithMarks,
      entrevista: {
        ...sourceWithMarks.entrevista!,
        miembrosSuperiores: {
          ...sourceWithMarks.entrevista!.miembrosSuperiores,
          manoMuneca: {
            ...sourceWithMarks.entrevista!.miembrosSuperiores.manoMuneca,
            areaDistribucionAnotaciones: null as unknown as never,
          },
        },
      },
    };
    expect(renderTemplate(html, manifest, sourceNull, img)).not.toContain('<svg');
  });

  it('ignores marks that are not finite numbers (skipped, not crashing)', () => {
    const html = '{{figure:mano}}';
    const manifest = { mano: figureSpec };
    const sourceMixed = {
      ...sourceWithMarks,
      entrevista: {
        ...sourceWithMarks.entrevista!,
        miembrosSuperiores: {
          ...sourceWithMarks.entrevista!.miembrosSuperiores,
          manoMuneca: {
            ...sourceWithMarks.entrevista!.miembrosSuperiores.manoMuneca,
            areaDistribucionAnotaciones: [
              { id: 'ok', x: 0.5, y: 0.5 },
              { id: 'nan', x: Number.NaN, y: 0.5 },
            ],
          },
        },
      },
    };

    const rendered = renderTemplate(html, manifest, sourceMixed, img);

    // Only the valid mark (0.5,0.5) is drawn; the NaN mark is skipped.
    expect(rendered).toContain('x1="53.5" y1="35.5" x2="63.5" y2="45.5"');
    expect(rendered).not.toContain('NaN');
  });
});