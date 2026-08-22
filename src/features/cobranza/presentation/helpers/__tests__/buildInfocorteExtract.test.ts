/**
 * Tests for `buildInfocorteExtract(envios, ruc, razonSocial)` (REQ-02
 * R5, task 6.5/6.6).
 *
 * Spec: a copyable plain-text chronological extract, most-recent-first
 * (user-confirmed format, design §4.3). Every line includes date,
 * status, recipients, amount with currency symbol, and sender; FAILED
 * rows append the transport error. Timestamps are rendered
 * deterministically in `America/Lima` via
 * `Intl.DateTimeFormat(...).formatToParts()` — NOT browser-local (the
 * extract is documentary evidence for Infocorte derivation and must be
 * timezone-stable). All lines end LF.
 *
 * The optional `now` parameter pins the "Generado" line in tests (the
 * default is the ambient clock) — the ONLY seam of this pure helper.
 */
import { describe, expect, it } from 'vitest';

import { buildInfocorteExtract } from '../buildInfocorteExtract';
import type { CobranzaEnvioHistorial } from '../../../domain/entities';

function envio(overrides: Partial<CobranzaEnvioHistorial> = {}): CobranzaEnvioHistorial {
  return {
    id: 1,
    ruc: '20601234567',
    razonSocial: 'HOLOMEDIC S.A.C.',
    destinatarios: ['a@x.com'],
    copias: null,
    asunto: 'Recordatorio de pago',
    montoReclamado: null,
    moneda: null,
    comprobantesCount: null,
    estadoEnvio: 'SUCCESS',
    errorDetalle: null,
    enviadoPor: 'Juan Perez',
    fechaEnvio: '2026-08-22T14:30:00.000Z',
    ...overrides,
  };
}

/** 2026-08-22 12:00 in Lima (UTC-5) — pinned "Generado" clock. */
const NOW = new Date('2026-08-22T17:00:00.000Z');

describe('buildInfocorteExtract', () => {
  it('builds the exact user-confirmed format: header, Generado line, separator and most-recent-first entries', () => {
    const extract = buildInfocorteExtract(
      [
        envio({
          id: 2,
          destinatarios: ['a@x.com', 'b@y.com'],
          copias: ['c@x.com'],
          montoReclamado: 1234.56,
          moneda: 'S/',
          comprobantesCount: 5,
          fechaEnvio: '2026-08-22T14:30:00.000Z', // Lima 09:30 same day
        }),
        envio({
          id: 1,
          estadoEnvio: 'FAILED',
          errorDetalle: 'SMTP 554 rejected',
          enviadoPor: 'Maria Lopez',
          fechaEnvio: '2026-08-21T20:15:00.000Z', // Lima 15:15 previous day
        }),
      ],
      '20601234567',
      'HOLOMEDIC S.A.C.',
      NOW,
    );

    expect(extract).toBe(
      'HISTORIAL DE COBRANZA — HOLOMEDIC S.A.C. (RUC/DNI: 20601234567)\n' +
        'Generado: 2026-08-22 12:00 hora Lima | Envíos registrados: 2\n' +
        `${'-'.repeat(64)}\n` +
        '[2026-08-22 09:30] SUCCESS | para: a@x.com, b@y.com | cc: c@x.com | ' +
        'S/ 1,234.56 (5 comprobantes) | por: Juan Perez\n' +
        '[2026-08-21 15:15] FAILED | para: a@x.com | error: SMTP 554 rejected | por: Maria Lopez\n',
    );
  });

  it('omits the cc, amount and error segments when their data is null (R5 format rules)', () => {
    const extract = buildInfocorteExtract(
      [
        envio({
          estadoEnvio: 'FAILED',
          errorDetalle: null,
          destinatarios: ['a@x.com'],
          copias: null,
          montoReclamado: null,
          moneda: null,
          comprobantesCount: null,
        }),
      ],
      '10444555666',
      'JUAN PEREZ S.A.',
      NOW,
    );

    expect(extract).toBe(
      'HISTORIAL DE COBRANZA — JUAN PEREZ S.A. (RUC/DNI: 10444555666)\n' +
        'Generado: 2026-08-22 12:00 hora Lima | Envíos registrados: 1\n' +
        `${'-'.repeat(64)}\n` +
        '[2026-08-22 09:30] FAILED | para: a@x.com | por: Juan Perez\n',
    );
  });

  it('renders timestamps in America/Lima regardless of UTC offset (date rollover and midnight hour)', () => {
    const extract = buildInfocorteExtract(
      [
        // 02:30 UTC on the 22nd is 21:30 on the 21st in Lima (backwards rollover).
        envio({ fechaEnvio: '2026-08-22T02:30:00.000Z' }),
        // 05:07 UTC is 00:07 in Lima — must be h23 "00", never "24".
        envio({ id: 3, fechaEnvio: '2026-08-22T05:07:00.000Z' }),
      ],
      '20601234567',
      'HOLOMEDIC S.A.C.',
      NOW,
    );

    const lines = extract.split('\n');
    expect(lines[3]).toBe('[2026-08-21 21:30] SUCCESS | para: a@x.com | por: Juan Perez');
    expect(lines[4]).toBe('[2026-08-22 00:07] SUCCESS | para: a@x.com | por: Juan Perez');
  });

  it('renders the header block alone for an empty history (N = 0, no entry lines)', () => {
    const extract = buildInfocorteExtract([], '20601234567', 'HOLOMEDIC S.A.C.', NOW);

    expect(extract).toBe(
      'HISTORIAL DE COBRANZA — HOLOMEDIC S.A.C. (RUC/DNI: 20601234567)\n' +
        'Generado: 2026-08-22 12:00 hora Lima | Envíos registrados: 0\n' +
        `${'-'.repeat(64)}\n`,
    );
  });

  it('formats the amount with the es-PE formatNumber convention for USD rows', () => {
    const extract = buildInfocorteExtract(
      [
        envio({
          montoReclamado: 900,
          moneda: '$',
          comprobantesCount: 1,
        }),
      ],
      '20601234567',
      'HOLOMEDIC S.A.C.',
      NOW,
    );

    expect(extract).toContain('$ 900.00 (1 comprobante)');
  });
});
