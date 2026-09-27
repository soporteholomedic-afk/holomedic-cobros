import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  ModalRespuesta,
  motivoDeRespuesta,
  payloadDeRespuesta,
} from './ModalRespuesta';

/**
 * Response-modal contract (task 9.3, spec OP-7, design D5): the operator
 * records the client's answer through the EXISTING transitions endpoint
 * (positive → AceptaciónOutbound semantics; negative → Rechazo with the
 * optional nota as motivo, falling back to 'No tiene interés' when left
 * empty — T14's motivo is server-required). Mock-verbatim UI including
 * the purple "Regla automática" explainer.
 *
 * Payload construction is a pure export (extract-before-mock); the
 * component is tested at the fetch seam only (useTransicion runs REAL).
 */

const fetchMock = vi.fn();

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function cuerposCapturados(): unknown[] {
  return fetchMock.mock.calls
    .filter((call) => String(call[0]).endsWith('/transiciones'))
    .map((call) => (typeof call[1]?.body === 'string' ? JSON.parse(call[1].body) : null));
}

function montar(overrides: Partial<Parameters<typeof ModalRespuesta>[0]> = {}): void {
  render(
    <ModalRespuesta
      empresaId={7}
      nombreEmpresa="Constructora A"
      preseleccion="positivo"
      onSalir={vi.fn()}
      onExito={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(okResponse({ success: true, pipeline: {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('payloadDeRespuesta + motivoDeRespuesta — pure', () => {
  it('positive → the existing AceptaciónOutbound event, no motivo', () => {
    expect(payloadDeRespuesta('positivo', 'pide cotización')).toEqual({
      evento: 'AceptaciónOutbound',
    });
  });

  it('negative → Rechazo with the trimmed nota as motivo', () => {
    expect(payloadDeRespuesta('negativo', '  contrato vigente  ')).toEqual({
      evento: 'Rechazo',
      motivo: 'contrato vigente',
    });
  });

  it('negative with a blank nota falls back to the shared motivo (T14 requires one)', () => {
    expect(motivoDeRespuesta('   ')).toBe('No tiene interés');
    expect(payloadDeRespuesta('negativo', '')).toEqual({
      evento: 'Rechazo',
      motivo: 'No tiene interés',
    });
  });
});

describe('ModalRespuesta (component)', () => {
  it('renders the mock header, empresa name and the Regla automática explainer', () => {
    montar();
    expect(
      screen.getByRole('dialog', { name: 'Registrar Respuesta del Cliente' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Constructora A')).toBeInTheDocument();
    expect(screen.getByText(/Regla automática:/)).toBeInTheDocument();
    expect(screen.getByText(/pausa de 3 meses/)).toBeInTheDocument();
  });

  it('defaults to the positive radio and accepts the preselección', () => {
    const { unmount } = render(
      <ModalRespuesta
        empresaId={7}
        nombreEmpresa="Constructora A"
        preseleccion="positivo"
        onSalir={vi.fn()}
        onExito={vi.fn()}
      />,
    );
    expect(
      (screen.getByRole('radio', { name: /Respuesta Positiva/ }) as HTMLInputElement).checked,
    ).toBe(true);
    unmount();

    render(
      <ModalRespuesta
        empresaId={7}
        nombreEmpresa="Minera B"
        preseleccion="negativo"
        onSalir={vi.fn()}
        onExito={vi.fn()}
      />,
    );
    expect(
      (screen.getByRole('radio', { name: /No tiene interés/ }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('positive submit POSTs AceptaciónOutbound and calls onExito', async () => {
    const onExito = vi.fn();
    montar({ onExito });

    await userEvent.click(screen.getByRole('button', { name: 'Guardar y Aplicar Regla' }));

    await waitFor(() => expect(onExito).toHaveBeenCalledTimes(1));
    expect(cuerposCapturados()).toEqual([{ evento: 'AceptaciónOutbound' }]);
  });

  it('negative submit POSTs Rechazo with the nota as motivo', async () => {
    const onExito = vi.fn();
    montar({ preseleccion: 'negativo', onExito });

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Comentario o nota (opcional):' }),
      'contrato vigente',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y Aplicar Regla' }));

    await waitFor(() => expect(onExito).toHaveBeenCalledTimes(1));
    expect(cuerposCapturados()).toEqual([
      { evento: 'Rechazo', motivo: 'contrato vigente' },
    ]);
  });

  it('negative with an empty nota still applies the rule (fallback motivo)', async () => {
    const onExito = vi.fn();
    montar({ preseleccion: 'negativo', onExito });

    await userEvent.click(screen.getByRole('button', { name: 'Guardar y Aplicar Regla' }));

    await waitFor(() => expect(onExito).toHaveBeenCalledTimes(1));
    expect(cuerposCapturados()).toEqual([
      { evento: 'Rechazo', motivo: 'No tiene interés' },
    ]);
  });

  it('surfaces the API error verbatim and keeps the form open', async () => {
    const onExito = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Transición no válida desde la etapa actual' }), {
        status: 400,
      }),
    );
    montar({ onExito });

    await userEvent.click(screen.getByRole('button', { name: 'Guardar y Aplicar Regla' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Transición no válida desde la etapa actual',
    );
    expect(onExito).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Guardar y Aplicar Regla' }),
    ).toBeInTheDocument();
  });

  it('Cancelar exits without any POST', async () => {
    const onSalir = vi.fn();
    montar({ onSalir });

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onSalir).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables the submit while the transition is in flight', async () => {
    let resolver: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((res) => {
        resolver = res;
      }),
    );
    montar();

    const boton = screen.getByRole('button', { name: 'Guardar y Aplicar Regla' });
    await userEvent.click(boton);
    expect(boton).toBeDisabled();

    resolver(okResponse({ success: true, pipeline: {} }));
    await waitFor(() => expect(boton).not.toBeDisabled());
  });
});
