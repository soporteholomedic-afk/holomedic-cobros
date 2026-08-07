import { describe, it, afterEach, beforeEach, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AtencionDetalle } from '@/types/jjc';
import {
  EntrevistaOsteomuscularProvider,
  useEntrevistaContext,
} from '@/features/entrevista-osteomuscular/presentation/context/EntrevistaOsteomuscularContext';
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

const fetchMock = vi.fn();

beforeEach(() => {
  // Sin entrevista previa guardada (GET → 404)
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({ data: null }),
  });
  vi.stubGlobal('fetch', fetchMock);
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

// ---- Ayudas para las figuras de columna (página 3) ----

const SAVED_CON_MARCAS = {
  columna: {
    cervical: { presentaDisturbio: true },
    areaDistribucionAnotaciones: {
      cervical: [{ id: 'g1', x: 0.25, y: 0.5 }],
      dorsalLumboSacra: [{ id: 'g2', x: 0.75, y: 0.25 }],
    },
  },
};

/** Botón real del provider para disparar el POST de la entrevista completa. */
function SaveHarness() {
  const { save } = useEntrevistaContext();
  return <button onClick={() => void save()}>Guardar entrevista</button>;
}

function renderPag3ConGuardar() {
  render(
    <EntrevistaOsteomuscularProvider idAtencion={ATENCION.idAtencion} atencion={ATENCION}>
      <EntrevistaOsteomuscularFormPag3 />
      <SaveHarness />
    </EntrevistaOsteomuscularProvider>,
  );
  const cervical = screen.getByRole('img', { name: 'Figura de columna cervical' });
  const dorsal = screen.getByRole('img', { name: 'Figura de columna dorsal y lumbo sacra' });
  stubSvgGeometry(cervical, 144, 128);
  stubSvgGeometry(dorsal, 144, 192);
  return { cervical, dorsal };
}

/** Stub de geometría: jsdom no calcula layout; el handler lee el rect del SVG. */
function stubSvgGeometry(svg: Element, width: number, height: number) {
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}),
  } as DOMRect);
}

/** Pointer primario en coordenadas absolutas (patrón del repo, ver FaceScanCanvas.test.tsx). */
function pointerDownAt(element: Element, clientX: number, clientY: number) {
  fireEvent.pointerDown(element, { clientX, clientY, isPrimary: true, button: 0 });
}

type MarcasColumna = { cervical: unknown[]; dorsalLumboSacra: unknown[] };

function postMarcas(): MarcasColumna {
  const posts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST');
  const body = JSON.parse(String((posts[posts.length - 1][1] as RequestInit).body)) as {
    entrevista: { columna: { areaDistribucionAnotaciones: MarcasColumna } };
  };
  return body.entrevista.columna.areaDistribucionAnotaciones;
}

describe('EntrevistaOsteomuscularFormPag3 — marcas X de las figuras de columna', () => {
  it('cervical y dorsalLumboSacra reciben marcas independientes que viajan en el JSON', async () => {
    const user = userEvent.setup();
    const { cervical, dorsal } = renderPag3ConGuardar();

    pointerDownAt(cervical, 72, 64);
    pointerDownAt(dorsal, 72, 96);
    await user.click(screen.getByRole('button', { name: 'Guardar entrevista' }));

    const marcas = postMarcas();
    expect(marcas.cervical).toHaveLength(1);
    expect(marcas.dorsalLumboSacra).toHaveLength(1);
    const [c] = marcas.cervical as Array<{ x: number; y: number }>;
    const [d] = marcas.dorsalLumboSacra as Array<{ x: number; y: number }>;
    expect(c.x).toBeCloseTo(0.5, 2);
    expect(c.y).toBeCloseTo(0.5, 2);
    expect(d.x).toBeCloseTo(0.5, 2);
    expect(d.y).toBeCloseTo(0.5, 2);
  });

  it('remover una marca cervical no altera la colección dorsalLumboSacra', async () => {
    const user = userEvent.setup();
    const { cervical, dorsal } = renderPag3ConGuardar();

    pointerDownAt(cervical, 72, 64);
    pointerDownAt(dorsal, 72, 96);
    await user.click(screen.getByRole('button', { name: 'Eliminar marca 1 en Columna cervical' }));
    expect(cervical.querySelectorAll('[data-mark-id]')).toHaveLength(0);
    expect(dorsal.querySelectorAll('[data-mark-id]')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Guardar entrevista' }));
    const marcas = postMarcas();
    expect(marcas.cervical).toEqual([]);
    expect(marcas.dorsalLumboSacra).toHaveLength(1);
  });

  it('restaura las marcas guardadas de ambas figuras junto con el cuestionario', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: SAVED_CON_MARCAS }),
    });

    renderPag3();

    expect(
      await screen.findByRole('button', { name: 'Eliminar marca 1 en Columna cervical' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Eliminar marca 1 en Columna dorsal y lumbo sacra' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: 'SI' })[0]).toBeChecked();
  });

  it('las marcas no alteran el cuestionario ni la irradiación, y viceversa', async () => {
    const user = userEvent.setup();
    const { cervical } = renderPag3ConGuardar();

    pointerDownAt(cervical, 72, 64);
    expect(screen.getAllByRole('radio', { name: 'SI' })[0]).not.toBeChecked();
    expect(screen.getAllByLabelText('DETALLE DE IRRADIACIÓN')[0]).toHaveValue('');

    await user.click(screen.getAllByRole('radio', { name: 'SI' })[0]);
    expect(cervical.querySelectorAll('[data-mark-id]')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Guardar entrevista' }));
    const marcas = postMarcas();
    expect(marcas.cervical).toHaveLength(1);
    expect(marcas.dorsalLumboSacra).toEqual([]);
  });
});
