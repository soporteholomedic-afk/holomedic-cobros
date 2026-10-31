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
