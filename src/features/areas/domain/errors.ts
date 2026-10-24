export class AreaNotFoundError extends Error {
  constructor(id: string) {
    super(`Area not found: ${id}`);
    this.name = 'AreaNotFoundError';
  }
}

export class AreaDuplicadaError extends Error {
  constructor(nombre: string) {
    super(`Ya existe un área activa con el nombre: ${nombre}`);
    this.name = 'AreaDuplicadaError';
  }
}
