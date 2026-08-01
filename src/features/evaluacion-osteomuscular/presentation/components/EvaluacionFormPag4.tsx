'use client';

import { useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { Paginacion } from './Paginacion';

const BASE_COLUMNA = 'evaluacionColumna';

function CheckField({ label, path }: { label: string; path: string }) {
  const { state, setField } = useEvaluacionContext();
  const keys = path.split('.');
  let current: unknown = state as unknown as Record<string, unknown>;
  for (const k of keys) {
    current = (current as Record<string, unknown>)[k];
  }
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300"
        checked={Boolean(current)}
        onChange={(e) => setField(path, e.target.checked)}
      />
      <span className="text-xs font-medium text-slate-700 uppercase">{label}</span>
    </label>
  );
}

function TextField({ label, path }: { label: string; path: string }) {
  const { state, setField } = useEvaluacionContext();
  const keys = path.split('.');
  let current: unknown = state as unknown as Record<string, unknown>;
  for (const k of keys) {
    current = (current as Record<string, unknown>)[k];
  }
  return (
    <div className="flex-1">
      <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">{label}</span>
      <input
        type="text"
        className="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-sky-500 outline-none"
        value={typeof current === 'string' ? current : ''}
        onChange={(e) => setField(path, e.target.value)}
      />
    </div>
  );
}

function ImagePlaceholder({ label }: { label: string }) {
  return (
    <div className="w-full h-24 bg-slate-100 rounded flex items-center justify-center">
      <span className="text-[10px] text-slate-400 italic">[{label}]</span>
    </div>
  );
}

export function EvaluacionFormPag4() {
  const { idAtencion, state } = useEvaluacionContext();

  return (
    <div className="space-y-6">
      {/* ---- Page Header ---- */}
      <div className="flex justify-between items-end border-b-2 border-sky-600 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">II.- COLUMNA</h1>
          <p className="text-slate-500 text-xs font-medium mt-1 uppercase tracking-wider">
            EVALUACIÓN CLÍNICA OSTEOMUSCULAR — PÁGINA 4
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white px-4 py-2 border border-slate-200 rounded-lg">
          <span className="text-xs font-bold text-sky-600 uppercase">Expediente No.</span>
          <span className="text-lg font-semibold text-slate-700">{state.idAtencion}</span>
        </div>
      </div>

      {/* ===================== SECCIÓN A: OBSERVACIÓN ===================== */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-sky-600">A) OBSERVACIÓN</h3>
          <span className="text-[11px] text-slate-400 italic">Marcar el casillero según corresponda</span>
        </div>

        <div className="p-6 space-y-6">
          {/* Cifosis Dorsal + Lordosis Lumbar + Escoliosis */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Cifosis Dorsal */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">
                Cifosis Dorsal
              </div>
              <div className="p-4 space-y-2">
                <CheckField label="Normal" path={`${BASE_COLUMNA}.observacion.cifosisDorsal.normal`} />
                <CheckField label="Hipercifosis" path={`${BASE_COLUMNA}.observacion.cifosisDorsal.hipercifosis`} />
                <CheckField label="Aplanamiento Cifosis Dorsal" path={`${BASE_COLUMNA}.observacion.cifosisDorsal.aplanamientoCifosisDorsal`} />
              </div>
            </div>

            {/* Lordosis Lumbar */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">
                Lordosis Lumbar
              </div>
              <div className="p-4 space-y-2">
                <CheckField label="Normal" path={`${BASE_COLUMNA}.observacion.lordosisLumbar.normal`} />
                <CheckField label="Hipercifosis" path={`${BASE_COLUMNA}.observacion.lordosisLumbar.hipercifosis`} />
                <CheckField label="Aplanamiento Lordosis Lumbar" path={`${BASE_COLUMNA}.observacion.lordosisLumbar.aplanamientoLordosisLumbar`} />
              </div>
            </div>

            {/* Escoliosis */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">
                Presencia de Escoliosis
              </div>
              <div className="p-4 space-y-2">
                <CheckField label="Ausente" path={`${BASE_COLUMNA}.observacion.presenciaEscoliosis.ausente`} />
                <CheckField label="Dorsal DX" path={`${BASE_COLUMNA}.observacion.presenciaEscoliosis.dorsalDx`} />
                <CheckField label="Dorsal IX" path={`${BASE_COLUMNA}.observacion.presenciaEscoliosis.dorsalIx`} />
                <CheckField label="Lumbar DX" path={`${BASE_COLUMNA}.observacion.presenciaEscoliosis.lumbarDx`} />
                <CheckField label="Lumbar IX" path={`${BASE_COLUMNA}.observacion.presenciaEscoliosis.lumbarIx`} />
              </div>
            </div>
          </div>

          {/* Ritmo Lumbo Pélvico + Dorso Curvo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Ritmo Lumbo Pélvico */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">
                Observación Ritmo Lumbo Pélvico
              </div>
              <div className="p-4 flex gap-4 items-start">
                <ImagePlaceholder label="Ritmo Lumbo Pélvico" />
                <div className="flex-1 space-y-2">
                  <CheckField label="Normal" path={`${BASE_COLUMNA}.observacion.ritmoLumboPelvico.normal`} />
                  <CheckField label="Lordosis Lumbar Inmodificada" path={`${BASE_COLUMNA}.observacion.ritmoLumboPelvico.lordosisLumbarInmodificada`} />
                  <CheckField label="Dolor Lumbar" path={`${BASE_COLUMNA}.observacion.ritmoLumboPelvico.dolorLumbar`} />
                </div>
              </div>
            </div>

            {/* Dorso Curvo Estructurado */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">
                Presencia de Dorso Curvo Estructurado / Cifo Escoliosis
              </div>
              <div className="p-4 flex gap-4 items-start">
                <ImagePlaceholder label="Dorso Curvo" />
                <div className="flex-1 space-y-2">
                  <CheckField label="Normal" path={`${BASE_COLUMNA}.observacion.dorsoCurvoEstructuradoCifoEscoliosis.normal`} />
                  <CheckField label="Presencia de Dorso Curvo Estructurado" path={`${BASE_COLUMNA}.observacion.dorsoCurvoEstructuradoCifoEscoliosis.presenciaDorsoCurvoEstructurado`} />
                  <CheckField label="Dolor Dorsal" path={`${BASE_COLUMNA}.observacion.dorsoCurvoEstructuradoCifoEscoliosis.dolorDorsal`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== SECCIÓN B: MANIOBRA DE PRESO PALPACIÓN ===================== */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-sky-600">
            B) MANIOBRA DE PRESO PALPACIÓN
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Apófisis espinosa, espacio intervertebral y musculatura paravertebral
          </p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Cervical */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
                <span className="font-bold text-xs text-sky-600 uppercase tracking-widest">Cervical</span>
              </div>
              <div className="p-4 space-y-4">
                <ImagePlaceholder label="Columna Cervical" />
                <CheckField label="Dolor Ausente" path={`${BASE_COLUMNA}.maniobraPresoPalpacion.cervical.dolorAusente`} />
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <CheckField label="Dolor Presente" path={`${BASE_COLUMNA}.maniobraPresoPalpacion.cervical.dolorPresente.aplica`} />
                  <div className="pl-4 space-y-3">
                    <div>
                      <CheckField label="Apófisis y/o Espacio Intervertebral" path={`${BASE_COLUMNA}.maniobraPresoPalpacion.cervical.dolorPresente.apofisisEspacioIntervertebral.aplica`} />
                      <div className="pl-4">
                        <TextField label="N° Apófisis / Espacio" path={`${BASE_COLUMNA}.maniobraPresoPalpacion.cervical.dolorPresente.apofisisEspacioIntervertebral.numeroApofisisEspacio`} />
                      </div>
                    </div>
                    <div>
                      <CheckField label="Segmento Muscular" path={`${BASE_COLUMNA}.maniobraPresoPalpacion.cervical.dolorPresente.segmentoMuscular.aplica`} />
                      <div className="pl-4">
                        <TextField label="Detalle" path={`${BASE_COLUMNA}.maniobraPresoPalpacion.cervical.dolorPresente.segmentoMuscular.detalle`} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Dorsal */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
                <span className="font-bold text-xs text-sky-600 uppercase tracking-widest">Dorsal</span>
              </div>
              <div className="p-4 space-y-4">
                <ImagePlaceholder label="Columna Dorsal" />
                <CheckField label="Dolor Ausente" path={`${BASE_COLUMNA}.maniobraPresoPalpacion.dorsal.dolorAusente`} />
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <CheckField label="Dolor Presente" path={`${BASE_COLUMNA}.maniobraPresoPalpacion.dorsal.dolorPresente.aplica`} />
                  <div className="pl-4 space-y-2">
                    <CheckField label="Apófisis y/o Espacio Intervertebral" path={`${BASE_COLUMNA}.maniobraPresoPalpacion.dorsal.dolorPresente.apofisisEspacioIntervertebral`} />
                    <CheckField label="Segmento Muscular" path={`${BASE_COLUMNA}.maniobraPresoPalpacion.dorsal.dolorPresente.segmentoMuscular`} />
                  </div>
                </div>
              </div>
            </div>

            {/* Lumbar */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
                <span className="font-bold text-xs text-sky-600 uppercase tracking-widest">Lumbar</span>
              </div>
              <div className="p-4 space-y-4">
                <ImagePlaceholder label="Columna Lumbar" />
                <CheckField label="Dolor Ausente" path={`${BASE_COLUMNA}.maniobraPresoPalpacion.lumbar.dolorAusente`} />
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <CheckField label="Dolor Presente" path={`${BASE_COLUMNA}.maniobraPresoPalpacion.lumbar.dolorPresente.aplica`} />
                  <div className="pl-4 space-y-2">
                    <CheckField label="Apófisis y/o Espacio Intervertebral" path={`${BASE_COLUMNA}.maniobraPresoPalpacion.lumbar.dolorPresente.apofisisEspacioIntervertebral`} />
                    <CheckField label="Segmento Muscular" path={`${BASE_COLUMNA}.maniobraPresoPalpacion.lumbar.dolorPresente.segmentoMuscular`} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Paginacion
        paginaActual={4}
        baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/evaluacion`}
      />
    </div>
  );
}
