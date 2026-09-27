import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ModalAltaEmpresa } from './ModalAltaEmpresa';
import type { Empresa } from '../../../domain/entities';

/**
 * Alta modal contract (task 10.2, spec OP-5, decision 5): the mock
 * form with its defaults (cargo "Recursos Humanos / Seguridad", 30
 * trabajadores, Construcción preselected, carta checkbox ON), the
 * radio mapping both domain doors (D5), persist-FIRST + carta via the
 * shared envios seam, and failure semantics — a persist error keeps
 * the form open (ModalRespuesta precedent), an SMTP failure does NOT
 * block the alta (the empresa stays in sin_carta; the parent warns).
 */

function makeEmpresa(overrides: Partial<Empresa> = {}): Empresa {
  return {
    id: 9,
    ruc: '20489561234',
    rucNormalizado: '20489561234',
    razonSocial: 'Constructora Los Andes',
    tipo: 'Cliente',
    origen: 'Inbound',
    proyectoObra: null,
    destinoComun: null,
    notas: null,
    responsable: null,
    contactos: [],
    createdAt: '2026-09-27T00:00:00.000Z',
    updatedAt: '2026-09-27T00:00:00.000Z',
    ...overrides,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Fills the required (*) fields and submits. */
async function enviarFormulario(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Nombre de la Empresa *'), 'Constructora Los Andes');
  await userEvent.type(screen.getByLabelText('RUC o Identificación *'), '20489561234');
  await userEvent.type(screen.getByLabelText('Persona de Contacto *'), 'Carlos Mendoza');
  await userEvent.type(screen.getByLabelText('Correo Electrónico *'), 'carlos@andes.com');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar y Empezar' }));
}

function mockPersistOk(empresa: Empresa): void {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    if (String(input) === '/api/crm/empresas') {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, empresa }), { status: 201 }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 201 }));
  });
}

describe('ModalAltaEmpresa', () => {
  it('renders the mock form with the decision-5 defaults', () => {
    render(<ModalAltaEmpresa onSalir={() => {}} onExito={() => {}} />);

    expect(screen.getByRole('dialog', { name: 'Anotar Nueva Empresa' })).toBeInTheDocument();
    // The radio's accessible name includes the mock's description line,
    // so these match by regex (RTL exact:false learning).
    expect(screen.getByRole('radio', { name: /Cliente Nuevo/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Posible Cliente/ })).not.toBeChecked();
    expect(screen.getByLabelText('Puesto o Cargo')).toHaveValue('Recursos Humanos / Seguridad');
    expect(screen.getByLabelText('Cantidad aprox. de trabajadores')).toHaveValue(30);
    expect(screen.getByLabelText('Rubro de la Empresa')).toHaveValue('Construcción');
    expect(screen.getByRole('checkbox', { name: 'Enviar la Carta de Presentación de inmediato' })).toBeChecked();
    expect(screen.getByLabelText('Rubro de la Empresa')).toHaveTextContent('Minería y Energía');
  });

  it('persists FIRST (radio-mapped doors + alta fields) and then sends the carta via the envios seam', async () => {
    const empresa = makeEmpresa();
    mockPersistOk(empresa);
    const onExito = vi.fn();
    const llamadas: Array<{ url: string; cuerpo: string }> = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      llamadas.push({ url: String(input), cuerpo: String(init?.body ?? '') });
      if (String(input) === '/api/crm/empresas') {
        return new Response(JSON.stringify({ success: true, empresa }), { status: 201 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 201 });
    });

    render(<ModalAltaEmpresa onSalir={() => {}} onExito={onExito} />);
    await enviarFormulario();

    expect(llamadas.map((l) => l.url)).toEqual([
      '/api/crm/empresas',
      `/api/crm/empresas/${empresa.id}/envios`,
    ]);
    expect(JSON.parse(llamadas[0]?.cuerpo ?? '{}')).toMatchObject({
      razonSocial: 'Constructora Los Andes',
      ruc: '20489561234',
      tipo: 'Cliente',
      origen: 'Inbound',
      sector: 'Construcción',
      cantidadTrabajadores: 30,
      contactos: [
        {
          nombre: 'Carlos Mendoza',
          cargo: 'Recursos Humanos / Seguridad',
          correos: ['carlos@andes.com'],
          esPrincipal: true,
        },
      ],
    });
    expect(JSON.parse(llamadas[1]?.cuerpo ?? '{}')).toEqual({ plantilla: 'carta_presentacion' });
    expect(onExito).toHaveBeenCalledWith(empresa, null);
  });

  it('maps the Posible Cliente radio to the Prospecto/Outbound door', async () => {
    const empresa = makeEmpresa({ tipo: 'Prospecto', origen: 'Outbound' });
    mockPersistOk(empresa);
    const onExito = vi.fn();

    render(<ModalAltaEmpresa onSalir={() => {}} onExito={onExito} />);
    await userEvent.click(screen.getByRole('radio', { name: /Posible Cliente/ }));
    await enviarFormulario();

    const cuerpo = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'));
    expect(cuerpo.tipo).toBe('Prospecto');
    expect(cuerpo.origen).toBe('Outbound');
  });

  it('reports an SMTP failure through onExito WITHOUT blocking the alta (sin_carta retry path)', async () => {
    const empresa = makeEmpresa();
    const onExito = vi.fn();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === '/api/crm/empresas') {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, empresa }), { status: 201 }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: false, error: 'Error de envío: SMTP_AUTH_ERROR' }), {
          status: 502,
        }),
      );
    });

    render(<ModalAltaEmpresa onSalir={() => {}} onExito={onExito} />);
    await enviarFormulario();

    expect(onExito).toHaveBeenCalledWith(empresa, 'Error de envío: SMTP_AUTH_ERROR');
  });

  it('keeps the form open with the API error when the persist fails', async () => {
    mockPersistOk(makeEmpresa());
    const onExito = vi.fn();
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ success: false, error: 'Ya existe una empresa con ese RUC', code: 'CONFLICT_ERROR' }),
          { status: 409 },
        ),
      ),
    );

    render(<ModalAltaEmpresa onSalir={() => {}} onExito={onExito} />);
    await enviarFormulario();

    expect(screen.getByRole('alert')).toHaveTextContent('Ya existe una empresa con ese RUC.');
    expect(onExito).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Anotar Nueva Empresa' })).toBeInTheDocument();
  });

  it('reports Cancelar through onSalir', async () => {
    const onSalir = vi.fn();
    render(<ModalAltaEmpresa onSalir={onSalir} onExito={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onSalir).toHaveBeenCalledTimes(1);
  });
});
