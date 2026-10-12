import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * UI contract for `/crm/calidad` (agente-ia-crm E4·T6) — the panel
 * mínimo de métricas de calidad. The page is a SYNC Server Component
 * (no session read — the proxy gates the route via RUTAS_PROTEGIDAS,
 * conversaciones page precedent) that renders the header + window
 * caption and wraps the async `TarjetasCalidad` data component in
 * Suspense (productividad page precedent). RTL cannot flush a
 * suspended RSC, so the async card component is invoked directly and
 * the resolved tree is rendered (crm/layout.test.tsx precedent).
 *
 * Pinned: the 8 Spanish KPI labels, NULL ⇒ '—' (sin dato, never 0),
 * the 'últimos 30 días' window caption, and the Suspense fallback on
 * the shell while data is in flight.
 */

const mockGetCrmDb = vi.hoisted(() => vi.fn());

vi.mock('@/features/crm/infrastructure/getCrmDb', () => ({
  getCrmDb: mockGetCrmDb,
}));

import CalidadPage, { TarjetasCalidad } from '../page';

function dbConResumen(resumen: unknown): void {
  mockGetCrmDb.mockResolvedValue({
    calidad: { obtenerResumen: vi.fn().mockResolvedValue(resumen) },
  });
}

beforeEach(() => {
  mockGetCrmDb.mockReset();
});

describe('CalidadPage (shell)', () => {
  it('renderiza el encabezado, el rótulo de ventana y el fallback de Suspense mientras carga', () => {
    // Promesa nunca resuelta: TarjetasCalidad queda suspendida.
    mockGetCrmDb.mockReturnValue(new Promise(() => {}));

    render(<CalidadPage />);

    expect(screen.getByRole('heading', { name: 'Calidad', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/últimos 30 días/)).toBeInTheDocument();
    // Las tarjetas aún no: el Suspense muestra el spinner.
    expect(screen.queryByText('Respuestas de la Guía')).not.toBeInTheDocument();
  });
});

describe('TarjetasCalidad (datos)', () => {
  it('renderiza las 8 métricas con sus valores y el rótulo de ventana', async () => {
    dbConResumen({
      desde: '2026-09-15T12:00:00.000Z',
      respuestasIa: 12,
      scorePromedio: 0.85,
      fidelidadPromedio: 0.9,
      porcentajeConFuentes: 66.666667,
      marcadasDeficiente: 2,
      solicitudesAyuda: 3,
      huecosAbiertos: 5,
      intervencionesHumanas: 4,
    });

    render(await TarjetasCalidad());

    expect(screen.getByRole('region', { name: 'Métricas de calidad' })).toBeInTheDocument();
    expect(screen.getByText('Respuestas de la Guía')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Score promedio')).toBeInTheDocument();
    expect(screen.getByText('0.85')).toBeInTheDocument();
    expect(screen.getByText('Fidelidad promedio')).toBeInTheDocument();
    expect(screen.getByText('0.90')).toBeInTheDocument();
    expect(screen.getByText('% con fuentes')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('Marcadas deficiente')).toBeInTheDocument();
    expect(screen.getByText('Solicitudes de ayuda')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Huecos abiertos')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Intervenciones humanas')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText(/Ventana analizada: últimos 30 días/)).toBeInTheDocument();
  });

  it('muestra — (sin dato) en las métricas NULL, nunca 0', async () => {
    dbConResumen({
      desde: '2026-09-15T12:00:00.000Z',
      respuestasIa: 0,
      scorePromedio: null,
      fidelidadPromedio: null,
      porcentajeConFuentes: null,
      marcadasDeficiente: 0,
      solicitudesAyuda: 0,
      huecosAbiertos: 2,
      intervencionesHumanas: 0,
    });

    render(await TarjetasCalidad());

    // Tres NULL ⇒ exactamente tres '—'.
    expect(screen.getAllByText('—')).toHaveLength(3);
    // Los ceros REALES (contadores) sí se muestran como 0: respuestas,
    // marcadas, solicitudes e intervenciones (huecos = 2).
    expect(screen.getByText('Respuestas de la Guía')).toBeInTheDocument();
    expect(screen.getAllByText('0', { exact: true })).toHaveLength(4);
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
