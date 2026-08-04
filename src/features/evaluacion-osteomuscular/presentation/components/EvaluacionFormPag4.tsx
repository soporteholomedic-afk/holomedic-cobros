'use client';

import { useMemo } from 'react';
import { useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { Paginacion } from './Paginacion';

const BASE_COLUMNA = 'evaluacionColumna';

interface CheckSimpleProps {
  path: string;
  checked: boolean;
  ariaLabel?: string;
  small?: boolean;
}

function CheckSimple({ path, checked, ariaLabel, small }: CheckSimpleProps) {
  const { setField } = useEvaluacionContext();
  return (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      checked={checked}
      onChange={(e) => setField(path, e.target.checked)}
      style={small ? { width: 12, height: 12 } : undefined}
    />
  );
}

interface TextFieldProps {
  path: string;
  value: string;
  ariaLabel: string;
  className?: string;
}

function TextField({ path, value, ariaLabel, className }: TextFieldProps) {
  const { setField } = useEvaluacionContext();
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => setField(path, e.target.value)}
      className={`border-b border-black outline-none px-1 ${className ?? ''}`}
    />
  );
}

/* ---- Diagramas SVG (réplica de __temp__/page8.html) ---- */

function SvgEspalda() {
  return (
    <svg viewBox="0 0 100 150" className="w-28 h-40" fill="none" stroke="#666" strokeWidth={1.5} aria-hidden="true">
      <path d="M 30,20 C 35,10 65,10 70,20 C 75,35 85,45 90,60 C 95,75 80,80 80,95 C 80,110 75,130 75,140 L 25,140 C 25,130 20,110 20,95 C 20,80 5,75 10,60 C 15,45 25,35 30,20 Z" fill="#f9f9f9" />
      <line x1="50" y1="25" x2="50" y2="105" stroke="#ef4444" strokeWidth={4} />
      <path d="M 40,105 C 45,100 55,100 60,105 C 65,115 35,115 40,105 Z" fill="#f97316" stroke="none" />
    </svg>
  );
}

function SvgFlexionLumbar() {
  return (
    <svg viewBox="0 0 120 70" className="w-32 h-20" fill="none" stroke="#333" strokeWidth={1.2} aria-hidden="true">
      <path d="M 20,60 L 20,30 L 25,10" />
      <path d="M 60,60 L 60,35 L 75,20 L 85,30" />
      <path d="M 100,60 L 105,45 L 90,30 L 70,35" />
      <circle cx="20" cy="60" r="1.5" fill="black" />
      <circle cx="60" cy="60" r="1.5" fill="black" />
      <circle cx="100" cy="60" r="1.5" fill="black" />
    </svg>
  );
}

function SvgPosturaManosCabeza() {
  return (
    <svg viewBox="0 0 100 80" className="w-28 h-24" fill="none" stroke="#333" strokeWidth={1.2} aria-hidden="true">
      <circle cx="50" cy="20" r="10" />
      <path d="M 50,30 L 50,70 M 35,25 L 25,15 L 35,10 L 45,15 Z M 65,25 L 75,15 L 65,10 L 55,15 Z" />
    </svg>
  );
}

function SvgCuello() {
  return (
    <svg viewBox="0 0 80 120" className="w-20 h-32" fill="none" stroke="#666" strokeWidth={1.2} aria-hidden="true">
      <path d="M 15,10 C 20,30 25,40 20,60 C 15,80 10,90 5,110 L 75,110 C 70,90 65,80 60,60 C 55,40 60,30 65,10 Z" fill="#f9f9f9" />
      <line x1="40" y1="15" x2="40" y2="70" stroke="#ef4444" strokeWidth={5} />
    </svg>
  );
}

function SvgDorsoLumbar() {
  return (
    <svg viewBox="0 0 80 120" className="w-20 h-32" fill="none" stroke="#666" strokeWidth={1.2} aria-hidden="true">
      <path d="M 20,10 C 25,30 35,40 40,60 C 45,80 35,100 25,115 L 55,115 C 45,100 35,80 40,60 C 45,40 55,30 60,10 Z" fill="#f9f9f9" />
      <line x1="40" y1="20" x2="40" y2="85" stroke="#ef4444" strokeWidth={5} />
      <path d="M 30,85 C 35,80 45,80 50,85 C 55,95 25,95 30,85 Z" fill="#f97316" stroke="none" />
    </svg>
  );
}

export function EvaluacionFormPag4() {
  const { idAtencion, state } = useEvaluacionContext();

  const columna = useMemo(() => state.evaluacionColumna, [state]);

  const obs = columna.observacion;
  const maniobra = columna.maniobraPresoPalpacion;

  const obsPath = `${BASE_COLUMNA}.observacion`;
  const manPath = `${BASE_COLUMNA}.maniobraPresoPalpacion`;

  return (
    <div className="evaluation-page evaluation-page--page4 min-h-screen bg-gray-100 py-6 text-xs leading-tight text-black">
      <form
        onSubmit={(e) => e.preventDefault()}
        className="max-w-[850px] mx-auto bg-white border border-gray-300 shadow-md p-6"
      >
        {/* TÍTULO PRINCIPAL DE SECCIÓN */}
        <h2 className="text-base font-bold mb-0.5">II.- COLUMNA</h2>
        <p className="text-[11px] mb-2 italic">Marcar &quot;x&quot; en los cuadraditos según corresponda.</p>

        {/* SECCIÓN A: OBSERVACION */}
        <div className="border border-gray-800 mb-4">
          <div className="bg-[#EAE6D9] font-bold px-2 py-1 border-b border-gray-800 text-sm tracking-wide">
            A) OBSERVACION
          </div>

          {/* Fila 1: Cifosis / Lordosis / Escoliosis */}
          <div className="grid grid-cols-12 border-b border-gray-800">
            <div className="col-span-4 border-r border-gray-800 p-2 flex items-center justify-center bg-white">
              <SvgEspalda />
            </div>

            <div className="col-span-4 border-r border-gray-800 p-2 flex flex-col justify-between text-[11px]">
              <div>
                <p className="font-bold mb-1">CIFOSIS DORSAL:</p>
                <div className="space-y-1 pl-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <CheckSimple
                      path={`${obsPath}.cifosisDorsal.normal`}
                      checked={obs.cifosisDorsal.normal}
                      ariaLabel="Cifosis dorsal normal"
                    />
                    NORMAL
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <CheckSimple
                      path={`${obsPath}.cifosisDorsal.hipercifosis`}
                      checked={obs.cifosisDorsal.hipercifosis}
                      ariaLabel="Cifosis dorsal hipercifosis"
                    />
                    HIPERCIFOSIS
                  </label>
                  <label className="flex items-start gap-1.5 cursor-pointer">
                    <CheckSimple
                      path={`${obsPath}.cifosisDorsal.aplanamientoCifosisDorsal`}
                      checked={obs.cifosisDorsal.aplanamientoCifosisDorsal}
                      ariaLabel="Cifosis dorsal aplanamiento"
                    />
                    APLANAMIENTO CIFOSIS DORSAL
                  </label>
                </div>
              </div>

              <div className="mt-3">
                <p className="font-bold mb-1">LORDOSIS LUMBAR</p>
                <div className="space-y-1 pl-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <CheckSimple
                      path={`${obsPath}.lordosisLumbar.normal`}
                      checked={obs.lordosisLumbar.normal}
                      ariaLabel="Lordosis lumbar normal"
                    />
                    NORMAL
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <CheckSimple
                      path={`${obsPath}.lordosisLumbar.hipercifosis`}
                      checked={obs.lordosisLumbar.hipercifosis}
                      ariaLabel="Lordosis lumbar hipercifosis"
                    />
                    HIPERCIFOSIS
                  </label>
                  <label className="flex items-start gap-1.5 cursor-pointer">
                    <CheckSimple
                      path={`${obsPath}.lordosisLumbar.aplanamientoLordosisLumbar`}
                      checked={obs.lordosisLumbar.aplanamientoLordosisLumbar}
                      ariaLabel="Lordosis lumbar aplanamiento"
                    />
                    APLANAMIENTO LORDOSIS LUMBAR
                  </label>
                </div>
              </div>
            </div>

            <div className="col-span-4 p-2 text-[11px]">
              <p className="font-bold mb-3">
                PRESENCIA DE ESCOLIOSIS <span className="font-normal text-[10px]">(curva &gt; 1cm)</span>
              </p>
              <div className="space-y-1.5 pl-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <CheckSimple
                    path={`${obsPath}.presenciaEscoliosis.ausente`}
                    checked={obs.presenciaEscoliosis.ausente}
                    ariaLabel="Escoliosis ausente"
                  />
                  AUSENTE
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <CheckSimple
                    path={`${obsPath}.presenciaEscoliosis.dorsalDx`}
                    checked={obs.presenciaEscoliosis.dorsalDx}
                    ariaLabel="Escoliosis dorsal Dx"
                  />
                  DORSAL DX
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <CheckSimple
                    path={`${obsPath}.presenciaEscoliosis.dorsalIx`}
                    checked={obs.presenciaEscoliosis.dorsalIx}
                    ariaLabel="Escoliosis dorsal Ix"
                  />
                  DORSAL IX
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <CheckSimple
                    path={`${obsPath}.presenciaEscoliosis.lumbarDx`}
                    checked={obs.presenciaEscoliosis.lumbarDx}
                    ariaLabel="Escoliosis lumbar Dx"
                  />
                  LUMBAR DX
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <CheckSimple
                    path={`${obsPath}.presenciaEscoliosis.lumbarIx`}
                    checked={obs.presenciaEscoliosis.lumbarIx}
                    ariaLabel="Escoliosis lumbar Ix"
                  />
                  LUMBAR IX
                </label>
              </div>
            </div>
          </div>

          {/* Fila 2: Sub-header Ritmo Lumbo Pélvico */}
          <div className="bg-gray-200 text-center font-bold py-0.5 border-b border-gray-800 text-[11px] tracking-wide">
            OBSERVACION RITMO LUMBO PELVICO:
          </div>

          {/* Fila 3: Contenido Ritmo Lumbo Pélvico */}
          <div className="grid grid-cols-12 border-b border-gray-800">
            <div className="col-span-4 border-r border-gray-800 p-2 flex items-center justify-center">
              <SvgFlexionLumbar />
            </div>
            <div className="col-span-8 p-3 flex flex-col justify-center space-y-2 text-[11px]">
              <label className="flex items-center gap-2 cursor-pointer">
                <CheckSimple
                  path={`${obsPath}.ritmoLumboPelvico.normal`}
                  checked={obs.ritmoLumboPelvico.normal}
                  ariaLabel="Ritmo lumbo pélvico normal"
                />
                NORMAL
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <CheckSimple
                  path={`${obsPath}.ritmoLumboPelvico.lordosisLumbarInmodificada`}
                  checked={obs.ritmoLumboPelvico.lordosisLumbarInmodificada}
                  ariaLabel="Ritmo lumbo pélvico lordosis lumbar inmodificada"
                />
                LORDOSIS LUMBAR INMODIFICADA
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <CheckSimple
                  path={`${obsPath}.ritmoLumboPelvico.dolorLumbar`}
                  checked={obs.ritmoLumboPelvico.dolorLumbar}
                  ariaLabel="Ritmo lumbo pélvico dolor lumbar"
                />
                DOLOR LUMBAR
              </label>
            </div>
          </div>

          {/* Fila 4: Sub-header Dorso Curvo Estructurado */}
          <div className="bg-gray-200 text-center font-bold py-0.5 border-b border-gray-800 text-[11px] tracking-wide">
            OBSERVACION DE PRESENCIA DE DORSO CURVO ESTRUCTURADO CIFO ESCOLIOSIS :
          </div>

          {/* Fila 5: Contenido Dorso Curvo Estructurado */}
          <div className="grid grid-cols-12">
            <div className="col-span-4 border-r border-gray-800 p-2 flex items-center justify-center">
              <SvgPosturaManosCabeza />
            </div>
            <div className="col-span-8 p-3 flex flex-col justify-center space-y-2 text-[11px]">
              <label className="flex items-center gap-2 cursor-pointer">
                <CheckSimple
                  path={`${obsPath}.dorsoCurvoEstructuradoCifoEscoliosis.normal`}
                  checked={obs.dorsoCurvoEstructuradoCifoEscoliosis.normal}
                  ariaLabel="Dorso curvo normal"
                />
                NORMAL
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <CheckSimple
                  path={`${obsPath}.dorsoCurvoEstructuradoCifoEscoliosis.presenciaDorsoCurvoEstructurado`}
                  checked={obs.dorsoCurvoEstructuradoCifoEscoliosis.presenciaDorsoCurvoEstructurado}
                  ariaLabel="Dorso curvo presencia de dorso curvo estructurado"
                />
                PRESENCIA DE DORSO CURVO ESTRUCTURADO
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <CheckSimple
                  path={`${obsPath}.dorsoCurvoEstructuradoCifoEscoliosis.dolorDorsal`}
                  checked={obs.dorsoCurvoEstructuradoCifoEscoliosis.dolorDorsal}
                  ariaLabel="Dorso curvo dolor dorsal"
                />
                DOLOR DORSAL
              </label>
            </div>
          </div>
        </div>

        {/* SECCIÓN B: MANIOBRA DE PRESO PALPACION */}
        <div className="border border-gray-800">
          <div className="bg-[#EAE6D9] px-2 py-1 border-b border-gray-800 text-sm tracking-wide">
            <span className="font-bold">B) MANIOBRA DE PRESO PALPACION</span>
            <span className="text-xs ml-1">(Apófisis espinosa, espacio intervertebral y musculatura para vertebral)</span>
          </div>

          <div className="grid grid-cols-12">
            {/* Columna Cervical (Izquierda) */}
            <div className="col-span-6 border-r border-gray-800 flex">
              <div className="w-1/3 border-r border-gray-300 p-2 flex items-center justify-center">
                <SvgCuello />
              </div>
              <div className="w-2/3 p-3 flex flex-col justify-start space-y-3 text-[10px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <CheckSimple
                    path={`${manPath}.cervical.dolorAusente`}
                    checked={maniobra.cervical.dolorAusente}
                    ariaLabel="Cervical dolor ausente"
                  />
                  DOLOR AUSENTE
                </label>

                <div>
                  <label className="flex items-start gap-2 cursor-pointer font-bold mb-1">
                    <CheckSimple
                      path={`${manPath}.cervical.dolorPresente.aplica`}
                      checked={maniobra.cervical.dolorPresente.aplica}
                      ariaLabel="Cervical dolor presente"
                    />
                    DOLOR PRESENTE:
                  </label>
                  <div className="pl-5 space-y-2 text-[10px]">
                    <p className="leading-tight">
                      <label className="inline-flex items-center gap-0.5 cursor-pointer">
                        <CheckSimple
                          path={`${manPath}.cervical.dolorPresente.apofisisEspacioIntervertebral.aplica`}
                          checked={maniobra.cervical.dolorPresente.apofisisEspacioIntervertebral.aplica}
                          ariaLabel="Cervical apófisis o espacio aplica"
                          small
                        />
                      </label>
                      APOFISIS Y/O ESPACIO INTERVERTEB.
                      <br />
                      <span className="font-normal">n° apófisis/ espacio :</span>{' '}
                      <TextField
                        path={`${manPath}.cervical.dolorPresente.apofisisEspacioIntervertebral.numeroApofisisEspacio`}
                        value={maniobra.cervical.dolorPresente.apofisisEspacioIntervertebral.numeroApofisisEspacio}
                        ariaLabel="Cervical n° apófisis o espacio"
                        className="w-16"
                      />
                    </p>
                    <p className="leading-tight pt-2">
                      <label className="inline-flex items-center gap-0.5 cursor-pointer">
                        <CheckSimple
                          path={`${manPath}.cervical.dolorPresente.segmentoMuscular.aplica`}
                          checked={maniobra.cervical.dolorPresente.segmentoMuscular.aplica}
                          ariaLabel="Cervical segmento muscular aplica"
                          small
                        />
                      </label>
                      SEGMENTO MUSCULAR:{' '}
                      <TextField
                        path={`${manPath}.cervical.dolorPresente.segmentoMuscular.detalle`}
                        value={maniobra.cervical.dolorPresente.segmentoMuscular.detalle}
                        ariaLabel="Cervical detalle segmento muscular"
                        className="w-20"
                      />
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Columna Dorsal y Lumbar (Derecha) */}
            <div className="col-span-6 flex">
              <div className="w-1/3 border-r border-gray-800 p-2 flex items-center justify-center">
                <SvgDorsoLumbar />
              </div>

              <div className="w-2/3 flex flex-col justify-between">
                {/* Bloque Dorsal */}
                <div className="p-2 border-b border-gray-800 text-[10px]">
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <CheckSimple
                      path={`${manPath}.dorsal.dolorAusente`}
                      checked={maniobra.dorsal.dolorAusente}
                      ariaLabel="Dorsal dolor ausente"
                    />
                    DOLOR AUSENTE
                  </label>
                  <div>
                    <label className="flex items-start gap-2 cursor-pointer font-bold">
                      <CheckSimple
                        path={`${manPath}.dorsal.dolorPresente.aplica`}
                        checked={maniobra.dorsal.dolorPresente.aplica}
                        ariaLabel="Dorsal dolor presente"
                      />
                      <div>
                        DOLORE PRESENTE:
                        <div className="pl-4 font-normal text-[9.5px] mt-0.5 space-y-0.5">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <CheckSimple
                              path={`${manPath}.dorsal.dolorPresente.apofisisEspacioIntervertebral`}
                              checked={maniobra.dorsal.dolorPresente.apofisisEspacioIntervertebral}
                              ariaLabel="Dorsal apófisis o espacio intervertebral"
                              small
                            />
                            APOFISIS Y/O ESPACIO INTERVERTEBRAL
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <CheckSimple
                              path={`${manPath}.dorsal.dolorPresente.segmentoMuscular`}
                              checked={maniobra.dorsal.dolorPresente.segmentoMuscular}
                              ariaLabel="Dorsal segmento muscular"
                              small
                            />
                            SEGMENTO MUSCULAR
                          </label>
                        </div>
                      </div>
                    </label>
                  </div>
                  <div className="text-right font-bold text-[11px] mt-1 pr-2">DORSAL</div>
                </div>

                {/* Bloque Lumbar */}
                <div className="p-2 text-[10px]">
                  <label className="flex items-center gap-2 cursor-pointer mb-1">
                    <CheckSimple
                      path={`${manPath}.lumbar.dolorAusente`}
                      checked={maniobra.lumbar.dolorAusente}
                      ariaLabel="Lumbar dolor ausente"
                    />
                    DOLOR AUSENTE
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <CheckSimple
                      path={`${manPath}.lumbar.dolorPresente.aplica`}
                      checked={maniobra.lumbar.dolorPresente.aplica}
                      ariaLabel="Lumbar dolor presente"
                    />
                    <div>
                      <span className="font-bold">DOLOR PRESENTE:</span>
                      <div className="pl-4 font-normal text-[9.5px] mt-0.5 space-y-0.5">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <CheckSimple
                            path={`${manPath}.lumbar.dolorPresente.apofisisEspacioIntervertebral`}
                            checked={maniobra.lumbar.dolorPresente.apofisisEspacioIntervertebral}
                            ariaLabel="Lumbar apófisis o espacio intervertebral"
                            small
                          />
                          APOFISIS Y/O ESPACIO INTERVERTEBRAL
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <CheckSimple
                            path={`${manPath}.lumbar.dolorPresente.segmentoMuscular`}
                            checked={maniobra.lumbar.dolorPresente.segmentoMuscular}
                            ariaLabel="Lumbar segmento muscular"
                            small
                          />
                          SEGMENTO MUSCULAR
                        </label>
                      </div>
                    </div>
                  </label>
                  <div className="text-right font-bold text-[11px] mt-2 pr-2">LUMBAR</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PIE DE PÁGINA */}
        <div className="flex justify-between items-end text-[9px] text-gray-700 pt-4">
          <div>
            Fo. JJC-SIG-13-31 Cuestionario anamnesico y evaluación de extremidad superior y espalda. Rev. 0
          </div>
          <div className="font-bold text-xs text-black">
            6
          </div>
        </div>
      </form>

      <Paginacion
        paginaActual={4}
        baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/evaluacion`}
      />
    </div>
  );
}
