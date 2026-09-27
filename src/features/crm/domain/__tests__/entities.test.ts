import { describe, expect, it } from 'vitest';

import { SECTORES_CRM } from '../entities';
import type {
  CrmEnviosCorreoRepositoryPort,
  EnviadorCorreoCrmPort,
} from '../ports';

/**
 * Domain contract pins for the rediseno-crm-panel data layer (design
 * D3/D5/D6, spec crm-data-normalization):
 * - `SECTORES_CRM` is the SINGLE SOURCE for the six-value sector domain
 *   (canonical storage form = the 6 labels; the alta rubro select
 *   preselects the first).
 * - The two email-sequencing ports exist with their hexagonal shapes;
 *   the typed literals below are compile-time proofs (tsc) that the
 *   interfaces are implementable from plain data — their behavioral
 *   suites arrive with the adapter/use-case tasks (4.x).
 */

describe('SECTORES_CRM — the six-value sector domain (spec crm-data-normalization)', () => {
  it('offers exactly the 6 mock labels with Construcción first (alta preselect)', () => {
    expect([...SECTORES_CRM]).toEqual([
      'Construcción',
      'Minería y Energía',
      'Fábrica y Producción',
      'Transporte y Almacén',
      'Comercio y Tiendas',
      'Oficinas y Servicios',
    ]);
  });

  it('carries no duplicates — every value is a distinct selectable rubro', () => {
    expect(new Set(SECTORES_CRM).size).toBe(SECTORES_CRM.length);
  });
});

describe('email-sequencing port contracts (design D3/D5) — plain-data implementability', () => {
  it('EnviadorCorreoCrmPort resolves to the typed SMTP outcome union', async () => {
    const enviador: EnviadorCorreoCrmPort = {
      async enviar({ destinatario, plantilla }) {
        // The fake mirrors the adapter's contract: a sent message
        // carries its SMTP messageId; the union's failure arm names
        // the surfaced SMTP error codes verbatim.
        return destinatario === '' || plantilla === 'reactivacion_3m'
          ? { ok: false as const, error: 'SMTP_AUTH_ERROR' as const, detalle: 'auth failed' }
          : { ok: true as const, messageId: '<probe@crm.test>' };
      },
    };

    const enviado = await enviador.enviar({
      destinatario: 'contacto@empresa.com',
      plantilla: 'carta_presentacion',
      empresa: 'Probe SA',
      contacto: 'María González',
      sector: 'Construcción',
      trabajadores: 30,
    });
    expect(enviado).toEqual({ ok: true, messageId: '<probe@crm.test>' });

    const fallido = await enviador.enviar({
      destinatario: '',
      plantilla: 'reactivacion_3m',
      empresa: 'Probe SA',
      contacto: 'María González',
      sector: null,
      trabajadores: null,
    });
    expect(fallido).toEqual({ ok: false, error: 'SMTP_AUTH_ERROR', detalle: 'auth failed' });
  });

  it('CrmEnviosCorreoRepositoryPort records the dispatch and lists the per-empresa log', async () => {
    const repo: CrmEnviosCorreoRepositoryPort = {
      async registrar(fila) {
        return fila.estado === 'ENVIADO' ? 101 : 102;
      },
      async listarPorEmpresa(empresaId) {
        return empresaId === 7
          ? [{ id: 101, plantilla: 'carta_presentacion', destinatario: 'c@e.com', estado: 'ENVIADO', createdAt: '2026-09-26T12:00:00.000Z' }]
          : [];
      },
    };

    expect(await repo.registrar({
      empresaId: 7,
      contactoId: null,
      plantilla: 'carta_presentacion',
      destinatario: 'c@e.com',
      messageId: '<m@x>',
      estado: 'ENVIADO',
      errorInfo: null,
      usuario: 'jperez',
    })).toBe(101);

    const historial = await repo.listarPorEmpresa(7);
    expect(historial).toHaveLength(1);
    expect(historial[0]?.plantilla).toBe('carta_presentacion');
    expect(await repo.listarPorEmpresa(99)).toEqual([]);
  });
});
