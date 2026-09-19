import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ImportWizard } from '../ImportWizard';
import type { FilaImportCrm } from '../../../domain/importar/columnas';

// ---- Mock the client parser at the module boundary (repo convention) ----

const parsearPlantillaCrmMock = vi.hoisted(() => vi.fn());
vi.mock('@/features/crm/infrastructure/importar/parsearPlantillaCliente', () => ({
  parsearPlantillaCrm: parsearPlantillaCrmMock,
}));

// ---- Fixtures ----

function fila(clave: Partial<FilaImportCrm> = {}): FilaImportCrm {
  return {
    empresa: 'Constructora X',
    ruc: '900123456',
    tipo: 'Cliente',
    origen: 'Inbound',
    proyectoObra: '',
    destinoComun: '',
    responsable: '',
    notas: '',
    encargado: 'Ana',
    correos: 'ana@x.com',
    telefono: '',
    principal: '',
    ...clave,
  };
}

const VISTA_PREVIA = {
  success: true,
  totalFilas: 2,
  filasValidas: 1,
  empresas: [{ ruc: '900123456', razonSocial: 'Constructora X', tipo: 'Cliente', contactos: ['Ana'] }],
  errores: [{ fila: 3, columna: 'Tipo', mensaje: '"Tipo" debe ser "Cliente" o "Prospecto"' }],
};

const RESULTADO = {
  success: true,
  resultado: {
    totalFilas: 2,
    filasValidas: 1,
    empresasCreadas: 1,
    empresasActualizadas: 0,
    contactosCreados: 1,
    contactosActualizados: 0,
    errores: [],
    fallos: [],
    advertencias: [],
    importacionId: 7,
  },
};

const fetchMock = vi.fn();

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

function archivoFalso(): File {
  const file = new File(['hoja'], 'empresas.xlsx', { type: 'application/vnd.ms-excel' });
  // jsdom's Blob may lack arrayBuffer depending on version — provide it.
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  return file;
}

async function subirArchivo(): Promise<void> {
  const input = screen.getByLabelText('Archivo Excel de empresas');
  fireEvent.change(input, { target: { files: [archivoFalso()] } });
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
}

beforeEach(() => {
  fetchMock.mockReset();
  parsearPlantillaCrmMock.mockReset();
  parsearPlantillaCrmMock.mockReturnValue([fila()]);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---- Wizard behavior ----

describe('ImportWizard', () => {
  it('renders the upload step with the template download link next to the file input', () => {
    render(<ImportWizard />);

    expect(screen.getByLabelText('Archivo Excel de empresas')).toBeInTheDocument();
    const descarga = screen.getByRole('link', { name: 'Descargar plantilla' });
    expect(descarga).toHaveAttribute('href', '/api/crm/import/plantilla');
    expect(descarga).toHaveAttribute('download');
  });

  it('parses the selected file and shows the preview with counts and groups', async () => {
    fetchMock.mockResolvedValue(okResponse(VISTA_PREVIA));
    render(<ImportWizard />);

    await subirArchivo();

    await waitFor(() => expect(screen.getByText('Vista previa')).toBeInTheDocument());
    expect(screen.getByText('Constructora X')).toBeInTheDocument();
    expect(screen.getByText('Filas totales:')).toBeInTheDocument();
    expect(screen.getByText('Filas válidas:')).toBeInTheDocument();
    // The parser output flows to the API untouched.
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      archivoNombre: 'empresas.xlsx',
      filas: [fila()],
    });
  });

  it('lists per-row errors in the preview step', async () => {
    fetchMock.mockResolvedValue(okResponse(VISTA_PREVIA));
    render(<ImportWizard />);

    await subirArchivo();
    await waitFor(() => expect(screen.getByText('Vista previa')).toBeInTheDocument());

    expect(screen.getByText('3')).toBeInTheDocument(); // fila
    expect(screen.getByText('Tipo')).toBeInTheDocument(); // columna
    expect(
      screen.getByText('"Tipo" debe ser "Cliente" o "Prospecto"'),
    ).toBeInTheDocument();
  });

  it('cancelar returns to the upload step WITHOUT calling confirmar (G2)', async () => {
    fetchMock.mockResolvedValue(okResponse(VISTA_PREVIA));
    render(<ImportWizard />);

    await subirArchivo();
    await waitFor(() => expect(screen.getByText('Vista previa')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByLabelText('Archivo Excel de empresas')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the validar call
  });

  it('confirmar posts to /confirmar and shows the result counters', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse(VISTA_PREVIA))
      .mockResolvedValueOnce(okResponse(RESULTADO));
    render(<ImportWizard />);

    await subirArchivo();
    await waitFor(() => expect(screen.getByText('Vista previa')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }));

    await waitFor(() => expect(screen.getByText('Resultado')).toBeInTheDocument());
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/crm/import/confirmar');
    expect(screen.getByText('Empresas creadas:')).toBeInTheDocument();
    expect(screen.getByText('Contactos creados:')).toBeInTheDocument();
    expect(screen.getByText(/Importación registrada/)).toBeInTheDocument();

    // Back to step 1 for a fresh import.
    fireEvent.click(screen.getByRole('button', { name: 'Importar otro archivo' }));
    expect(await screen.findByLabelText('Archivo Excel de empresas')).toBeInTheDocument();
  });

  it('shows the API error with a retry when validar fails', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Esta acción requiere el permiso crm_admin' }), {
        status: 403,
      }),
    );
    render(<ImportWizard />);

    await subirArchivo();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Esta acción requiere el permiso crm_admin');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('shows a Spanish error when the file is not a valid template', async () => {
    parsearPlantillaCrmMock.mockImplementation(() => {
      throw new Error('La planilla no contiene la hoja "Empresas". Descargue la plantilla oficial y vuelva a intentarlo.');
    });
    render(<ImportWizard />);

    // A parse failure never fetches — fire the change and wait for the
    // alert directly (the subirArchivo helper would time out waiting
    // for a call that must not happen).
    const input = screen.getByLabelText('Archivo Excel de empresas');
    fireEvent.change(input, { target: { files: [archivoFalso()] } });

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('La planilla no contiene la hoja "Empresas"');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
