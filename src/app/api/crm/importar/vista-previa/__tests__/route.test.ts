// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __setCrmDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import { FILA, crmSession, makeMockRepo, sinCrmSession } from '../../../_lib/__tests__/fixtures';
import { archivo, libroXlsx, multipart } from '../../../_lib/__tests__/importacion';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { POST } from '../route';

const EXISTENTE = ['Constructora Andina S.A.C.', '20512345678', 'Construcción', 'Marcela Quispe', '987 654 321', 'marcela@andina.pe'];
const NUEVA = ['Escuela Norte S.A.C.', '20601112223', 'Educación', 'Rosa Mendoza', '987111222', ''];
const MALA = ['Transportes El Sol', '2060444', 'Transporte y Almacén', 'Mario Cruz', '984 444 555', ''];

describe('POST /api/crm/importar/vista-previa', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('labels every row ok / err / dup with its note and sector flag, and counts them', async () => {
    __setCrmDbForTests(makeMockRepo({ list: vi.fn().mockResolvedValue([FILA]) }));
    const res = await POST(multipart({ archivo: archivo(await libroXlsx([EXISTENTE, NUEVA, MALA])) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      filas: [
        { fila: 2, razonSocial: 'Constructora Andina S.A.C.', ruc: '20512345678', sector: 'Construcción', contacto: 'Marcela Quispe', telefono: '987 654 321', correo: 'marcela@andina.pe', estado: 'dup', nota: 'Ya existe en el CRM', sectorNuevo: false },
        { fila: 3, razonSocial: 'Escuela Norte S.A.C.', ruc: '20601112223', sector: 'Educación', contacto: 'Rosa Mendoza', telefono: '987111222', correo: '', estado: 'ok', nota: '', sectorNuevo: true },
        { fila: 4, razonSocial: 'Transportes El Sol', ruc: '2060444', sector: 'Transporte y Almacén', contacto: 'Mario Cruz', telefono: '984 444 555', correo: '', estado: 'err', nota: 'El RUC debe tener 11 dígitos', sectorNuevo: false },
      ],
      resumen: { leidas: 3, listas: 1, errores: 1, repetidas: 1 },
    });
  });

  it('writes nothing: no empresa and no sector is created', async () => {
    const repo = makeMockRepo();
    __setCrmDbForTests(repo);
    await POST(multipart({ archivo: archivo(await libroXlsx([NUEVA])) }));
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.createSector).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it.each([
    ['without a session', null],
    ['without the crm permiso', sinCrmSession],
  ])('returns 401 %s and neither reads the body nor touches the database', async (_n, session) => {
    mockGetSession.mockResolvedValue(session);
    const list = vi.fn();
    __setCrmDbForTests(makeMockRepo({ list }));
    const formData = vi.fn();
    const res = await POST({ formData } as unknown as Request);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: 'No autorizado' });
    expect(formData).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it.each([
    ['there is no file', async () => multipart({}), 'Selecciona un archivo Excel.'],
    ['the file is an .xls', async () => multipart({ archivo: archivo(new Uint8Array([1]), 'viejo.xls') }), 'Los archivos .xls no se pueden leer. Ábrelo en Excel, guárdalo como .xlsx y vuelve a subirlo.'],
    ['the bytes are not an Excel', async () => multipart({ archivo: archivo(new TextEncoder().encode('hola')) }), 'No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) válido.'],
    ['the columns are not the template ones', async () => multipart({ archivo: archivo(await libroXlsx([NUEVA], ['a', 'b', 'c', 'd', 'e', 'f'])) }), 'El archivo no tiene las columnas de la plantilla. Descarga la plantilla y vuelve a intentarlo.'],
    ['the file has no data rows', async () => multipart({ archivo: archivo(await libroXlsx([])) }), 'El archivo no tiene filas con datos.'],
  ])('answers 400 with a clear message when %s, without touching the database', async (_n, armar, mensaje) => {
    const list = vi.fn().mockResolvedValue([]);
    __setCrmDbForTests(makeMockRepo({ list }));
    const res = await POST(await armar());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: mensaje });
    expect(list).not.toHaveBeenCalled();
  });

  it('answers 500 with a generic message and logs when the database fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    __setCrmDbForTests(makeMockRepo({ list: vi.fn().mockRejectedValue(new Error('boom')) }));
    const res = await POST(multipart({ archivo: archivo(await libroXlsx([NUEVA])) }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al revisar el archivo' });
    expect(spy).toHaveBeenCalled();
  });
});
