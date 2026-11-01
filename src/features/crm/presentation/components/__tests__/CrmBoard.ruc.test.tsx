import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { CrmBoard } from '../CrmBoard';
import { empresa, json, llamadas, mockApi, type Respuesta } from './crmFixtures';

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
    etapa: 'contactado',
    medio: 'whatsapp',
    contactos: [{ nombre: 'Mónica Paredes', telefono: '945 210 334', correo: null }],
  }),
];

type Rutas = (body: Record<string, unknown>) => Respuesta;

function montar(ruc: Rutas) {
  mockApi({ lista: { status: 200, body: { success: true, empresas: LISTA_RUC } } });
  const base = global.fetch;
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url === URL_RUC && method === 'PATCH') return json(ruc(JSON.parse(String(init?.body))));
    if (url.endsWith('/historial')) return json({ status: 200, body: { success: true, interacciones: [] } });
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
  body: { success: false, error: 'Ese RUC ya existe', otra: { idEmpresa: 'e-1', razonSocial: OTRA, etapa: 'por_contactar' } },
};

beforeEach(() => {
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

afterEach(() => vi.restoreAllMocks());

describe('Detalle — cabecera y próxima acción', () => {
  it('writes the follow-up label after the stage name in the subtitle', async () => {
    mockApi({
      lista: {
        status: 200,
        body: { success: true, empresas: [empresa({ etapa: 'contactado', medio: 'llamada', intentosSinRespuesta: 2 })] },
      },
    });
    const base = global.fetch;
    global.fetch = vi.fn(async (u: string, i?: RequestInit) =>
      u.endsWith('/historial') ? json({ status: 200, body: { interacciones: [] } }) : base(u, i),
    ) as unknown as typeof fetch;
    render(<CrmBoard />);
    await screen.findByText(OTRA);
    fireEvent.click(within(tarjeta(OTRA)).getByRole('heading', { level: 3 }));
    const cabecera = screen.getByRole('dialog', { name: OTRA }).querySelector('header') as HTMLElement;
    expect(cabecera).toHaveTextContent('Contactado · Sin respuesta · 2');
  });

  it('shows the next action with its date, "Vencida: " when overdue, or "Sin próxima acción"', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T16:00:00.000Z'));
    mockApi({
      lista: {
        status: 200,
        body: {
          success: true,
          empresas: [
            empresa({ idEmpresa: 'a', razonSocial: 'Futura S.A.', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-02' } }),
            empresa({ idEmpresa: 'b', razonSocial: 'Vencida S.A.', ruc: '20000000002', proximaAccion: { tipo: 'cotizar', detalle: null, fecha: '2026-10-29' } }),
            empresa({ idEmpresa: 'c', razonSocial: 'Libre S.A.', ruc: '20000000003' }),
          ],
        },
      },
    });
    const base = global.fetch;
    global.fetch = vi.fn(async (u: string, i?: RequestInit) =>
      u.endsWith('/historial') ? json({ status: 200, body: { interacciones: [] } }) : base(u, i),
    ) as unknown as typeof fetch;
    render(<CrmBoard />);
    await screen.findByText('Futura S.A.');
    const abrir = (n: string) => {
      fireEvent.click(within(tarjeta(n)).getByRole('heading', { level: 3 }));
      return screen.getByRole('dialog', { name: n });
    };
    let panel = abrir('Futura S.A.');
    expect(within(panel).getByText('Llamar · lun 2 nov')).toBeInTheDocument();
    panel = abrir('Vencida S.A.');
    const vencida = within(panel).getByText('Vencida: Enviar cotización · jue 29 oct');
    expect(vencida.className).toMatch(/red/);
    panel = abrir('Libre S.A.');
    expect(within(panel).getByText('Sin próxima acción').className).toMatch(/slate/);
    vi.useRealTimers();
  });
});

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

describe('Detalle — RUC de otra empresa: unir tarjetas', () => {
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
      empresa: empresa({
        intentosSinRespuesta: 0,
        etapa: 'contactado',
        medio: 'llamada',
        faltaResponderDesde: '2026-10-31T15:40:00.000Z',
        updatedAt: '2026-10-31T16:05:00.000Z',
      }),
    },
  });

  it('a 409 shows the question with the other empresa and its stage, the note, and the two buttons with the focus on "Unir tarjetas"', async () => {
    const { panel, caja } = await conflictoAbierto();
    expect(caja).toHaveTextContent('Este RUC ya es de Constructora Andina S.A.C. («Por contactar»). ¿Unir las dos tarjetas?');
    expect(within(caja).getByText(OTRA, { selector: 'b' })).toBeInTheDocument();
    expect(
      within(panel).getByText(
        `El historial y los contactos de «${SIN_RUC}» pasan a «${OTRA}» y esta tarjeta desaparece.`,
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Unir tarjetas' })).toHaveFocus();
    expect(within(panel).getByRole('button', { name: 'No unir' })).toBeInTheDocument();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('"No unir" goes back to the input, sends nothing more and leaves both cards unchanged', async () => {
    const { fn, panel } = await conflictoAbierto();
    fireEvent.click(within(panel).getByRole('button', { name: 'No unir' }));
    expect(within(panel).queryByRole('button', { name: 'Unir tarjetas' })).toBeNull();
    expect(campoRuc(panel)).toHaveFocus();
    expect(campoRuc(panel)).toHaveValue(RUC_DE_OTRA);
    expect(llamadas(fn, 'PATCH', /ruc$/)).toEqual([{ url: URL_RUC, body: { ruc: RUC_DE_OTRA } }]);
    expect(within(tarjeta(SIN_RUC)).getByText('Falta RUC')).toBeInTheDocument();
    expect(within(tarjeta(OTRA)).getByText(`RUC ${RUC_DE_OTRA}`)).toBeInTheDocument();
    expect(tarjetas()).toHaveLength(2);
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('before confirming, both cards stay as they were', async () => {
    await conflictoAbierto();
    expect(within(tarjeta(SIN_RUC)).getByText('Falta RUC')).toBeInTheDocument();
    expect(within(tarjeta(OTRA)).queryByText('Falta responder', { exact: false })).toBeNull();
  });

  it('"Unir tarjetas" repeats the PATCH with unir:true, removes this card, updates the other, keeps the panel on it and toasts', async () => {
    const { fn, panel } = await conflictoAbierto();
    fireEvent.click(within(panel).getByRole('button', { name: 'Unir tarjetas' }));
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(`Tarjetas unidas. El historial quedó en «${OTRA}».`),
    );
    expect(llamadas(fn, 'PATCH', /ruc$/)).toEqual([
      { url: URL_RUC, body: { ruc: RUC_DE_OTRA } },
      { url: URL_RUC, body: { ruc: RUC_DE_OTRA, unir: true } },
    ]);
    expect(within(screen.getByTestId('crm-board')).queryByRole('heading', { level: 3, name: SIN_RUC })).toBeNull();
    expect(tarjetas()).toHaveLength(1);
    // The other card now shows the merged data: moved to Contactado, waiting for a reply.
    const col = screen.getByRole('region', { name: 'Contactado' });
    expect(within(col).getByRole('heading', { level: 3, name: OTRA })).toBeInTheDocument();
    expect(within(col).getByText(/^Falta responder/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: SIN_RUC })).toBeNull();
    const abierto = screen.getByRole('dialog', { name: OTRA });
    expect(within(abierto).getByText(RUC_DE_OTRA)).toBeInTheDocument();
    expect(within(abierto).queryByLabelText('RUC')).toBeNull();
  });

  it('a failed merge shows the server message and keeps both cards', async () => {
    const { panel } = await conflictoAbierto(
      montar((b) => (b.unir ? { status: 500, body: { success: false, error: 'No se pudo unir' } } : conflicto)),
    );
    fireEvent.click(within(panel).getByRole('button', { name: 'Unir tarjetas' }));
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
    mockApi({ lista: { status: 200, body: { success: true, empresas: LISTA_RUC } }, put });
    const base = global.fetch;
    global.fetch = vi.fn(async (u: string, i?: RequestInit) =>
      u.endsWith('/historial') ? json({ status: 200, body: { interacciones: [] } }) : base(u, i),
    ) as unknown as typeof fetch;
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
