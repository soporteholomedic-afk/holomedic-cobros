/**
 * ListarUsuariosAsignablesUseCase (agente-ia-crm E3·T3) — the escalar
 * target list: users whose permisos include 'crm_conversaciones'
 * (the gate the proxy already enforces for the whole prefix — an
 * operator without it could not even see the conversation they would
 * be assigned to). ONLY {id, nombre} crosses the boundary: `id` is
 * the LOGIN NAME (dbo.usuarios.usuario, the currency asignadaA
 * stores — empresas asignar precedent), never the opaque idUsuario;
 * no other field (area, correo, permisos, hash) leaks. The dep is a
 * narrow structural source the route wires over getUsuarioDb()
 * (/api/usuarios route precedent — list() and nothing else).
 */

/** One assignable operator as the escalar selector sees it. */
export interface UsuarioAsignable {
  /** Login name — the value POST /escalar expects as usuarioId. */
  id: string;
  /** Display name. */
  nombre: string;
}

/**
 * The minimal users source this use case needs — satisfied
 * STRUCTURALLY by the auth repository (IUsuarioRepository.list();
 * UsuarioRow's usuario/nombre/permisos are the only fields read).
 */
export interface FuenteUsuariosAsignables {
  list(): Promise<
    ReadonlyArray<{ usuario: string; nombre: string; permisos: ReadonlyArray<string> }>
  >;
}

export class ListarUsuariosAsignablesUseCase {
  constructor(private readonly fuente: FuenteUsuariosAsignables) {}

  async ejecutar(): Promise<UsuarioAsignable[]> {
    const usuarios = await this.fuente.list();
    return usuarios
      .filter((usuario) => usuario.permisos.includes('crm_conversaciones'))
      .map((usuario) => ({ id: usuario.usuario, nombre: usuario.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre) || a.id.localeCompare(b.id));
  }
}
