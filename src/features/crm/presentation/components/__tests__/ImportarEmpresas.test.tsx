import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: mockToast }));

import { ImportarEmpresas } from '../ImportarEmpresas';

type Estado = 'ok' | 'err' | 'dup';
interface Fila {
  fila: number;
  razonSocial: string;
  ruc: string;
  sector: string;
  contacto: string;
  telefono: string;
  correo: string;
  estado: Estado;
  nota: string;
  sectorNuevo: boolean;
}

const OK: Fila = { fila: 2, razonSocial: 'Escuela Norte S.A.C.', ruc: '20601112223', sector: 'Educación', contacto: 'Rosa Mendoza', telefono: '987111222', correo: '', estado: 'ok', nota: '', sectorNuevo: true };
const OK2: Fila = { fila: 3, razonSocial: 'Colegio Sur S.A.C.', ruc: '20601112224', sector: 'Construcción', contacto: 'Luis Vera', telefono: '986 222 333', correo: '', estado: 'ok', nota: '', sectorNuevo: false };
const ERR: Fila = { fila: 4, razonSocial: 'Transportes El Sol', ruc: '20604445556', sector: 'Transporte y Almacén', contacto: '', telefono: '984 444 555', correo: '', estado: 'err', nota: 'Falta el contacto', sectorNuevo: false };
const DUP: Fila = { fila: 5, razonSocial: 'Constructora Andina S.A.C.', ruc: '20512345678', sector: 'Construcción', contacto: 'Marcela Quispe', telefono: '987 654 321', correo: '', estado: 'dup', nota: 'Ya existe en el CRM', sectorNuevo: false };

function vista(filas: Fila[]) {
  const cuenta = (e: Estado) => filas.filter((f) => f.estado === e).length;
  return { success: true, filas, resumen: { leidas: filas.length, listas: cuenta('ok'), errores: cuenta('err'), repetidas: cuenta('dup') } };
}

type Manejador = (url: string, init?: RequestInit) => unknown | Promise<unknown>;
function mockFetch(manejar: Manejador) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const r = (await manejar(url, init)) as { status?: number; cuerpo: unknown } | 'red';
    if (r === 'red') throw new TypeError('network');
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.cuerpo } as Response;
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}
const responde = (cuerpo: unknown, status = 200) => ({ cuerpo, status });

const excel = (nombre = 'empresas.xlsx') => new File([new Uint8Array([1, 2, 3])], nombre);

function elegir(archivo: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [archivo] } });
}

async function conVista(filas: Fila[]) {
  const fn = mockFetch((url) => (url.endsWith('/vista-previa') ? responde(vista(filas)) : responde({ success: true, importadas: 1, sectoresNuevos: 0, omitidas: 0 })));
  render(<ImportarEmpresas />);
  elegir(excel());
  await screen.findByRole('heading', { name: /Revisa y confirma/ });
  return fn;
}

const desplazar = vi.fn();

beforeEach(() => {
  desplazar.mockReset();
  Element.prototype.scrollIntoView = desplazar;
  push.mockReset();
  Object.values(mockToast).forEach((m) => m.mockReset());
});
afterEach(() => vi.restoreAllMocks());

describe('Importar empresas — pantalla inicial', () => {
  it('shows the title, the way back to the CRM, the template link and the three steps', () => {
    render(<ImportarEmpresas />);
    expect(screen.getByRole('heading', { level: 1, name: 'Importar empresas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver al CRM/ })).toHaveAttribute('href', '/crm');
    expect(screen.getByRole('heading', { name: /Descarga la plantilla/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Sube tu archivo/ })).toBeInTheDocument();
    const plantilla = screen.getByRole('link', { name: /Descargar plantilla \(\.xlsx\)/ });
    expect(plantilla).toHaveAttribute('href', '/api/crm/importar/plantilla');
    expect(plantilla).toHaveAttribute('download');
    expect(screen.queryByRole('heading', { name: /Revisa y confirma/ })).not.toBeInTheDocument();
  });

  it('lists the six template columns, marking the optional one', () => {
    render(<ImportarEmpresas />);
    const columnas = within(screen.getByRole('list', { name: 'Columnas de la plantilla' })).getAllByRole('listitem');
    expect(columnas.map((c) => c.textContent)).toEqual(['Razón social *', 'RUC *', 'Sector *', 'Contacto *', 'Teléfono *', 'Correo (opcional)']);
  });

  it('asks only for .xlsx up to 5 MB, through a hidden file input and a visible button', () => {
    render(<ImportarEmpresas />);
    expect(screen.getByText('.xlsx · hasta 5 MB')).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', '.xlsx');
    expect(input).toHaveAttribute('hidden');
    const clic = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Elegir archivo' }));
    expect(clic).toHaveBeenCalledTimes(1);
  });
});

describe('Importar empresas — revisar el archivo', () => {
  it('sends the file to the preview as multipart (field "archivo") and says it is reading meanwhile', async () => {
    let liberar!: (v: unknown) => void;
    const fn = mockFetch(() => new Promise((r) => (liberar = r)));
    render(<ImportarEmpresas />);
    const archivo = excel('mis-empresas.xlsx');
    elegir(archivo);
    expect(await screen.findByText('Leyendo “mis-empresas.xlsx”…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Elegir archivo' }).closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('/api/crm/importar/vista-previa');
    expect(init?.method).toBe('POST');
    expect((init?.body as FormData).get('archivo')).toBe(archivo);
    liberar(responde(vista([OK])));
    await screen.findByRole('heading', { name: /Revisa y confirma/ });
    expect(screen.queryByText(/Leyendo/)).not.toBeInTheDocument();
  });

  it('shows the review with the focus on its title and one row per file row', async () => {
    await conVista([OK, ERR, DUP]);
    const titulo = screen.getByRole('heading', { name: /Revisa y confirma/ });
    expect(titulo).toHaveFocus();
    const tabla = screen.getByRole('table', { name: 'Filas leídas del archivo' });
    expect(within(tabla).getAllByRole('row')).toHaveLength(4);
    expect(within(tabla).getByText('Escuela Norte S.A.C.')).toBeInTheDocument();
  });

  it('scrolls the whole review into view so the confirm button is not left below the fold', async () => {
    await conVista([OK, ERR, DUP]);
    expect(desplazar).toHaveBeenCalledTimes(1);
    expect(desplazar).toHaveBeenCalledWith({ block: 'nearest' });
    expect(desplazar.mock.contexts[0]).toBe(screen.getByRole('heading', { name: /Revisa y confirma/ }).closest('section'));
  });

  it('does not scroll while there is no review (reading, error, or before choosing a file)', async () => {
    mockFetch(() => responde({ success: false, error: 'El archivo está vacío.' }, 400));
    render(<ImportarEmpresas />);
    elegir(excel());
    await screen.findByRole('alert');
    expect(desplazar).not.toHaveBeenCalled();
  });

  it('keeps a visible focus ring on the review title (no outline-none), since it takes the focus on its own', async () => {
    await conVista([OK]);
    const titulo = screen.getByRole('heading', { name: /Revisa y confirma/ });
    expect(titulo.className).not.toMatch(/outline-none/);
    expect(titulo.className).toMatch(/focus-visible:outline-2/);
    expect(titulo.className).toMatch(/focus-visible:outline-sky-600/);
  });

  it('summarizes the rows in plural', async () => {
    await conVista([OK, OK2, ERR, ERR, DUP, DUP].map((f, i) => ({ ...f, fila: i + 2 })));
    expect(screen.getByText('6 filas leídas')).toBeInTheDocument();
    expect(screen.getByText('2 listas')).toBeInTheDocument();
    expect(screen.getByText('2 con errores')).toBeInTheDocument();
    expect(screen.getByText('2 repetidas')).toBeInTheDocument();
  });

  it('summarizes the rows in singular', async () => {
    await conVista([OK, ERR, DUP]);
    expect(screen.getByText('3 filas leídas')).toBeInTheDocument();
    expect(screen.getByText('1 lista')).toBeInTheDocument();
    expect(screen.getByText('1 con error')).toBeInTheDocument();
    expect(screen.getByText('1 repetida')).toBeInTheDocument();
  });

  it('labels each row: Lista, Error with its reason, Omitida with its reason, and a dash for an empty contact', async () => {
    await conVista([OK, ERR, DUP]);
    const filas = screen.getAllByRole('row').slice(1);
    expect(within(filas[0]).getByText('Lista')).toBeInTheDocument();
    expect(within(filas[1]).getByText('Error: Falta el contacto')).toBeInTheDocument();
    expect(within(filas[1]).getByText('—')).toBeInTheDocument();
    expect(within(filas[2]).getByText('Omitida: Ya existe en el CRM')).toBeInTheDocument();
  });

  it('shows the Excel row number and flags only the rows whose sector will be created', async () => {
    await conVista([OK, OK2]);
    const filas = screen.getAllByRole('row').slice(1);
    expect(within(filas[0]).getAllByRole('cell')[0]).toHaveTextContent('2');
    expect(within(filas[0]).getByText('Sector nuevo: se creará')).toBeInTheDocument();
    expect(within(filas[1]).queryByText('Sector nuevo: se creará')).not.toBeInTheDocument();
  });

  it('"Mostrar solo las filas con problemas" hides the ok rows and unchecking brings them back', async () => {
    await conVista([OK, ERR, DUP]);
    const solo = screen.getByRole('checkbox', { name: 'Mostrar solo las filas con problemas' });
    fireEvent.click(solo);
    expect(screen.queryByText('Escuela Norte S.A.C.')).not.toBeInTheDocument();
    expect(screen.getByText('Transportes El Sol')).toBeInTheDocument();
    expect(screen.getByText('Constructora Andina S.A.C.')).toBeInTheDocument();
    fireEvent.click(solo);
    expect(screen.getByText('Escuela Norte S.A.C.')).toBeInTheDocument();
  });

  it('a new file replaces the previous review and resets the problems filter', async () => {
    const fn = await conVista([OK, ERR]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar solo las filas con problemas' }));
    fn.mockImplementation(async () => ({ ok: true, status: 200, json: async () => vista([OK2]) }) as Response);
    elegir(excel('otro.xlsx'));
    await screen.findByText('Colegio Sur S.A.C.');
    expect(screen.queryByText('Escuela Norte S.A.C.')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mostrar solo las filas con problemas' })).not.toBeChecked();
  });

  it('ignores a slow answer of an older file when a newer one was already chosen', async () => {
    const pendientes: Array<(v: unknown) => void> = [];
    mockFetch(() => new Promise((r) => pendientes.push(r)));
    render(<ImportarEmpresas />);
    elegir(excel('a.xlsx'));
    elegir(excel('b.xlsx'));
    pendientes[1](responde(vista([OK2])));
    await screen.findByText('Colegio Sur S.A.C.');
    pendientes[0](responde(vista([OK])));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Escuela Norte S.A.C.')).not.toBeInTheDocument();
    expect(screen.getByText('Colegio Sur S.A.C.')).toBeInTheDocument();
  });

  it('accepts a file dropped on the drop zone', async () => {
    const fn = mockFetch(() => responde(vista([OK])));
    render(<ImportarEmpresas />);
    const zona = screen.getByRole('button', { name: 'Elegir archivo' }).closest('[aria-busy]') as HTMLElement;
    const archivo = excel('arrastrado.xlsx');
    fireEvent.dragEnter(zona, { dataTransfer: { types: ['Files'], files: [archivo] } });
    fireEvent.drop(zona, { dataTransfer: { types: ['Files'], files: [archivo] } });
    await screen.findByRole('heading', { name: /Revisa y confirma/ });
    expect((fn.mock.calls[0][1]?.body as FormData).get('archivo')).toBe(archivo);
  });

  it('stops the browser from opening a file dropped anywhere else on the page', () => {
    render(<ImportarEmpresas />);
    const dataTransfer = { types: ['Files'], files: [] };
    expect(fireEvent.dragOver(window, { dataTransfer })).toBe(false);
    expect(fireEvent.drop(window, { dataTransfer })).toBe(false);
    expect(fireEvent.drop(window, { dataTransfer: { types: ['text/plain'], files: [] } })).toBe(true);
  });

  it('"Elegir otro archivo" opens the file picker again', async () => {
    await conVista([OK]);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clic = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Elegir otro archivo' }));
    expect(clic).toHaveBeenCalledTimes(1);
  });
});

describe('Importar empresas — errores al revisar', () => {
  it('shows the server message as an alert and no review when the file is rejected', async () => {
    mockFetch(() => responde({ success: false, error: 'El archivo está vacío.' }, 400));
    render(<ImportarEmpresas />);
    elegir(excel());
    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo está vacío.');
    expect(screen.queryByRole('heading', { name: /Revisa y confirma/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Leyendo/)).not.toBeInTheDocument();
  });

  it('shows a generic alert when the network fails, and a later good file clears it', async () => {
    const fn = mockFetch(() => 'red');
    render(<ImportarEmpresas />);
    elegir(excel());
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo revisar el archivo. Inténtalo de nuevo.');
    fn.mockImplementation(async () => ({ ok: true, status: 200, json: async () => vista([OK]) }) as Response);
    elegir(excel());
    await screen.findByRole('heading', { name: /Revisa y confirma/ });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a rejected file hides the review of the file before it', async () => {
    const fn = await conVista([OK]);
    fn.mockImplementation(async () => ({ ok: false, status: 400, json: async () => ({ success: false, error: 'El archivo debe ser un Excel (.xlsx).' }) }) as Response);
    elegir(excel('malo.csv'));
    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo debe ser un Excel (.xlsx).');
    expect(screen.queryByRole('heading', { name: /Revisa y confirma/ })).not.toBeInTheDocument();
  });
});

describe('Importar empresas — confirmar', () => {
  it('labels the button with the number of ready empresas, singular and plural', async () => {
    await conVista([OK, ERR]);
    expect(screen.getByRole('button', { name: 'Importar 1 empresa' })).toBeEnabled();
  });

  it('uses the plural for several ready empresas', async () => {
    await conVista([OK, OK2]);
    expect(screen.getByRole('button', { name: 'Importar 2 empresas' })).toBeEnabled();
  });

  it('disables the button when no row is ready', async () => {
    await conVista([ERR, DUP]);
    expect(screen.getByRole('button', { name: 'Importar 0 empresas' })).toBeDisabled();
  });

  it('sends the same file to the import, tells how many came in and goes back to the board', async () => {
    const fn = mockFetch((url) =>
      url.endsWith('/vista-previa') ? responde(vista([OK, OK2, ERR])) : responde({ success: true, importadas: 2, sectoresNuevos: 1, omitidas: 1 }),
    );
    render(<ImportarEmpresas />);
    const archivo = excel('empresas.xlsx');
    elegir(archivo);
    await screen.findByRole('heading', { name: /Revisa y confirma/ });
    fireEvent.click(screen.getByRole('button', { name: 'Importar 2 empresas' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/crm'));
    const importaciones = fn.mock.calls.filter(([u]) => u === '/api/crm/importar');
    expect(importaciones).toHaveLength(1);
    expect(importaciones[0][1]?.method).toBe('POST');
    expect((importaciones[0][1]?.body as FormData).get('archivo')).toBe(archivo);
    expect(mockToast.success).toHaveBeenCalledWith('2 empresas importadas en “Por contactar” · 1 sector nuevo');
  });

  it('words the notice in singular and without sectors when none were created', async () => {
    mockFetch((url) =>
      url.endsWith('/vista-previa') ? responde(vista([OK2])) : responde({ success: true, importadas: 1, sectoresNuevos: 0, omitidas: 0 }),
    );
    render(<ImportarEmpresas />);
    elegir(excel());
    await screen.findByRole('heading', { name: /Revisa y confirma/ });
    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 empresa' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(mockToast.success).toHaveBeenCalledWith('1 empresa importada en “Por contactar”');
  });

  it('words several new sectors in plural', async () => {
    mockFetch((url) =>
      url.endsWith('/vista-previa') ? responde(vista([OK, OK2])) : responde({ success: true, importadas: 2, sectoresNuevos: 3, omitidas: 0 }),
    );
    render(<ImportarEmpresas />);
    elegir(excel());
    await screen.findByRole('heading', { name: /Revisa y confirma/ });
    fireEvent.click(screen.getByRole('button', { name: 'Importar 2 empresas' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(mockToast.success).toHaveBeenCalledWith('2 empresas importadas en “Por contactar” · 3 sectores nuevos');
  });

  it('does not send the import twice on a double click and disables the button meanwhile', async () => {
    let liberar!: (v: unknown) => void;
    const fn = mockFetch((url) => (url.endsWith('/vista-previa') ? responde(vista([OK])) : new Promise((r) => (liberar = r))));
    render(<ImportarEmpresas />);
    elegir(excel());
    await screen.findByRole('heading', { name: /Revisa y confirma/ });
    const boton = screen.getByRole('button', { name: 'Importar 1 empresa' });
    fireEvent.click(boton);
    fireEvent.click(boton);
    expect(fn.mock.calls.filter(([u]) => u === '/api/crm/importar')).toHaveLength(1);
    expect(boton).toBeDisabled();
    liberar(responde({ success: true, importadas: 1, sectoresNuevos: 0, omitidas: 0 }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  });

  it('keeps the review and shows the error when the import fails, with no notice and no navigation', async () => {
    mockFetch((url) => (url.endsWith('/vista-previa') ? responde(vista([OK])) : responde({ success: false, error: 'Error al importar las empresas' }, 500)));
    render(<ImportarEmpresas />);
    elegir(excel());
    await screen.findByRole('heading', { name: /Revisa y confirma/ });
    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 empresa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Error al importar las empresas');
    expect(push).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Importar 1 empresa' })).toBeEnabled();
    expect(screen.getByText('Escuela Norte S.A.C.')).toBeInTheDocument();
  });

  it('lets the user try again after a failed import: the second click sends a new request', async () => {
    let intento = 0;
    const fn = mockFetch((url) => {
      if (url.endsWith('/vista-previa')) return responde(vista([OK]));
      intento++;
      return intento === 1
        ? responde({ success: false, error: 'Error al importar las empresas' }, 500)
        : responde({ success: true, importadas: 1, sectoresNuevos: 0, omitidas: 0 });
    });
    render(<ImportarEmpresas />);
    elegir(excel());
    await screen.findByRole('heading', { name: /Revisa y confirma/ });
    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 empresa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Error al importar las empresas');
    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 empresa' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/crm'));
    expect(fn.mock.calls.filter(([u]) => u === '/api/crm/importar')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sends one import even when two clicks land before the screen can disable the button', async () => {
    let liberar!: (v: unknown) => void;
    const fn = mockFetch((url) => (url.endsWith('/vista-previa') ? responde(vista([OK])) : new Promise((r) => (liberar = r))));
    render(<ImportarEmpresas />);
    elegir(excel());
    await screen.findByRole('heading', { name: /Revisa y confirma/ });
    const boton = screen.getByRole('button', { name: 'Importar 1 empresa' });
    act(() => {
      boton.click();
      boton.click();
    });
    expect(fn.mock.calls.filter(([u]) => u === '/api/crm/importar')).toHaveLength(1);
    liberar(responde({ success: true, importadas: 1, sectoresNuevos: 0, omitidas: 0 }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  });

  it('shows a generic error when the import request itself fails', async () => {
    mockFetch((url) => (url.endsWith('/vista-previa') ? responde(vista([OK])) : 'red'));
    render(<ImportarEmpresas />);
    elegir(excel());
    await screen.findByRole('heading', { name: /Revisa y confirma/ });
    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 empresa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron importar las empresas. Inténtalo de nuevo.');
    expect(push).not.toHaveBeenCalled();
  });

  it('does not announce success nor leave when the server imported nothing', async () => {
    mockFetch((url) =>
      url.endsWith('/vista-previa') ? responde(vista([OK])) : responde({ success: true, importadas: 0, sectoresNuevos: 0, omitidas: 1 }),
    );
    render(<ImportarEmpresas />);
    elegir(excel());
    await screen.findByRole('heading', { name: /Revisa y confirma/ });
    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 empresa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se importó ninguna empresa. Revisa el archivo y vuelve a intentarlo.');
    expect(push).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Importar 1 empresa' })).toBeEnabled();
  });
});
