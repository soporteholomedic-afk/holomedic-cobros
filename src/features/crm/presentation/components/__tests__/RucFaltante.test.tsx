import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatosSunat } from '../../../domain/entities';
import { RucFaltante, type ResultadoRuc } from '../RucFaltante';

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

type OnGuardarMock = ReturnType<typeof vi.fn<(ruc: string, unir: boolean) => Promise<ResultadoRuc>>>;

function montar(onGuardar: OnGuardarMock = vi.fn(async () => ({ tipo: 'ok' as const }))) {
  render(<RucFaltante razonSocial="Clínica sin RUC" onGuardar={onGuardar} />);
  return onGuardar;
}

const escribir = (v: string) => fireEvent.change(screen.getByLabelText('RUC'), { target: { value: v } });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RucFaltante — consulta SUNAT al tipear (T6, S3)', () => {
  it('shows the SUNAT preview (razón social + estado/condición badge) above the save buttons', async () => {
    stubConsulta(200, { success: true, datos: DATOS });
    montar();

    escribir(RUC);
    await flush(600);

    expect(screen.getByText(DATOS.razonSocial)).toBeInTheDocument();
    const chip = screen.getByText('ACTIVO · HABIDO');
    expect(chip.className).toMatch(/emerald/);
    expect((screen.getByLabelText('RUC') as HTMLInputElement).value).toBe(RUC);
    expect(screen.getByRole('button', { name: 'Guardar RUC' })).toBeInTheDocument();
  });

  it('the save contract is unchanged: onGuardar receives the typed RUC with unir=false', async () => {
    stubConsulta(200, { success: true, datos: DATOS });
    const onGuardar = montar();

    escribir(RUC);
    await flush(600);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar RUC' }));
    await flush(0);

    expect(onGuardar).toHaveBeenCalledTimes(1);
    expect(onGuardar).toHaveBeenCalledWith(RUC, false);
  });

  it('a 404 keeps saving possible: inline message, no preview, onGuardar still called', async () => {
    stubConsulta(404, { success: false, error: `No se encontraron datos SUNAT para el RUC: ${RUC}` });
    const onGuardar = montar();

    escribir(RUC);
    await flush(600);
    expect(screen.getByText(`No se encontraron datos SUNAT para el RUC: ${RUC}`)).toBeInTheDocument();
    expect(screen.queryByText(DATOS.razonSocial)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar RUC' }));
    await flush(0);
    expect(onGuardar).toHaveBeenCalledWith(RUC, false);
  });

  it.each([
    [503, 'no está configurada'],
    [502, 'apifacturacion no respondió'],
  ])('a %i shows a non-blocking inline message', async (status, fragmento) => {
    stubConsulta(status, { success: false, error: status === 503 ? 'La consulta SUNAT no está configurada. Configura el token de apifacturacion en Configuración.' : 'apifacturacion no respondió' });
    montar();

    escribir(RUC);
    await flush(600);
    expect(screen.getByText(new RegExp(fragmento.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar RUC' })).toBeEnabled();
  });

  it('clearing the RUC back below 11 digits hides the preview', async () => {
    stubConsulta(200, { success: true, datos: DATOS });
    montar();

    escribir(RUC);
    await flush(600);
    expect(screen.getByText(DATOS.razonSocial)).toBeInTheDocument();

    escribir('2051234567');
    await flush(600);
    expect(screen.queryByText(DATOS.razonSocial)).toBeNull();
  });
});

describe('RucFaltante — RUC de otra ficha (T7: nueva forma de `otra`)', () => {
  it.each([
    ['prospecto', '(«Prospecto»)'],
    ['cliente', '(«Cliente»)'],
  ])('a conflict with relacion %s renders the domain message and asks to merge the fichas', async (relacion, chip) => {
    const onGuardar = montar(
      vi.fn(async () => ({
        tipo: 'conflicto' as const,
        otra: { idEmpresa: 'e-1', razonSocial: 'Constructora Andina S.A.C.', relacion },
      })),
    );

    escribir(RUC);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar RUC' }));
    await flush(0);

    const caja = screen.getByRole('alert');
    expect(caja).toHaveTextContent(`Este RUC ya es de Constructora Andina S.A.C. ${chip}. ¿Unir las dos fichas?`);
    expect(screen.getByRole('button', { name: 'Unir fichas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No unir' })).toBeInTheDocument();
    expect(onGuardar).toHaveBeenCalledWith(RUC, false);
  });
});
