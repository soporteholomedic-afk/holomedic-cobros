export class UsuarioNotFoundError extends Error {
  constructor(id: string) {
    super(`Usuario not found: ${id}`);
    this.name = 'UsuarioNotFoundError';
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Credenciales inválidas');
    this.name = 'InvalidCredentialsError';
  }
}
