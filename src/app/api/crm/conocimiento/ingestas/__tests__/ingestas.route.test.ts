// @vitest-environment node
// API-route test: no DOM. The node environment is REQUIRED for the
// FormData suites — jsdom replaces globalThis.File with its own class,
// which breaks undici's request.formData() multipart parser on Node 24
// (send-email route.test precedent).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IngestaConocimiento, TareaAgente } from '@/features/crm/domain/entities';
import type {
  EntradaCrearIngestaConocimiento,
  EntradaCrearTareaAgente,
  IngestaConocimientoRepository,
  TareaAgenteRepository,
} from '@/features/crm/domain/ports';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';

/**
 * Route contract for /api/crm/conocimiento/ingestas (agente-ia-crm
 * E4·T8 — permiso `crm_conocimiento`). Pinned:
 * - POST JSON (texto pegado, tipo TEXTO) y POST multipart (archivo
 *   .pdf/.txt/.docx con extracción EN el upload) → 201 { ingesta } +
 *   tarea INGESTAR_CONOCIMIENTO encolada (conversacionId NULL,
 *   mensajeId = ingestaId) + drenaje fire-and-forget (webhook idiom).
 * - Límites: archivo >5 MB rechazado 400 ANTES de leerlo
 *   (Content-Length lo delata), extensión desconocida 400.
 * - Errores tipados: IngestaInvalidaError → 400, ExtraccionError →
 *   422 (documento ilegible, no es culpa del pedido), sin sesión 401,
 *   sin permiso 403, contenedor sin repos 503, inesperado 500 sin
 *   filtrar el mensaje interno.
 * - GET ?limite (default 20, tope 50) → { ingestas } SIN contenidoCrudo
 *   (el crudo puede medir 200 000 chars: el panel no lo necesita) y
 *   fechas como ISO strings, cache-control no-store.
 * El use case y la extracción son LOS REALES (fakes solo en los
 * puertos, hexagonal): la ruta se prueba cableando de punta a punta.
 */

const mocks = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  procesarMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSessionMock }));

vi.mock('@/features/crm/infrastructure/agentes/iniciarBarredorTareas', () => ({
  iniciarBarredorTareas: () => {},
}));

vi.mock('@/features/crm/infrastructure/agentes/crearProcesadorTareasAgente', () => ({
  crearProcesadorTareasAgente: () => ({ procesar: mocks.procesarMock }),
}));

import { GET, POST } from '../route';

class FakeIngestas implements IngestaConocimientoRepository {
  creadas: EntradaCrearIngestaConocimiento[] = [];
  recientes: IngestaConocimiento[] = [];
  limitePedida: number | null = null;
  falloEnCrear: Error | null = null;
  private siguienteId = 1;

  async crear(entrada: EntradaCrearIngestaConocimiento): Promise<IngestaConocimiento> {
    if (this.falloEnCrear) throw this.falloEnCrear;
    this.creadas.push({ ...entrada });
    return {
      id: this.siguienteId++,
      nombre: entrada.nombre,
      tipo: entrada.tipo,
      tamanoBytes: entrada.tamanoBytes,
      contenidoCrudo: entrada.contenidoCrudo,
      estado: 'PENDIENTE',
      error: null,
      entradasCreadas: 0,
      creadoPor: entrada.creadoPor ?? null,
      creadoEn: new Date('2026-10-12T10:00:00.000Z'),
      procesadoEn: null,
      vigenciaDesde: entrada.vigenciaDesde ?? null,
      vigenciaHasta: entrada.vigenciaHasta ?? null,
    };
  }

  async obtenerPorId(): Promise<IngestaConocimiento | null> {
    return null;
  }

  async listarRecientes(limite: number): Promise<IngestaConocimiento[]> {
    this.limitePedida = limite;
    return this.recientes.slice(0, limite);
  }

  async marcarProcesando(): Promise<void> {}
  async marcarCompletada(): Promise<void> {}
  async marcarFallida(): Promise<void> {}
}

class FakeTareas implements TareaAgenteRepository {
  creaciones: EntradaCrearTareaAgente[] = [];
  private siguienteId = 900;

  async crearSiNoExiste(entrada: EntradaCrearTareaAgente): Promise<{ id: number; creada: boolean }> {
    this.creaciones.push({ ...entrada });
    return { id: this.siguienteId++, creada: true };
  }

  // Nunca llamados desde la ruta (el procesador está mockeado) — el
  // use case solo pide Pick<..., 'crearSiNoExiste'>; la interfaz
  // completa existe para satisfacer el contenedor CrmDb.
  async reclamarPendientes(): Promise<TareaAgente[]> {
    return [];
  }
  async reclamarAbandonadas(): Promise<TareaAgente[]> {
    return [];
  }
  async completar(): Promise<void> {}
  async reencolar(): Promise<void> {}
  async fallar(): Promise<void> {}
}

const sessionBase = { sub: 'u-1', nombre: 'Marcos Conversa', area: 'Comercial' };

function ingestaFixture(sobre: Partial<IngestaConocimiento> = {}): IngestaConocimiento {
  return {
    id: 7,
    nombre: 'Manual comercial.pdf',
    tipo: 'PDF',
    tamanoBytes: 42,
    contenidoCrudo: 'texto ya extraído (nunca viaja por el wire)',
    estado: 'COMPLETADA',
    error: null,
    entradasCreadas: 3,
    creadoPor: 'Marcos Conversa',
    creadoEn: new Date('2026-10-12T10:00:00.000Z'),
    procesadoEn: new Date('2026-10-12T10:00:05.000Z'),
    vigenciaDesde: null,
    vigenciaHasta: null,
    ...sobre,
  };
}

let fakeIngestas: FakeIngestas;
let fakeTareas: FakeTareas;

function setDb(sobre: Partial<CrmDb> = {}): void {
  fakeIngestas = new FakeIngestas();
  fakeTareas = new FakeTareas();
  __setCrmDbForTests({
    pool: {} as never,
    empresas: {} as never,
    importador: {} as never,
    pipeline: {} as never,
    transiciones: {} as never,
    resultados: {} as never,
    handoffs: {} as never,
    actividades: {} as never,
    asignaciones: {} as never,
    envios: {} as never,
    panel: {} as never,
    conversaciones: {} as never,
    mensajes: {} as never,
    conocimiento: {} as never,
    ingestaConocimiento: fakeIngestas,
    tareas: fakeTareas,
    ...sobre,
  } satisfies CrmDb);
}

function sinRepos(): void {
  fakeIngestas = new FakeIngestas();
  fakeTareas = new FakeTareas();
  __setCrmDbForTests({
    pool: {} as never,
    empresas: {} as never,
    importador: {} as never,
    pipeline: {} as never,
    transiciones: {} as never,
    resultados: {} as never,
    handoffs: {} as never,
    actividades: {} as never,
    asignaciones: {} as never,
    envios: {} as never,
    panel: {} as never,
    conversaciones: {} as never,
    mensajes: {} as never,
    conocimiento: {} as never,
  } satisfies CrmDb);
}

function jsonPost(body: unknown): Request {
  return new Request('http://localhost/api/crm/conocimiento/ingestas', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function multipartPost(
  campos: Record<string, string>,
  archivo?: { nombre: string; contenido: Buffer; tipo?: string },
): Request {
  const fd = new FormData();
  for (const [clave, valor] of Object.entries(campos)) fd.append(clave, valor);
  if (archivo) {
    // Uint8Array propio (Buffer genérico no entra a BlobPart en TS estricto).
    fd.append(
      'file',
      new File([new Uint8Array(archivo.contenido)], archivo.nombre, {
        type: archivo.tipo ?? 'application/octet-stream',
      }),
    );
  }
  return new Request('http://localhost/api/crm/conocimiento/ingestas', {
    method: 'POST',
    body: fd,
  });
}

function getLista(query = ''): Request {
  return new Request(`http://localhost/api/crm/conocimiento/ingestas${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm_conocimiento'] });
  mocks.procesarMock.mockResolvedValue({ procesadas: 1, resultados: [] });
  setDb();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('POST /api/crm/conocimiento/ingestas — gates (E4·T8)', () => {
  it('401 UNAUTHORIZED sin sesión', async () => {
    mocks.getSessionMock.mockResolvedValue(null);

    const response = await POST(jsonPost({ nombre: 'X', contenido: 'Y' }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(fakeIngestas.creadas).toHaveLength(0);
  });

  it('403 FORBIDDEN sin el permiso crm_conocimiento', async () => {
    mocks.getSessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm'] });

    const response = await POST(jsonPost({ nombre: 'X', contenido: 'Y' }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ success: false, code: 'FORBIDDEN' });
    expect(fakeIngestas.creadas).toHaveLength(0);
  });
});

describe('POST /api/crm/conocimiento/ingestas — JSON (texto pegado)', () => {
  it('201 happy: ingesta TEXTO PENDIENTE + tarea encolada (conversacionId NULL, mensajeId = ingestaId) + drenaje fire-and-forget', async () => {
    const response = await POST(
      jsonPost({
        nombre: 'Políticas 2026',
        contenido: 'Contenido pegado por el operador',
        vigenciaDesde: '2026-01-01T00:00:00.000Z',
        vigenciaHasta: '2026-12-31T00:00:00.000Z',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.ingesta).toMatchObject({
      nombre: 'Políticas 2026',
      tipo: 'TEXTO',
      estado: 'PENDIENTE',
      creadoPor: 'Marcos Conversa',
    });

    expect(fakeIngestas.creadas[0]).toMatchObject({
      nombre: 'Políticas 2026',
      tipo: 'TEXTO',
      contenidoCrudo: 'Contenido pegado por el operador',
      creadoPor: 'Marcos Conversa',
      vigenciaDesde: new Date('2026-01-01T00:00:00.000Z'),
      vigenciaHasta: new Date('2026-12-31T00:00:00.000Z'),
    });
    expect(fakeTareas.creaciones).toEqual([
      { conversacionId: null, mensajeId: body.ingesta.id, tipo: 'INGESTAR_CONOCIMIENTO' },
    ]);
    expect(mocks.procesarMock).toHaveBeenCalledTimes(1);
  });

  it('400 IngestaInvalidaError (contenido vacío) — el mensaje nombra el campo', async () => {
    const response = await POST(jsonPost({ nombre: 'Sin cuerpo', contenido: '   ' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('contenidoCrudo');
    expect(fakeIngestas.creadas).toHaveLength(0);
    expect(fakeTareas.creaciones).toHaveLength(0); // sin encolar (contrato T7)
    expect(mocks.procesarMock).not.toHaveBeenCalled(); // sin drenaje sin tarea
  });

  it('400 cuerpo que no es objeto JSON', async () => {
    const response = await POST(jsonPost('"solo un string"'));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('VALIDATION_ERROR');
  });

  it('500 inesperado → INTERNAL_ERROR sin filtrar el mensaje del repo', async () => {
    fakeIngestas.falloEnCrear = new Error('secreto interno de la base');

    const response = await POST(jsonPost({ nombre: 'X', contenido: 'Y' }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(body)).not.toContain('secreto interno');
  });
});

describe('POST /api/crm/conocimiento/ingestas — multipart (archivo)', () => {
  it('201 happy .txt: extrae en el upload (BOM/\\r\\n normalizados), tipo TXT, nombre del file', async () => {
    const response = await POST(
      multipartPost(
        { vigenciaDesde: '2026-02-01' },
        { nombre: 'notas.txt', contenido: Buffer.from('\uFEFFlinea uno\r\nlinea dos', 'utf8'), tipo: 'text/plain' },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.ingesta).toMatchObject({ nombre: 'notas.txt', tipo: 'TXT', estado: 'PENDIENTE' });
    expect(fakeIngestas.creadas[0]).toMatchObject({
      nombre: 'notas.txt',
      tipo: 'TXT',
      contenidoCrudo: 'linea uno\nlinea dos',
      vigenciaDesde: new Date('2026-02-01T00:00:00.000Z'),
    });
    expect(fakeTareas.creaciones).toHaveLength(1);
    expect(mocks.procesarMock).toHaveBeenCalledTimes(1);
  });

  it('422 .pdf con bytes basura → ExtraccionError (documento ilegible)', async () => {
    const response = await POST(
      multipartPost({}, { nombre: 'corrupto.pdf', contenido: Buffer.from('%PDF-1.7 esto no es un pdf valido', 'utf8'), tipo: 'application/pdf' }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/extraer/i);
    expect(fakeIngestas.creadas).toHaveLength(0);
    expect(mocks.procesarMock).not.toHaveBeenCalled();
  });

  it('400 extensión desconocida (nunca intenta extraer)', async () => {
    const response = await POST(
      multipartPost({}, { nombre: 'virus.exe', contenido: Buffer.from('MZ...') }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('VALIDATION_ERROR');
    expect(fakeIngestas.creadas).toHaveLength(0);
  });

  it('400 archivo mayor a 5 MB (Content-Length lo delata ANTES de leerlo)', async () => {
    const response = await POST(
      multipartPost({}, { nombre: 'grande.txt', contenido: Buffer.alloc(5 * 1024 * 1024 + 1, 97) }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/5 ?MB/i);
    expect(fakeIngestas.creadas).toHaveLength(0);
    expect(mocks.procesarMock).not.toHaveBeenCalled();
  });

  it('400 sin el campo file', async () => {
    const response = await POST(multipartPost({ vigenciaDesde: '' }));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('VALIDATION_ERROR');
    expect(fakeIngestas.creadas).toHaveLength(0);
  });
});

describe('POST /api/crm/conocimiento/ingestas — contenedor', () => {
  it('503 cuando el contenedor no trae los repos de ingesta/tareas', async () => {
    sinRepos();

    const response = await POST(jsonPost({ nombre: 'X', contenido: 'Y' }));

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('INTERNAL_ERROR');
  });
});

describe('GET /api/crm/conocimiento/ingestas', () => {
  it('401 sin sesión / 403 sin permiso', async () => {
    mocks.getSessionMock.mockResolvedValue(null);
    expect((await GET(getLista())).status).toBe(401);

    mocks.getSessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm'] });
    expect((await GET(getLista())).status).toBe(403);
  });

  it('200: lista en shape de wire SIN contenidoCrudo, fechas ISO, limite default 20, no-store', async () => {
    fakeIngestas.recientes = [ingestaFixture()];

    const response = await GET(getLista());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fakeIngestas.limitePedida).toBe(20);
    expect(body.ingestas).toEqual([
      {
        id: 7,
        nombre: 'Manual comercial.pdf',
        tipo: 'PDF',
        tamanoBytes: 42,
        estado: 'COMPLETADA',
        error: null,
        entradasCreadas: 3,
        creadoPor: 'Marcos Conversa',
        creadoEn: '2026-10-12T10:00:00.000Z',
        procesadoEn: '2026-10-12T10:00:05.000Z',
        vigenciaDesde: null,
        vigenciaHasta: null,
      },
    ]);
    expect(JSON.stringify(body)).not.toContain('nunca viaja por el wire');
  });

  it('tope duro 50 (?limite=500) y default ante basura (?limite=abc)', async () => {
    await GET(getLista('?limite=500'));
    expect(fakeIngestas.limitePedida).toBe(50);

    await GET(getLista('?limite=abc'));
    expect(fakeIngestas.limitePedida).toBe(20);
  });

  it('503 cuando el contenedor no trae el repo de ingestas', async () => {
    sinRepos();

    const response = await GET(getLista());

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('INTERNAL_ERROR');
  });
});
