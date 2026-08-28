/**
 * FirmaCorreo entity — self-service email signature (editor-firmas).
 *
 * Five structured fields the user edits on the "Mi firma" page; the
 * send paths interpolate the HTML block composed from them. Every
 * value is a plain string: optional fields (telefono, anexo) are ''
 * when not provided, never null/undefined, so the shape is stable for
 * JSON storage (see firmaCodec) and client consumption.
 */
export interface FirmaCorreo {
  nombre: string;
  area: string;
  correo: string;
  telefono: string;
  anexo: string;
}

/**
 * Discriminates each signature field. Used as the key set for
 * per-field validation errors and codec shape checks.
 */
export type CampoFirma = 'nombre' | 'area' | 'correo' | 'telefono' | 'anexo';
