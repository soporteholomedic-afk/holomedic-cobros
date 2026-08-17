import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../../application/renderer';
import { PAGE_1_MANIFEST } from './page1';
import { sampleImageResolver, sampleSource } from '../../testing/sampleSource';
import type { PdfTokenManifest } from '../../domain/entities';

/**
 * Page-1 mapping proof against the authoritative `__temp__/page1.html`
 * design + `mapeo_datos-pg1.json` dictionary. Every manifest token must
 * resolve the CORRECT field; expected values are hand-derived from the
 * sample source so a mis-pointed path fails loudly.
 *
 * Unmapped-by-design dictionary fields (flagged in apply-progress):
 * umbralPositivo.otrasVeces, molestiasLeves.detalle (×3 segments) and
 * manoMuneca.areaDistribucionAnotaciones have no visible slot in this
 * template — they are intentionally NOT mapped.
 */
describe('PAGE_1_MANIFEST', () => {
  it('declares the page-1 template and only page 1', () => {
    expect(PAGE_1_MANIFEST.page).toBe(1);
    expect(PAGE_1_MANIFEST.template).toBe('musculoesqueletica-pdf/pages/page1.html');
  });

  it('maps every token to the correct entrevista field', () => {
    const entries = Object.entries(PAGE_1_MANIFEST.tokens);
    expect(entries.length).toBeGreaterThan(80);

    // Hand-derived expected output per token name, from the sample source.
    const expected: Record<string, string> = {
      // ---- Datos generales ----
      fecha_entrevista: '17/08/2026',
      empresa: 'ACME &amp; Sons &lt;CIA&gt;',
      area: 'Producción',
      nombre_apellidos: 'Juan &quot;El&quot; Pérez',
      fecha_nacimiento: '15/03/1990',
      edad: '35',
      sexo_m: 'checked',
      sexo_f: '',
      antiguedad_empresa: '24',
      antiguedad_puesto: '12',
      miembro_dominante_dx: 'checked',
      miembro_dominante_ix: '',
      tipo_examen_ingreso: '',
      tipo_examen_periodico: 'checked',
      tipo_examen_retiro: '',
      tipo_examen_otro: '',

      // ---- Hombro ----
      hombro_tiene_dolor_no: '',
      hombro_tiene_dolor_si: 'checked',
      hombro_inicio_molestia: 'Hace 2 semanas',
      hombro_info_medicamentos: 'checked',
      hombro_info_fisioterapia: '',
      hombro_info_ortopedista: '',
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

      // ---- Codo ----
      codo_tiene_dolor_no: 'checked',
      codo_tiene_dolor_si: '',
      codo_inicio_molestia: '',
      codo_info_medicamentos: '',
      codo_info_fisioterapia: '',
      codo_info_ortopedista: '',
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

      // ---- Mano / muñeca ----
      mano_tiene_dolor_no: 'checked',
      mano_tiene_dolor_si: '',
      mano_inicio_molestia: '',
      mano_info_medicamentos: '',
      mano_info_fisioterapia: '',
      mano_info_ortopedista: '',
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

      // ---- Figures (canonical repo assets) ----
      figure_hombro: '<img src="data:image/png;base64,YXNzZXRzL2ltYWdlcy9tdXNjdWxvL2VudHJldmlzdGEvaG9tYnJvcy5wbmc=" alt="" data-figure>',
      figure_codo: '<img src="data:image/png;base64,YXNzZXRzL2ltYWdlcy9tdXNjdWxvL2VudHJldmlzdGEvY29kb3MucG5n" alt="" data-figure>',
      // Mano figure carries the marks overlay (sample marks m1/m2 over 117×81).
      figure_mano:
        '<div style="position:relative"><img src="data:image/png;base64,YXNzZXRzL2ltYWdlcy9tdXNjdWxvL2VudHJldmlzdGEvbWFub3MucG5n" alt="" data-figure><svg viewBox="0 0 117 81" preserveAspectRatio="xMidYMid meet" style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none"><line x1="24.25" y1="35.5" x2="34.25" y2="45.5" stroke="#cc0000" stroke-width="2"/><line x1="34.25" y1="35.5" x2="24.25" y2="45.5" stroke="#cc0000" stroke-width="2"/><line x1="82.75" y1="19.3" x2="92.75" y2="29.3" stroke="#cc0000" stroke-width="2"/><line x1="92.75" y1="19.3" x2="82.75" y2="29.3" stroke="#cc0000" stroke-width="2"/></svg></div>',
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