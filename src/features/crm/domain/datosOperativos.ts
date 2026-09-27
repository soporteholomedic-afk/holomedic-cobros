/**
 * Operational contact data (crm-ux redesign) — the three optional
 * (encargado, correo) pairs captured by the DatosSolicitados event:
 * facturación, médico ocupacional, administrador. All fields optional
 * by product decision; filled pairs become FIRST-CLASS contactos with
 * a `cargo` (upserted by empresaId+cargo in the empresas repository)
 * and ride the transition's `motivo` as a compact Spanish summary so
 * the living timeline shows what was obtained.
 */

/** One captured pair — both fields optional, at least one non-empty to count. */
export interface ParDatoOperativo {
  encargado?: string;
  correo?: string;
}

export interface DatosOperativosInput {
  facturacion?: ParDatoOperativo;
  medicoOcupacional?: ParDatoOperativo;
  administrador?: ParDatoOperativo;
}

/** The catalog: API key → stored cargo + form label (ONE source). */
export const CARGOS_OPERATIVOS: readonly {
  clave: keyof DatosOperativosInput;
  cargo: string;
  etiqueta: string;
}[] = [
  { clave: 'facturacion', cargo: 'Facturación', etiqueta: 'Correo de facturación' },
  { clave: 'medicoOcupacional', cargo: 'Médico ocupacional', etiqueta: 'Correo de médico ocupacional' },
  { clave: 'administrador', cargo: 'Administrador', etiqueta: 'Correo de administrador' },
];

/** Trim + null-ify one pair (missing → both null). */
export function limpiarParDato(par: ParDatoOperativo | undefined): {
  encargado: string | null;
  correo: string | null;
} {
  const encargado = par?.encargado?.trim() ?? '';
  const correo = par?.correo?.trim() ?? '';
  return {
    encargado: encargado === '' ? null : encargado,
    correo: correo === '' ? null : correo,
  };
}

/** Compact Spanish summary of the FILLED pairs (" · "-joined), null when none. */
export function construirResumenDatos(datos: DatosOperativosInput): string | null {
  const partes = CARGOS_OPERATIVOS.map(({ clave, cargo }) => {
    const { encargado, correo } = limpiarParDato(datos[clave]);
    if (encargado === null && correo === null) return null;
    const valor =
      encargado !== null && correo !== null
        ? `${encargado} (${correo})`
        : encargado !== null
          ? encargado
          : correo;
    return `${cargo}: ${valor}`;
  }).filter((parte): parte is string => parte !== null);
  return partes.length === 0 ? null : partes.join(' · ');
}
