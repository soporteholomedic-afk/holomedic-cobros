import { ETAPA_LABELS, type Etapa } from './entities';

export class EmpresaNotFoundError extends Error {
  constructor(id: string) {
    super(`Empresa not found: ${id}`);
    this.name = 'EmpresaNotFoundError';
  }
}

export class RucDuplicadoError extends Error {
  constructor(ruc: string) {
    super(`Ya existe una empresa con el RUC: ${ruc}`);
    this.name = 'RucDuplicadoError';
  }
}

/** The RUC being completed already belongs to another empresa; the caller may confirm a merge. */
export class RucDeOtraEmpresaError extends Error {
  readonly otra: { idEmpresa: string; razonSocial: string; etapa: Etapa };

  constructor(otra: { idEmpresa: string; razonSocial: string; etapa: Etapa }) {
    super(`Este RUC ya es de ${otra.razonSocial} («${ETAPA_LABELS[otra.etapa]}»). ¿Unir las dos tarjetas?`);
    this.name = 'RucDeOtraEmpresaError';
    this.otra = { idEmpresa: otra.idEmpresa, razonSocial: otra.razonSocial, etapa: otra.etapa };
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
