import { describe, expect, it } from 'vitest';

import { PLANTILLAS_CORREO, renderPlantillaCorreo } from '../plantillasCorreo';
import type { DatosPlantilla } from '../plantillasCorreo';
import type { PlantillaCrmKey } from '../ports';
import { PLANTILLAS_CANONICAS } from './plantillasCorreo.canonical';

/**
 * Contract for the 5 verbatim CRM templates (tasks 3.1/3.2; spec
 * crm-email-sequencing): exactly the 5 PlantillaCrmKey entries,
 * byte-equal to the canonical fixture (mock 08892c2, folleto sentence
 * removed per decision 3), subjects embed `[Empresa]`, and the pure
 * renderPlantillaCorreo resolves every placeholder (mock-verbatim
 * fallbacks for nullable sector/trabajadores). Data carries no
 * attachment field (OP-8/EM-3 guard).
 */

const CLAVES: readonly PlantillaCrmKey[] = [
  'carta_presentacion',
  'seguimiento_1',
  'seguimiento_2',
  'seguimiento_3',
  'reactivacion_3m',
];

const DATOS: DatosPlantilla = {
  empresa: 'Constructora Andes SAC',
  contacto: 'María López',
  sector: 'Construcción',
  trabajadores: 45,
};

describe('PLANTILLAS_CORREO catalog', () => {
  it('defines exactly the 5 PlantillaCrmKey templates', () => {
    expect(CLAVES).toHaveLength(5);
    expect(Object.keys(PLANTILLAS_CORREO).sort()).toEqual([...CLAVES].sort());
  });

  it('is byte-equal to the canonical in-repo fixture (asunto + cuerpo)', () => {
    for (const clave of CLAVES) {
      expect(PLANTILLAS_CANONICAS[clave].asunto.length).toBeGreaterThan(0);
      expect(PLANTILLAS_CANONICAS[clave].cuerpo.length).toBeGreaterThan(0);
      expect(PLANTILLAS_CORREO[clave].asunto).toBe(PLANTILLAS_CANONICAS[clave].asunto);
      expect(PLANTILLAS_CORREO[clave].cuerpo).toBe(PLANTILLAS_CANONICAS[clave].cuerpo);
    }
  });

  it('embeds the literal [Empresa] token in every subject (mock trait)', () => {
    for (const clave of CLAVES) {
      expect(PLANTILLAS_CORREO[clave].asunto).toContain('[Empresa]');
    }
  });

  it('declares no attachment field on any template (v1 without folleto — decision 3 / OP-8)', () => {
    for (const clave of CLAVES) {
      expect(Object.keys(PLANTILLAS_CORREO[clave]).sort()).toEqual([
        'asunto',
        'clave',
        'cuerpo',
        'fase',
        'titulo',
      ]);
    }
  });
});

describe('carta_presentacion — decision 3 (folleto sentence removed)', () => {
  it('drops the folleto sentence and keeps the rest of the verbatim copy', () => {
    const cuerpo = PLANTILLAS_CORREO.carta_presentacion.cuerpo;
    expect(cuerpo).not.toContain('folleto');
    expect(cuerpo).not.toContain('Te adjuntamos');
    expect(cuerpo).toContain(
      'Quedamos a tu disposición para coordinar una breve llamada de 5 minutos',
    );
  });

  it('renders subject + body with every placeholder replaced', () => {
    const render = renderPlantillaCorreo('carta_presentacion', DATOS);
    expect(render.asunto).toBe(
      'Presentación: Chequeos médicos y salud para los trabajadores de Constructora Andes SAC',
    );
    expect(render.cuerpo).toContain('Hola <strong>María López</strong>, un gusto saludarte.');
    expect(render.cuerpo).toContain(
      'para <strong>Constructora Andes SAC</strong> cuidar el bienestar',
    );
    expect(render.cuerpo).not.toContain('{{');
  });
});

describe('renderPlantillaCorreo interpolation', () => {
  it('seguimiento_1 interpolates trabajadores as "(45 aprox.)"', () => {
    const render = renderPlantillaCorreo('seguimiento_1', DATOS);
    expect(render.cuerpo).toContain('(45 aprox.)');
    expect(render.cuerpo).not.toContain('{{');
  });

  it('seguimiento_1 falls back to the mock literal "su personal" when trabajadores is null', () => {
    const render = renderPlantillaCorreo('seguimiento_1', { ...DATOS, trabajadores: null });
    expect(render.cuerpo).toContain('(su personal aprox.)');
  });

  it('seguimiento_2 interpolates sector and trabajadores', () => {
    const render = renderPlantillaCorreo('seguimiento_2', DATOS);
    expect(render.cuerpo).toContain('empresas de <strong>Construcción</strong>');
    expect(render.cuerpo).toContain('aproximadamente 45 personas');
  });

  it('seguimiento_2 falls back to the mock literals "su rubro"/"sus" on nulls', () => {
    const render = renderPlantillaCorreo('seguimiento_2', {
      ...DATOS,
      sector: null,
      trabajadores: null,
    });
    expect(render.cuerpo).toContain('empresas de <strong>su rubro</strong>');
    expect(render.cuerpo).toContain('aproximadamente sus personas');
  });

  it('reactivacion_3m interpolates sector and falls back to "su sector" when null', () => {
    const conSector = renderPlantillaCorreo('reactivacion_3m', DATOS);
    expect(conSector.cuerpo).toContain('para empresas de Construcción.');
    const sinSector = renderPlantillaCorreo('reactivacion_3m', { ...DATOS, sector: null });
    expect(sinSector.cuerpo).toContain('para empresas de su sector.');
  });

  it('seguimiento_3 uses no sector/trabajadores and renders token-free on nulls', () => {
    const render = renderPlantillaCorreo('seguimiento_3', {
      ...DATOS,
      sector: null,
      trabajadores: null,
    });
    expect(render.cuerpo).toContain(
      'los exámenes médicos de <strong>Constructora Andes SAC</strong>',
    );
    expect(render.cuerpo).not.toContain('{{');
  });

  it('is pure: identical input yields identical output', () => {
    expect(renderPlantillaCorreo('seguimiento_2', DATOS)).toStrictEqual(
      renderPlantillaCorreo('seguimiento_2', DATOS),
    );
  });
});
