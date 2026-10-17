import type { ConfigCrmRepository } from '../domain/ports';
import type { ConfigAgente } from './configAgente';
import { CLAVES_CONFIG_AGENTE, resolverConfigAgente } from './resolverConfigAgente';

/**
 * Admin write path for the hot agent config (agente-ia-crm E5·T3).
 * Validation is STRICT (unlike the lenient env parsing): any invalid
 * field throws `ErrorConfigAgenteInvalida` BEFORE a single write, so a
 * bad payload never half-applies. Every changed key is persisted as a
 * non-secret row through the repo (which audits each change).
 */

export type CampoConfigAgente = keyof typeof CLAVES_CONFIG_AGENTE;

export interface CambiosConfigAgente {
  habilitado?: boolean;
  umbralConfianza?: number;
  maxIntercambios?: number;
  horarioDesde?: number;
  horarioHasta?: number;
  textoEscalado?: string;
}

export class ErrorConfigAgenteInvalida extends Error {
  constructor(
    readonly campo: CampoConfigAgente,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorConfigAgenteInvalida';
  }
}

export interface GuardarConfigAgenteDeps {
  config: Pick<ConfigCrmRepository, 'guardar' | 'listar'>;
}

const LARGO_MAXIMO_TEXTO_ESCALADO = 500;
const ORDEN_CAMPOS: readonly CampoConfigAgente[] = [
  'habilitado',
  'umbralConfianza',
  'maxIntercambios',
  'horarioDesde',
  'horarioHasta',
  'textoEscalado',
];

function esHora(valor: number): boolean {
  return Number.isInteger(valor) && valor >= 0 && valor <= 23;
}

/** Validate and serialize ONE field; throws with its name when invalid. */
function serializar(campo: CampoConfigAgente, cambios: CambiosConfigAgente): string {
  const invalida = (mensaje: string): ErrorConfigAgenteInvalida =>
    new ErrorConfigAgenteInvalida(campo, mensaje);
  switch (campo) {
    case 'habilitado': {
      const valor: unknown = cambios.habilitado;
      if (typeof valor !== 'boolean') throw invalida('habilitado debe ser booleano');
      return valor ? 'true' : 'false';
    }
    case 'umbralConfianza': {
      const valor: unknown = cambios.umbralConfianza;
      if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0 || valor > 1) {
        throw invalida('umbralConfianza debe estar en (0, 1]');
      }
      return String(valor);
    }
    case 'maxIntercambios': {
      const valor: unknown = cambios.maxIntercambios;
      if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1) {
        throw invalida('maxIntercambios debe ser un entero >= 1');
      }
      return String(valor);
    }
    case 'horarioDesde':
    case 'horarioHasta': {
      const valor: unknown = cambios[campo];
      if (typeof valor !== 'number' || !esHora(valor)) {
        throw invalida(`${campo} debe ser un entero entre 0 y 23`);
      }
      return String(valor);
    }
    case 'textoEscalado': {
      const valor: unknown = cambios.textoEscalado;
      if (typeof valor !== 'string' || valor.trim() === '') {
        throw invalida('textoEscalado no puede estar vacío');
      }
      const recortado = valor.trim();
      if (recortado.length > LARGO_MAXIMO_TEXTO_ESCALADO) {
        throw invalida(`textoEscalado excede ${LARGO_MAXIMO_TEXTO_ESCALADO} caracteres`);
      }
      return recortado;
    }
  }
}

export class GuardarConfigAgenteUseCase {
  constructor(private readonly deps: GuardarConfigAgenteDeps) {}

  async guardar(cambios: CambiosConfigAgente, usuario: string): Promise<ConfigAgente> {
    const campos = ORDEN_CAMPOS.filter((campo) => campo in cambios && cambios[campo] !== undefined);
    // Validate EVERYTHING first: no write happens if any field is invalid.
    const escrituras = campos.map((campo) => ({
      clave: CLAVES_CONFIG_AGENTE[campo],
      valor: serializar(campo, cambios),
    }));
    for (const escritura of escrituras) {
      await this.deps.config.guardar({ ...escritura, esSecreto: false, usuario });
    }
    return resolverConfigAgente({ config: this.deps.config });
  }

  /** Kill-switch convenience: audited through the repo like any other key. */
  alternarKillSwitch(habilitado: boolean, usuario: string): Promise<ConfigAgente> {
    return this.guardar({ habilitado }, usuario);
  }
}
