import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Behavioral smoke of the three asistencia pages' building blocks
 * (REQ-F1-11/12/13). Server pages are thin wrappers (plantillas
 * precedent) — these tests pin what each page's components DO:
 *
 *  - dashboard: TablaMarcaciones renders the day's rows with the
 *    "Sin ficha" label for unresolved punches; AlertasPanel maps
 *    WORKER_CAIADO to a human label; RefrescarButton refreshes the RSC
 *    tree.
 *  - histórico: BuscadorHistorico round-trips the current search as
 *    GET-form defaults; criterio.ts normalizes searchParams.
 *  - fichas: ColaFichas lists the pending queue with one completion
 *    form each; useCompletarFicha POSTs the snake_case wire contract
 *    and refreshes the tree on success, surfacing server errors.
 */

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

import { TablaMarcaciones } from '@/features/asistencia-rrhh/presentation/components/TablaMarcaciones';
import { AlertasPanel } from '@/features/asistencia-rrhh/presentation/components/AlertasPanel';
import { RefrescarButton } from '@/features/asistencia-rrhh/presentation/components/RefrescarButton';
import { BuscadorHistorico } from '@/features/asistencia-rrhh/presentation/components/BuscadorHistorico';
import { ColaFichas } from '@/features/asistencia-rrhh/presentation/components/ColaFichas';
import { CompletarFichaForm } from '@/features/asistencia-rrhh/presentation/components/CompletarFichaForm';
import { normalizarCriterioHistorico } from '@/app/asistencia/historico/criterio';
import type { Empleado, MarcacionRaw } from '@/features/asistencia-rrhh/domain/entities';
import type { VistaAlerta } from '@/features/asistencia-rrhh/application/listarDashboard';

// ---- Fixtures ----

function makeMarca(id: number, hora: string, empleadoId: number | null): MarcacionRaw {
  return {
    id,
    dispositivoId: 1,
    userId: `U00${id}`,
    empleadoId,
    fechaHora: new Date(`2026-09-02T${hora}`),
    punch: 0,
    tipoVerificacion: 'HUELLA',
    procesada: false,
    createdAt: new Date('2026-09-02T08:00:00'),
  };
}

function makeFicha(id: number, overrides: Partial<Empleado> = {}): Empleado {
  return {
    id,
    userId: `U00${id}`,
    dni: null,
    nombres: `Usuario ${id}`,
    apellidos: null,
    area: null,
    cargo: null,
    fechaIngreso: null,
    fechaBaja: null,
    estado: 'PENDIENTE_FICHA',
    modoExtras: 'PAGAR',
    createdAt: new Date(`2026-09-0${id}T08:00:00`),
    updatedAt: new Date(`2026-09-0${id}T08:00:00`),
    ...overrides,
  };
}

function vistaAlerta(overrides: Partial<VistaAlerta>): VistaAlerta {
  return {
    tipo: 'DRIFT_RELOJ',
    empleadoId: null,
    dispositivoId: null,
    detalle: 'Deriva 75s',
    fecha: new Date('2026-09-02T08:00:00'),
    atendida: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockRouter.refresh.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ empleado: { id: 1, estado: 'ACTIVO' } }), { status: 200 }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---- Dashboard: TablaMarcaciones ----

describe('TablaMarcaciones', () => {
  it('lista las marcas del día; un punch sin empleadoId muestra la etiqueta "Sin ficha"', () => {
    render(
      <TablaMarcaciones
        marcaciones={[makeMarca(1, '08:01:00', 5), makeMarca(2, '08:03:00', null)]}
      />,
    );
    expect(screen.getByText('U001')).toBeInTheDocument();
    expect(screen.getByText('#5')).toBeInTheDocument();
    expect(screen.getByText('Sin ficha')).toBeInTheDocument();
  });

  it('sin marcaciones hoy → mensaje explícito (y ninguna tabla)', () => {
    render(<TablaMarcaciones marcaciones={[]} />);
    expect(screen.getByText(/Sin marcaciones registradas hoy/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

// ---- Dashboard: AlertasPanel + RefrescarButton ----

describe('AlertasPanel', () => {
  it('mapea WORKER_CAIADO a etiqueta humana y muestra el detalle', () => {
    render(
      <AlertasPanel
        alertas={[
          vistaAlerta({ tipo: 'WORKER_CAIADO', detalle: 'K20-SEDE-01: última sincronización hace 753s' }),
        ]}
      />,
    );
    expect(screen.getByText('Worker caído')).toBeInTheDocument();
    expect(screen.getByText(/K20-SEDE-01/)).toBeInTheDocument();
  });

  it('sin alertas → mensaje explícito', () => {
    render(<AlertasPanel alertas={[]} />);
    expect(screen.getByText(/Sin alertas activas/)).toBeInTheDocument();
  });
});

describe('RefrescarButton', () => {
  it('el click dispara router.refresh (re-ejecuta el server component)', () => {
    render(<RefrescarButton />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });
});

// ---- Histórico: criterio + BuscadorHistorico ----

describe('normalizarCriterioHistorico', () => {
  it('defaults: sin parámetros → hoy..hoy', () => {
    const criterio = normalizarCriterioHistorico({}, '2026-09-02');
    expect(criterio).toEqual({ empleadoId: undefined, userId: undefined, desde: '2026-09-02', hasta: '2026-09-02' });
  });

  it('parámetros completos viajan parseados (empleado a número)', () => {
    const criterio = normalizarCriterioHistorico(
      { empleado: '5', userId: ' U007 ', desde: '2026-08-01', hasta: '2026-08-31' },
      '2026-09-02',
    );
    expect(criterio).toEqual({ empleadoId: 5, userId: 'U007', desde: '2026-08-01', hasta: '2026-08-31' });
  });

  it('rango invertido se corrige (desde ≤ hasta), fechas malformadas caen al default y empleado inválido se descarta', () => {
    const criterio = normalizarCriterioHistorico(
      { empleado: 'abc', desde: '2026-09-30', hasta: '20/08/2026' },
      '2026-09-02',
    );
    // hasta malformada → hoy; desde (30) > hasta (02) → swap.
    expect(criterio.desde).toBe('2026-09-02');
    expect(criterio.hasta).toBe('2026-09-30');
    expect(criterio.empleadoId).toBeUndefined();
  });
});

describe('BuscadorHistorico', () => {
  it('GET form a la misma ruta con los valores actuales como defaults', () => {
    render(
      <BuscadorHistorico
        valores={{ empleado: '5', userId: 'U007', desde: '2026-08-01', hasta: '2026-08-31' }}
      />,
    );
    const form = screen.getByRole('form') as HTMLFormElement;
    expect(form.method).toBe('get');
    expect(form.getAttribute('action')).toBe('/asistencia/historico');
    expect((screen.getByLabelText('Empleado (id)') as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText('Usuario de equipo') as HTMLInputElement).value).toBe('U007');
    expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe('2026-08-01');
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe('2026-08-31');
  });
});

// ---- Fichas: ColaFichas + CompletarFichaForm (useCompletarFicha) ----

describe('ColaFichas', () => {
  it('lista cada ficha pendiente (nombre + userId) con UN formulario de completado por ficha', () => {
    render(<ColaFichas fichas={[makeFicha(1), makeFicha(2)]} />);
    expect(screen.getByText('Usuario 1')).toBeInTheDocument();
    expect(screen.getByText(/Usuario 2/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Completar/ })).toHaveLength(2);
  });

  it('cola vacía → mensaje explícito', () => {
    render(<ColaFichas fichas={[]} />);
    expect(screen.getByText(/No hay fichas pendientes/)).toBeInTheDocument();
  });
});

describe('CompletarFichaForm (useCompletarFicha)', () => {
  function completarFichaMock(): { empleado: { id: number; estado: string } } | { error: string } {
    return { empleado: { id: 1, estado: 'ACTIVO' } };
  }

  it('envía el contrato snake_case a /api/asistencia-rrhh/fichas/[id] y refresca al completar', async () => {
    render(<CompletarFichaForm ficha={makeFicha(5)} />);

    fireEvent.change(screen.getByLabelText(/DNI/), { target: { value: '87654321' } });
    fireEvent.change(screen.getByLabelText(/Apellidos/), { target: { value: 'Gómez' } });
    fireEvent.change(screen.getByLabelText(/Área/), { target: { value: 'Enfermería' } });
    fireEvent.change(screen.getByLabelText(/Fecha de ingreso/), { target: { value: '2026-08-01' } });
    fireEvent.click(screen.getByRole('button', { name: /Completar/ }));

    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/asistencia-rrhh/fichas/5');
    expect(init.method).toBe('POST');
    const cuerpo = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(cuerpo).toMatchObject({
      dni: '87654321',
      apellidos: 'Gómez',
      area: 'Enfermería',
      fecha_ingreso: '2026-08-01',
    });
    void completarFichaMock;
  });

  it('un 400 del servidor se muestra al usuario y NO refresca', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ success: false, error: 'Ficha inválida: el DNI es obligatorio' }),
          { status: 400 },
        ),
      ),
    );

    render(<CompletarFichaForm ficha={makeFicha(5)} />);
    fireEvent.change(screen.getByLabelText(/DNI/), { target: { value: '00000000' } });
    fireEvent.change(screen.getByLabelText(/Apellidos/), { target: { value: 'Gómez' } });
    fireEvent.change(screen.getByLabelText(/Área/), { target: { value: 'Enfermería' } });
    fireEvent.change(screen.getByLabelText(/Fecha de ingreso/), { target: { value: '2026-08-01' } });
    fireEvent.click(screen.getByRole('button', { name: /Completar/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('el DNI es obligatorio'),
    );
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it('el botón queda deshabilitado mientras el envío está en curso', async () => {
    let resolverFetch: ((res: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolverFetch = resolve;
          }),
      ),
    );

    render(<CompletarFichaForm ficha={makeFicha(5)} />);
    fireEvent.change(screen.getByLabelText(/DNI/), { target: { value: '00000000' } });
    fireEvent.change(screen.getByLabelText(/Apellidos/), { target: { value: 'Gómez' } });
    fireEvent.change(screen.getByLabelText(/Área/), { target: { value: 'Enfermería' } });
    fireEvent.change(screen.getByLabelText(/Fecha de ingreso/), { target: { value: '2026-08-01' } });
    fireEvent.click(screen.getByRole('button', { name: /Completar/ }));

    expect(await screen.findByRole('button', { name: /Completando/ })).toBeDisabled();
    resolverFetch?.(
      new Response(JSON.stringify({ empleado: { id: 5, estado: 'ACTIVO' } }), { status: 200 }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });
});
