/**
 * Pure implementation of the D1 contacto merge rule (design D1) for
 * re-imports: a row whose NORMALIZED name (normalizarNombre) matches an
 * existing contacto of the SAME empresa updates that contacto —
 * teléfono overwritten if provided, correos UNIONed (existing ones are
 * never removed). No name match → a NEW contacto. Correo overlap
 * WITHOUT a name match is NOT a merge: a non-blocking warning row
 * ("Posible contacto duplicado") is emitted and the contacto is still
 * created — shared inboxes must never silently fuse two people.
 *
 * The planner is scoped to ONE empresa: the caller passes ONLY that
 * empresa's existing contactos, so merging can never happen across
 * empresas (DB backstop: `UQ_CRM_Contactos_EmpresaNombre`). Warnings
 * reuse the import-report row shape ({fila, columna, mensaje}) anchored
 * at the group's first sheet fila.
 */
import { COLUMNAS_IMPORT_CRM } from './columnas';
import type { ContactoImportado, ErrorFilaImport } from './validarImportacion';
import { normalizarNombre } from '../normalizar';

/** An existing DB contacto reduced to what the merge rule needs. */
export interface ContactoExistenteMerge {
  id: number;
  nombre: string;
  /** Stored dedup key (`UQ_CRM_Contactos_EmpresaNombre`). */
  nombreNormalizado: string;
  telefono: string | null;
  /** Normalized addresses already stored for this contacto. */
  correos: string[];
}

/** Update intent for an existing contacto (union semantics). */
export interface PlanContactoActualizacion {
  contactoId: number;
  /** Incoming teléfono if provided, otherwise the existing one (kept). */
  telefono: string | null;
  /** Only the incoming correos missing from the existing set. */
  correosNuevos: string[];
}

/** Creation intent — mirrors the imported contacto as validated. */
export interface PlanContactoCreacion {
  nombre: string;
  telefono: string | null;
  correos: string[];
  esPrincipal: boolean;
}

export interface PlanMergeContactos {
  creaciones: PlanContactoCreacion[];
  actualizaciones: PlanContactoActualizacion[];
  advertencias: ErrorFilaImport[];
}

/** Excel header of the correos column, derived from the shared constant (anti-drift). */
const ENCABEZADO_CORREOS =
  COLUMNAS_IMPORT_CRM.find((columna) => columna.clave === 'correos')?.encabezado ?? 'Correos';

/**
 * Plan the merge of imported contactos into one empresa's existing
 * contactos. `filaAviso` anchors duplicate warnings at the group's
 * first sheet fila (contactos are collapsed per name by the validator,
 * so an incoming contacto has no single row of its own).
 */
export function planificarMergeContactos(
  existentes: readonly ContactoExistenteMerge[],
  entrantes: readonly ContactoImportado[],
  filaAviso: number,
): PlanMergeContactos {
  const porNombre = new Map(existentes.map((c) => [c.nombreNormalizado, c]));
  const correosEnEmpresa = new Set(existentes.flatMap((c) => c.correos));

  const creaciones: PlanContactoCreacion[] = [];
  const actualizaciones: PlanContactoActualizacion[] = [];
  const advertencias: ErrorFilaImport[] = [];

  for (const entrante of entrantes) {
    const coincidente = porNombre.get(normalizarNombre(entrante.nombre));
    if (coincidente) {
      const correosNuevos = entrante.correos.filter(
        (correo) => !coincidente.correos.includes(correo),
      );
      actualizaciones.push({
        contactoId: coincidente.id,
        telefono: entrante.telefono ?? coincidente.telefono,
        correosNuevos,
      });
      continue;
    }

    const solapado = entrante.correos.find((correo) => correosEnEmpresa.has(correo));
    if (solapado !== undefined) {
      advertencias.push({
        fila: filaAviso,
        columna: ENCABEZADO_CORREOS,
        mensaje: `Posible contacto duplicado: el correo "${solapado}" ya pertenece a otro contacto de esta empresa; se crea como contacto nuevo`,
      });
    }
    creaciones.push({
      nombre: entrante.nombre,
      telefono: entrante.telefono,
      correos: entrante.correos,
      esPrincipal: entrante.esPrincipal,
    });
  }

  return { creaciones, actualizaciones, advertencias };
}
