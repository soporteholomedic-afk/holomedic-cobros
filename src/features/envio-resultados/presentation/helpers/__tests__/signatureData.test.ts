import { describe, it, expect } from 'vitest';
import {
  buildSignatureDataFromUser,
  buildSignatureHtml,
  DEFAULT_SIGNATURE_DATA,
  stripSignatureHtml,
} from '../signatureData';

// historial-envios-consolidados PR4 (task 4.1, design D8): the built
// signature is wrapped in `<!--holomedic-firma-->` sentinels so the
// persisted body can be stripped exactly before reenvío re-appends it.
const SENTINEL = '<!--holomedic-firma-->';

describe('buildSignatureHtml (D8 sentinels)', () => {
  it('wraps the signature table in exactly one sentinel pair', () => {
    const html = buildSignatureHtml(DEFAULT_SIGNATURE_DATA);

    expect(html.startsWith(SENTINEL)).toBe(true);
    expect(html.endsWith(SENTINEL)).toBe(true);
    // Splitting on the sentinel yields [empty, table, empty] — exactly
    // two sentinels, no stray occurrences inside the table markup.
    expect(html.split(SENTINEL)).toHaveLength(3);
    expect(html).toContain('<table');
  });
});

describe('stripSignatureHtml', () => {
  it('round-trips: body + signature strips back to the exact body, and re-appending reproduces the persisted HTML', () => {
    const body = '<p>Estimado paciente,</p><p>Adjuntamos sus resultados.</p>';
    const persisted = body + buildSignatureHtml(DEFAULT_SIGNATURE_DATA);

    const stripped = stripSignatureHtml(persisted);
    expect(stripped).toBe(body);
    // The editor re-appends the signature at send time — the result must
    // equal the persisted HTML verbatim (no duplication, D8).
    expect(stripped + buildSignatureHtml(DEFAULT_SIGNATURE_DATA)).toBe(persisted);
  });

  // firma-correos regression: persisted history may carry ANY signature
  // variant (with or without a role first line) — the sentinel strip is
  // content-agnostic and must remove the block byte-for-byte.
  it('round-trips a role-bearing signature variant: strip is content-agnostic', () => {
    const body = '<p>Hola</p>';
    const signature = buildSignatureHtml({
      ...DEFAULT_SIGNATURE_DATA,
      name: 'María Pérez',
      role: 'Cobranzas',
    });
    const persisted = body + signature;

    expect(signature).toContain('Cobranzas');
    expect(stripSignatureHtml(persisted)).toBe(body);
  });

  it('returns input unchanged when no sentinel is present (strip exactness)', () => {
    const html = '<p>Sin firma persistida</p>';
    expect(stripSignatureHtml(html)).toBe(html);
  });

  it('strips only the signature block, keeping content before and after', () => {
    const before = '<p>before</p>';
    const after = '<p>after</p>';
    const html = before + buildSignatureHtml(DEFAULT_SIGNATURE_DATA) + after;
    expect(stripSignatureHtml(html)).toBe(before + after);
  });

  it('handles the empty-body case', () => {
    expect(stripSignatureHtml('')).toBe('');
    // A persisted empty body (htmlBody memo yields '' when body is empty)
    // carries no signature at all — stripping is a no-op.
    expect(stripSignatureHtml(buildSignatureHtml(DEFAULT_SIGNATURE_DATA))).toBe('');
  });

  it('defends against a lone sentinel (malformed persisted body)', () => {
    expect(stripSignatureHtml(`<p>x</p>${SENTINEL}<p>y</p>`)).toBe('<p>x</p>');
  });
});

// usuarios-nombre-firma — session-seeded signature mapper: the single
// extension point wiring nombre → name and correo → email (fallback
// chains nombre → usuario → default name, correo → default email).
// firma-correos adds area → role (session-only, nullable).
describe('buildSignatureDataFromUser', () => {
  it('wires the session nombre into name', () => {
    const data = buildSignatureDataFromUser({ nombre: 'María Pérez', usuario: 'mperez' });
    expect(data.name).toBe('María Pérez');
  });

  it('falls back to usuario when nombre is empty', () => {
    const data = buildSignatureDataFromUser({ nombre: '   ', usuario: 'mperez' });
    expect(data.name).toBe('mperez');
  });

  it('falls back to usuario when nombre is absent', () => {
    const data = buildSignatureDataFromUser({ usuario: 'mperez' });
    expect(data.name).toBe('mperez');
  });

  it('falls back to the default name for a null user (pre-login safety)', () => {
    const data = buildSignatureDataFromUser(null);
    expect(data.name).toBe(DEFAULT_SIGNATURE_DATA.name);
  });

  it('falls back to the default name when both fields are empty', () => {
    const data = buildSignatureDataFromUser({ nombre: '', usuario: '' });
    expect(data.name).toBe(DEFAULT_SIGNATURE_DATA.name);
  });

  it('keeps non-name defaults; role is session-only (firma-correos)', () => {
    const data = buildSignatureDataFromUser({ nombre: 'María Pérez', usuario: 'mperez' });
    // firma-correos: the role comes only from the session area — a
    // user without one gets null, never a resurfaced default role.
    expect(data.role).toBeNull();
    expect(data.email).toBe(DEFAULT_SIGNATURE_DATA.email);
    expect(data.phone).toBe(DEFAULT_SIGNATURE_DATA.phone);
    expect(data.phoneAlt).toBe(DEFAULT_SIGNATURE_DATA.phoneAlt);
    expect(data.address).toBe(DEFAULT_SIGNATURE_DATA.address);
  });

  it('returns a mutable copy — editing it never affects the defaults', () => {
    const before = { ...DEFAULT_SIGNATURE_DATA };
    const data = buildSignatureDataFromUser({ nombre: 'María Pérez' });
    data.name = 'Edited Name';
    data.role = 'Edited Role';
    expect(DEFAULT_SIGNATURE_DATA.name).toBe(before.name);
    expect(DEFAULT_SIGNATURE_DATA.role).toBe(before.role);
  });
});

// usuarios-correo — signature email seeding: the session user's correo
// maps into the signature email with DEFAULT_SIGNATURE_DATA.email as
// the fallback (adjudicated design: identical rendering for
// correo-less users, never undefined artifacts).
describe('buildSignatureDataFromUser — correo seeding', () => {
  it('seeds the signature email from the session correo', () => {
    const data = buildSignatureDataFromUser({
      nombre: 'María Pérez',
      usuario: 'mperez',
      correo: 'u@holomedic.com',
    });
    expect(data.email).toBe('u@holomedic.com');
    expect(data.name).toBe('María Pérez'); // name chain untouched
  });

  it('trims the correo before seeding', () => {
    const data = buildSignatureDataFromUser({ correo: '  u@holomedic.com  ' });
    expect(data.email).toBe('u@holomedic.com');
  });

  it('falls back to the default email when correo is null', () => {
    const data = buildSignatureDataFromUser({ nombre: 'María Pérez', correo: null });
    expect(data.email).toBe(DEFAULT_SIGNATURE_DATA.email);
  });

  it('falls back to the default email when correo is an empty string', () => {
    const data = buildSignatureDataFromUser({ correo: '' });
    expect(data.email).toBe(DEFAULT_SIGNATURE_DATA.email);
  });

  it('falls back to the default email when correo is whitespace-only', () => {
    const data = buildSignatureDataFromUser({ correo: '   ' });
    expect(data.email).toBe(DEFAULT_SIGNATURE_DATA.email);
  });

  it('falls back to the default email for a null user (auth/me unavailable)', () => {
    const data = buildSignatureDataFromUser(null);
    expect(data.email).toBe(DEFAULT_SIGNATURE_DATA.email);
  });
});

// firma-correos — role seeding: the session user's area maps into the
// signature role. Trim first; null/empty/whitespace area → null role
// (the effective role comes ONLY from the session — no hardcoded
// fallback remains).
describe('buildSignatureDataFromUser — area/role seeding', () => {
  it('seeds the signature role from the session area', () => {
    const data = buildSignatureDataFromUser({ nombre: 'María Pérez', area: 'Cobranzas' });
    expect(data.role).toBe('Cobranzas');
  });

  it('trims the area before seeding', () => {
    const data = buildSignatureDataFromUser({ area: '  Cobranzas ' });
    expect(data.role).toBe('Cobranzas');
  });

  it('maps a null area to a null role', () => {
    const data = buildSignatureDataFromUser({ nombre: 'María Pérez', area: null });
    expect(data.role).toBeNull();
  });

  it('maps an empty area to a null role', () => {
    const data = buildSignatureDataFromUser({ area: '' });
    expect(data.role).toBeNull();
  });

  it('maps a whitespace-only area to a null role', () => {
    const data = buildSignatureDataFromUser({ area: '   ' });
    expect(data.role).toBeNull();
  });

  it('maps an absent area to a null role', () => {
    const data = buildSignatureDataFromUser({ nombre: 'María Pérez' });
    expect(data.role).toBeNull();
  });

  it('leaves the name/email fallback chains untouched alongside role seeding', () => {
    const data = buildSignatureDataFromUser({
      nombre: '   ',
      usuario: 'mperez',
      correo: '  u@holomedic.com  ',
      area: 'Cobranzas',
    });
    expect(data.name).toBe('mperez');
    expect(data.email).toBe('u@holomedic.com');
    expect(data.role).toBe('Cobranzas');
  });
});

// firma-correos — conditional role segment: `| role` renders only when
// a role exists; a null role renders a name-only first line.
describe('buildSignatureHtml — conditional role segment', () => {
  it('renders the separator and role byte-identically when a role exists', () => {
    const html = buildSignatureHtml({
      ...DEFAULT_SIGNATURE_DATA,
      name: 'María Pérez',
      role: 'Cobranzas',
    });

    expect(html).toContain(
      'María Pérez <span style="color: rgb(0, 86, 179); font-weight: bold; margin: 0 4px;">|</span> Cobranzas',
    );
    expect(html).toContain('|</span> Cobranzas');
  });

  it('escapes a role containing HTML metacharacters', () => {
    const html = buildSignatureHtml({ ...DEFAULT_SIGNATURE_DATA, role: `<&"'> z` });

    expect(html).toContain('&lt;&amp;&quot;&#039;&gt; z');
  });

  it('renders a name-only first line for a null role: no separator, no span, no role text', () => {
    const html = buildSignatureHtml({ ...DEFAULT_SIGNATURE_DATA, name: 'María Pérez', role: null });

    expect(html).toContain('María Pérez');
    expect(html).not.toContain('|');
    expect(html).not.toContain('margin: 0 4px');
    expect(html).not.toContain('Cobranzas');
    // The rest of the signature table still renders.
    expect(html).toContain(DEFAULT_SIGNATURE_DATA.email);
  });

  it('degrades to a name-only signature when the user transport fails (null user)', () => {
    const data = buildSignatureDataFromUser(null);
    const html = buildSignatureHtml(data);

    expect(data.role).toBeNull();
    expect(data.email).toBe(DEFAULT_SIGNATURE_DATA.email);
    expect(html).toContain(DEFAULT_SIGNATURE_DATA.name);
    expect(html).not.toContain('|');
  });
});
