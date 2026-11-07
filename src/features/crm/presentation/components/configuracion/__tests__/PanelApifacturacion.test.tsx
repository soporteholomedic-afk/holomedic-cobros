import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PanelApifacturacion } from '../PanelApifacturacion';

/**
 * UI contract of the apifacturacion panel (crm-consulta-sunat T2, spec
 * S2/S5; T8: rendered at the /configuracion/consulta-sunat tab): the
 * panel administers the apifacturacion token (masked,
 * replace/remove) and URL, shows the configured/source badge and runs
 * the paid "probar conexión" probe. fetch is stubbed at the global
 * boundary (useLookup.test precedent); NO backend module is mocked.
 */

interface Llamada {
  url: string;
  metodo: string;
  cuerpo?: unknown;
}

const RUTA = '/api/crm/configuracion/apifacturacion';

function respuesta(status: number, cuerpo: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(cuerpo) } as Response;
}

/** Dispatch stubbed fetch by `METODO ruta`; records every call. */
function stubFetch(
  rutas: Record<string, { status: number; cuerpo: unknown }>,
): { fetch: ReturnType<typeof vi.fn>; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  const fetchMock = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada).replace(
      'http://localhost:3000',
      '',
    );
    const metodo = (init?.method ?? 'GET').toUpperCase();
    llamadas.push({ url, metodo, cuerpo: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
    const plan = rutas[`${metodo} ${url}`];
    if (!plan) throw new Error(`fetch no preparado para ${metodo} ${url}`);
    return respuesta(plan.status, plan.cuerpo);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetch: fetchMock, llamadas };
}

interface CuerpoVista {
  success: boolean;
  configuracion: {
    configurado: boolean;
    tokenMascarado: string | null;
    url: string;
    fuente: string;
  };
}

const VISTA_CONFIGURADA: CuerpoVista = {
  success: true,
  configuracion: {
    configurado: true,
    tokenMascarado: '••••••••••••3456',
    url: 'https://api.apifacturacion.com',
    fuente: 'db',
  },
};

const VISTA_SIN_CONFIGURAR: CuerpoVista = {
  success: true,
  configuracion: {
    configurado: false,
    tokenMascarado: null,
    url: 'https://api.apifacturacion.com',
    fuente: 'ninguna',
  },
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PanelApifacturacion', () => {
  it('muestra la insignia de estado, la fuente y la URL al cargar', async () => {
    stubFetch({ [`GET ${RUTA}`]: { status: 200, cuerpo: VISTA_CONFIGURADA } });
    render(<PanelApifacturacion />);

    expect(await screen.findByText('Configurado')).toBeInTheDocument();
    expect(screen.getByText(/db/)).toBeInTheDocument();
    expect(screen.getByText('••••••••••••3456')).toBeInTheDocument();
    expect(screen.getByLabelText('URL de la API')).toHaveValue('https://api.apifacturacion.com');
  });

  it('sin token configurado muestra la insignia Sin configurar', async () => {
    stubFetch({ [`GET ${RUTA}`]: { status: 200, cuerpo: VISTA_SIN_CONFIGURAR } });
    render(<PanelApifacturacion />);

    expect((await screen.findAllByText('Sin configurar')).length).toBeGreaterThan(0);
    expect(screen.queryByText('••••••••••••3456')).not.toBeInTheDocument();
  });

  it('si la carga inicial falla muestra el error', async () => {
    stubFetch({ [`GET ${RUTA}`]: { status: 500, cuerpo: { success: false, error: 'No se pudo leer la configuración' } } });
    render(<PanelApifacturacion />);

    expect(await screen.findByText(/No se pudo leer la configuración/)).toBeInTheDocument();
  });

  it('Guardar envía la URL escrita y refresca el estado', async () => {
    const { llamadas } = stubFetch({
      [`GET ${RUTA}`]: { status: 200, cuerpo: VISTA_CONFIGURADA },
      [`PUT ${RUTA}`]: { status: 200, cuerpo: VISTA_CONFIGURADA },
    });
    const user = userEvent.setup();
    render(<PanelApifacturacion />);
    await screen.findByText('Configurado');

    const url = screen.getByLabelText('URL de la API');
    await user.clear(url);
    await user.type(url, 'https://api.qa.example.com');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      const put = llamadas.find((l) => l.metodo === 'PUT');
      expect(put?.cuerpo).toEqual({ url: 'https://api.qa.example.com' });
    });
    expect(llamadas.filter((l) => l.metodo === 'GET')).toHaveLength(2);
    expect(await screen.findByText('Configuración guardada')).toBeInTheDocument();
  });

  it('Reemplazar revela el campo del token y lo guarda (nunca se renderiza el valor actual)', async () => {
    const { llamadas } = stubFetch({
      [`GET ${RUTA}`]: { status: 200, cuerpo: VISTA_CONFIGURADA },
      [`PUT ${RUTA}`]: { status: 200, cuerpo: VISTA_CONFIGURADA },
    });
    const user = userEvent.setup();
    render(<PanelApifacturacion />);
    await screen.findByText('Configurado');

    await user.click(screen.getByRole('button', { name: 'Reemplazar Token de apifacturacion' }));
    const campo = screen.getByLabelText('Nuevo valor de Token de apifacturacion');
    expect(campo).toHaveAttribute('type', 'password');
    await user.type(campo, 'tok-nuevo-secreto');
    await user.click(screen.getByRole('button', { name: 'Guardar Token de apifacturacion' }));

    await waitFor(() => {
      const put = llamadas.find((l) => l.metodo === 'PUT');
      expect(put?.cuerpo).toEqual({ token: 'tok-nuevo-secreto' });
    });
    // El valor actual nunca se renderiza; solo la máscara del servidor.
    expect(screen.queryByDisplayValue('tok-nuevo-secreto')).not.toBeInTheDocument();
  });

  it('Quitar pide confirmación y envía token null', async () => {
    // Stateful stub: after a successful token deletion the refreshed GET
    // reflects the removed token (like the real server would).
    let vistaActual = VISTA_CONFIGURADA;
    const llamadas: Llamada[] = [];
    const fetchMock = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entrada).replace('http://localhost:3000', '');
      const metodo = (init?.method ?? 'GET').toUpperCase();
      if (metodo === 'GET' && url === RUTA) {
        return respuesta(200, vistaActual);
      }
      if (metodo === 'PUT' && url === RUTA) {
        const cuerpo: unknown = JSON.parse(String(init?.body));
        llamadas.push({ url, metodo, cuerpo });
        if (
          typeof cuerpo === 'object' &&
          cuerpo !== null &&
          (cuerpo as { token?: unknown }).token === null
        ) {
          vistaActual = VISTA_SIN_CONFIGURAR;
        }
        return respuesta(200, vistaActual);
      }
      throw new Error(`fetch no preparado para ${metodo} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<PanelApifacturacion />);
    await screen.findByText('Configurado');

    await user.click(screen.getByRole('button', { name: 'Quitar Token de apifacturacion' }));
    expect(screen.getByText(/Se eliminará/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sí, quitar Token de apifacturacion' }));

    await waitFor(() => {
      const put = llamadas.find((l) => l.metodo === 'PUT');
      expect(put?.cuerpo).toEqual({ token: null });
    });
    expect((await screen.findAllByText('Sin configurar')).length).toBeGreaterThan(0);
  });

  it('un rechazo del servidor al guardar muestra el mensaje de error', async () => {
    stubFetch({
      [`GET ${RUTA}`]: { status: 200, cuerpo: VISTA_CONFIGURADA },
      [`PUT ${RUTA}`]: {
        status: 400,
        cuerpo: { success: false, error: 'La URL debe ser una URL http(s) válida' },
      },
    });
    const user = userEvent.setup();
    render(<PanelApifacturacion />);
    await screen.findByText('Configurado');

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/La URL debe ser una URL http\(s\) válida/)).toBeInTheDocument();
  });

  it('Probar conexión consulta la API y muestra el resultado; el aviso de consulta paga está presente', async () => {
    const { llamadas } = stubFetch({
      [`GET ${RUTA}`]: { status: 200, cuerpo: VISTA_CONFIGURADA },
      [`POST ${RUTA}/probar`]: {
        status: 200,
        cuerpo: { success: true, ok: true, mensaje: 'Consulta de prueba correcta: "CONSTRUCTORES ANDINA S.A.C."' },
      },
    });
    const user = userEvent.setup();
    render(<PanelApifacturacion />);
    await screen.findByText('Configurado');

    expect(screen.getByText(/consume una consulta/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Probar conexión' }));

    expect(
      await screen.findByText(/CONSTRUCTORES ANDINA S\.A\.C\./),
    ).toBeInTheDocument();
    expect(llamadas.find((l) => l.metodo === 'POST')?.url).toBe(`${RUTA}/probar`);
  });

  it('una prueba fallida muestra el mensaje genérico sin romper el panel', async () => {
    stubFetch({
      [`GET ${RUTA}`]: { status: 200, cuerpo: VISTA_CONFIGURADA },
      [`POST ${RUTA}/probar`]: {
        status: 200,
        cuerpo: { success: true, ok: false, mensaje: 'apifacturacion no respondió a tiempo' },
      },
    });
    const user = userEvent.setup();
    render(<PanelApifacturacion />);
    await screen.findByText('Configurado');

    await user.click(screen.getByRole('button', { name: 'Probar conexión' }));
    expect(await screen.findByText(/no respondió a tiempo/)).toBeInTheDocument();
    expect(screen.getByText('Configurado')).toBeInTheDocument();
  });
});
