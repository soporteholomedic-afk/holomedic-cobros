import type { Empresa, SeguimientoEmpresa } from '../domain/entities';

/** The whole follow-up state of an empresa as `updateSeguimiento` expects it. */
export function seguimientoDe(e: Empresa): SeguimientoEmpresa {
  return {
    etapa: e.etapa,
    medio: e.medio,
    medioOtro: e.medio === 'otro' ? e.medioOtro : null,
    motivo: e.motivo,
    intentosSinRespuesta: e.intentosSinRespuesta,
    faltaResponderDesde: e.faltaResponderDesde,
    proximaAccion: e.proximaAccion,
    sugerenciaDescartadaEn: e.sugerenciaDescartadaEn,
  };
}
