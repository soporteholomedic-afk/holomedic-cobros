import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatosSunat, Empresa } from '../../../domain/entities';
import { empresa } from './crmFixtures';
import { AltaPanel } from '../AltaPanel';

const RUC = '20512345678';
const DATOS: DatosSunat = {
  razonSocial: 'Clínica Santa Rosa S.A.C.',
  direccion: 'Jr. Las Palmas 456, Lima',
  estado: 'ACTIVO',
  condicion: 'HABIDO',
};

function stubConsulta(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string) => {
    if (url === `/api/crm/ruc/${RUC}`) {
      return { ok: status < 400, status, json: async () => body } as Response;
    }
    throw new Error(`fetch inesperado: ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function flush(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

type OnCrearMock = ReturnType<typeof vi.fn<(cuerpo: Record<string, unknown>) => Promise<Empresa | { error: string }>>>;
type OnCrearOportunidadMock = ReturnType<
  typeof vi.fn<(idEmpresa: string, cuerpo: Record<string, unknown>) => Promise<unknown | { error: string }>>
>;

interface Montaje {
  onCrear: OnCrearMock;
  onCrearOportunidad: OnCrearOportunidadMock;
  onCerrar: ReturnType<typeof vi.fn<() => void>>;
}

function montar(
  onCrear: OnCrearMock = vi.fn(async () => empresa()),
  onCrearOportunidad: OnCrearOportunidadMock = vi.fn(async () => ({ idOportunidad: 'o-9' })),
): Montaje {
  const onCerrar = vi.fn<() => void>();
  render(
    <AltaPanel
      sectores={['Salud']}
      oculto={false}
      onCerrar={onCerrar}
      onCrearSector={vi.fn(async () => 'creado')}
      onCrear={onCrear}
      onCrearOportunidad={onCrearOportunidad}
    />,
  );
  return { onCrear, onCrearOportunidad, onCerrar };
}

function escribirRuc(valor: string): void {
  fireEvent.change(screen.getByLabelText(/^RUC/), { target: { value: valor } });
}

async function completarContactoYCrear(): Promise<void> {
  // Scoped: with the oportunidad section open, /^Nombre/ would also match "Nombre de la oportunidad".
  const contacto = within(screen.getByRole('group', { name: 'Contacto principal' }));
  fireEvent.change(contacto.getByLabelText(/^Nombre/), { target: { value: 'Marcela Quispe' } });
  fireEvent.change(contacto.getByLabelText(/^Teléfono/), { target: { value: '987654321' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear empresa' }));
  await flush(0);
}

/** Fills the required empresa fields (the SUNAT tests rely on the autofill instead). */
function completarBase(): void {
  fireEvent.change(screen.getByLabelText(/^Razón social/), { target: { value: DATOS.razonSocial } });
  fireEvent.change(screen.getByLabelText(/^RUC/), { target: { value: RUC } });
}

function activarSeccion(): void {
  fireEvent.click(screen.getByLabelText(/Crear también su primera oportunidad/));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AltaPanel — consulta SUNAT por RUC (T5, S3/S4)', () => {
  it('autocompletes razón social + dirección, shows the ACTIVO/HABIDO badge and sends direccion in the payload', async () => {
    stubConsulta(200, { success: true, datos: DATOS });
    const mocks = montar();

    escribirRuc(RUC);
    await flush(600);

    expect((screen.getByLabelText(/^Razón social/) as HTMLInputElement).value).toBe(DATOS.razonSocial);
    expect((screen.getByLabelText('Dirección fiscal') as HTMLInputElement).value).toBe(DATOS.direccion);
    const chip = screen.getByText('ACTIVO · HABIDO');
    expect(chip).toBeInTheDocument();
    expect(chip.className).toMatch(/emerald/);

    await completarContactoYCrear();
    expect(mocks.onCrear).toHaveBeenCalledWith(
      expect.objectContaining({
        razonSocial: DATOS.razonSocial,
        ruc: RUC,
        direccion: DATOS.direccion,
      }),
    );
  });

  it('does not overwrite a razón social the user typed before the lookup, but still fills dirección + badge', async () => {
    stubConsulta(200, { success: true, datos: DATOS });
    const mocks = montar();

    fireEvent.change(screen.getByLabelText(/^Razón social/), { target: { value: 'Mi Clínica Local S.A.C.' } });
    escribirRuc(RUC);
    await flush(600);

    expect((screen.getByLabelText(/^Razón social/) as HTMLInputElement).value).toBe('Mi Clínica Local S.A.C.');
    expect((screen.getByLabelText('Dirección fiscal') as HTMLInputElement).value).toBe(DATOS.direccion);
    expect(screen.getByText('ACTIVO · HABIDO')).toBeInTheDocument();

    await completarContactoYCrear();
    expect(mocks.onCrear).toHaveBeenCalledWith(
      expect.objectContaining({ razonSocial: 'Mi Clínica Local S.A.C.', direccion: DATOS.direccion }),
    );
  });

  it('manual typing after the autofill wins in the payload', async () => {
    stubConsulta(200, { success: true, datos: DATOS });
    const mocks = montar();

    escribirRuc(RUC);
    await flush(600);
    fireEvent.change(screen.getByLabelText(/^Razón social/), { target: { value: 'Nombre Editado S.A.C.' } });

    await completarContactoYCrear();
    expect(mocks.onCrear).toHaveBeenCalledWith(
      expect.objectContaining({ razonSocial: 'Nombre Editado S.A.C.', direccion: DATOS.direccion }),
    );
  });

  it('shows "Consultando SUNAT…" while the debounced lookup is pending and does not fetch before ~500ms', async () => {
    const fn = stubConsulta(200, { success: true, datos: DATOS });
    montar();

    escribirRuc(RUC);
    expect(screen.getByText('Consultando SUNAT…')).toBeInTheDocument();
    await flush(400);
    expect(fn).not.toHaveBeenCalled();
    await flush(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('shows a BAJA/SUSPENDIDO badge in red when SUNAT reports it', async () => {
    stubConsulta(200, {
      success: true,
      datos: { ...DATOS, estado: 'BAJA', condicion: 'SUSPENDIDO' },
    });
    montar();

    escribirRuc(RUC);
    await flush(600);
    const chip = screen.getByText('BAJA · SUSPENDIDO');
    expect(chip.className).toMatch(/red/);
  });

  it('a 404 keeps the form usable: message shown, no badge, and crear still works without direccion', async () => {
    stubConsulta(404, { success: false, error: `No se encontraron datos SUNAT para el RUC: ${RUC}` });
    const mocks = montar();

    escribirRuc(RUC);
    await flush(600);

    expect(screen.getByText(`No se encontraron datos SUNAT para el RUC: ${RUC}`)).toBeInTheDocument();
    expect(screen.queryByText('ACTIVO · HABIDO')).toBeNull();

    fireEvent.change(screen.getByLabelText(/^Razón social/), { target: { value: 'Escrita a mano S.A.C.' } });
    await completarContactoYCrear();
    const cuerpo = mocks.onCrear.mock.calls[0]![0];
    expect(cuerpo.razonSocial).toBe('Escrita a mano S.A.C.');
    expect(cuerpo).not.toHaveProperty('direccion');
  });

  it('a 503 (sin configurar) shows the configuration message without blocking the form', async () => {
    stubConsulta(503, {
      success: false,
      error: 'La consulta SUNAT no está configurada. Configura el token de apifacturacion en Configuración.',
    });
    montar();

    escribirRuc(RUC);
    await flush(600);
    expect(screen.getByText(/no está configurada/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Razón social/)).toBeEnabled();
  });

  it('a 502 (servicio caído) shows an inline error and the form stays usable', async () => {
    stubConsulta(502, { success: false, error: 'apifacturacion no respondió' });
    montar();

    escribirRuc(RUC);
    await flush(600);
    expect(screen.getByText('apifacturacion no respondió')).toBeInTheDocument();
    expect((screen.getByLabelText(/^Razón social/) as HTMLInputElement).value).toBe('');
  });

  it('omits direccion from the payload when SUNAT gives none, and shows no badge', async () => {
    stubConsulta(200, { success: true, datos: { ...DATOS, direccion: null, estado: null, condicion: null } });
    const mocks = montar();

    escribirRuc(RUC);
    await flush(600);
    expect((screen.getByLabelText('Dirección fiscal') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('ACTIVO · HABIDO')).toBeNull();

    await completarContactoYCrear();
    const cuerpo = mocks.onCrear.mock.calls[0]![0];
    expect(cuerpo).not.toHaveProperty('direccion');
  });
});

describe('AltaPanel — primera oportunidad opcional (S4/S7.1)', () => {
  /** Enables the section, fills the deal fields and the contact, and submits. */
  async function crearConSeccion(
    onCrear: OnCrearMock,
    onCrearOportunidad: OnCrearOportunidadMock,
    valores: Record<string, string> = { 'Nombre de la oportunidad': 'Exámenes de ingreso 2026' },
  ): Promise<void> {
    completarBase();
    activarSeccion();
    for (const [etiqueta, valor] of Object.entries(valores)) {
      fireEvent.change(screen.getByLabelText(new RegExp(`^${etiqueta}`)), { target: { value: valor } });
    }
    await completarContactoYCrear();
    void onCrear;
    void onCrearOportunidad;
  }

  it('the section starts collapsed: unticked checkbox, fields hidden; ticking reveals them and unticking hides them again', () => {
    stubConsulta(200, { success: true, datos: DATOS });
    montar();
    expect(screen.getByRole('group', { name: 'Primera oportunidad (opcional)' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Crear también su primera oportunidad/)).not.toBeChecked();
    expect(screen.queryByLabelText(/^Nombre de la oportunidad/)).toBeNull();
    activarSeccion();
    for (const etiqueta of [/^Nombre de la oportunidad/, /^Servicio de interés/, /^Responsable/, /^Monto estimado/, /¿Cómo nos conoció?/]) {
      expect(screen.getByLabelText(etiqueta)).toBeInTheDocument();
    }
    activarSeccion();
    expect(screen.queryByLabelText(/^Nombre de la oportunidad/)).toBeNull();
  });

  it('with the section off it calls ONLY onCrear and closes (S7.1: ficha without oportunidad)', async () => {
    stubConsulta(200, { success: true, datos: DATOS });
    const mocks = montar();

    completarBase();
    await completarContactoYCrear();
    expect(mocks.onCrear).toHaveBeenCalledTimes(1);
    expect(mocks.onCrearOportunidad).not.toHaveBeenCalled();
    expect(mocks.onCerrar).toHaveBeenCalledTimes(1);
  });

  it('with the section on it requires the deal name before calling anything', async () => {
    stubConsulta(200, { success: true, datos: DATOS });
    const mocks = montar();

    await crearConSeccion(mocks.onCrear, mocks.onCrearOportunidad, { 'Nombre de la oportunidad': '  ' });
    expect(screen.getByRole('alert')).toHaveTextContent('Falta el nombre de la oportunidad');
    expect(screen.getByLabelText(/^Nombre de la oportunidad/)).toHaveFocus();
    expect(mocks.onCrear).not.toHaveBeenCalled();
    expect(mocks.onCrearOportunidad).not.toHaveBeenCalled();
  });

  it('with the section on it calls onCrear first and then onCrearOportunidad with the returned id and trimmed fields', async () => {
    stubConsulta(200, { success: true, datos: DATOS });
    const ficha = empresa({ idEmpresa: 'e-5', razonSocial: DATOS.razonSocial });
    const onCrear = vi.fn<(cuerpo: Record<string, unknown>) => Promise<Empresa | { error: string }>>(async () => ficha);
    const onCrearOportunidad = vi.fn<
      (idEmpresa: string, cuerpo: Record<string, unknown>) => Promise<unknown | { error: string }>
    >(async () => ({ idOportunidad: 'o-9' }));
    const mocks = montar(onCrear, onCrearOportunidad);

    completarBase();
    activarSeccion();
    for (const [etiqueta, valor] of Object.entries({
      'Nombre de la oportunidad': ' Exámenes de ingreso 2026 ',
      'Servicio de interés': ' Exámenes ocupacionales ',
      Responsable: ' Luis Cárdenas ',
      'Monto estimado': '7500',
    })) {
      fireEvent.change(screen.getByLabelText(new RegExp(`^${etiqueta}`)), { target: { value: valor } });
    }
    await completarContactoYCrear();
    expect(onCrear).toHaveBeenCalledTimes(1);
    expect(mocks.onCrearOportunidad).toHaveBeenCalledTimes(1);
    expect(mocks.onCrearOportunidad).toHaveBeenCalledWith('e-5', {
      nombre: 'Exámenes de ingreso 2026',
      servicio: 'Exámenes ocupacionales',
      responsableNombre: 'Luis Cárdenas',
      montoEstimado: 7500,
    });
    expect(mocks.onCerrar).toHaveBeenCalledTimes(1);
  });

  it('sends origen when chosen and omits every empty optional', async () => {
    stubConsulta(200, { success: true, datos: DATOS });
    const mocks = montar();

    completarBase();
    activarSeccion();
    fireEvent.click(screen.getByRole('button', { name: /¿Cómo nos conoció?/ }));
    fireEvent.click(screen.getByRole('option', { name: /^Referido por un cliente/ }));
    await completarContactoYCrear();

    // The name is still required even when origen was chosen.
    expect(screen.getByRole('alert')).toHaveTextContent('Falta el nombre de la oportunidad');
    expect(mocks.onCrear).not.toHaveBeenCalled();
    expect(mocks.onCrearOportunidad).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Nombre de la oportunidad/), { target: { value: 'Exámenes 2026' } });
    await completarContactoYCrear();
    const cuerpo = mocks.onCrearOportunidad.mock.calls[0]![1];
    expect(cuerpo).toEqual({ nombre: 'Exámenes 2026', origen: 'referido' });
    expect(cuerpo).not.toHaveProperty('servicio');
    expect(cuerpo).not.toHaveProperty('montoEstimado');
    expect(mocks.onCerrar).toHaveBeenCalledTimes(1);
  });

  it('a monto of 0 is rejected client-side with the server message and focus on the field', async () => {
    stubConsulta(200, { success: true, datos: DATOS });
    const mocks = montar();

    completarBase();
    await crearConSeccion(mocks.onCrear, mocks.onCrearOportunidad, {
      'Nombre de la oportunidad': 'Algo',
      'Monto estimado': '0',
    });
    expect(screen.getByRole('alert')).toHaveTextContent('El monto estimado debe ser un número mayor a 0');
    expect(screen.getByLabelText(/^Monto estimado/)).toHaveFocus();
    expect(mocks.onCrear).not.toHaveBeenCalled();
  });

  it('if the deal fails the ficha stays created: the panel shows the error, a Reintentar affordance, and retry sends ONLY the deal', async () => {
    stubConsulta(200, { success: true, datos: DATOS });
    const ficha = empresa({ idEmpresa: 'e-5', razonSocial: DATOS.razonSocial });
    const onCrear = vi.fn<(cuerpo: Record<string, unknown>) => Promise<Empresa | { error: string }>>(async () => ficha);
    let fallo = true;
    const onCrearOportunidad = vi.fn<(idEmpresa: string, cuerpo: Record<string, unknown>) => Promise<unknown | { error: string }>>(
      async (_id, cuerpo) => (fallo ? { error: 'Error al crear la oportunidad' } : { idOportunidad: 'o-9', ...cuerpo }),
    );
    const mocks = montar(onCrear, onCrearOportunidad);

    completarBase();
    await crearConSeccion(onCrear, onCrearOportunidad);
    expect(onCrear).toHaveBeenCalledTimes(1);
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent(`La empresa «${DATOS.razonSocial}» quedó creada, pero la oportunidad no:`);
    expect(alerta).toHaveTextContent('Error al crear la oportunidad');
    const reintentar = screen.getByRole('button', { name: 'Reintentar oportunidad' });
    expect(reintentar).toBeEnabled();
    expect(mocks.onCerrar).not.toHaveBeenCalled();

    fallo = false;
    fireEvent.click(reintentar);
    await flush(0);
    // The retry re-sent ONLY the deal; the ficha was never created twice.
    expect(onCrear).toHaveBeenCalledTimes(1);
    expect(mocks.onCrearOportunidad).toHaveBeenCalledTimes(2);
    expect(mocks.onCrearOportunidad).toHaveBeenLastCalledWith('e-5', { nombre: 'Exámenes de ingreso 2026' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocks.onCerrar).toHaveBeenCalledTimes(1);
  });
});
