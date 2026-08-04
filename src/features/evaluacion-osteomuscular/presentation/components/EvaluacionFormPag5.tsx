'use client';

import { useMemo } from 'react';
import { useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { Paginacion } from './Paginacion';

interface CheckSimpleProps {
  path: string;
  checked: boolean;
  ariaLabel?: string;
}

function CheckSimple({ path, checked, ariaLabel }: CheckSimpleProps) {
  const { setField } = useEvaluacionContext();
  return (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      checked={checked}
      onChange={(e) => setField(path, e.target.checked)}
    />
  );
}

/* ---- Diagramas SVG (réplica de __temp__/page9.html) ---- */

function SvgLasegue() {
  return (
    <svg viewBox="0 0 160 80" className="w-48 h-24" fill="none" stroke="#222" strokeWidth={1.3} aria-hidden="true">
      <circle cx="25" cy="55" r="7" />
      <path d="M 32,55 L 75,55" />
      <path d="M 75,55 L 75,15 L 85,15" strokeWidth={1.5} />
      <path d="M 90,25 L 90,40 M 87,36 L 90,42 L 93,36" strokeWidth={1.5} />
      <path d="M 75,55 L 130,55 L 130,50" />
    </svg>
  );
}

function SvgWasserman() {
  return (
    <svg viewBox="0 0 160 70" className="w-48 h-20" fill="none" stroke="#222" strokeWidth={1.3} aria-hidden="true">
      <path d="M 20,45 C 40,40 60,50 80,45 C 95,40 105,25 110,20 C 112,18 118,22 115,30 C 108,42 90,55 75,55 C 50,55 35,50 20,45 Z" />
      <path d="M 110,55 L 110,40 M 107,44 L 110,38 L 113,44" strokeWidth={1.5} fill="black" />
    </svg>
  );
}

const BASE_MOTILIDAD = 'evaluacionMotilidad';
const BASE_LASEGUE = 'maniobraLasegueRetraccionIsquioCrural';
const BASE_WASSERMAN = 'maniobraWassermanRetraccionIleopsoas';

const MOVIMIENTOS: ReadonlyArray<{
  field: 'flexion' | 'extension' | 'inclinacionDx' | 'inclinacionIx' | 'rotacionDx' | 'rotacionIx';
  label: string;
}> = [
  { field: 'flexion', label: 'FLEXION' },
  { field: 'extension', label: 'EXTENSION' },
  { field: 'inclinacionDx', label: 'INCLINACION DX' },
  { field: 'inclinacionIx', label: 'INCLINACION IX' },
  { field: 'rotacionDx', label: 'ROT. DX' },
  { field: 'rotacionIx', label: 'ROT. IX' },
];

export function EvaluacionFormPag5() {
  const { idAtencion, state, setField } = useEvaluacionContext();

  const motilidad = useMemo(() => state.evaluacionMotilidad, [state]);
  const lasegue = state.maniobraLasegueRetraccionIsquioCrural;
  const wasserman = state.maniobraWassermanRetraccionIleopsoas;

  return (
    <div className="evaluation-page evaluation-page--page5 min-h-screen bg-gray-100 py-6 text-xs leading-tight text-black">
      <form
        onSubmit={(e) => e.preventDefault()}
        className="max-w-[850px] mx-auto bg-white border border-gray-300 shadow-md p-6"
      >
        <div className="space-y-4">
          {/* SECCIÓN C: EVALUACION DE LA MOTILIDAD */}
          <div className="border border-gray-800">
            <div className="bg-[#EAE6D9] font-bold px-2 py-1 border-b border-gray-800 text-sm tracking-wide">
              C) EVALUACION DE LA MOTILIDAD
            </div>

            <div className="grid grid-cols-2 border-b border-gray-800 font-bold text-center text-[11px] py-1 bg-white">
              <div className="border-r border-gray-800">COLUMNA CERVICAL</div>
              <div>COLUMNA DORSO LUMBAR</div>
            </div>

            <div className="grid grid-cols-2 text-[10.5px]">
              {/* Columna Cervical */}
              <div className="border-r border-gray-800 p-3 space-y-2">
                <p className="font-bold text-[10px] mb-2">PRESENCIA DE DOLOR AL MOVIMIENTO</p>
                {MOVIMIENTOS.map((mov) => (
                  <label key={mov.field} className="flex items-center gap-1 cursor-pointer select-none">
                    <span>{mov.label} (</span>
                    <CheckSimple
                      path={`${BASE_MOTILIDAD}.columnaCervical.presenciaDolorMovimiento.${mov.field}`}
                      checked={motilidad.columnaCervical.presenciaDolorMovimiento[mov.field]}
                      ariaLabel={`${mov.label} cervical`}
                    />
                    <span>)</span>
                  </label>
                ))}
              </div>

              {/* Columna Dorso Lumbar */}
              <div className="p-3 space-y-2 pl-8">
                <p className="font-bold text-[10px] mb-2">PRESENCIA DE DOLOR AL MOVIMIENTO</p>
                {MOVIMIENTOS.map((mov) => (
                  <label key={mov.field} className="flex items-center gap-1 cursor-pointer select-none">
                    <span>{mov.label} (</span>
                    <CheckSimple
                      path={`${BASE_MOTILIDAD}.columnaDorsoLumbar.presenciaDolorMovimiento.${mov.field}`}
                      checked={motilidad.columnaDorsoLumbar.presenciaDolorMovimiento[mov.field]}
                      ariaLabel={`${mov.label} dorso lumbar`}
                    />
                    <span>)</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* SECCIÓN D: MANIOBRA DE LASEGUE */}
          <div className="border border-gray-800">
            <div className="bg-[#EAE6D9] font-bold px-2 py-1 border-b border-gray-800 text-sm tracking-wide">
              D) MANIOBRA DE LASEGUE / RETRACCION DE MUSCULO ISQUIO CRURAL
            </div>
            <div className="grid grid-cols-12 items-stretch">
              <div className="col-span-5 border-r border-gray-800 p-2 flex flex-col items-center justify-center">
                <SvgLasegue />
                <span className="text-[10px] mt-1">Lasegue / SLR( elevación de la pierna recta)</span>
              </div>

              <div className="col-span-7 p-3 flex flex-col justify-between text-[11px]">
                <div className="flex items-center gap-4">
                  <span className="font-bold">LASEGUE/SLR :</span>
                  <label className="flex items-center gap-1 cursor-pointer select-none">
                    <CheckSimple
                      path={`${BASE_LASEGUE}.lasegueSlr.normal`}
                      checked={lasegue.lasegueSlr.normal}
                      ariaLabel="Lasègue normal"
                    />{' '}
                    NORMAL
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer select-none">
                    <CheckSimple
                      path={`${BASE_LASEGUE}.lasegueSlr.dx`}
                      checked={lasegue.lasegueSlr.dx}
                      ariaLabel="Lasègue derecho"
                    />{' '}
                    DX
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer select-none">
                    <CheckSimple
                      path={`${BASE_LASEGUE}.lasegueSlr.ix`}
                      checked={lasegue.lasegueSlr.ix}
                      ariaLabel="Lasègue izquierdo"
                    />{' '}
                    IX
                  </label>
                </div>
                <div className="border-b border-dotted border-gray-500 my-2" />
                <div>
                  <label className="flex items-center gap-2 cursor-pointer font-bold select-none">
                    <CheckSimple
                      path={`${BASE_LASEGUE}.presenciaRetraccionIsquioCrural`}
                      checked={lasegue.presenciaRetraccionIsquioCrural}
                      ariaLabel="Presencia de retracción isquio crural"
                    />
                    PRESENCIA DE RETRACCION ISQUIO CRURAL
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">OBSERVACION:</span>
                  <input
                    type="text"
                    aria-label="Observación Lasègue"
                    value={lasegue.lasegueSlr.observacion}
                    onChange={(e) => setField(`${BASE_LASEGUE}.lasegueSlr.observacion`, e.target.value)}
                    className="flex-1 border-b border-dotted border-black outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN E: MANIOBRA DE WASSERMAN */}
          <div className="border border-gray-800">
            <div className="bg-[#EAE6D9] font-bold px-2 py-1 border-b border-gray-800 text-sm tracking-wide">
              E) MANIOBRA DE WASSERMAN / RETRACCION DEL MUSCULO ILEOPSOAS
            </div>
            <div className="grid grid-cols-12 items-stretch">
              <div className="col-span-5 border-r border-gray-800 p-2 flex items-center justify-center">
                <SvgWasserman />
              </div>

              <div className="col-span-7 p-3 flex flex-col justify-between text-[11px]">
                <div className="flex items-center gap-4">
                  <span className="font-bold">
                    WASSERMAN <span className="font-normal text-[10px]">(Lasegue invertido):</span>
                  </span>
                  <label className="flex items-center gap-1 cursor-pointer select-none">
                    <CheckSimple
                      path={`${BASE_WASSERMAN}.wassermanLasegueInvertido.dx`}
                      checked={wasserman.wassermanLasegueInvertido.dx}
                      ariaLabel="Wasserman derecho"
                    />{' '}
                    DX
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer select-none">
                    <CheckSimple
                      path={`${BASE_WASSERMAN}.wassermanLasegueInvertido.ix`}
                      checked={wasserman.wassermanLasegueInvertido.ix}
                      ariaLabel="Wasserman izquierdo"
                    />{' '}
                    IX
                  </label>
                </div>
                <div className="border-b border-dotted border-gray-500 my-2" />
                <div>
                  <label className="flex items-center gap-2 cursor-pointer font-bold select-none">
                    <CheckSimple
                      path={`${BASE_WASSERMAN}.presenciaRetraccionIleopsoas`}
                      checked={wasserman.presenciaRetraccionIleopsoas}
                      ariaLabel="Presencia de retracción ileopsoas"
                    />
                    PRESENCIA DE RETRACCION ILEOPSOAS
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">OBSERVACION:</span>
                  <input
                    type="text"
                    aria-label="Observación Wasserman"
                    value={wasserman.wassermanLasegueInvertido.observacion}
                    onChange={(e) =>
                      setField(`${BASE_WASSERMAN}.wassermanLasegueInvertido.observacion`, e.target.value)
                    }
                    className="flex-1 border-b border-dotted border-black outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* APROXIMACION DIAGNOSTICA */}
          <div className="text-[10px] italic pt-1">
            Dx. = Derecho(a)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Ix.= Izquierdo(a)
          </div>

          <div className="border border-gray-800 min-h-[90px]">
            <div className="bg-gray-200 font-bold px-2 py-1 border-b border-gray-800 text-[11px] tracking-wide">
              APROXIMACION DIAGNOSTICA DE LA EVALUACION
            </div>
            <div className="p-2">
              <textarea
                aria-label="Aproximación diagnóstica de la evaluación"
                value={state.aproximacionDiagnosticaEvaluacion}
                onChange={(e) => setField('aproximacionDiagnosticaEvaluacion', e.target.value)}
                placeholder="Escriba el diagnóstico aquí..."
                className="w-full h-16 resize-none outline-none text-xs"
              />
            </div>
          </div>

          {/* SECCIÓN FIRMA Y DATOS MÉDICO */}
          <div className="pt-10 text-[10.5px] leading-relaxed">
            <div className="w-72 border-b border-dotted border-black mb-1" />
            <p className="font-bold">NOMBRE Y APELLIDOS</p>
            <p className="font-bold">FIRMA-SELLO</p>
            <p className="font-bold">MEDICO EVALUADOR / OCUPACIONAL</p>
            <p className="font-bold">FECHA.</p>
          </div>
        </div>

        {/* PIE DE PÁGINA */}
        <div className="flex justify-between items-end text-[9px] text-gray-700 pt-4">
          <div>
            Fo. JJC-SIG-13-31 Cuestionario anamnesico y evaluación de extremidad superior y espalda. Rev. 0
          </div>
          <div className="font-bold text-xs text-black">
            7
          </div>
        </div>
      </form>

      <Paginacion
        paginaActual={5}
        baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/evaluacion`}
      />
    </div>
  );
}
