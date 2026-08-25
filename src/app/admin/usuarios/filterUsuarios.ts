/**
 * Pure search filter for the admin usuarios table
 * (usuarios-nombre-firma, usuarios-correo): the search box matches the
 * login identifier (`usuario`), the display full name (`nombre`), the
 * area, or the correo — so "john" finds "John Doe" by nombre and
 * "maria@holo" finds the account by correo. Extracted beside the page
 * so the behavior is unit-testable without rendering the page.
 */
export interface FilterableUsuario {
  usuario: string;
  nombre: string;
  area: string;
  correo?: string | null;
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
      u.area.toLowerCase().includes(term) ||
      (u.correo?.toLowerCase().includes(term) ?? false),
  );
}
