/**
 * Área organizacional (catalog used to assign users to their area).
 *
 * `usuarios.area` predates this catalog as a free-text NVARCHAR(50)
 * column; `dbo.areas` gives that value a managed home. The migration
 * seeds one row per existing distinct `usuarios.area` so nothing is
 * lost when the usuarios form switches to the dropdown.
 */
export interface Area {
  idArea: string;
  /** Unique display name among ACTIVE areas (filtered unique index). */
  nombre: string;
  descripcion: string | null;
  /** Soft delete flag (patrón usuarios): DELETE keeps the row with activo = 0. */
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAreaInput {
  nombre: string;
  descripcion?: string | null;
}

export interface UpdateAreaInput {
  nombre?: string;
  descripcion?: string | null;
  activo?: boolean;
}
