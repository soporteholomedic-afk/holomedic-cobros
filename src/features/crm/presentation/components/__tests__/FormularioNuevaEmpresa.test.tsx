import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FormularioNuevaEmpresa } from '../FormularioNuevaEmpresa';

/**
 * Contract for the manual empresa registration form (post-verify UX
 * remediation — the inbound flow's first step): Spanish labels,
 * client-side required validation, POST through useCrearEmpresa and
 * navigation to the created empresa's detail on success.
 */

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  pushMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function okResponse(empresaId: number): Response {
  return new Response(
    JSON.stringify({
      success: true,
      empresa: {
        id: empresaId,
        ruc: '900123456',
        rucNormalizado: '900123456',
        razonSocial: 'Constructora X',
        tipo: 'Prospecto',
        origen: 'Inbound',
        proyectoObra: null,
        destinoComun: null,
        notas: null,
        responsable: null,
        contactos: [],
        createdAt: '2026-09-20T00:00:00.000Z',
        updatedAt: '2026-09-20T00:00:00.000Z',
      },
    }),
    { status: 201 },
  );
}

async function llenarFormularioValido(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('Empresa (razón social)', { exact: false }), 'Constructora X');
  await user.type(screen.getByLabelText('RUC', { exact: false }), '900-123456');
  await user.click(screen.getByRole('radio', { name: 'Prospecto' }));
  await user.selectOptions(screen.getByLabelText('Origen'), 'Inbound');
  await user.type(screen.getByLabelText('Encargado', { exact: false }), 'Ana Pérez');
  await user.type(screen.getByLabelText('Correos', { exact: false }), 'ana@constructorax.com');
}

describe('FormularioNuevaEmpresa', () => {
  it('renders the Spanish fields with the principal checkbox checked by default', () => {
    render(<FormularioNuevaEmpresa />);

    expect(screen.getByLabelText('Empresa (razón social)', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('RUC', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Cliente' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Prospecto' })).not.toBeChecked();
    expect(screen.getByLabelText('Origen')).toHaveValue('');
    expect(screen.getByLabelText('Es el contacto principal')).toBeChecked();
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/crm');
  });

  it('blocks the submit with Spanish per-field errors when required fields are missing', async () => {
    const user = userEvent.setup();
    render(<FormularioNuevaEmpresa />);

    await user.click(screen.getByRole('button', { name: 'Registrar empresa' }));

    expect(screen.getByText('La razón social es obligatoria.')).toBeInTheDocument();
    expect(screen.getByText('El RUC es obligatorio.')).toBeInTheDocument();
    expect(screen.getByText('Selecciona el tipo de empresa.')).toBeInTheDocument();
    expect(screen.getByText('El nombre del encargado es obligatorio.')).toBeInTheDocument();
    expect(screen.getByText('Indica al menos un correo (separa varios con ";").')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('rejects a RUC that is invalid after normalization', async () => {
    const user = userEvent.setup();
    render(<FormularioNuevaEmpresa />);

    await user.type(screen.getByLabelText('RUC', { exact: false }), '90-0');
    await user.click(screen.getByRole('button', { name: 'Registrar empresa' }));

    expect(
      screen.getByText('RUC inválido: debe tener entre 8 y 11 dígitos (solo números).'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the built input and navigates to the created empresa detail on success', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(okResponse(7));
    render(<FormularioNuevaEmpresa />);

    await llenarFormularioValido(user);
    await user.click(screen.getByRole('button', { name: 'Registrar empresa' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ruc: '900-123456',
        razonSocial: 'Constructora X',
        tipo: 'Prospecto',
        origen: 'Inbound',
        proyectoObra: null,
        destinoComun: null,
        notas: null,
        responsable: null,
        contactos: [
          {
            nombre: 'Ana Pérez',
            telefono: null,
            esPrincipal: true,
            correos: ['ana@constructorax.com'],
          },
        ],
      }),
    });
    expect(pushMock).toHaveBeenCalledWith('/crm/empresas/7');
  });

  it('shows the friendly RUC duplicado message on 409 and keeps the form open', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: 'Ya existe una empresa con el RUC 900123456',
          code: 'CONFLICT_ERROR',
        }),
        { status: 409 },
      ),
    );
    render(<FormularioNuevaEmpresa />);

    await llenarFormularioValido(user);
    await user.click(screen.getByRole('button', { name: 'Registrar empresa' }));

    expect(await screen.findByText('Ya existe una empresa con ese RUC.')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('surfaces other server errors verbatim', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: 'Esta acción requiere el permiso crm_admin',
          code: 'FORBIDDEN',
        }),
        { status: 403 },
      ),
    );
    render(<FormularioNuevaEmpresa />);

    await llenarFormularioValido(user);
    await user.click(screen.getByRole('button', { name: 'Registrar empresa' }));

    expect(
      await screen.findByText('Esta acción requiere el permiso crm_admin'),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('disables the submit while the request is in flight', async () => {
    const user = userEvent.setup();
    let resolverFetch: ((r: Response) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolverFetch = resolve;
        }),
    );
    render(<FormularioNuevaEmpresa />);

    await llenarFormularioValido(user);
    await user.click(screen.getByRole('button', { name: 'Registrar empresa' }));

    expect(screen.getByRole('button', { name: 'Registrar empresa' })).toBeDisabled();

    await act(async () => {
      resolverFetch?.(okResponse(7));
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Registrar empresa' })).not.toBeDisabled(),
    );
  });
});
