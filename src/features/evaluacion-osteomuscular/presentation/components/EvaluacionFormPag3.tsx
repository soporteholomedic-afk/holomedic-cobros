'use client';

import { useMemo } from 'react';
import { useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { Paginacion } from './Paginacion';
import { MunecaFinkelsteinFlexoExtensionBlock } from './blocks/MunecaFinkelsteinFlexoExtensionBlock';
import { MunecaParestesiaRegionesBlock } from './blocks/MunecaParestesiaRegionesBlock';
import { MunecaInstrumentalSeveridadDiagnosticoBlock } from './blocks/MunecaInstrumentalSeveridadDiagnosticoBlock';

export function EvaluacionFormPag3() {
  const { idAtencion, state } = useEvaluacionContext();

  const munecaMano = useMemo(
    () => state.evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano,
    [state],
  );

  return (
    <div className="space-y-6">
      {/* ---- Page Header ---- */}
      <div className="flex justify-between items-end border-b-2 border-sky-600 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">I.- MIEMBROS SUPERIORES (Cont.)</h1>
          <p className="text-slate-500 text-xs font-medium mt-1 uppercase tracking-wider">
            EVALUACIÓN CLÍNICA OSTEMUSCULAR — PÁGINA 3
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white px-4 py-2 border border-slate-200 rounded-lg">
          <span className="text-xs font-bold text-sky-600 uppercase">Expediente No.</span>
          <span className="text-lg font-semibold text-slate-700">{state.idAtencion}</span>
        </div>
      </div>

      {/* ===================== SECCIÓN B: MUÑECA - MANO (Continuación) ===================== */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-sky-600">
            B) MUÑECA - MANO (Continuación)
          </h3>
        </div>

        <div className="p-6 space-y-10">
          <MunecaFinkelsteinFlexoExtensionBlock
            finkelstein={munecaMano.finkelstein}
            flexoExtensionMuneca={munecaMano.flexoExtensionMuneca}
          />
          <MunecaParestesiaRegionesBlock realizaManiobras={munecaMano.realizaManiobras} molestiaMunecaDxDesdeMeses={munecaMano.molestiaMunecaDxDesdeMeses} molestiaMunecaIxDesdeMeses={munecaMano.molestiaMunecaIxDesdeMeses} sintomatologiaParestesica={munecaMano.sintomatologiaParestesica} />
          <MunecaInstrumentalSeveridadDiagnosticoBlock sintomatologiaParestesica={munecaMano.sintomatologiaParestesica} />
        </div>
      </section>

      <Paginacion
        paginaActual={3}
        baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/evaluacion`}
      />
    </div>
  );
}
