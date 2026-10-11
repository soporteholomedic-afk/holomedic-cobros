import type {
  NivelMemoria,
  ObservacionMemoria,
  ResultadoGuardarMemoria,
} from '../../domain/entities';
import type { EntradaGuardarMemoria, MemoriaConversacionPort } from '../../domain/ports';

/**
 * Engram 3.3.2 HTTP adapter for MemoriaConversacionPort (agente-ia-crm
 * E2·T2) — coded against the parent's VERIFIED live contract:
 * - POST /sessions {"id","project"} → 201, IDEMPOTENT (safe before
 *   every save).
 * - POST /observations {"session_id","title","content","project",
 *   "type","scope":"project","operation_id"} → 201 {"id","status"},
 *   idempotent BY operation_id (same replay → same id).
 * - GET /observations/save-result?operation_id=X → 200 {"id","status":
 *   "committed"} once committed; 404 while pending. Bounded poll
 *   (250 ms interval, max 8 tries ≈ 2 s); still-uncommitted is
 *   NON-fatal ({estado:'guardado'}).
 * - GET /search?q&project&limit → 200 array (NO server-side session
 *   filter — the client filters session_id). Timestamps are UTC
 *   "YYYY-MM-DD HH:MM:SS" strings.
 * - GET /context?project → 200 {"context": markdown}; parse ONLY the
 *   "### Pinned" block, skipping malformed lines.
 * - PUT /observations/{id}/pin → 200.
 *
 * Scoping (locked design): project `crm-emp-<empresaId>` per empresa;
 * sessions `chat-<conversacionId>` (nivel 'chat') and the fixed
 * `empresa` session (nivel 'empresa').
 *
 * Errors: every failure maps to ONE typed ErrorMemoriaCrm codigo —
 * MEMORIA_TIMEOUT (AbortController per call), MEMORIA_ERROR (non-2xx
 * outside the save-result 404 path, network failures) or
 * MEMORIA_RESPUESTA_INVALIDA (garbage JSON / missing fields).
 * MEMORIA_NO_CONFIGURADA is raised by the factory's fail-closed
 * adapter, never here.
 *
 * Security: observation content is PII — it is NEVER logged; the only
 * log line (poll exhausted) carries the observation id and estado.
 */

/** Typed error surface of every MemoriaConversacionPort adapter. */
export type CodigoErrorMemoria =
  | 'MEMORIA_NO_CONFIGURADA'
  | 'MEMORIA_TIMEOUT'
  | 'MEMORIA_ERROR'
  | 'MEMORIA_RESPUESTA_INVALIDA';

/** One typed memory failure: `codigo` drives the caller's handling. */
export class ErrorMemoriaCrm extends Error {
  readonly codigo: CodigoErrorMemoria;
  readonly detalle: string;

  constructor(codigo: CodigoErrorMemoria, detalle: string) {
    super(`${codigo}: ${detalle}`);
    this.name = 'ErrorMemoriaCrm';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

/** Constructor config: base URL, optional Bearer token, per-call timeout. */
export interface ConfigMemoriaEngramHttp {
  urlBase: string;
  token?: string;
  timeoutMs?: number;
}

const TIMEOUT_POR_DEFECTO_MS = 5000;
const POLL_INTERVALO_MS = 250;
const POLL_INTENTOS_MAX = 8;

/** Project per empresa (aislamiento por empresa). */
function proyectoDeEmpresa(empresaId: number): string {
  return `crm-emp-${empresaId}`;
}

/** Session id for one save: nivel 'empresa' → fixed 'empresa' session. */
function sesionDeNivel(nivel: NivelMemoria, conversacionId: number): string {
  return nivel === 'empresa' ? 'empresa' : `chat-${conversacionId}`;
}

/** nivel derivation (locked design): only the fixed 'empresa' session is empresa-level. */
function nivelDeSesion(sessionId: string): NivelMemoria {
  return sessionId === 'empresa' ? 'empresa' : 'chat';
}

/** Redacted, user-safe rendering of an unknown thrown value. */
function detalleDe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function esAborto(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/** "YYYY-MM-DD HH:MM:SS" (UTC textual) → Date; epoch when unparseable. */
function parsearFechaEngram(crudo: unknown): Date {
  if (typeof crudo !== 'string' || crudo === '') return new Date(0);
  const fecha = new Date(`${crudo.replace(' ', 'T')}Z`);
  return Number.isNaN(fecha.getTime()) ? new Date(0) : fecha;
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolver) => {
    setTimeout(resolver, ms);
  });
}

/**
 * One /search row (verified contract subset the adapter consumes).
 * Unknown extra fields are ignored.
 */
interface FilaBusquedaEngram {
  id: number;
  session_id: string;
  type: string;
  title: string;
  content: string;
  created_at: unknown;
}

function esFilaBusqueda(fila: unknown): fila is FilaBusquedaEngram {
  if (fila === null || typeof fila !== 'object') return false;
  const candidata = fila as Record<string, unknown>;
  return (
    typeof candidata.id === 'number' &&
    Number.isFinite(candidata.id) &&
    typeof candidata.session_id === 'string' &&
    typeof candidata.type === 'string' &&
    typeof candidata.title === 'string' &&
    typeof candidata.content === 'string'
  );
}

/**
 * Pinned-line shape: `- [tipo] **titulo**: contenido`. An optional
 * parenthesized session marker between the bracket and the bold title
 * (tolerant superset: the verified render carries no session, so
 * those lines derive nivel 'chat') maps by the session rule.
 */
const RE_LINEA_PINNEADA = /^-\s*\[([^\]]+)\](?:\s*\(([^)]*)\))?\s+\*\*([^*]+)\*\*\s*:\s*(.*)$/;

/**
 * Parse the "### Pinned" block of a /context markdown render: extract
 * {tipo, titulo, contenido} per line, SKIP malformed lines (never
 * throw), stop at the next `###` section. Pinned lines carry no id
 * nor timestamp → id 0 (titulo is the caller's key) and epoch creadoEn.
 */
export function parsearPinned(contexto: string): ObservacionMemoria[] {
  const lineas = contexto.split('\n');
  const indicePinned = lineas.findIndex((linea) => linea.trim() === '### Pinned');
  if (indicePinned === -1) return [];

  const observaciones: ObservacionMemoria[] = [];
  for (const cruda of lineas.slice(indicePinned + 1)) {
    const linea = cruda.trim();
    if (linea === '') continue;
    if (linea.startsWith('###')) break;
    const coincidencia = RE_LINEA_PINNEADA.exec(linea);
    if (coincidencia === null) continue;
    const [, tipo, sesion, titulo, contenido] = coincidencia;
    observaciones.push({
      id: 0,
      nivel: nivelDeSesion(sesion ?? ''),
      tipo: tipo.trim(),
      titulo: titulo.trim(),
      contenido: contenido.trim(),
      creadoEn: new Date(0),
    });
  }
  return observaciones;
}

export class MemoriaEngramHttp implements MemoriaConversacionPort {
  private readonly urlBase: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: ConfigMemoriaEngramHttp) {
    this.urlBase = config.urlBase.trim().replace(/\/+$/, '');
    this.token =
      config.token !== undefined && config.token !== '' ? config.token : undefined;
    this.timeoutMs =
      config.timeoutMs !== undefined && Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
        ? config.timeoutMs
        : TIMEOUT_POR_DEFECTO_MS;
  }

  async contexto(empresaId: number): Promise<ObservacionMemoria[]> {
    const proyecto = proyectoDeEmpresa(empresaId);
    const respuesta = await this.llamar(
      'GET',
      `/context?project=${encodeURIComponent(proyecto)}`,
    );
    // 404 unknown_project es el estado vacío NORMAL de una empresa
    // nueva (sin proyecto Engram hasta el primer guardar) — memoria
    // vacía, no un error. Verificado en vivo contra Engram 3.3.2.
    if (await this.esProyectoVacio(respuesta)) return [];
    this.exigirOk(respuesta, '/context');
    const datos = await this.leerJson<{ context?: unknown }>(respuesta, '/context');
    if (datos === null || typeof datos !== 'object' || typeof datos.context !== 'string') {
      throw new ErrorMemoriaCrm(
        'MEMORIA_RESPUESTA_INVALIDA',
        'La respuesta de /context no trae el campo context (string)',
      );
    }
    return parsearPinned(datos.context);
  }

  async buscar(
    consulta: string,
    empresaId: number,
    conversacionId: number,
    limite: number,
  ): Promise<ObservacionMemoria[]> {
    const proyecto = proyectoDeEmpresa(empresaId);
    const parametros = new URLSearchParams({
      q: consulta,
      project: proyecto,
      limit: String(limite),
    });
    const respuesta = await this.llamar('GET', `/search?${parametros.toString()}`);
    // Igual que /context: proyecto inexistente = memoria vacía.
    if (await this.esProyectoVacio(respuesta)) return [];
    this.exigirOk(respuesta, '/search');
    const filas = await this.leerJson<unknown>(respuesta, '/search');
    if (Array.isArray(filas) === false) {
      throw new ErrorMemoriaCrm('MEMORIA_RESPUESTA_INVALIDA', '/search no devolvió un array');
    }

    const sesionesValidas = new Set([sesionDeNivel('chat', conversacionId), 'empresa']);
    const observaciones: ObservacionMemoria[] = [];
    for (const fila of filas) {
      if (esFilaBusqueda(fila) === false) {
        throw new ErrorMemoriaCrm(
          'MEMORIA_RESPUESTA_INVALIDA',
          'fila de /search con forma inesperada (id/session_id/type/title/content)',
        );
      }
      if (sesionesValidas.has(fila.session_id) === false) continue;
      observaciones.push({
        id: fila.id,
        nivel: nivelDeSesion(fila.session_id),
        tipo: fila.type,
        titulo: fila.title,
        contenido: fila.content,
        creadoEn: parsearFechaEngram(fila.created_at),
      });
    }
    return observaciones.slice(0, Math.max(0, limite));
  }

  async guardar(entrada: EntradaGuardarMemoria): Promise<ResultadoGuardarMemoria> {
    const proyecto = proyectoDeEmpresa(entrada.empresaId);
    const sesion = sesionDeNivel(entrada.nivel, entrada.conversacionId);

    // 1) Ensure the session — IDEMPOTENT (re-POST → 201 created), so it
    //    runs before EVERY save, replay-safe.
    const respuestaSesion = await this.llamar('POST', '/sessions', {
      id: sesion,
      project: proyecto,
    });
    this.exigirOk(respuestaSesion, '/sessions');

    // 2) Save with operation_id — the server dedups by it (same replay →
    //    same id, no duplicate).
    const respuestaGuardar = await this.llamar('POST', '/observations', {
      session_id: sesion,
      title: entrada.titulo,
      content: entrada.contenido,
      project: proyecto,
      type: entrada.tipo,
      scope: 'project',
      operation_id: entrada.operationId,
    });
    this.exigirOk(respuestaGuardar, '/observations');
    const guardado = await this.leerJson<{ id?: unknown }>(respuestaGuardar, '/observations');
    if (
      guardado === null ||
      typeof guardado !== 'object' ||
      typeof guardado.id !== 'number' ||
      Number.isFinite(guardado.id) === false
    ) {
      throw new ErrorMemoriaCrm(
        'MEMORIA_RESPUESTA_INVALIDA',
        '/observations no devolvió un id numérico',
      );
    }

    // 3) Bounded commit poll (non-fatal when it expires).
    return this.esperarCommit(guardado.id, entrada.operationId);
  }

  async pinear(id: number): Promise<void> {
    const respuesta = await this.llamar('PUT', `/observations/${id}/pin`);
    this.exigirOk(respuesta, `/observations/${id}/pin`);
  }

  /**
   * Bounded poll of the save-result endpoint: 404 = not yet committed
   * (keep trying, 250 ms apart, max 8 tries ≈ 2 s), 200 = committed
   * (per contract), anything else = MEMORIA_ERROR. Exhausted poll is
   * NON-fatal: the write stands with its id, only the confirmation is
   * pending — log the id ONLY (content is PII, never logged).
   */
  private async esperarCommit(id: number, operationId: string): Promise<ResultadoGuardarMemoria> {
    const ruta = `/observations/save-result?operation_id=${encodeURIComponent(operationId)}`;
    for (let intento = 1; intento <= POLL_INTENTOS_MAX; intento += 1) {
      if (intento > 1) await dormir(POLL_INTERVALO_MS);
      const respuesta = await this.llamar('GET', ruta);
      if (respuesta.status === 404) continue;
      this.exigirOk(respuesta, '/observations/save-result');
      return { id, estado: 'comprometido' };
    }
    console.log(
      `[crm-memoria] observación ${id} guardada sin confirmación de commit ` +
        `(poll agotado en ${POLL_INTENTOS_MAX} intentos, operation_id ${operationId})`,
    );
    return { id, estado: 'guardado' };
  }

  /** One HTTP call with its own AbortController deadline + Bearer auth. */
  private async llamar(
    metodo: 'GET' | 'POST' | 'PUT',
    ruta: string,
    cuerpo?: unknown,
  ): Promise<Response> {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), this.timeoutMs);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token !== undefined) headers.Authorization = `Bearer ${this.token}`;
    try {
      return await fetch(`${this.urlBase}${ruta}`, {
        method: metodo,
        headers,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: controlador.signal,
      });
    } catch (error: unknown) {
      if (esAborto(error)) {
        throw new ErrorMemoriaCrm(
          'MEMORIA_TIMEOUT',
          `Engram no respondió en ${this.timeoutMs} ms (${metodo} ${ruta})`,
        );
      }
      throw new ErrorMemoriaCrm(
        'MEMORIA_ERROR',
        `fallo de red contra Engram en ${metodo} ${ruta}: ${detalleDe(error)}`,
      );
    } finally {
      clearTimeout(temporizador);
    }
  }

  private exigirOk(respuesta: Response, ruta: string): void {
    if (respuesta.ok === false) {
      throw new ErrorMemoriaCrm(
        'MEMORIA_ERROR',
        `Engram respondió HTTP ${respuesta.status} en ${ruta}`,
      );
    }
  }

  /**
   * 404 + code "unknown_project" es el estado vacío legítimo (la
   * empresa aún no tiene proyecto Engram — recién se crea al primer
   * guardar). Lee el cuerpo (único consumidor en esta vía 404) y
   * decide vacío-vs-error; cualquier otro 404 sigue siendo error.
   */
  private async esProyectoVacio(respuesta: Response): Promise<boolean> {
    if (respuesta.status !== 404) return false;
    try {
      const cuerpo = (await respuesta.json()) as { code?: unknown };
      return cuerpo.code === 'unknown_project';
    } catch {
      return false;
    }
  }

  private async leerJson<T>(respuesta: Response, ruta: string): Promise<T> {
    try {
      return (await respuesta.json()) as T;
    } catch (error: unknown) {
      throw new ErrorMemoriaCrm(
        'MEMORIA_RESPUESTA_INVALIDA',
        `JSON inválido de Engram en ${ruta}: ${detalleDe(error)}`,
      );
    }
  }
}
