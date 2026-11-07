import { act, fireEvent, render, screen } from '@testing-library/react';
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

type OnCrearMock = ReturnType<
  typeof vi.fn<(cuerpo: Record<string, unknown>) => Promise<Empresa | { error: string }>>
>;

function montar(onCrear: OnCrearMock = vi.fn(async () => empresa())) {
  render(
    <AltaPanel
      sectores={['Salud']}
      oculto={false}
      onCerrar={vi.fn()}
      onCrearSector={vi.fn(async () => 'creado')}
      onCrear={onCrear}
    />,
  );
  return onCrear;
}

function escribirRuc(valor: string): void {
  fireEvent.change(screen.getByLabelText(/^RUC/), { target: { value: valor } });
}

async function completarContactoYCrear(): Promise<void> {
  fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'Marcela Quispe' } });
  fireEvent.change(screen.getByLabelText(/^Teléfono/), { target: { value: '987654321' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear empresa' }));
  await flush(0);
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
    const onCrear = montar();

    escribirRuc(RUC);
    await flush(600);

    expect((screen.getByLabelText(/^Razón social/) as HTMLInputElement).value).toBe(DATOS.razonSocial);
    expect((screen.getByLabelText('Dirección fiscal') as HTMLInputElement).value).toBe(DATOS.direccion);
    const chip = screen.getByText('ACTIVO · HABIDO');
    expect(chip).toBeInTheDocument();
    expect(chip.className).toMatch(/emerald/);

    await completarContactoYCrear();
    expect(onCrear).toHaveBeenCalledWith(
      expect.objectContaining({
        razonSocial: DATOS.razonSocial,
        ruc: RUC,
        direccion: DATOS.direccion,
      }),
    );
  });

  it('does not overwrite a razón social the user typed before the lookup, but still fills dirección + badge', async () => {
    stubConsulta(200, { success: true, datos: DATOS });
    const onCrear = montar();

    fireEvent.change(screen.getByLabelText(/^Razón social/), { target: { value: 'Mi Clínica Local S.A.C.' } });
    escribirRuc(RUC);
    await flush(600);

    expect((screen.getByLabelText(/^Razón social/) as HTMLInputElement).value).toBe('Mi Clínica Local S.A.C.');
    expect((screen.getByLabelText('Dirección fiscal') as HTMLInputElement).value).toBe(DATOS.direccion);
    expect(screen.getByText('ACTIVO · HABIDO')).toBeInTheDocument();

    await completarContactoYCrear();
    expect(onCrear).toHaveBeenCalledWith(
      expect.objectContaining({ razonSocial: 'Mi Clínica Local S.A.C.', direccion: DATOS.direccion }),
    );
  });

  it('manual typing after the autofill wins in the payload', async () => {
    stubConsulta(200, { success: true, datos: DATOS });
    const onCrear = montar();

    escribirRuc(RUC);
    await flush(600);
    fireEvent.change(screen.getByLabelText(/^Razón social/), { target: { value: 'Nombre Editado S.A.C.' } });

    await completarContactoYCrear();
    expect(onCrear).toHaveBeenCalledWith(
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
    const onCrear = montar();

    escribirRuc(RUC);
    await flush(600);

    expect(screen.getByText(`No se encontraron datos SUNAT para el RUC: ${RUC}`)).toBeInTheDocument();
    expect(screen.queryByText('ACTIVO · HABIDO')).toBeNull();

    fireEvent.change(screen.getByLabelText(/^Razón social/), { target: { value: 'Escrita a mano S.A.C.' } });
    await completarContactoYCrear();
    const cuerpo = onCrear.mock.calls[0]![0];
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
    const onCrear = montar();

    escribirRuc(RUC);
    await flush(600);
    expect((screen.getByLabelText('Dirección fiscal') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('ACTIVO · HABIDO')).toBeNull();

    await completarContactoYCrear();
    const cuerpo = onCrear.mock.calls[0]![0];
    expect(cuerpo).not.toHaveProperty('direccion');
  });
});
