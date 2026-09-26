import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Origen, PipelineEmpresa } from '../../../domain/entities';
import type { HandoffHistorial, TransicionHistorial } from '../../../domain/ports';
import { TimelineAvance } from '../TimelineAvance';

/**
 * UI contract for the living timeline (crm-ux redesign): ONE story
 * fusing state + history — birth node (synthesized from the
 * registration), chronological event nodes (transiciones + handoffs
 * merged, API order is newest-first), the live "estás acá" node with
 * the envíos meter, and the "¿qué sigue?" node carrying the actions.
 * Registering an action is the caller's flow — here we only assert
 * the component reports the chosen evento.
 */

function pipeline(overrides: Partial<PipelineEmpresa> = {}): PipelineEmpresa {
  return {
    empresaId: 42,
    flujo: 'INBOUND',
    etapa: 'SEGUIMIENTO',
    ciclo: 1,
    enviosCiclo: 2,
    fechaCicloInicio: '2026-09-01',
    fechaUltimoEnvio: '2026-09-20',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    updatedBy: null,
    updatedAt: '2026-09-20T00:00:00.000Z',
    ...overrides,
  };
}

function transicion(overrides: Partial<TransicionHistorial> = {}): TransicionHistorial {
  return {
    id: 1,
    empresaId: 42,
    flujoPrevio: 'INBOUND',
    etapaPrevia: 'REGISTRADO',
    flujoNuevo: 'INBOUND',
    etapaNueva: 'SEGUIMIENTO',
    evento: 'CotizaciónEnviada',
    motivo: null,
    usuario: 'jperez',
    createdAt: '2026-09-10T10:00:00.000Z',
    ...overrides,
  };
}

function handoff(overrides: Partial<HandoffHistorial> = {}): HandoffHistorial {
  return {
    id: 1,
    empresaId: 42,
    area: 'Operaciones',
    nota: 'Coordinar entrega',
    usuario: 'mgarcia',
    createdAt: '2026-09-15T10:00:00.000Z',
    ...overrides,
  };
}

function renderTimeline(overrides: Partial<Parameters<typeof TimelineAvance>[0]> = {}) {
  const onAccion = vi.fn();
  const props: Parameters<typeof TimelineAvance>[0] = {
    pipeline: pipeline(),
    transiciones: [transicion()],
    handoffs: [handoff()],
    empresaCreatedAt: '2026-09-01T09:00:00.000Z',
    empresaOrigen: 'Inbound' as Origen,
    disponibles: ['PresentaciónEnviada', 'Rechazo'],
    enCurso: false,
    onAccion,
    errorTransicion: null,
    ...overrides,
  };
  render(<TimelineAvance {...props} />);
  return { onAccion };
}

describe('TimelineAvance — la historia viva', () => {
  it('tells the story in order: nacimiento, eventos, estás acá, qué sigue', () => {
    renderTimeline();

    const avance = within(screen.getByLabelText('Avance comercial'));

    // Nacimiento + origen en vocabulario intuitivo.
    expect(avance.getByText('Empresa en el CRM')).toBeInTheDocument();
    expect(avance.getByText(/Origen: Nos contactaron/)).toBeInTheDocument();

    // Eventos históricos en orden cronológico (el handoff es POSTERIOR
    // a la transición por fecha) — el orden del DOM cuenta la historia.
    const textos = avance.getAllByRole('listitem').map((li) => li.textContent ?? '');
    const indiceTransicion = textos.findIndex((t) => t.includes('Cotización enviada'));
    const indiceHandoff = textos.findIndex((t) => t.includes('Handoff a Operaciones'));
    const indiceActual = textos.findIndex((t) => t.includes('Estás acá: Seguimiento'));
    const indiceSigue = textos.findIndex((t) => t.includes('¿Qué sigue?'));
    expect(indiceTransicion).toBeGreaterThan(-1);
    expect(indiceHandoff).toBeGreaterThan(indiceTransicion);
    expect(indiceActual).toBeGreaterThan(indiceHandoff);
    expect(indiceSigue).toBeGreaterThan(indiceActual);

    // Medidor de envíos: 2 de 3.
    expect(avance.getByTitle('Envíos del ciclo: 2 de 3')).toBeInTheDocument();
  });

  it('fires onAccion with the chosen event from the ¿qué sigue? node', async () => {
    const { onAccion } = renderTimeline();

    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));

    expect(onAccion).toHaveBeenCalledWith('Rechazo');
  });

  it('collapses long histories behind an expand control', async () => {
    const muchas = Array.from({ length: 7 }, (_, i) =>
      transicion({ id: i + 1, createdAt: `2026-09-0${i + 1}T10:00:00.000Z` }),
    );
    renderTimeline({ transiciones: muchas, handoffs: [] });

    // 7 eventos → solo los últimos 5 visibles, 2 ocultos.
    expect(screen.getByText('Ver 2 eventos anteriores')).toBeInTheDocument();
    expect(screen.getAllByText(/Cotización enviada/).length).toBeLessThanOrEqual(6); // 5 nodos + 1 botón de acción

    await userEvent.click(screen.getByText('Ver 2 eventos anteriores'));

    expect(screen.getByText('Ocultar eventos anteriores')).toBeInTheDocument();
  });

  it('shows the aviso when the empresa has no pipeline (origen null)', () => {
    renderTimeline({ pipeline: null, disponibles: [] });

    expect(
      screen.getByText('Esta empresa todavía no registra avance comercial.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('¿Qué sigue?')).not.toBeInTheDocument();
  });
});
