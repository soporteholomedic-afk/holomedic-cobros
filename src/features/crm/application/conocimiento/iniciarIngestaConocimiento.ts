import type {
  IngestaConocimiento,
  ResultadoCrearTarea,
  TipoIngesta,
} from '../../domain/entities';
import type { IngestaConocimientoRepository, TareaAgenteRepository } from '../../domain/ports';

/**
 * IniciarIngestaConocimientoUseCase (agente-ia-crm E4·T7) — el arranque
 * de una ingesta de conocimiento: valida la entrada, crea la fila
 * PENDIENTE en CRM_IngestasConocimiento y encola UNA tarea
 * INGESTAR_CONOCIMIENTO en la cola duradera (CRM_AgenteTareas).
 *
 * CONTRATO DE EXTRACCIÓN: `contenidoCrudo` llega YA EXTRAÍDO a texto —
 * para TEXTO es el pegado del operador; para PDF/TXT/DOCX la ruta de
 * subida (T8) llama extraerTextoArchivo(buffer, tipo) en el momento
 * del upload (los 5 MB se procesan en un tirón) y guarda el TEXTO.
 * El tipo describe la procedencia, no el formato del crudo — el
 * procesador trocea lo que haya, uniforme para todos los tipos. Así la
 * cola nunca ve binarios (payload { ingestaId } only) y el crudo queda
 * auditable en NVARCHAR(MAX).
 *
 * DEDUP DE LA COLA (E4·T7): la tarea nace con conversacionId NULL (la
 * ingesta no tiene conversación) y mensajeId = ingestaId — la UNIQUE
 * (conversacionId, mensajeId, tipo) trata los NULL como iguales, así
 * que es exactamente una tarea por ingesta. El disparo del drenaje NO
 * vive acá: la ruta dispara crearProcesadorTareasAgente().procesar()
 * fire-and-forget (webhook precedent) y el barredor lazy recupera lo
 * que un disparo pierda.
 *
 * LÍMITES: nombre ≤260 (columna), crudo no vacío y ≤200 000 chars (la
 * ingesta razonable cabe en ~222 chunks del tope del troceador), y
 * byteLength ≤5 MB como defensa en profundidad — matemáticamente
 * inalcanzable tras el tope de chars (máx. 800 KB UTF-8), queda por
 * fidelidad al diseño por si el tope de chars cambia algún día.
 */

/** Error tipado de validación de la entrada (T8 lo mapea a 400). */
export class IngestaInvalidaError extends Error {
  constructor(
    readonly campo: string,
    motivo: string,
  ) {
    super(`Ingesta inválida (${campo}): ${motivo}`);
    this.name = 'IngestaInvalidaError';
  }
}

/** Nombre del documento (columna NVARCHAR(260)). */
const NOMBRE_MAX_CARACTERES = 260;
/** Tope del crudo: ~222 chunks al objetivo del troceador (~900). */
export const LIMITE_CARACTERES_CRUDO = 200_000;
/** Defensa en profundidad (inalcanzable con el tope de chars — ver cabecera). */
export const LIMITE_BYTES_CONTENIDO = 5 * 1024 * 1024;

/** Catálogo cerrado de tipos (CHECK-backed en la tabla). */
const TIPOS_INGESTA = new Set<TipoIngesta>(['TEXTO', 'PDF', 'TXT', 'DOCX']);

export interface EntradaIniciarIngestaConocimiento {
  /** Nombre visible del documento (archivo o título del pegado). */
  nombre: string;
  tipo: TipoIngesta;
  /** Texto crudo YA extraído (nunca binarios — ver cabecera). */
  contenidoCrudo: string;
  /** Usuario operador que sube (null = sistema). */
  creadoPor?: string | null;
  /** Ventana de vigencia heredable por las entradas que cree. */
  vigenciaDesde?: Date | null;
  vigenciaHasta?: Date | null;
}

export interface ResultadoIniciarIngestaConocimiento {
  ingesta: IngestaConocimiento;
  /** La tarea encolada (creada:false = replay del mismo id, no ocurre con ids frescos). */
  tarea: ResultadoCrearTarea;
}

export interface IniciarIngestaConocimientoDeps {
  ingestas: IngestaConocimientoRepository;
  tareas: Pick<TareaAgenteRepository, 'crearSiNoExiste'>;
}

export class IniciarIngestaConocimientoUseCase {
  constructor(private readonly deps: IniciarIngestaConocimientoDeps) {}

  async ejecutar(entrada: EntradaIniciarIngestaConocimiento): Promise<ResultadoIniciarIngestaConocimiento> {
    const nombre = entrada.nombre.trim();
    if (nombre === '') {
      throw new IngestaInvalidaError('nombre', 'el nombre es obligatorio');
    }
    if (nombre.length > NOMBRE_MAX_CARACTERES) {
      throw new IngestaInvalidaError('nombre', `máximo ${NOMBRE_MAX_CARACTERES} caracteres`);
    }
    if (!TIPOS_INGESTA.has(entrada.tipo)) {
      throw new IngestaInvalidaError('tipo', 'debe ser TEXTO, PDF, TXT o DOCX');
    }
    // El crudo se valida sin recortar (se guarda tal cual); solo se
    // verifica que no sea vacío de puro espacio.
    if (entrada.contenidoCrudo.trim() === '') {
      throw new IngestaInvalidaError('contenidoCrudo', 'el contenido es obligatorio');
    }
    if (entrada.contenidoCrudo.length > LIMITE_CARACTERES_CRUDO) {
      throw new IngestaInvalidaError('contenidoCrudo', `máximo ${LIMITE_CARACTERES_CRUDO} caracteres`);
    }
    const tamanoBytes = Buffer.byteLength(entrada.contenidoCrudo, 'utf8');
    if (tamanoBytes > LIMITE_BYTES_CONTENIDO) {
      throw new IngestaInvalidaError('contenidoCrudo', 'supera el máximo de 5 MB');
    }

    const ingesta = await this.deps.ingestas.crear({
      nombre,
      tipo: entrada.tipo,
      tamanoBytes,
      contenidoCrudo: entrada.contenidoCrudo,
      creadoPor: entrada.creadoPor ?? null,
      vigenciaDesde: entrada.vigenciaDesde ?? null,
      vigenciaHasta: entrada.vigenciaHasta ?? null,
    });
    const tarea = await this.deps.tareas.crearSiNoExiste({
      conversacionId: null,
      mensajeId: ingesta.id,
      tipo: 'INGESTAR_CONOCIMIENTO',
    });
    return { ingesta, tarea };
  }
}
