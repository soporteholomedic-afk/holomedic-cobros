import type { EstadoEmpresa } from './entities';

/** Fallback estado for NULL/''/unknown codes (D2). */
export const ESTADO_SIN_DATOS: EstadoEmpresa = '—';

/** All valid members — runtime whitelist for the hook guard. */
export const ESTADOS_EMPRESA: readonly EstadoEmpresa[] = [
  'PAGO CONFORME',
  'PAGO POR CONFIRMAR',
  'CREDITO',
  ESTADO_SIN_DATOS,
];

/** Total mapper (D1/D2): raw SP code → EstadoEmpresa; raw codes never pass through. */
export function estadoFromEstCob(code: string | null | undefined): EstadoEmpresa {
  switch (code?.trim()) {
    case 'C':
      return 'PAGO CONFORME';
    case 'PP':
      return 'PAGO POR CONFIRMAR';
    case 'P':
      return 'CREDITO';
    default:
      return ESTADO_SIN_DATOS;
  }
}
