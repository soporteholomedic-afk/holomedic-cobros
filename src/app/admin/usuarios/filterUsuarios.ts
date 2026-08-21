/**
 * Pure search filter for the admin usuarios table
 * (usuarios-nombre-firma): the search box matches the login identifier
 * (`usuario`), the display full name (`nombre`), or the area — so
 * "john" finds "John Doe" by nombre and "asmith" finds the account by
 * usuario. Extracted beside the page so the behavior is unit-testable
 * without rendering the page.
 */
export interface FilterableUsuario {
  usuario: string;
  nombre: string;
  area: string;
}

export function filterUsuarios<T extends FilterableUsuario>(
  usuarios: T[],
  searchTerm: string,
): T[] {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return usuarios;
  return usuarios.filter(
    (u) =>
      u.usuario.toLowerCase().includes(term) ||
      u.nombre.toLowerCase().includes(term) ||
      u.area.toLowerCase().includes(term),
  );
}
