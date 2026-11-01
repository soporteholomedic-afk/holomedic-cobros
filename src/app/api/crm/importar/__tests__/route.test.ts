// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ICrmEmpresaRepository } from '@/features/crm/domain/ports';
import { __setCrmDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import { FILA, crmSession, makeMockRepo, sinCrmSession } from '../../_lib/__tests__/fixtures';
import { archivo, libroXlsx, multipart } from '../../_lib/__tests__/importacion';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { POST } from '../route';

const A = ['Escuela Norte S.A.C.', '20601112223', 'Educación', 'Rosa Mendoza', '987111222', 'rosa@norte.pe'];
const B = ['Colegio Sur S.A.C.', '20601112224', ' educación ', 'Luis Vera', '986 222 333', ''];
const MALA = ['Transportes El Sol', '2060444', 'Transporte y Almacén', 'Mario Cruz', '984 444 555', ''];
const EXISTENTE = ['Constructora Andina S.A.C.', '20512345678', 'Construcción', 'Marcela Quispe', '987 654 321', ''];

/** Repository whose sectors really grow when one is created, like the real one. */
function repoConSectores(over: Partial<ICrmEmpresaRepository> = {}): ICrmEmpresaRepository {
  const sectores = ['Construcción', 'Comercio y Tiendas'];
  return makeMockRepo({
    listSectores: vi.fn().mockImplementation(async () => [...sectores]),
    createSector: vi.fn().mockImplementation(async (n: string) => {
      sectores.push(n);
      return n;
    }),
    ...over,
  });
}

describe('POST /api/crm/importar', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('stores the ok rows in "Por contactar", creates each new sector once and reports the counts', async () => {
    const repo = repoConSectores();
    __setCrmDbForTests(repo);
    const res = await POST(multipart({ archivo: archivo(await libroXlsx([A, B, MALA])) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, importadas: 2, sectoresNuevos: 1, omitidas: 1 });
    expect(repo.createSector).toHaveBeenCalledTimes(1);
    expect(repo.createSector).toHaveBeenCalledWith('Educación');
    expect(repo.create).toHaveBeenCalledTimes(2);
    expect(repo.create).toHaveBeenNthCalledWith(1, {
      razonSocial: 'Escuela Norte S.A.C.',
      ruc: '20601112223',
      sector: 'Educación',
      contactos: [{ nombre: 'Rosa Mendoza', telefono: '987111222', correo: 'rosa@norte.pe' }],
      notas: null,
      etapa: 'por_contactar',
      origen: null,
    });
    expect(repo.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ ruc: '20601112224', sector: 'Educación', etapa: 'por_contactar' }));
  });

  it('reads and checks the file again on the server: a list of rows sent by the client is ignored', async () => {
    const repo = repoConSectores();
    __setCrmDbForTests(repo);
    const falsas = JSON.stringify([{ fila: 2, razonSocial: 'Falsa S.A.', ruc: '20999999999', sector: 'Construcción', contacto: 'X', telefono: '987654321', estado: 'ok' }]);
    const res = await POST(multipart({ archivo: archivo(await libroXlsx([A])), filas: falsas, resumen: '{"listas":99}' }));
    expect(await res.json()).toEqual({ success: true, importadas: 1, sectoresNuevos: 1, omitidas: 0 });
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ ruc: '20601112223' }));
  });

  it('skips a row whose RUC already exists in the CRM and creates no sector for it', async () => {
    const repo = repoConSectores({ list: vi.fn().mockResolvedValue([FILA]) });
    __setCrmDbForTests(repo);
    const res = await POST(multipart({ archivo: archivo(await libroXlsx([[...EXISTENTE.slice(0, 2), 'Educación', ...EXISTENTE.slice(3)]])) }));
    expect(await res.json()).toEqual({ success: true, importadas: 0, sectoresNuevos: 0, omitidas: 1 });
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.createSector).not.toHaveBeenCalled();
  });

  it('answers 200 with zero imported when every row is skipped, and writes nothing', async () => {
    const repo = repoConSectores();
    __setCrmDbForTests(repo);
    const res = await POST(multipart({ archivo: archivo(await libroXlsx([MALA])) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, importadas: 0, sectoresNuevos: 0, omitidas: 1 });
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.createSector).not.toHaveBeenCalled();
  });

  it.each([
    ['without a session', null],
    ['without the crm permiso', sinCrmSession],
  ])('returns 401 %s and neither reads the body nor writes', async (_n, session) => {
    mockGetSession.mockResolvedValue(session);
    const repo = repoConSectores();
    __setCrmDbForTests(repo);
    const formData = vi.fn();
    const res = await POST({ formData } as unknown as Request);
    expect(res.status).toBe(401);
    expect(formData).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.createSector).not.toHaveBeenCalled();
  });

  it.each([
    ['there is no file', async () => multipart({}), 'Selecciona un archivo Excel.'],
    ['the file is an .xls', async () => multipart({ archivo: archivo(new Uint8Array([1]), 'viejo.xls') }), 'Los archivos .xls no se pueden leer. Ábrelo en Excel, guárdalo como .xlsx y vuelve a subirlo.'],
    ['the columns are not the template ones', async () => multipart({ archivo: archivo(await libroXlsx([A], ['a', 'b', 'c', 'd', 'e', 'f'])) }), 'El archivo no tiene las columnas de la plantilla. Descarga la plantilla y vuelve a intentarlo.'],
  ])('answers 400 when %s and writes nothing', async (_n, armar, mensaje) => {
    const repo = repoConSectores();
    __setCrmDbForTests(repo);
    const res = await POST(await armar());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: mensaje });
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.createSector).not.toHaveBeenCalled();
  });

  it('answers 500 with a generic message and logs when saving fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    __setCrmDbForTests(repoConSectores({ create: vi.fn().mockRejectedValue(new Error('boom')) }));
    const res = await POST(multipart({ archivo: archivo(await libroXlsx([A])) }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al importar las empresas' });
    expect(spy).toHaveBeenCalled();
  });
});
