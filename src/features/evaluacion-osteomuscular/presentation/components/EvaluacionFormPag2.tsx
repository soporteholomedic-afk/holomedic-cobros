'use client';

import { useMemo, type ReactNode } from 'react';
import { useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { Paginacion } from './Paginacion';
import type {
  DxIxBool,
  GravedadPatologia,
} from '@/types/evaluacion-osteomuscular';

type Lado = 'dx' | 'ix';

const DEDOS = ['dedo1', 'dedo2', 'dedo3', 'dedo4', 'dedo5'] as const;

interface CheckDxIxProps {
  basePath: string;
  checked: DxIxBool;
  lado: Lado;
  ariaLabel?: string;
}

function CheckDxIx({ basePath, checked, lado, ariaLabel }: CheckDxIxProps) {
  const { setDxIx } = useEvaluacionContext();
  return (
    <label className="cursor-pointer">
      <input
        type="checkbox"
        aria-label={ariaLabel}
        checked={checked[lado]}
        onChange={(e) => setDxIx(basePath, lado, e.target.checked)}
      />{' '}
      {lado === 'dx' ? 'Dx' : 'Ix'}
    </label>
  );
}

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

interface RadioGravedadProps {
  value: GravedadPatologia;
  current: GravedadPatologia | null;
  path: string;
  groupName: string;
}

function RadioGravedad({ value, current, path, groupName }: RadioGravedadProps) {
  const { setField } = useEvaluacionContext();
  return (
    <label className="inline-flex items-center space-x-1 cursor-pointer">
      <input
        type="radio"
        name={groupName}
        value={value}
        checked={current === value}
        onChange={() => setField(path, value)}
      />
      <span>{value}</span>
    </label>
  );
}

interface GraphPlaceholderProps {
  className?: string;
  column?: boolean;
  children: ReactNode;
}

function GraphPlaceholder({ className, column, children }: GraphPlaceholderProps) {
  return (
    <div
      className={`border border-dashed border-gray-400 flex items-center justify-center bg-gray-50 text-[9px] text-gray-400 shrink-0 ${
        column ? 'flex-col' : ''
      } ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

const BASE = 'evaluacionClinicaOsteomuscular.miembrosSuperiores';

export function EvaluacionFormPag2() {
  const { idAtencion, state, setField } = useEvaluacionContext();

  const codo = useMemo(
    () => state.evaluacionClinicaOsteomuscular.miembrosSuperiores.codo,
    [state],
  );
  const munecaMano = useMemo(
    () => state.evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano,
    [state],
  );

  const baseCodo = `${BASE}.codo`;
  const baseMuneca = `${BASE}.munecaMano`;

  const epi = codo.palpacionEpicondileoEpitroclear;
  const obs = munecaMano.observacionManoMuneca;
  const clic = munecaMano.maniobraClicDedosGatillo.clicExtensionDedos;

  return (
    <div className="evaluation-page evaluation-page--page2 min-h-screen bg-gray-100 py-6 text-xs leading-tight text-black">
      <form
        onSubmit={(e) => e.preventDefault()}
        className="max-w-4xl mx-auto bg-white p-3 shadow-md border border-gray-900 space-y-2"
      >
        {/* 1. PALPACIÓN MÚSCULO EPICÓNDILEO - EPITRÓCLEAR */}
        <div className="border border-gray-900">
          <div className="grid grid-cols-12 divide-x divide-gray-900">
            <div className="col-span-10 grid grid-cols-12 divide-x divide-gray-900">
              <div className="col-span-12 bg-gray-200 font-bold p-1 px-2 uppercase border-b border-gray-900 text-[11px]">
                PALPACION MUSCULO EPICÓNDILEO - EPITRÓCLEAR
              </div>
              <div className="col-span-6 p-2 flex items-center justify-between space-x-2">
                <p className="text-[9px] uppercase font-semibold leading-tight max-w-[130px] text-gray-800">
                  SE EFECTÚA A 2 CM DEL EPICÓNDILO SOBRE LA INSERCIÓN DEL TENDÓN
                </p>
                <GraphPlaceholder className="w-28 h-14">[Gráfico Palpación]</GraphPlaceholder>
              </div>
              <div className="col-span-6 flex flex-col justify-center divide-y divide-gray-900 font-semibold text-[10px]">
                <div className="p-2 flex items-center h-1/2">
                  DOLOR MUSCULO EPICÓNDILEO.........................
                </div>
                <div className="p-2 flex items-center h-1/2">
                  DOLOR MUSCULO EPITRÓCLEAR.........................
                </div>
              </div>
            </div>

            <div className="col-span-2 grid grid-cols-2 divide-x divide-gray-900 text-center">
              <div className="bg-gray-200 font-bold p-1 border-b border-gray-900 text-[11px]">Dx</div>
              <div className="bg-gray-200 font-bold p-1 border-b border-gray-900 text-[11px]">Ix</div>
              <div className="p-1 flex items-center justify-center border-b border-gray-900">
                <CheckSimple
                  path={`${baseCodo}.palpacionEpicondileoEpitroclear.dolorMusculoEpicondileo.dx`}
                  checked={epi.dolorMusculoEpicondileo.dx}
                  ariaLabel="Dolor músculo epicóndilo Dx"
                />
              </div>
              <div className="p-1 flex items-center justify-center border-b border-gray-900">
                <CheckSimple
                  path={`${baseCodo}.palpacionEpicondileoEpitroclear.dolorMusculoEpicondileo.ix`}
                  checked={epi.dolorMusculoEpicondileo.ix}
                  ariaLabel="Dolor músculo epicóndilo Ix"
                />
              </div>
              <div className="p-1 flex items-center justify-center">
                <CheckSimple
                  path={`${baseCodo}.palpacionEpicondileoEpitroclear.dolorMusculoEpitroclear.dx`}
                  checked={epi.dolorMusculoEpitroclear.dx}
                  ariaLabel="Dolor músculo epitróclear Dx"
                />
              </div>
              <div className="p-1 flex items-center justify-center">
                <CheckSimple
                  path={`${baseCodo}.palpacionEpicondileoEpitroclear.dolorMusculoEpitroclear.ix`}
                  checked={epi.dolorMusculoEpitroclear.ix}
                  ariaLabel="Dolor músculo epitróclear Ix"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2. TESTS DE CODO (EPICONDILITIS Y ATRAPAMIENTO N. ULNAR) */}
        <div className="border border-gray-900 grid grid-cols-2 divide-x divide-gray-900">
          {/* TEST PARA EPICONDILITIS */}
          <div className="flex flex-col justify-between">
            <div className="bg-gray-200 font-bold p-1 border-b border-gray-900 uppercase px-2 text-[11px]">
              TEST PARA EPICONDILITIS
            </div>
            <div className="p-2 grid grid-cols-12 gap-2 items-start">
              <div className="col-span-6 flex flex-col items-start space-y-1">
                <GraphPlaceholder className="w-full h-20">[Gráfico Extensión Codo]</GraphPlaceholder>
                <p className="text-[8px] uppercase leading-tight font-semibold text-gray-800 pt-1">
                  FLEXIÓN PASIVA DE LA MUÑECA CON EXTENSIÓN DEL CODO
                </p>
              </div>
              <div className="col-span-6 space-y-3 pt-1">
                <p className="text-[10px] font-semibold leading-tight">
                  Presencia de dolor lateral en el codo.
                </p>
                <div className="flex space-x-4 font-bold text-[11px] pl-1">
                  <CheckDxIx
                    basePath={`${baseCodo}.testEpicondilitis.presenciaDolorLateralCodo`}
                    checked={codo.testEpicondilitis.presenciaDolorLateralCodo}
                    lado="dx"
                    ariaLabel="Presencia de dolor lateral en el codo Dx"
                  />
                  <CheckDxIx
                    basePath={`${baseCodo}.testEpicondilitis.presenciaDolorLateralCodo`}
                    checked={codo.testEpicondilitis.presenciaDolorLateralCodo}
                    lado="ix"
                    ariaLabel="Presencia de dolor lateral en el codo Ix"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* TEST PARA ATRAPAMIENTO N. ULNAR EN EL CODO */}
          <div className="flex flex-col justify-between">
            <div className="bg-gray-200 font-bold p-1 border-b border-gray-900 uppercase px-2 text-[11px]">
              TEST PARA ATRAPAMIENTO N. ULNAR EN EL CODO
            </div>
            <div className="p-2 grid grid-cols-12 gap-2 items-center">
              <div className="col-span-6">
                <GraphPlaceholder className="w-full h-20">[Gráfico Nervio Ulnar]</GraphPlaceholder>
              </div>
              <div className="col-span-6 space-y-3">
                <p className="font-semibold text-[9px] uppercase leading-tight text-gray-900">
                  PARESTESIAS IRRADIAN AL ANTEBRAZO Y/O AL 4° Y 5° DEDO:
                </p>
                <div className="flex space-x-4 font-bold text-[11px]">
                  <CheckDxIx
                    basePath={`${baseCodo}.testAtrapamientoNervioUlnar.parestesiasIrradianAntebrazoODedos`}
                    checked={codo.testAtrapamientoNervioUlnar.parestesiasIrradianAntebrazoODedos}
                    lado="dx"
                    ariaLabel="Parestesias irradian antebrazo o dedos Dx"
                  />
                  <CheckDxIx
                    basePath={`${baseCodo}.testAtrapamientoNervioUlnar.parestesiasIrradianAntebrazoODedos`}
                    checked={codo.testAtrapamientoNervioUlnar.parestesiasIrradianAntebrazoODedos}
                    lado="ix"
                    ariaLabel="Parestesias irradian antebrazo o dedos Ix"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. EXAMEN INSTRUMENTAL */}
        <div className="border border-gray-900 p-1.5 flex flex-wrap items-center justify-between text-[11px] gap-2">
          <span className="font-bold">Examen instrumental:</span>
          <label className="inline-flex items-center space-x-1 cursor-pointer">
            <CheckSimple
              path={`${baseCodo}.examenInstrumental.noRealizado`}
              checked={codo.examenInstrumental.noRealizado}
            />
            <span className="font-bold">NO</span>
          </label>

          <div className="inline-flex items-center space-x-1">
            <label className="inline-flex items-center space-x-1 cursor-pointer">
              <CheckSimple
                path={`${baseCodo}.examenInstrumental.ecografia`}
                checked={codo.examenInstrumental.ecografia}
              />
              <span>ECOGRAFÍA (año</span>
            </label>
            <input
              type="number"
              min={0}
              aria-label="Año ecografía codo"
              value={codo.examenInstrumental.ecografiaAno ?? ''}
              onChange={(e) =>
                setField(
                  `${baseCodo}.examenInstrumental.ecografiaAno`,
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
              className="w-12 border-b border-gray-800 text-center outline-none p-0 h-4 text-xs font-semibold"
            />
            <span>)</span>
          </div>

          <div className="inline-flex items-center space-x-1">
            <label className="inline-flex items-center space-x-1 cursor-pointer">
              <CheckSimple
                path={`${baseCodo}.examenInstrumental.rx`}
                checked={codo.examenInstrumental.rx}
              />
              <span>RX (año</span>
            </label>
            <input
              type="number"
              min={0}
              aria-label="Año RX codo"
              value={codo.examenInstrumental.rxAno ?? ''}
              onChange={(e) =>
                setField(
                  `${baseCodo}.examenInstrumental.rxAno`,
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
              className="w-12 border-b border-gray-800 text-center outline-none p-0 h-4 text-xs font-semibold"
            />
            <span>)</span>
          </div>

          <div className="inline-flex items-center space-x-1">
            <label className="inline-flex items-center space-x-1 cursor-pointer">
              <CheckSimple
                path={`${baseCodo}.examenInstrumental.emg`}
                checked={codo.examenInstrumental.emg}
              />
              <span>EMG (año</span>
            </label>
            <input
              type="number"
              min={0}
              aria-label="Año EMG codo"
              value={codo.examenInstrumental.emgAno ?? ''}
              onChange={(e) =>
                setField(
                  `${baseCodo}.examenInstrumental.emgAno`,
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
              className="w-12 border-b border-gray-800 text-center outline-none p-0 h-4 text-xs font-semibold"
            />
            <span>)</span>
          </div>
        </div>

        {/* 4. GRAVEDAD PATOLOGÍA DEL CODO */}
        <div className="border border-gray-900 bg-gray-100 p-1.5 flex items-center justify-between text-[11px]">
          <span className="font-bold uppercase">GRAVEDAD PATOLOGÍA DEL CODO (última página)</span>
          <div className="flex space-x-6 font-bold">
            <RadioGravedad
              value="LEVE"
              current={codo.gravedadPatologiaCodo}
              path={`${baseCodo}.gravedadPatologiaCodo`}
              groupName="gravedadCodo"
            />
            <RadioGravedad
              value="MEDIA"
              current={codo.gravedadPatologiaCodo}
              path={`${baseCodo}.gravedadPatologiaCodo`}
              groupName="gravedadCodo"
            />
            <RadioGravedad
              value="GRAVE"
              current={codo.gravedadPatologiaCodo}
              path={`${baseCodo}.gravedadPatologiaCodo`}
              groupName="gravedadCodo"
            />
          </div>
        </div>

        {/* 5. SECCIÓN C: MUÑECA - MANO */}
        <div className="border border-gray-900">
          <div className="bg-gray-200 p-1 font-bold border-b border-gray-900 flex items-center justify-between text-[12px]">
            <div className="text-amber-900 font-extrabold">
              c) MUÑECA - MANO: <span className="text-amber-800">REALIZA MANIOBRAS</span>
            </div>
            <label className="inline-flex items-center space-x-1 text-black font-semibold cursor-pointer">
              <CheckSimple
                path={`${baseMuneca}.realizaManiobras`}
                checked={munecaMano.realizaManiobras}
              />
              <span>SI</span>
            </label>
          </div>

          <div className="p-2 border-b border-gray-900 flex justify-around items-center font-bold text-[11px]">
            <div>
              <span>MOLESTIA MUÑECA Dx desde</span>{' '}
              <input
                type="number"
                min={0}
                aria-label="Molestia muñeca Dx desde meses"
                value={munecaMano.molestiaMunecaDxDesdeMeses ?? ''}
                onChange={(e) =>
                  setField(
                    `${baseMuneca}.molestiaMunecaDxDesdeMeses`,
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                className="w-20 border-b border-gray-800 text-center outline-none p-0 mx-1 font-semibold"
              />
              <span>(meses)</span>
            </div>
            <div>
              <span>MOLESTIA MUÑECA Ix desde</span>{' '}
              <input
                type="number"
                min={0}
                aria-label="Molestia muñeca Ix desde meses"
                value={munecaMano.molestiaMunecaIxDesdeMeses ?? ''}
                onChange={(e) =>
                  setField(
                    `${baseMuneca}.molestiaMunecaIxDesdeMeses`,
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                className="w-20 border-b border-gray-800 text-center outline-none p-0 mx-1 font-semibold"
              />
              <span>(meses)</span>
            </div>
          </div>

          {/* OBSERVACIÓN MANO / MUÑECA */}
          <div>
            <div className="bg-gray-200 font-bold p-1 text-center border-b border-gray-900 uppercase text-[11px]">
              OBSERVACIÓN MANO/MUÑECA
            </div>
            <div className="divide-y divide-gray-900 font-semibold text-[10px]">
              {/* QUISTE */}
              <div className="grid grid-cols-12 divide-x divide-gray-900 p-1 items-center">
                <div className="col-span-3 font-bold pl-2 uppercase">QUISTE</div>
                <div className="col-span-4 pl-2 flex items-center justify-between pr-2">
                  <span>QUISTE DORSAL</span>
                  <div className="space-x-2">
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.quisteDorsal`}
                      checked={obs.quisteDorsal}
                      lado="dx"
                      ariaLabel="Quiste dorsal Dx"
                    />
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.quisteDorsal`}
                      checked={obs.quisteDorsal}
                      lado="ix"
                      ariaLabel="Quiste dorsal Ix"
                    />
                  </div>
                </div>
                <div className="col-span-5 pl-2 flex items-center justify-between pr-2">
                  <span>QUISTE VENTRAL</span>
                  <div className="space-x-2">
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.quisteVentral`}
                      checked={obs.quisteVentral}
                      lado="dx"
                      ariaLabel="Quiste ventral Dx"
                    />
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.quisteVentral`}
                      checked={obs.quisteVentral}
                      lado="ix"
                      ariaLabel="Quiste ventral Ix"
                    />
                  </div>
                </div>
              </div>

              {/* EDEMA */}
              <div className="grid grid-cols-12 divide-x divide-gray-900 p-1 items-center">
                <div className="col-span-3 font-bold pl-2 uppercase">EDEMA</div>
                <div className="col-span-4 pl-2 flex items-center justify-between pr-2">
                  <div>
                    <div>VENTRAL (muñeca)</div>
                    <div>ESTILOIDE RADIAL</div>
                  </div>
                  <div className="space-x-2">
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.edemaVentralEstiloideRadial`}
                      checked={obs.edemaVentralEstiloideRadial}
                      lado="dx"
                      ariaLabel="Edema ventral estiloide radial Dx"
                    />
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.edemaVentralEstiloideRadial`}
                      checked={obs.edemaVentralEstiloideRadial}
                      lado="ix"
                      ariaLabel="Edema ventral estiloide radial Ix"
                    />
                  </div>
                </div>
                <div className="col-span-5 pl-2 flex items-center justify-between pr-2">
                  <div>
                    <div>DORSAL (Muñeca)</div>
                    <div>ESTILOIDE ULNAR</div>
                  </div>
                  <div className="space-x-2">
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.edemaDorsalEstiloideUlnar`}
                      checked={obs.edemaDorsalEstiloideUlnar}
                      lado="dx"
                      ariaLabel="Edema dorsal estiloide ulnar Dx"
                    />
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.edemaDorsalEstiloideUlnar`}
                      checked={obs.edemaDorsalEstiloideUlnar}
                      lado="ix"
                      ariaLabel="Edema dorsal estiloide ulnar Ix"
                    />
                  </div>
                </div>
              </div>

              {/* HIPOTROFIA */}
              <div className="grid grid-cols-12 divide-x divide-gray-900 p-1 items-center">
                <div className="col-span-3 font-bold pl-2 uppercase">HIPOTROFIA</div>
                <div className="col-span-4 pl-2">
                  <label className="cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.observacionManoMuneca.hipotrofiaPosterior.dx`}
                      checked={obs.hipotrofiaPosterior.dx}
                      ariaLabel="Hipotrofia posterior Dx"
                    />{' '}
                    Dx posterior:
                  </label>
                </div>
                <div className="col-span-5 pl-2">
                  <label className="cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.observacionManoMuneca.hipotrofiaPosterior.ix`}
                      checked={obs.hipotrofiaPosterior.ix}
                      ariaLabel="Hipotrofia posterior Ix"
                    />{' '}
                    Ix posterior:
                  </label>
                </div>
              </div>

              {/* DEFORMIDAD ARTICULAR */}
              <div className="grid grid-cols-12 divide-x divide-gray-900 p-1 items-center">
                <div className="col-span-3 font-bold pl-2 uppercase">DEFORM. ARTIC. TRAPECIO - METACARPAL</div>
                <div className="col-span-4 pl-2">
                  <label className="cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.observacionManoMuneca.deformidadArticularTrapecioMetacarpal.dx`}
                      checked={obs.deformidadArticularTrapecioMetacarpal.dx}
                      ariaLabel="Deformidad articular trapecio metacarpal Dx"
                    />{' '}
                    Dx
                  </label>
                </div>
                <div className="col-span-5 pl-2">
                  <label className="cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.observacionManoMuneca.deformidadArticularTrapecioMetacarpal.ix`}
                      checked={obs.deformidadArticularTrapecioMetacarpal.ix}
                      ariaLabel="Deformidad articular trapecio metacarpal Ix"
                    />{' '}
                    Ix
                  </label>
                </div>
              </div>

              {/* RETACCIONES PALMARES */}
              <div className="grid grid-cols-12 divide-x divide-gray-900 p-1 items-center">
                <div className="col-span-3 font-bold pl-2 uppercase">RETACCIONES PALMARES</div>
                <div className="col-span-4 pl-2">
                  <label className="cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.observacionManoMuneca.retaccionesPalmares.dx`}
                      checked={obs.retaccionesPalmares.dx}
                      ariaLabel="Retracciones palmares Dx"
                    />{' '}
                    Dx
                  </label>
                </div>
                <div className="col-span-5 pl-2">
                  <label className="cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.observacionManoMuneca.retaccionesPalmares.ix`}
                      checked={obs.retaccionesPalmares.ix}
                      ariaLabel="Retracciones palmares Ix"
                    />{' '}
                    Ix
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 6. PALPACIÓN Y DEDO EN GATILLO */}
        <div className="border border-gray-900 grid grid-cols-2 divide-x divide-gray-900">
          {/* PALPACIÓN */}
          <div className="flex flex-col justify-between">
            <div className="bg-gray-200 font-bold p-1 text-center border-b border-gray-900 uppercase text-[11px]">
              PALPACIÓN
            </div>
            <div className="p-2 flex items-center space-x-2">
              <GraphPlaceholder className="w-24 h-28" column>
                <span>[Esquema Mano]</span>
                <span className="font-bold text-gray-600">A</span>
                <span className="font-bold text-gray-600">B</span>
              </GraphPlaceholder>

              <div className="space-y-1 text-[9px] font-semibold">
                <label className="flex items-start space-x-1 cursor-pointer">
                  <CheckSimple
                    path={`${baseMuneca}.palpacion.dolorArticulacionTrapecioMetacarpal.dx`}
                    checked={munecaMano.palpacion.dolorArticulacionTrapecioMetacarpal.dx}
                  />
                  <span>(A) DOLOR A LA PALPACIÓN ARTI. TRAPECIO – METACARPALE Dx.</span>
                </label>
                <label className="flex items-start space-x-1 cursor-pointer">
                  <CheckSimple
                    path={`${baseMuneca}.palpacion.dolorArticulacionTrapecioMetacarpal.ix`}
                    checked={munecaMano.palpacion.dolorArticulacionTrapecioMetacarpal.ix}
                  />
                  <span>(A) DOLOR A LA PALPACIÓN ARTI. TRAPECIO – METACARPAL Ix.</span>
                </label>
                <label className="flex items-start space-x-1 cursor-pointer">
                  <CheckSimple
                    path={`${baseMuneca}.palpacion.dolorEstiloideRadial.dx`}
                    checked={munecaMano.palpacion.dolorEstiloideRadial.dx}
                  />
                  <span>(B) DOLOR A LA PALPACIÓN ESTILOIDE RADIAL Dx.</span>
                </label>
                <label className="flex items-start space-x-1 cursor-pointer">
                  <CheckSimple
                    path={`${baseMuneca}.palpacion.dolorEstiloideRadial.ix`}
                    checked={munecaMano.palpacion.dolorEstiloideRadial.ix}
                  />
                  <span>(B) DOLOR A LA PALPACIÓN ESTILOIDE RADIAL Ix.</span>
                </label>
              </div>
            </div>
          </div>

          {/* MANIOBRA PARA CLIC (GATILLO) */}
          <div className="flex flex-col justify-between">
            <div className="bg-gray-200 font-bold p-1 text-center border-b border-gray-900 uppercase text-[11px]">
              MANIOBRA PARA CLIC (chasquido) DE DEDOS (GATILLO)
            </div>
            <div className="p-2 space-y-3">
              <div className="flex items-center space-x-2">
                <GraphPlaceholder className="w-20 h-20">[Gráfico Dedo]</GraphPlaceholder>

                <div className="space-y-2 text-[9px] font-semibold">
                  {/* Dedo Dx */}
                  <div>
                    <p className="font-bold">CLIC DURANTE LA EXTENSIÓN DEDO Dx:</p>
                    <div className="flex space-x-1 pl-4 mt-1">
                      {DEDOS.map((dedo, i) => (
                        <label
                          key={`dx-${dedo}`}
                          className="inline-flex items-center space-x-0.5 cursor-pointer"
                        >
                          <CheckSimple
                            path={`${baseMuneca}.maniobraClicDedosGatillo.clicExtensionDedos.dx.${dedo}`}
                            checked={clic.dx[dedo]}
                          />
                          <span>{i + 1}°</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Dedo Ix */}
                  <div>
                    <p className="font-bold">CLIC DURANTE LA EXTENSIÓN DEDO Ix:</p>
                    <div className="flex space-x-1 pl-4 mt-1">
                      {DEDOS.map((dedo, i) => (
                        <label
                          key={`ix-${dedo}`}
                          className="inline-flex items-center space-x-0.5 cursor-pointer"
                        >
                          <CheckSimple
                            path={`${baseMuneca}.maniobraClicDedosGatillo.clicExtensionDedos.ix.${dedo}`}
                            checked={clic.ix[dedo]}
                          />
                          <span>{i + 1}°</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* LEYENDA */}
        <div className="text-[10px] font-bold pt-1">
          Dx.= Derecho&nbsp;&nbsp;&nbsp; Ix.= Izquierdo
        </div>

        {/* PIE DE PÁGINA */}
        <div className="flex justify-between items-center text-[9px] text-gray-600 pt-2 border-t border-gray-300">
          <div>
            Fo. JJC-SIGLA-13-31 Cuestionario anamnesico y evaluación de extremidad superior y espalda. Rev. 0
          </div>
          <div className="font-bold text-gray-900 text-xs">
            6
          </div>
        </div>
      </form>

      <Paginacion
        paginaActual={2}
        baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/evaluacion`}
      />
    </div>
  );
}
