import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { DatosSunat } from '../../../domain/entities';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { CrmBoard } from '../CrmBoard';
import { empresa, json, llamadas, mockApi, oportunidad, type Respuesta } from './crmFixtures';

const SIN_RUC = 'Clínica Santa Rosa';
const OTRA = 'Constructora Andina S.A.C.';
const RUC_LIBRE = '20111222333';
const RUC_DE_OTRA = '20512345678';
const URL_RUC = '/api/crm/empresas/e-10/ruc';

const LISTA_RUC = [
  empresa(),
  empresa({
    idEmpresa: 'e-10',
    razonSocial: SIN_RUC,
    ruc: null,
    sector: null,
    contactos: [{ nombre: 'Mónica Paredes', telefono: '945 210 334', correo: null }],
  }),
];

/** A ficha only reaches the board through its oportunidades (S2): e-10 needs one. */
const OPORTUNIDADES_RUC = [
  oportunidad(),
  oportunidad({ idOportunidad: 'o-10', idEmpresa: 'e-10', nombre: 'Consultoría de bioseguridad', etapa: 'contactado', medio: 'whatsapp' }),
];

type Rutas = (body: Record<string, unknown>) => Respuesta;

function montar(ruc: Rutas) {
  mockApi({
    lista: { status: 200, body: { success: true, empresas: LISTA_RUC } },
    oportunidades: { status: 200, body: { success: true, oportunidades: OPORTUNIDADES_RUC } },
  });
  const base = global.fetch;
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url === URL_RUC && method === 'PATCH') return json(ruc(JSON.parse(String(init?.body))));
    return base(url, init);
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

/** Like `montar`, but also answers the SUNAT lookup GET /api/crm/ruc/{RUC_LIBRE}. */
function montarConConsulta(consulta: Respuesta, rucResponde: Rutas = () => ok(RUC_LIBRE)) {
  mockApi({
    lista: { status: 200, body: { success: true, empresas: LISTA_RUC } },
    oportunidades: { status: 200, body: { success: true, oportunidades: OPORTUNIDADES_RUC } },
  });
  const base = global.fetch;
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url === URL_RUC && method === 'PATCH') return json(rucResponde(JSON.parse(String(init?.body))));
    if (url === `/api/crm/ruc/${RUC_LIBRE}` && method === 'GET') return json(consulta);
    return base(url, init);
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const tarjetas = () => within(screen.getByTestId('crm-board')).getAllByRole('heading', { level: 3 });

function tarjeta(nombre: string): HTMLElement {
  return screen.getByRole('heading', { level: 3, name: nombre }).closest('article') as HTMLElement;
}

async function abierto(): Promise<HTMLElement> {
  await screen.findByText(OTRA);
  fireEvent.click(within(tarjeta(SIN_RUC)).getByRole('heading', { level: 3 }));
  return screen.getByRole('dialog', { name: SIN_RUC });
}

const campoRuc = (panel: HTMLElement) => within(panel).getByLabelText('RUC');
const escribir = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
const guardar = (panel: HTMLElement) => fireEvent.click(within(panel).getByRole('button', { name: 'Guardar RUC' }));

const ok = (ruc: string): Respuesta => ({
  status: 200,
  body: { success: true, empresa: { ...LISTA_RUC[1], ruc, updatedAt: '2026-10-31T16:00:00.000Z' } },
});
const conflicto: Respuesta = {
  status: 409,
  body: {
    success: false,
    error: `Este RUC ya es de ${OTRA} («Prospecto»). ¿Unir las dos fichas?`,
    otra: { idEmpresa: 'e-1', razonSocial: OTRA, relacion: 'prospecto' },
  },
};

beforeEach(() => {
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

afterEach(() => vi.restoreAllMocks());

describe('Detalle — completar el RUC', () => {
  it('shows "Falta RUC" with the inline field, its hidden label, numeric keypad, 11 chars and the placeholder', async () => {
    montar(() => ok(RUC_LIBRE));
    render(<CrmBoard />);
    const panel = await abierto();
    expect(within(panel).getByText('Falta RUC').className).toMatch(/amber/);
    const campo = campoRuc(panel);
    expect(campo).toHaveAttribute('inputmode', 'numeric');
    expect(campo).toHaveAttribute('maxlength', '11');
    expect(campo).toHaveAttribute('placeholder', '11 dígitos');
    expect(within(panel).getByText('RUC', { selector: 'label' }).className).toMatch(/sr-only/);
    expect(within(panel).getByRole('button', { name: 'Guardar RUC' })).toBeInTheDocument();
  });

  it('with a RUC it shows the number and no field, as before', async () => {
    montar(() => ok(RUC_LIBRE));
    render(<CrmBoard />);
    await screen.findByText(OTRA);
    fireEvent.click(within(tarjeta(OTRA)).getByRole('heading', { level: 3 }));
    const panel = screen.getByRole('dialog', { name: OTRA });
    expect(within(panel).getByText(RUC_DE_OTRA)).toBeInTheDocument();
    expect(within(panel).queryByText('Falta RUC')).toBeNull();
    expect(within(panel).queryByLabelText('RUC')).toBeNull();
  });

  it.each([['vacío', ''], ['corto', '123'], ['con letras', '2051234567a']])(
    'an invalid RUC (%s) sends nothing, shows the message linked to the field and focuses it',
    async (_n, valor) => {
      const fn = montar(() => ok(RUC_LIBRE));
      render(<CrmBoard />);
      const panel = await abierto();
      escribir(campoRuc(panel), valor);
      guardar(panel);
      const error = within(panel).getByText('El RUC debe tener 11 dígitos.');
      expect(error).toHaveAttribute('role', 'alert');
      expect(campoRuc(panel)).toHaveAttribute('aria-describedby', error.id);
      expect(campoRuc(panel)).toHaveFocus();
      expect(llamadas(fn, 'PATCH', /ruc$/)).toHaveLength(0);
    },
  );

  it('saves a free RUC: PATCH with the digits, the card is updated, the field disappears and a toast confirms', async () => {
    const fn = montar(() => ok(RUC_LIBRE));
    render(<CrmBoard />);
    const panel = await abierto();
    escribir(campoRuc(panel), ` ${RUC_LIBRE} `.trim());
    guardar(panel);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('RUC guardado.'));
    expect(llamadas(fn, 'PATCH', /ruc$/)).toEqual([{ url: URL_RUC, body: { ruc: RUC_LIBRE } }]);
    expect(fn.mock.calls.find(([u]) => u === URL_RUC)?.[1]?.method).toBe('PATCH');
    expect(within(panel).getByText(RUC_LIBRE)).toBeInTheDocument();
    expect(within(panel).queryByLabelText('RUC')).toBeNull();
    expect(within(tarjeta(SIN_RUC)).queryByText('Falta RUC')).toBeNull();
    expect(within(tarjeta(SIN_RUC)).getByText(`RUC ${RUC_LIBRE}`)).toBeInTheDocument();
  });

  it('another error shows the server message as an error toast', async () => {
    montar(() => ({ status: 500, body: { success: false, error: 'Falló el servidor' } }));
    render(<CrmBoard />);
    const panel = await abierto();
    escribir(campoRuc(panel), RUC_LIBRE);
    guardar(panel);
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Falló el servidor'));
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(within(panel).getByText('Falta RUC')).toBeInTheDocument();
  });
});

describe('Detalle — RUC de otra ficha: unir fichas', () => {
  async function conflictoAbierto(fn = montar((b) => (b.unir ? merged() : conflicto))) {
    render(<CrmBoard />);
    const panel = await abierto();
    escribir(campoRuc(panel), RUC_DE_OTRA);
    guardar(panel);
    const caja = await within(panel).findByRole('alert');
    return { fn, panel, caja };
  }

  const merged = (): Respuesta => ({
    status: 200,
    body: {
      success: true,
      empresa: empresa({ updatedAt: '2026-10-31T16:05:00.000Z' }),
    },
  });

  it('a 409 shows the question with the other ficha and its relación, the note, and the two buttons with the focus on "Unir fichas"', async () => {
    const { panel, caja } = await conflictoAbierto();
    expect(caja).toHaveTextContent('Este RUC ya es de Constructora Andina S.A.C. («Prospecto»). ¿Unir las dos fichas?');
    expect(within(caja).getByText(OTRA, { selector: 'b' })).toBeInTheDocument();
    expect(
      within(panel).getByText(
        `El historial y los contactos de «${SIN_RUC}» pasan a «${OTRA}» y esta ficha desaparece.`,
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Unir fichas' })).toHaveFocus();
    expect(within(panel).getByRole('button', { name: 'No unir' })).toBeInTheDocument();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('"No unir" goes back to the input, sends nothing more and leaves both fichas unchanged', async () => {
    const { fn, panel } = await conflictoAbierto();
    fireEvent.click(within(panel).getByRole('button', { name: 'No unir' }));
    expect(within(panel).queryByRole('button', { name: 'Unir fichas' })).toBeNull();
    expect(campoRuc(panel)).toHaveFocus();
    expect(campoRuc(panel)).toHaveValue(RUC_DE_OTRA);
    expect(llamadas(fn, 'PATCH', /ruc$/)).toEqual([{ url: URL_RUC, body: { ruc: RUC_DE_OTRA } }]);
    expect(within(tarjeta(SIN_RUC)).getByText('Falta RUC')).toBeInTheDocument();
    expect(within(tarjeta(OTRA)).getByText(`RUC ${RUC_DE_OTRA}`)).toBeInTheDocument();
    expect(tarjetas()).toHaveLength(2);
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('before confirming, both fichas stay as they were', async () => {
    await conflictoAbierto();
    expect(within(tarjeta(SIN_RUC)).getByText('Falta RUC')).toBeInTheDocument();
    expect(within(tarjeta(OTRA)).getByText(`RUC ${RUC_DE_OTRA}`)).toBeInTheDocument();
  });

  it('"Unir fichas" repeats the PATCH with unir:true, removes this ficha, updates the other, keeps the panel on it and toasts', async () => {
    const { fn, panel } = await conflictoAbierto();
    fireEvent.click(within(panel).getByRole('button', { name: 'Unir fichas' }));
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(`Fichas unidas. El historial quedó en «${OTRA}».`),
    );
    expect(llamadas(fn, 'PATCH', /ruc$/)).toEqual([
      { url: URL_RUC, body: { ruc: RUC_DE_OTRA } },
      { url: URL_RUC, body: { ruc: RUC_DE_OTRA, unir: true } },
    ]);
    expect(within(screen.getByTestId('crm-board')).queryByRole('heading', { level: 3, name: SIN_RUC })).toBeNull();
    expect(tarjetas()).toHaveLength(1);
    const col = screen.getByRole('region', { name: 'Por contactar' });
    expect(within(col).getByRole('heading', { level: 3, name: OTRA })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: SIN_RUC })).toBeNull();
    const abierto = screen.getByRole('dialog', { name: OTRA });
    expect(within(abierto).getByText(RUC_DE_OTRA)).toBeInTheDocument();
    expect(within(abierto).queryByLabelText('RUC')).toBeNull();
  });

  it('a failed merge shows the server message and keeps both fichas', async () => {
    const { panel } = await conflictoAbierto(
      montar((b) => (b.unir ? { status: 500, body: { success: false, error: 'No se pudo unir' } } : conflicto)),
    );
    fireEvent.click(within(panel).getByRole('button', { name: 'Unir fichas' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No se pudo unir'));
    expect(tarjetas()).toHaveLength(2);
  });
});

describe('Detalle — editar una empresa sin RUC', () => {
  it('keeps the RUC optional in the form: an empty RUC is sent as null, and a wrong one still needs 11 digits', async () => {
    const put = vi.fn((_id: string, b: Record<string, unknown>): Respuesta => ({
      status: 200,
      body: { success: true, empresa: { ...LISTA_RUC[1], razonSocial: b.razonSocial, ruc: b.ruc } },
    }));
    mockApi({
      lista: { status: 200, body: { success: true, empresas: LISTA_RUC } },
      oportunidades: { status: 200, body: { success: true, oportunidades: OPORTUNIDADES_RUC } },
      put,
    });
    render(<CrmBoard />);
    const panel = await abierto();
    fireEvent.click(within(panel).getByRole('button', { name: 'Editar' }));
    const ruc = within(panel).getByLabelText(/^RUC/);
    expect(ruc).toHaveValue('');
    expect(within(panel).getByText('RUC', { selector: 'span' }).textContent).not.toMatch(/\*/);
    escribir(ruc, '123');
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar cambios' }));
    expect(within(panel).getByText('El RUC debe tener 11 dígitos.')).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
    escribir(ruc, '');
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0]![1]).toMatchObject({ razonSocial: SIN_RUC, ruc: null });
  });
});

describe('Detalle — consulta SUNAT al completar el RUC (S3)', () => {
  const DATOS_SUNAT: DatosSunat = {
    razonSocial: 'Clínica Santa Rosa S.A.C.',
    direccion: 'Jr. Las Palmas 456, Lima',
    estado: 'ACTIVO',
    condicion: 'HABIDO',
  };

  const esperarConsulta = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 650));
    });
  };

  it('shows the SUNAT preview above the save buttons and the PATCH body stays {ruc}', async () => {
    const fn = montarConConsulta({ status: 200, body: { success: true, datos: DATOS_SUNAT } });
    render(<CrmBoard />);
    const panel = await abierto();

    escribir(campoRuc(panel), RUC_LIBRE);
    await esperarConsulta();
    expect(within(panel).getByText('Clínica Santa Rosa S.A.C.')).toBeInTheDocument();
    expect(within(panel).getByText('ACTIVO · HABIDO')).toBeInTheDocument();

    guardar(panel);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('RUC guardado.'));
    expect(llamadas(fn, 'PATCH', /ruc$/)).toEqual([{ url: URL_RUC, body: { ruc: RUC_LIBRE } }]);
  });

  it('a lookup failure (503) is non-blocking: inline message and the save still PATCHes the typed RUC', async () => {
    const fn = montarConConsulta({
      status: 503,
      body: {
        success: false,
        error: 'La consulta SUNAT no está configurada. Configura el token de apifacturacion en Configuración.',
      },
    });
    render(<CrmBoard />);
    const panel = await abierto();

    escribir(campoRuc(panel), RUC_LIBRE);
    await esperarConsulta();
    expect(within(panel).getByText(/no está configurada/)).toBeInTheDocument();
    expect(within(panel).queryByText('ACTIVO · HABIDO')).toBeNull();

    guardar(panel);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('RUC guardado.'));
    expect(llamadas(fn, 'PATCH', /ruc$/)).toEqual([{ url: URL_RUC, body: { ruc: RUC_LIBRE } }]);
  });
});
