import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtencionDetalle } from '@/types/jjc';
import { EvaluacionOsteomuscularProvider, useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { EvaluacionLayoutShell } from '../EvaluacionLayoutShell';

const mockPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const ATENCION: AtencionDetalle = {
  idAtencion: 'AT-1001',
  dni: '11223344',
  paciente: 'Paciente Prueba',
  sexo: 'M',
  fechaNac: '01/01/1990',
  edad: 36,
  fechaAtencion: '01/08/2026',
  empresa: 'Empresa X',
  tipoExamen: 'PERIODICO',
  puesto: 'Operario',
  area: 'Producción',
  rutaFirma: null,
  rutaHuella: null,
};

function ModifyButton() {
  const { setField } = useEvaluacionContext();

  return (
    <button
      type="button"
      onClick={() =>
        setField(
          'evaluacionClinicaOsteomuscular.miembrosSuperiores.codo.gravedadPatologiaCodo',
          'GRAVE',
        )
      }
    >
      Modificar
    </button>
  );
}

function renderShell() {
  return render(
    <EvaluacionOsteomuscularProvider idAtencion={ATENCION.idAtencion} atencion={ATENCION}>
      <EvaluacionLayoutShell>
        <ModifyButton />
      </EvaluacionLayoutShell>
    </EvaluacionOsteomuscularProvider>,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: unknown, init?: { method?: string }) => {
    if (init?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: null }), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mockPush.mockReset();
});

describe('EvaluacionLayoutShell', () => {
  it('renders the top and footer actions and protects exit with unsaved changes', async () => {
    const user = userEvent.setup();
    renderShell();

    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Modificar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Hay cambios sin guardar. Si sale, se perderán los datos no guardados.')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Volver' }));
    await user.click(screen.getByRole('button', { name: 'Salir sin guardar' }));
    expect(mockPush).toHaveBeenCalledWith('/areas/musculoesqueletica/jjc/AT-1001');
  });

  it('persists the evaluation on Guardar and allows leaving without confirmation', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Modificar' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    // El guardado real (POST) termina y el botón vuelve a su estado normal
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, init]) =>
        String(url).includes('/api/areas/musculoesqueletica/jjc/evaluacion')
        && init?.method === 'POST')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Volver' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockPush).toHaveBeenCalledWith('/areas/musculoesqueletica/jjc/AT-1001');
  });

  it('shows an error message when the save request fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (_url: unknown, init?: { method?: string }) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'DB connection failed' }), { status: 500 });
      }
      return new Response(JSON.stringify({ data: null }), { status: 404 });
    });
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Modificar' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('DB connection failed');
  });
});
