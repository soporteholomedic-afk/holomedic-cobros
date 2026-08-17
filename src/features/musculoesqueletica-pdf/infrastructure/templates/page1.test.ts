import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../../application/renderer';
import { PAGE_1_MANIFEST } from './page1';
import { sampleImageResolver, sampleSource } from '../../testing/sampleSource';
import type { PdfTokenManifest } from '../../domain/entities';

/**
 * Page-1 mapping proof: every manifest token must resolve the CORRECT
 * entrevista field. The expected values below are hand-derived from the
 * sample source so a mis-pointed path (e.g. atencion.empresa instead of
 * entrevista.datosGenerales.empresa) fails loudly.
 */
describe('PAGE_1_MANIFEST', () => {
  it('declares the page-1 template and only page 1', () => {
    expect(PAGE_1_MANIFEST.page).toBe(1);
    expect(PAGE_1_MANIFEST.template).toBe('musculoesqueletica-pdf/pages/page1.html');
  });

  it('maps every token to the correct entrevista/atencion field', () => {
    const entries = Object.entries(PAGE_1_MANIFEST.tokens);
    expect(entries.length).toBeGreaterThan(50);

    // Hand-derived expected output per token name, from the sample source.
    const expected: Record<string, string> = {
      atencion_id: '2024-MS-089',

      // Datos generales
      fecha_entrevista: '17/08/2026',
      empresa: 'ACME &amp; Sons &lt;CIA&gt;',
      area: 'Producción',
      nombre_apellidos: 'Juan &quot;El&quot; Pérez',
      fecha_nacimiento: '15/03/1990',
      edad: '35',
      antiguedad_puesto: '12',
      antiguedad_empresa: '24',
      sexo_m: 'checked',
      sexo_f: '',
      tipo_examen_ingreso: '',
      tipo_examen_periodico: 'checked',
      tipo_examen_retiro: '',
      tipo_examen_otro: '',
      miembro_dominante_dx: 'checked',
      miembro_dominante_ix: '',

      // Hombro
      hombro_tiene_dolor: 'checked',
      hombro_inicio_molestia: 'Hace 2 semanas',
      hombro_info_medicamentos: 'checked',
      hombro_info_fisioterapia: '',
      hombro_info_traumatologia: '',
      hombro_info_rx: '',
      hombro_info_eco_rmn: '',
      hombro_dolor_movimiento_dx: 'checked',
      hombro_dolor_movimiento_ix: '',
      hombro_dolor_reposo_dx: '',
      hombro_dolor_reposo_ix: '',
      hombro_umbral_continuo_dx: 'checked',
      hombro_umbral_continuo_ix: '',
      hombro_umbral_semana_dx: '',
      hombro_umbral_semana_ix: 'checked',
      hombro_umbral_mes_dx: '',
      hombro_umbral_mes_ix: '',
      hombro_molestias_leves_dx: '',
      hombro_molestias_leves_ix: '',
      hombro_observaciones: 'Dolor al levantar el brazo.',

      // Codo
      codo_tiene_dolor: '',
      codo_inicio_molestia: '',
      codo_info_medicamentos: '',
      codo_info_fisioterapia: '',
      codo_info_traumatologia: '',
      codo_info_rx: '',
      codo_info_eco_rmn: '',
      codo_info_emg: '',
      codo_dolor_peso_dx: '',
      codo_dolor_peso_ix: '',
      codo_dolor_reposo_dx: '',
      codo_dolor_reposo_ix: '',
      codo_umbral_continuo_dx: '',
      codo_umbral_continuo_ix: '',
      codo_umbral_semana_dx: '',
      codo_umbral_semana_ix: '',
      codo_umbral_mes_dx: '',
      codo_umbral_mes_ix: '',
      codo_molestias_leves_dx: '',
      codo_molestias_leves_ix: '',
      codo_observaciones: '',

      // Mano / muñeca
      mano_tiene_dolor: '',
      mano_inicio_molestia: '',
      mano_info_medicamentos: '',
      mano_info_fisioterapia: '',
      mano_info_traumatologia: '',
      mano_info_rx: '',
      mano_info_eco_rmn: '',
      mano_info_emg: '',
      mano_dolor_pinza_dx: '',
      mano_dolor_pinza_ix: '',
      mano_dolor_movimiento_dx: '',
      mano_dolor_movimiento_ix: '',
      mano_dolor_reposo_dx: '',
      mano_dolor_reposo_ix: '',
      mano_dolor_1er_dedo_dx: '',
      mano_dolor_1er_dedo_ix: '',
      mano_dolor_3_dedos_dx: '',
      mano_dolor_3_dedos_ix: '',
      mano_dolor_palma_dx: '',
      mano_dolor_palma_ix: '',
      mano_dolor_dorso_dx: '',
      mano_dolor_dorso_ix: '',
      mano_umbral_continuo_dx: '',
      mano_umbral_continuo_ix: '',
      mano_umbral_semana_dx: '',
      mano_umbral_semana_ix: '',
      mano_umbral_mes_dx: '',
      mano_umbral_mes_ix: '',
      mano_molestias_leves_dx: '',
      mano_molestias_leves_ix: '',
      mano_observaciones: '',

      // Figures
      figure_hombro: '<img src="data:image/png;base64,bXVzY3Vsb2VzcXVlbGV0aWNhLXBkZi9hc3NldHMvaG9tYnJvLnBuZw==" alt="" data-figure>',
      figure_codo: '<img src="data:image/svg+xml;base64,bXVzY3Vsb2VzcXVlbGV0aWNhLXBkZi9hc3NldHMvY29kby5zdmc=" alt="" data-figure>',
      figure_mano: '<img src="data:image/png;base64,bXVzY3Vsb2VzcXVlbGV0aWNhLXBkZi9hc3NldHMvbWFuby5wbmc=" alt="" data-figure>',
    };

    // Render one template containing every token, in manifest order.
    const tokenNames = entries.map(([name]) => name);
    const template = tokenNames
      .map((name) => `{{${PAGE_1_MANIFEST.tokens[name].kind}:${name}}}`)
      .join('|');

    const rendered = renderTemplate(
      template,
      PAGE_1_MANIFEST.tokens satisfies PdfTokenManifest,
      sampleSource,
      sampleImageResolver,
    );

    const parts = rendered.split('|');
    expect(parts).toHaveLength(tokenNames.length);
    for (let i = 0; i < tokenNames.length; i++) {
      expect(parts[i], `token "${tokenNames[i]}"`).toBe(expected[tokenNames[i]]);
    }
    // No token may remain unresolved.
    expect(rendered).not.toContain('{{');
  });
});