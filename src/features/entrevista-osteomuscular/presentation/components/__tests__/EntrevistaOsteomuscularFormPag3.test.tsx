import { describe, it, afterEach, beforeEach, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AtencionDetalle } from '@/types/jjc';
import { EntrevistaOsteomuscularProvider } from '@/features/entrevista-osteomuscular/presentation/context/EntrevistaOsteomuscularContext';
import {
  DETALLE_IRRADIACION_MAX_LENGTH,
  DETALLE_IRRADIACION_ERROR_MESSAGE,
} from '@/features/entrevista-osteomuscular/domain/detalleIrradiacion';
import { EntrevistaOsteomuscularFormPag3 } from '../EntrevistaOsteomuscularFormPag3';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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

function renderPag3() {
  return render(
    <EntrevistaOsteomuscularProvider idAtencion={ATENCION.idAtencion} atencion={ATENCION}>
      <EntrevistaOsteomuscularFormPag3 />
    </EntrevistaOsteomuscularProvider>,
  );
}

beforeEach(() => {
  // Sin entrevista previa guardada (GET → 404)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ data: null }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EntrevistaOsteomuscularFormPag3 — campo DETALLE DE IRRADIACIÓN', () => {
  it('renderiza el campo de forma idéntica en CERVICAL, DORSAL y LUMBO SACRA', () => {
    renderPag3();

    expect(screen.getByText('CERVICAL')).toBeInTheDocument();
    expect(screen.getByText('DORSAL')).toBeInTheDocument();
    expect(screen.getByText('LUMBO SACRA')).toBeInTheDocument();

    const inputs = screen.getAllByLabelText('DETALLE DE IRRADIACIÓN');
    expect(inputs).toHaveLength(3);

    for (const input of inputs) {
      expect(input).toHaveAttribute('type', 'text');
      expect(input).toHaveAttribute('maxLength', String(DETALLE_IRRADIACION_MAX_LENGTH));
      expect(input).toHaveValue('');
      // Diseño responsivo: apilado en móvil, en fila desde el breakpoint sm
      const wrapper = input.closest('.flex-col');
      expect(wrapper).not.toBeNull();
      expect(wrapper?.className).toContain('sm:flex-row');
    }
  });

  it('almacena valores válidos de forma independiente en las tres secciones', async () => {
    const user = userEvent.setup();
    renderPag3();

    const [cervical, dorsal, lumbo] = screen.getAllByLabelText('DETALLE DE IRRADIACIÓN');

    await user.type(cervical, 'Hombro derecho');
    await user.type(dorsal, 'Región escapular izquierda');
    await user.type(lumbo, 'Ciática derecha hasta rodilla');

    expect(cervical).toHaveValue('Hombro derecho');
    expect(dorsal).toHaveValue('Región escapular izquierda');
    expect(lumbo).toHaveValue('Ciática derecha hasta rodilla');
  });

  it('rechaza caracteres fuera del formato y muestra el mensaje de error', async () => {
    const user = userEvent.setup();
    renderPag3();

    const [cervical] = screen.getAllByLabelText('DETALLE DE IRRADIACIÓN');
    await user.type(cervical, 'dolor@');

    // El carácter inválido no se incorpora al valor y se muestra el aviso
    expect(cervical).toHaveValue('dolor');
    expect(screen.getByRole('alert')).toHaveTextContent(DETALLE_IRRADIACION_ERROR_MESSAGE);
  });

  it('aplica la longitud máxima permitida', async () => {
    const user = userEvent.setup();
    renderPag3();

    const [lumbo] = screen.getAllByLabelText('DETALLE DE IRRADIACIÓN');
    await user.type(lumbo, 'a'.repeat(DETALLE_IRRADIACION_MAX_LENGTH + 50));

    expect(lumbo).toHaveValue('a'.repeat(DETALLE_IRRADIACION_MAX_LENGTH));
  });

  it('limpia el error cuando el valor vuelve a ser válido', async () => {
    const user = userEvent.setup();
    renderPag3();

    const [dorsal] = screen.getAllByLabelText('DETALLE DE IRRADIACIÓN');
    await user.type(dorsal, 'x#');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.clear(dorsal);
    await user.type(dorsal, 'Zona dorsal baja');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(dorsal).toHaveValue('Zona dorsal baja');
  });
});
