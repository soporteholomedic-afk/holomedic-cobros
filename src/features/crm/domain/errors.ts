import { ETAPA_OPORTUNIDAD_LABELS, type EtapaOportunidad } from './entities';

export class EmpresaNotFoundError extends Error {
  constructor(id: string) {
    super(`Empresa not found: ${id}`);
    this.name = 'EmpresaNotFoundError';
  }
}

export class OportunidadNotFoundError extends Error {
  constructor(id: string) {
    super(`Oportunidad not found: ${id}`);
    this.name = 'OportunidadNotFoundError';
  }
}

/** The activity names an oportunidad that belongs to another empresa. */
export class OportunidadDeOtraEmpresaError extends Error {
  constructor(idOportunidad: string, idEmpresa: string) {
    super('La oportunidad no pertenece a esta empresa');
    this.name = 'OportunidadDeOtraEmpresaError';
    this.idOportunidad = idOportunidad;
    this.idEmpresa = idEmpresa;
  }

  readonly idOportunidad: string;
  readonly idEmpresa: string;
}

export class RucDuplicadoError extends Error {
  constructor(ruc: string) {
    super(`Ya existe una empresa con el RUC: ${ruc}`);
    this.name = 'RucDuplicadoError';
  }
}

/** The RUC being completed already belongs to another empresa; the caller may confirm a merge. */
export class RucDeOtraEmpresaError extends Error {
  readonly otra: { idEmpresa: string; razonSocial: string; relacion: string };

  constructor(otra: { idEmpresa: string; razonSocial: string; relacion: string }) {
    super(`Este RUC ya es de ${otra.razonSocial} («${otra.relacion === 'cliente' ? 'Cliente' : 'Prospecto'}»). ¿Unir las dos fichas?`);
    this.name = 'RucDeOtraEmpresaError';
    this.otra = { idEmpresa: otra.idEmpresa, razonSocial: otra.razonSocial, relacion: otra.relacion };
  }
}

export class SectorDuplicadoError extends Error {
  constructor(nombre: string) {
    super(`Ya existe el sector: ${nombre}`);
    this.name = 'SectorDuplicadoError';
  }
}

export class EtapaInvalidaError extends Error {
  constructor(etapa: string) {
    super(`Etapa inválida: ${etapa}`);
    this.name = 'EtapaInvalidaError';
  }
}

export class DatosEmpresaInvalidosError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatosEmpresaInvalidosError';
  }
}

export class ArchivoImportacionInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchivoImportacionInvalidoError';
  }
}

/** The SUNAT lookup found no usable data for the RUC (no `razon_social`). */
export class RucNoEncontradoError extends Error {
  constructor(ruc: string) {
    super(`No se encontraron datos SUNAT para el RUC: ${ruc}`);
    this.name = 'RucNoEncontradoError';
  }
}

/** The lookup cannot run: no apifacturacion token is configured (S5). */
export class ConsultaNoConfiguradaError extends Error {
  constructor() {
    super(
      'La consulta SUNAT no está configurada. Configura el token de apifacturacion en Configuración.',
    );
    this.name = 'ConsultaNoConfiguradaError';
  }
}

/** apifacturacion is unreachable, timed out, or answered an unusable HTTP/JSON response. */
export class ServicioConsultaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ServicioConsultaError';
  }
}
