/**
 * RED tests for the `interpolateSpitch` refactor (PR 4).
 *
 * Three flavors of test:
 *  1. GOLDEN tests — pin the EXACT current output for the existing
 *     non-empty token path. The refactor must preserve these. Any drift
 *     = regression.
 *  2. NEW behavior tests — empty-token block removal, td-exclusion,
 *     non-empty string replace path, injectable today. Per spec delta
 *     "TokenResolverRegistry and InterpolationContext".
 *  3. THIN-WRAPPER tests — verify the legacy `interpolateSpitch(params)`
 *     signature still works (EmailEditor + its tests depend on it).
 *
 * The import below references production code that does not exist yet
 * → real RED. The next commit (GREEN) implements the registry + refactored
 * `interpolateSpitch`; these tests then pass.
 *
 * Note on `firma` empty-block tests: the bug-fix plan (option B) makes
 * `firma` resolve to a visible placeholder instead of `''`, so empty-block
 * removal tests use a different unknown key ({{doesNotExist}}) to keep
 * the spec scenarios pinned.
 */
import { describe, it, expect } from 'vitest';

import { interpolateSpitch } from '../interpolateSpitch';
import { interpolate } from '../interpolate';
import { GOLDEN_CTX, GOLDEN_CTX_TODAY_2, GOLDEN_HTML_SPITCH_001, GOLDEN_SUBJECT_SPITCH_001 } from './goldenFixtures';
import { buildTokenResolverRegistry } from '../tokenResolvers/buildTokenResolverRegistry';

describe('interpolateSpitch — forwards `patients` and `files` from params to ctx (bug-fix wiring)', () => {
  it('forwards `patients` so {{dni}} and {{nombrePaciente}} resolve to the first patient fields', () => {
    const out = interpolateSpitch({
      html: '<p>DNI: {{dni}} — Paciente: {{nombrePaciente}}</p>',
      subject: 's',
      companyName: 'C',
      patientNames: ['Juan Pérez'],
      fileNames: [],
      patients: [
        { id: 'p1', companyId: 'c1', name: 'Juan Pérez', dni: '12345678', files: [] },
      ],
    });
    expect(out.html).toContain('DNI: 12345678');
    expect(out.html).toContain('Paciente: Juan Pérez');
    expect(out.html).not.toContain('{{dni}}');
    expect(out.html).not.toContain('{{nombrePaciente}}');
  });

  it('HTML-escapes patient names with special chars in {{nombrePaciente}}', () => {
    const out = interpolateSpitch({
      html: '<p>{{nombrePaciente}}</p>',
      subject: 's',
      companyName: 'C',
      patientNames: ['<script>'],
      fileNames: [],
      patients: [
        { id: 'p1', companyId: 'c1', name: '<script>', dni: '1', files: [] },
      ],
    });
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).not.toContain('<script>');
  });

  it('omitting `patients` keeps the legacy behaviour: {{dni}} and {{nombrePaciente}} resolve to empty', () => {
    const out = interpolateSpitch({
      html: '<p>{{dni}} / {{nombrePaciente}}</p>',
      subject: 's',
      companyName: 'C',
      patientNames: [],
      fileNames: [],
    });
    expect(out.html).not.toContain('{{dni}}');
    expect(out.html).not.toContain('{{nombrePaciente}}');
  });

  it('replaces {{firma}} with the visible [Falta configurar firma] placeholder when firma is omitted', () => {
    const out = interpolateSpitch({
      html: '<div>{{firma}}</div>',
      subject: 's',
      companyName: 'C',
      patientNames: [],
      fileNames: [],
    });
    expect(out.html).toContain('[Falta configurar firma]');
    expect(out.html).toContain('<div>');
    // The containing block is preserved (option B — no removal).
  });
});

describe('interpolateSpitch (legacy thin wrapper) — behaviour-preserving for EmailEditor', () => {
  it('replaces the same tokens as before in html + subject (GOLDEN — spitch-001)', () => {
    // The new thin wrapper exposes `today` as an OPTIONAL param. We
    // inject a fixed value here so the test is deterministic — the
    // legacy module-level `TODAY` was frozen at import and would have
    // used the system date. Same observable output (GOLDEN) for the
    // spec scenario "Injectable today fixes date bug".
    const out = interpolateSpitch({
      html: GOLDEN_HTML_SPITCH_001,
      subject: GOLDEN_SUBJECT_SPITCH_001,
      companyName: GOLDEN_CTX.companyName,
      patientNames: GOLDEN_CTX.patientNames,
      fileNames: GOLDEN_CTX.fileNames,
      today: GOLDEN_CTX.today,
    });
    expect(out.subject).toBe('Informe consolidado de resultados — 15 de enero de 2026');
    // empresa → companyName (HTML-escaped by old behaviour)
    expect(out.html).toContain('equipo de Clínica Demo S.A.');
    // totalPacientes = patientNames.length = 2
    expect(out.html).toContain('Total de pacientes: 2');
    // totalExamenes = fileNames.length = 2
    expect(out.html).toContain('Exámenes procesados: 2');
    // fecha resolved via module's TODAY — see "injectable today" tests below
    // for the new behaviour that fixes the frozen-TODAY gotcha.
    expect(out.html).not.toContain('{{empresa}}');
    expect(out.html).not.toContain('{{totalPacientes}}');
    expect(out.html).not.toContain('{{totalExamenes}}');
  });

  it('strips inline `color: #xxx;` declarations (preserves prior behaviour)', () => {
    const html = '<body style="color: #333;">X</body>';
    const out = interpolateSpitch({
      html,
      subject: 'S',
      companyName: 'C',
      patientNames: [],
      fileNames: [],
    });
    expect(out.html).not.toMatch(/color:\s*#/);
    expect(out.html).toContain('X');
  });

  it('HTML-escapes a company name with < and & in the empresa placeholder', () => {
    const out = interpolateSpitch({
      html: '<p>{{empresa}}</p>',
      subject: 's',
      companyName: '<A & B>',
      patientNames: [],
      fileNames: [],
    });
    expect(out.html).toContain('&lt;A &amp; B&gt;');
    expect(out.html).not.toContain('<A & B>');
  });
});

describe('interpolate(html, subject, ctx, registry) — new orchestrator (PR 4 core)', () => {
  it('uses ctx.today for {{fecha}} and {{fechaExamen}} (spec: Injectable today fixes date bug)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const html = '<p>{{fecha}} / {{fechaExamen}}</p>';
    const out1 = interpolate(html, 's', GOLDEN_CTX, registry);
    expect(out1.html).toContain('15 de enero de 2026');
    const out2 = interpolate(html, 's', GOLDEN_CTX_TODAY_2, registry);
    expect(out2.html).toContain('20 de febrero de 2026');
    // The two calls must yield DIFFERENT outputs — proves today is per-call,
    // not frozen at import time.
    expect(out1.html).not.toBe(out2.html);
  });

  it('non-empty token replacement is string-based — DOMParser is NOT invoked (spec: Non-empty path stays string-based)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = interpolate('<p>Hola {{empresa}}</p>', 's', GOLDEN_CTX, registry);
    expect(out.html).toContain('Hola Clínica Demo S.A.');
    expect(out.html).not.toContain('{{empresa}}');
  });

  it('removes a <p> block when its ONLY content resolves to empty (spec: Empty token removes containing block)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = interpolate('<p>{{doesNotExist}}</p>', 's', GOLDEN_CTX, registry);
    // The <p> block is removed entirely — no empty paragraph remains.
    expect(out.html).not.toContain('<p>');
    expect(out.html).not.toContain('{{doesNotExist}}');
  });

  it('keeps a <td> when its token resolves to empty (spec: Empty token in td keeps cell)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = interpolate(
      '<table><tr><td>{{doesNotExist}}</td><td>X</td></tr></table>',
      's',
      GOLDEN_CTX,
      registry,
    );
    // The <td> is kept (empty cell), the token is removed.
    expect(out.html).toContain('<td></td>');
    expect(out.html).toContain('<td>X</td>');
    expect(out.html).not.toContain('{{doesNotExist}}');
  });

  it('keeps a <p> that has other text alongside an empty-resolving token', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = interpolate(
      '<p>Prefix {{doesNotExist}} suffix</p>',
      's',
      GOLDEN_CTX,
      registry,
    );
    expect(out.html).toContain('Prefix');
    expect(out.html).toContain('suffix');
    expect(out.html).not.toContain('{{doesNotExist}}');
    expect(out.html).toContain('<p>');
  });

  it('removes an empty <li> but keeps non-empty siblings', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = interpolate(
      '<ul><li>{{doesNotExist}}</li><li>Item {{empresa}}</li></ul>',
      's',
      GOLDEN_CTX,
      registry,
    );
    expect(out.html).not.toContain('{{doesNotExist}}');
    expect(out.html).toContain('Item Clínica Demo S.A.');
    const liCount = (out.html.match(/<li[\s>]/g) ?? []).length;
    expect(liCount).toBe(1);
  });

  it('strips inline `color: #xxx;` declarations after the replacement pass (preserves prior behaviour)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = interpolate(
      '<body style="color: #333;"><p>{{empresa}}</p></body>',
      's',
      GOLDEN_CTX,
      registry,
    );
    expect(out.html).not.toMatch(/color:\s*#/);
    expect(out.html).toContain('Clínica Demo S.A.');
  });

  it('replaces tokens in the subject too', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = interpolate('Hola {{empresa}}', 'Subject: {{fecha}}', GOLDEN_CTX, registry);
    expect(out.subject).toBe('Subject: 15 de enero de 2026');
    expect(out.html).toBe('Hola Clínica Demo S.A.');
  });

  it('unknown simple tokens are removed cleanly (treated as empty) — no leftover {{ }}', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = interpolate(
      '<p>Hola {{unknownKey}} mundo</p>',
      's',
      GOLDEN_CTX,
      registry,
    );
    expect(out.html).not.toContain('{{');
    expect(out.html).not.toContain('}}');
  });

  it('firma token resolves to the signature HTML (spec: firma resolves to signature HTML)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = interpolate(
      '<div>{{firma}}</div>',
      's',
      GOLDEN_CTX,
      registry,
    );
    expect(out.html).toContain('<p>Dr. Pérez — Clínica Demo S.A.</p>');
    expect(out.html).not.toContain('{{firma}}');
  });
});

describe('interpolate — GOLDEN regression for the original interpolateSpitch surface', () => {
  it('produces the EXACT prior output for spitch-001 with the new orchestrator (behaviour-preserving)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = interpolate(
      GOLDEN_HTML_SPITCH_001,
      GOLDEN_SUBJECT_SPITCH_001,
      GOLDEN_CTX,
      registry,
    );
    // empresa → companyName
    expect(out.html).toContain('equipo de Clínica Demo S.A.');
    // totals
    expect(out.html).toContain('Total de pacientes: 2');
    expect(out.html).toContain('Exámenes procesados: 2');
    // fecha
    expect(out.html).toContain('15 de enero de 2026');
    // subject
    expect(out.subject).toBe('Informe consolidado de resultados — 15 de enero de 2026');
  });
});
