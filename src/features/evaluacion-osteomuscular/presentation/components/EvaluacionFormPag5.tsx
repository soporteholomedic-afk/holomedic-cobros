'use client';

import { useMemo } from 'react';
import { useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { Paginacion } from './Paginacion';
import { AnatomicalImage } from './AnatomicalImage';

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

            <table className="w-full border-collapse">
              <tbody>
                <tr className="border-b border-gray-800 font-bold text-center text-[11px] py-1 bg-white">
                  <td className="w-1/2 border-r border-gray-800 py-1">COLUMNA CERVICAL</td>
                  <td className="py-1">COLUMNA DORSO LUMBAR</td>
                </tr>
                <tr>
                  {/* Columna Cervical */}
                  <td className="w-1/2 border-r border-gray-800 p-3 space-y-2 align-top">
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
                  </td>

                  {/* Columna Dorso Lumbar */}
                  <td className="p-3 space-y-2 pl-8 align-top">
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
                  </td>
                </tr>
                <tr className="border-t border-gray-800">
                  <td colSpan={2} className="p-2">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-bold">OBSERVACION:</span>
                      <input
                        type="text"
                        aria-label="Observación motilidad"
                        value={motilidad.observacion}
                        onChange={(e) => setField(`${BASE_MOTILIDAD}.observacion`, e.target.value)}
                        className="flex-1 border-b border-dotted border-black outline-none"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* SECCIÓN D: MANIOBRA DE LASEGUE */}
          <div className="border border-gray-800">
            <div className="bg-[#EAE6D9] font-bold px-2 py-1 border-b border-gray-800 text-sm tracking-wide">
              D) MANIOBRA DE LASEGUE / RETRACCION DE MUSCULO ISQUIO CRURAL
            </div>
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="w-5/12 border-r border-gray-800 p-2 text-center align-middle">
                    <AnatomicalImage
                      src="/assets/images/musculo/entrevista/maniobra-lasegue.png"
                      alt="Maniobra de Lasègue o elevación de la pierna recta"
                      className="w-48 h-24"
                      sizes="192px"
                    />
                    <span className="text-[10px] mt-1 block">Lasegue / SLR( elevación de la pierna recta)</span>
                  </td>

                  <td className="w-7/12 p-3 text-[11px] align-top">
                    <div className="flex flex-col justify-between h-full">
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
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* SECCIÓN E: MANIOBRA DE WASSERMAN */}
          <div className="border border-gray-800">
            <div className="bg-[#EAE6D9] font-bold px-2 py-1 border-b border-gray-800 text-sm tracking-wide">
              E) MANIOBRA DE WASSERMAN / RETRACCION DEL MUSCULO ILEOPSOAS
            </div>
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="w-5/12 border-r border-gray-800 p-2 text-center align-middle">
                    <AnatomicalImage
                      src="/assets/images/musculo/entrevista/maniobra-wasserman.jpg"
                      alt="Maniobra de Wasserman o Lasègue invertido"
                      className="w-48 h-20"
                      sizes="192px"
                    />
                  </td>

                  <td className="w-7/12 p-3 text-[11px] align-top">
                    <div className="flex flex-col justify-between h-full">
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
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* APROXIMACION DIAGNOSTICA */}
          <div className="text-[10px] italic pt-1">
            Dx. = Derecho(a)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Ix.= Izquierdo(a)
          </div>

          <div className="border border-gray-800 min-h-[90px]">
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="bg-gray-200 font-bold px-2 py-1 border-b border-gray-800 text-[11px] tracking-wide">
                    APROXIMACION DIAGNOSTICA DE LA EVALUACION
                  </td>
                </tr>
                <tr>
                  <td className="p-2">
                    <textarea
                      aria-label="Aproximación diagnóstica de la evaluación"
                      value={state.aproximacionDiagnosticaEvaluacion}
                      onChange={(e) => setField('aproximacionDiagnosticaEvaluacion', e.target.value)}
                      placeholder="Escriba el diagnóstico aquí..."
                      className="w-full h-16 resize-none outline-none text-xs"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
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
