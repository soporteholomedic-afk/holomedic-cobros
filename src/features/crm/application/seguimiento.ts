import type { Oportunidad, SeguimientoOportunidad } from '../domain/entities';

/** The whole follow-up state of an oportunidad as `updateSeguimiento` expects it. */
export function seguimientoDe(o: Oportunidad): SeguimientoOportunidad {
  return {
    etapa: o.etapa,
    medio: o.medio,
    medioOtro: o.medio === 'otro' ? o.medioOtro : null,
    motivo: o.motivo,
    intentosSinRespuesta: o.intentosSinRespuesta,
    faltaResponderDesde: o.faltaResponderDesde,
    proximaAccion: o.proximaAccion,
    sugerenciaDescartadaEn: o.sugerenciaDescartadaEn,
  };
}
