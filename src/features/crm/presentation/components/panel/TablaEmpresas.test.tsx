import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FilaPanelCrm } from '../../../domain/ports';
import { derivarPanel } from '../../panelDerivado';
import type { EstadoPanel } from '../../estadoPanel';
import { TablaEmpresas } from './TablaEmpresas';

/**
 * UI contract for the empresa table (task 8.4, spec OP-4 + SD-3):
 * mock-verbatim columns and status badges, the derived "Próximo paso"
 * labels, and — table-driven over ALL 10 derived statuses — exactly
 * the ACCIONES_POR_ESTADO action set for each row. Rows are fixtures
 * run through the REAL derivarPanel (the component renders derivation
 * output, never its own classification). The empty state and the
 * "Mostrando N de M empresas" footer close the contract.
 */

const HOY = '2026-09-15';

function fila(overrides: Partial<FilaPanelCrm> = {}): FilaPanelCrm {
  return {
    empresaId: 1,
    razonSocial: 'Constructora X',
    ruc: '20489561234',
    tipo: 'Prospecto',
    responsable: null,
    sector: 'Construcción',
    cantidadTrabajadores: 45,
    createdAt: '2026-09-01T00:00:00.000Z',
    flujo: 'OUTBOUND',
    etapa: 'CADENCIA',
    ciclo: 1,
    enviosCiclo: 1,
    fechaCicloInicio: '2026-09-08',
    fechaUltimoEnvio: '2026-09-08',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    contactoNombre: 'Carlos Mendoza',
    contactoCargo: 'Recursos Humanos / Seguridad',
    contactoCorreo: 'carlos@constructora.com',
    ...overrides,
  };
}

function sinPipeline(overrides: Partial<FilaPanelCrm> = {}): Partial<FilaPanelCrm> {
  return {
    flujo: null,
    etapa: null,
    ciclo: null,
    enviosCiclo: null,
    fechaCicloInicio: null,
    fechaUltimoEnvio: null,
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    ...overrides,
  };
}

/** The <tr> containing the empresa name — closest('tr') is stable
 * (rows carry no accessible name of their own in jsdom). */
function filaDe(nombre: string): HTMLElement {
  const tr = screen.getByText(nombre).closest('tr');
  if (tr === null) throw new Error(`La empresa ${nombre} no quedó dentro de una fila`);
  return tr;
}

/** Fixture overrides per derived status + the mock-verbatim badge,
 * the accessible names of EXACTLY the allowed buttons, and the
 * "Próximo paso" principal label (null = empty cell). */
const CASOS: readonly {
  estado: EstadoPanel;
  overrides: Partial<FilaPanelCrm>;
  insignia: string;
  botones: string[];
  proximo: string | null;
}[] = [
  {
    estado: 'sin_carta',
    overrides: sinPipeline({ empresaId: 10 }),
    insignia: 'Falta enviar carta',
    botones: ['Enviar carta', 'Ver ficha'],
    proximo: 'Enviar carta hoy',
  },
  {
    estado: 'carta_enviada',
    overrides: { empresaId: 11 },
    insignia: 'Carta enviada (Inicio)',
    botones: ['+1 Sem', '¿Respondió?', 'Ver ficha'],
    proximo: 'Toca Semana 1',
  },
  {
    estado: 'seguimiento_1',
    overrides: { empresaId: 12, enviosCiclo: 2 },
    insignia: 'Semana 1 enviada',
    botones: ['+1 Sem', '¿Respondió?', 'Ver ficha'],
    proximo: 'Toca Semana 2',
  },
  {
    estado: 'seguimiento_2',
    overrides: { empresaId: 13, enviosCiclo: 3 },
    insignia: 'Semana 2 enviada',
    botones: ['+1 Sem', '¿Respondió?', 'Ver ficha'],
    proximo: 'Toca Semana 3 (Fin)',
  },
  {
    estado: 'seguimiento_3',
    overrides: { empresaId: 14, enviosCiclo: 4 },
    insignia: 'Semana 3 (Último aviso)',
    botones: ['¿Respondió?', 'Pausar 3m', 'Ver ficha'],
    proximo: 'Cumplió 3 semanas (Pausa)',
  },
  {
    estado: 'respondio_positivo',
    overrides: { empresaId: 15, etapa: 'ACEPTADO' },
    insignia: '¡Interesado! (Positivo)',
    botones: ['Ver Ficha'],
    proximo: 'Llamar o Cotizar',
  },
  {
    estado: 'en_pausa_3m',
    overrides: { empresaId: 16, etapa: 'DESCANSO', descansoHasta: '2026-12-15' },
    insignia: 'En pausa por 3 meses',
    botones: ['Reactivar ya', 'Ver ficha'],
    proximo: 'Se reactiva:',
  },
  {
    estado: 'reactivado',
    overrides: {
      empresaId: 17,
      etapa: 'NUEVO',
      enviosCiclo: 0,
      fechaCicloInicio: '2026-09-10',
      fechaUltimoEnvio: null,
    },
    insignia: '¡Reactivado tras 3 meses!',
    botones: ['¿Respondió?', 'Ver ficha'],
    proximo: 'Toca volver a contactar',
  },
  {
    estado: 'respondio_negativo',
    overrides: { empresaId: 18, etapa: 'RECHAZADO', rechazadoHasta: '2026-12-15' },
    insignia: 'Sin interés (En pausa)',
    botones: ['Ver Ficha'],
    proximo: null,
  },
  {
    estado: 'avanzado',
    overrides: {
      empresaId: 19,
      flujo: 'INBOUND',
      etapa: 'CONFIRMADA',
      enviosCiclo: 0,
      fechaCicloInicio: '2026-09-10',
      fechaUltimoEnvio: null,
    },
    insignia: 'Confirmada',
    botones: ['Ver Ficha'],
    proximo: 'Llamar o Cotizar',
  },
];

function renderTabla(
  overrides: Partial<FilaPanelCrm>[] = [{ empresaId: 11 }],
  total = overrides.length,
) {
  const panel = derivarPanel({ hoy: HOY, filas: overrides.map((o) => fila(o)) });
  const onAccion = vi.fn();
  const onAnotar = vi.fn();
  render(
    <TablaEmpresas filas={panel.filas} total={total} onAccion={onAccion} onAnotar={onAnotar} />,
  );
  return { onAccion, onAnotar, filas: panel.filas };
}

describe('TablaEmpresas — una fila por estado derivado', () => {
  it.each(CASOS)('$estado: insignia "$insignia", próximo "$proximo" y SOLO sus acciones', ({
    overrides,
    insignia,
    botones,
    proximo,
  }) => {
    renderTabla([overrides]);

    expect(screen.getByText(insignia)).toBeInTheDocument();

    const fila = filaDe('Constructora X');
    if (proximo === null) {
      expect(within(fila).queryByTestId('proximo-paso')).not.toBeInTheDocument();
    } else {
      expect(within(fila).getByText(proximo)).toBeInTheDocument();
    }

    const botonesFila = within(fila)
      .getAllByRole('button')
      .map((boton) => boton.getAttribute('aria-label') ?? boton.textContent);
    // The empresa-name button (ficha affordance, spec OP-6) is not a
    // row action — exclude it from the action-set comparison.
    const acciones = botonesFila.filter((nombre) => nombre !== 'Constructora X').sort();
    expect(acciones).toEqual([...botones].sort());
  });

  it('formats the "Se reactiva:" date dd/mm/yyyy next to its label', () => {
    renderTabla([{ empresaId: 16, etapa: 'DESCANSO', descansoHasta: '2026-12-15' }]);

    const fila = filaDe('Constructora X');
    expect(within(fila).getByText('Se reactiva:')).toBeInTheDocument();
    expect(within(fila).getByText('15/12/2026')).toBeInTheDocument();
  });

  it('reports the clicked row action with the derived fila', async () => {
    const { onAccion, filas } = renderTabla([
      { empresaId: 16, etapa: 'DESCANSO', descansoHasta: '2026-12-15' },
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Reactivar ya' }));
    expect(onAccion).toHaveBeenCalledTimes(1);
    expect(onAccion).toHaveBeenCalledWith(filas[0], 'reactivar');
  });

  it('opens the ficha from the empresa-name button (spec OP-6 affordance)', async () => {
    const { onAccion, filas } = renderTabla([{ empresaId: 10, ...sinPipeline() }]);

    await userEvent.click(screen.getByRole('button', { name: 'Constructora X' }));
    expect(onAccion).toHaveBeenCalledWith(filas[0], 'ver_ficha');
  });
});

describe('TablaEmpresas — columnas y contenido', () => {
  it('renders the 6 mock-verbatim column headers', () => {
    renderTabla();

    const encabezados = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(encabezados).toEqual([
      'Empresa',
      'Persona de Contacto',
      'Tipo',
      '¿En qué correo va?',
      'Próximo paso',
      '¿Qué deseas hacer?',
    ]);
  });

  it('shows nombre + RUC + trabajadores in the empresa cell and contacto + cargo + sector chip', () => {
    renderTabla();

    const fila = filaDe('Constructora X');
    expect(within(fila).getByText('RUC: 20489561234')).toBeInTheDocument();
    expect(within(fila).getByText('45 trabajadores')).toBeInTheDocument();
    expect(within(fila).getByText('Carlos Mendoza')).toBeInTheDocument();
    expect(within(fila).getByText('Recursos Humanos / Seguridad')).toBeInTheDocument();
    expect(within(fila).getByText('Construcción')).toBeInTheDocument();
  });

  it('renders the display-only tipo label over the domain type', () => {
    renderTabla([{ empresaId: 11, tipo: 'Prospecto' }, { empresaId: 12, tipo: 'Cliente' }]);

    expect(screen.getByText('Posible Cliente')).toBeInTheDocument();
    expect(screen.getByText('Cliente Nuevo')).toBeInTheDocument();
  });

  it('gives inbound advanced stages their OWN badge under the derived stage label', () => {
    renderTabla([
      {
        empresaId: 19,
        flujo: 'INBOUND',
        etapa: 'PRESENTACION',
        enviosCiclo: 0,
        fechaCicloInicio: '2026-09-10',
        fechaUltimoEnvio: null,
      },
    ]);

    expect(screen.getByText('Presentación')).toBeInTheDocument();
    expect(screen.queryByText('Carta enviada (Inicio)')).not.toBeInTheDocument();
  });

  it('omits the trabajadores detail when cantidadTrabajadores is null', () => {
    renderTabla([{ empresaId: 11, cantidadTrabajadores: null }]);

    const fila = filaDe('Constructora X');
    expect(within(fila).getByText('RUC: 20489561234')).toBeInTheDocument();
    expect(within(fila).queryByText(/trabajadores/)).not.toBeInTheDocument();
  });
});

describe('TablaEmpresas — estado vacío y pie', () => {
  it('renders the empty state (task 8.3 copy) instead of the table when no row matches', () => {
    renderTabla([], 7);

    expect(screen.getByText('No hay empresas que mostrar')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
  });

  it('fires onAnotar from the empty-state CTA', async () => {
    const { onAnotar } = renderTabla([], 7);

    await userEvent.click(screen.getByRole('button', { name: '+ Anotar Empresa' }));
    expect(onAnotar).toHaveBeenCalledTimes(1);
  });

  it('shows the "Mostrando N de M empresas" footer with the reactivation rule', () => {
    renderTabla([{ empresaId: 11 }, { empresaId: 12, enviosCiclo: 2 }], 5);

    expect(
      screen.getByText(
        'Regla de reactivación: Si no hay interés, se deja en pausa 3 meses y luego se reactiva para consultar nuevamente.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Mostrando 2 de 5 empresas')).toBeInTheDocument();
  });
});

describe('TablaEmpresas — acción en curso (decision 13, batch 14)', () => {
  /** PanelCrm passes the empresaId whose row action is in flight; the
   * in-flight row's buttons disable so a send cannot double-fire. */
  function renderConCurso(accionEnCurso: number | null): void {
    const panel = derivarPanel({ hoy: HOY, filas: [fila({ empresaId: 10, ...sinPipeline() })] });
    render(
      <TablaEmpresas
        filas={panel.filas}
        total={1}
        onAccion={vi.fn()}
        onAnotar={vi.fn()}
        accionEnCurso={accionEnCurso}
      />,
    );
  }

  it('disables every action button of the in-flight row while its action posts', () => {
    renderConCurso(10);

    expect(screen.getByRole('button', { name: 'Enviar carta' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ver ficha' })).toBeDisabled();
  });

  it('keeps the buttons enabled when no action is in flight', () => {
    renderConCurso(null);

    expect(screen.getByRole('button', { name: 'Enviar carta' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Ver ficha' })).toBeEnabled();
  });

  it('keeps other rows enabled while a different row is in flight', () => {
    renderConCurso(99);

    expect(screen.getByRole('button', { name: 'Enviar carta' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Ver ficha' })).toBeEnabled();
  });
});
