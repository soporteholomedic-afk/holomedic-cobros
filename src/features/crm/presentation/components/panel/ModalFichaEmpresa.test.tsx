import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  construirLineaTiempo,
  ModalFichaEmpresa,
  plantillaSiguienteDeEstado,
} from './ModalFichaEmpresa';
import { derivarPanel } from '../../panelDerivado';
import type { EstadoPanel } from '../../estadoPanel';
import type { DetalleEmpresa } from '../../../application/obtenerDetalleEmpresa';
import type { EnvioCorreoHistorial, FilaPanelCrm } from '../../../domain/ports';

/**
 * Ficha modal contract (task 9.1, spec OP-6 + EM-6): opens with the
 * empresa header + contacto/rubro cards rendered immediately from the
 * derived panel row, then the timeline (registro + transiciones ∪
 * envios, task 7.3 read) once the detalle lands. Quick actions
 * (respuesta positiva/negativa + "Enviar el siguiente correo de
 * recordatorio ahora") disable when the empresa already responded, and
 * the send rides the EXISTING POST /envios endpoint (task 5.2) with the
 * plantilla the pure `plantillaSiguienteDeEstado` resolves.
 *
 * Mock at the fetch seam only (useEmpresaDetalle runs REAL); the
 * respuesta modal is a callback prop — PanelCrm owns it (batch 13).
 */

const HOY = '2026-09-15';

function fila(overrides: Partial<FilaPanelCrm> = {}): FilaPanelCrm {
  return {
    empresaId: 1,
    razonSocial: 'Constructora A',
    ruc: '20489561234',
    tipo: 'Prospecto',
    responsable: null,
    sector: 'Construcción',
    cantidadTrabajadores: 45,
    createdAt: '2026-09-01T09:30:00.000Z',
    flujo: 'OUTBOUND',
    etapa: 'CADENCIA',
    ciclo: 1,
    enviosCiclo: 1,
    fechaCicloInicio: '2026-09-08',
    fechaUltimoEnvio: '2026-09-08',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    contactoNombre: 'Carlos Mendoza',
    contactoCargo: 'Recursos Humanos / Seguridad',
    contactoCorreo: 'carlos@constructora.com',
    ...overrides,
  };
}

function derivadaDe(overrides: Partial<FilaPanelCrm> = {}) {
  const panel = derivarPanel({ hoy: HOY, filas: [fila(overrides)] });
  return panel.filas[0];
}

function envio(
  overrides: Partial<EnvioCorreoHistorial> = {},
): EnvioCorreoHistorial {
  return {
    id: 1,
    plantilla: 'carta_presentacion',
    destinatario: 'carlos@constructora.com',
    estado: 'ENVIADO',
    createdAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

function detalle(overrides: Partial<DetalleEmpresa> = {}): DetalleEmpresa {
  return {
    empresa: {
      id: 1,
      ruc: '20489561234',
      rucNormalizado: '20489561234',
      razonSocial: 'Constructora A',
      tipo: 'Prospecto',
      origen: 'Outbound',
      proyectoObra: null,
      destinoComun: null,
      notas: null,
      responsable: null,
      sector: 'Construcción',
      cantidadTrabajadores: 45,
      contactos: [],
      createdAt: '2026-09-01T09:30:00.000Z',
      updatedAt: '2026-09-01T09:30:00.000Z',
    },
    pipeline: null,
    transiciones: [],
    handoffs: [],
    envios: [],
    ...overrides,
  };
}

const DETALLE = detalle({
  // Newest-first per the 7.3 read contract — the timeline must render
  // them chronologically (carta → seguimiento_1 → seguimiento_2).
  envios: [
    envio({ id: 3, plantilla: 'seguimiento_2', createdAt: '2026-09-15T10:00:00.000Z' }),
    envio({ id: 2, plantilla: 'seguimiento_1', createdAt: '2026-09-08T10:00:00.000Z' }),
    envio({ id: 1, plantilla: 'carta_presentacion', createdAt: '2026-09-01T10:00:00.000Z' }),
  ],
});

const fetchMock = vi.fn();

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

type CuerpoCapturado = string | null;
function mockDetalleYEnvios(enviosResponse: Response = okResponse({ success: true })): CuerpoCapturado[] {
  const cuerpos: CuerpoCapturado[] = [];
  fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(_input);
    if (url.endsWith('/detalle')) {
      return Promise.resolve(okResponse({ success: true, ...DETALLE }));
    }
    if (url.endsWith('/envios')) {
      cuerpos.push(typeof init?.body === 'string' ? init.body : null);
      return Promise.resolve(enviosResponse);
    }
    return Promise.reject(new Error(`URL inesperada en el test: ${url}`));
  });
  return cuerpos;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('plantillaSiguienteDeEstado — estado → siguiente plantilla (puro)', () => {
  it('maps every panel status to the next template of the 4-send cycle (null when no send applies)', () => {
    const esperados: Record<EstadoPanel, ReturnType<typeof plantillaSiguienteDeEstado>> = {
      sin_carta: 'carta_presentacion',
      carta_enviada: 'seguimiento_1',
      seguimiento_1: 'seguimiento_2',
      seguimiento_2: 'seguimiento_3',
      seguimiento_3: null, // cycle complete — the mock pauses from here (manual)
      en_pausa_3m: 'reactivacion_3m',
      reactivado: null,
      respondio_positivo: null,
      respondio_negativo: null,
      avanzado: null,
    };
    for (const [estado, esperado] of Object.entries(esperados)) {
      expect(plantillaSiguienteDeEstado(estado as EstadoPanel)).toBe(esperado);
    }
  });
});

describe('construirLineaTiempo — transiciones ∪ envios + registro (puro)', () => {
  it('merges registro, transitions and send-log rows chronologically (spec OP-6 order)', () => {
    const nodos = construirLineaTiempo(
      detalle({
        transiciones: [
          {
            id: 9,
            empresaId: 1,
            flujoPrevio: 'OUTBOUND',
            etapaPrevia: 'CADENCIA',
            flujoNuevo: 'OUTBOUND',
            etapaNueva: 'ACEPTADO',
            evento: 'AceptaciónOutbound',
            motivo: null,
            usuario: 'operador',
            createdAt: '2026-09-10T12:00:00.000Z',
          },
        ],
        envios: DETALLE.envios,
      }),
    );

    expect(nodos.map((n) => n.tipo)).toEqual(['registro', 'envio', 'envio', 'transicion', 'envio']);
    expect(nodos[0].titulo).toBe('Empresa en el CRM');
    expect(nodos[0].fecha).toBe('01/09/2026');
    expect(nodos[1].titulo).toContain('Carta de Presentación');
    expect(nodos[1].detalle).toBe('Enviado a carlos@constructora.com');
    expect(nodos[3].titulo).toBe('Aceptó nuestro contacto');
    expect(nodos[3].detalle).toContain('Cadencia → Aceptado');
  });

  it('surfaces a FALLIDO send row with its addressee (EM-6 visible in the ficha)', () => {
    const nodos = construirLineaTiempo(
      detalle({
        envios: [
          envio({ estado: 'FALLIDO', plantilla: 'seguimiento_1', createdAt: '2026-09-08T10:00:00.000Z' }),
        ],
      }),
    );

    expect(nodos).toHaveLength(2);
    expect(nodos[1].detalle).toBe('Falló el envío a carlos@constructora.com');
  });

  it('leaves only the registro node when the empresa has no history at all', () => {
    const nodos = construirLineaTiempo(detalle());
    expect(nodos).toHaveLength(1);
    expect(nodos[0].tipo).toBe('registro');
    expect(nodos[0].detalle).toBe('Tipo: Posible Cliente');
  });
});

type RenderOpts = {
  derivada?: ReturnType<typeof derivadaDe>;
  enviosResponse?: Response;
};

async function renderFicha(opts: RenderOpts = {}) {
  const derivada = opts.derivada ?? derivadaDe();
  const cuerpos = mockDetalleYEnvios(opts.enviosResponse);
  const onSalir = vi.fn();
  const onRegistrarRespuesta = vi.fn();
  render(
    <ModalFichaEmpresa
      derivada={derivada}
      onSalir={onSalir}
      onRegistrarRespuesta={onRegistrarRespuesta}
    />,
  );
  return { derivada, cuerpos, onSalir, onRegistrarRespuesta };
}

describe('ModalFichaEmpresa — encabezado, tarjetas y timeline', () => {
  it('renders the empresa header, both info cards and the timeline heading', async () => {
    await renderFicha();

    expect(screen.getByRole('dialog', { name: 'Ficha de Constructora A' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Constructora A' })).toBeInTheDocument();
    expect(screen.getByText('RUC: 20489561234 • Posible Cliente')).toBeInTheDocument();

    // Cards render IMMEDIATELY from the derived row (no detalle wait).
    expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
    expect(screen.getByText('Recursos Humanos / Seguridad • carlos@constructora.com')).toBeInTheDocument();
    expect(screen.getByText('Construcción')).toBeInTheDocument();
    expect(screen.getByText('45 trabajadores estimados')).toBeInTheDocument();

    // Timeline arrives with the detalle fetch (this fixture carries only
    // send-log rows; the transición ∪ envios merge is pinned in the pure
    // construirLineaTiempo tests above).
    expect(await screen.findByText('Historial de correos enviados')).toBeInTheDocument();
    const fechas = screen.getAllByText('01/09/2026');
    expect(fechas.length).toBeGreaterThanOrEqual(2); // registro + carta
  });

  it('lists the 3 historical sends in chronological order with dates (spec OP-6)', async () => {
    await renderFicha();

    await screen.findByText('Carta de Presentación Inicial');
    const titulos = screen
      .getAllByText(/Carta de Presentación Inicial|Recordatorio 1|Recordatorio 2/)
      .map((n) => n.textContent);
    expect(titulos).toHaveLength(3);
    expect(titulos[0]).toContain('Carta de Presentación');
    expect(titulos[1]).toContain('Recordatorio 1');
    expect(titulos[2]).toContain('Recordatorio 2');
    expect(screen.getByText('15/09/2026')).toBeInTheDocument();
  });
});

describe('ModalFichaEmpresa — acciones rápidas', () => {
  it('offers both respuesta actions (callback with preselect) and the send button while unresponded', async () => {
    const { onRegistrarRespuesta } = await renderFicha({
      derivada: derivadaDe({ etapa: 'CADENCIA', enviosCiclo: 2 }),
    });

    await screen.findByText('Historial de correos enviados');

    const positiva = screen.getByRole('button', { name: 'Respuesta Positiva (Tiene interés)' });
    const negativa = screen.getByRole('button', { name: 'Respuesta Negativa (No le interesa)' });
    const enviar = screen.getByRole('button', {
      name: 'Enviar el siguiente correo de recordatorio ahora',
    });
    expect(positiva).toBeEnabled();
    expect(negativa).toBeEnabled();
    expect(enviar).toBeEnabled();

    await userEvent.click(positiva);
    expect(onRegistrarRespuesta).toHaveBeenCalledWith('positivo');
    await userEvent.click(negativa);
    expect(onRegistrarRespuesta).toHaveBeenCalledWith('negativo');
  });

  it('disables the three quick actions when the empresa already responded (spec OP-6)', async () => {
    await renderFicha({ derivada: derivadaDe({ etapa: 'ACEPTADO' }) });

    await screen.findByText('Historial de correos enviados');

    expect(
      screen.getByRole('button', { name: 'Respuesta Positiva (Tiene interés)' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Respuesta Negativa (No le interesa)' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Enviar el siguiente correo de recordatorio ahora' }),
    ).toBeDisabled();
  });

  it('sends the NEXT template through POST /envios and refreshes the timeline', async () => {
    const { cuerpos } = await renderFicha({
      derivada: derivadaDe({ etapa: 'CADENCIA', enviosCiclo: 2 }),
    });

    await screen.findByText('Historial de correos enviados');
    await userEvent.click(
      screen.getByRole('button', { name: 'Enviar el siguiente correo de recordatorio ahora' }),
    );

    await waitFor(() => expect(cuerpos).toHaveLength(1));
    expect(JSON.parse(cuerpos[0] ?? '{}')).toEqual({ plantilla: 'seguimiento_2' });

    // The detalle is re-fetched after a successful dispatch (timeline updates).
    await waitFor(() => {
      const detalleLlamadas = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/detalle'));
      expect(detalleLlamadas.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('surfaces the API error verbatim when the send is rejected', async () => {
    await renderFicha({
      derivada: derivadaDe({ etapa: 'CADENCIA', enviosCiclo: 2 }),
      enviosResponse: new Response(JSON.stringify({ error: 'El envío no corresponde hoy' }), {
        status: 400,
      }),
    });

    await screen.findByText('Historial de correos enviados');
    await userEvent.click(
      screen.getByRole('button', { name: 'Enviar el siguiente correo de recordatorio ahora' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('El envío no corresponde hoy');
  });

  it('hides no send affordance for pausa: the send button maps to reactivacion_3m', async () => {
    const { cuerpos } = await renderFicha({
      derivada: derivadaDe({
        etapa: 'DESCANSO',
        enviosCiclo: 4,
        descansoHasta: '2026-12-08',
        fechaUltimoEnvio: '2026-09-08',
      }),
    });

    await screen.findByText('Historial de correos enviados');
    const enviar = screen.getByRole('button', {
      name: 'Enviar el siguiente correo de recordatorio ahora',
    });
    expect(enviar).toBeEnabled();
    await userEvent.click(enviar);

    await waitFor(() => expect(cuerpos).toHaveLength(1));
    expect(JSON.parse(cuerpos[0] ?? '{}')).toEqual({ plantilla: 'reactivacion_3m' });
  });
});
