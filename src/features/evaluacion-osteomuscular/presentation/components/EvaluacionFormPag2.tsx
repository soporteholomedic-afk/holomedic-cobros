'use client';

import { useMemo } from 'react';
import { useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import type {
  DxIxBool,
  GravedadPatologia,
} from '@/types/evaluacion-osteomuscular';

type Lado = 'dx' | 'ix';

interface CheckDxIxProps {
  basePath: string;
  checked: DxIxBool;
  lado: Lado;
}

function CheckDxIx({ basePath, checked, lado }: CheckDxIxProps) {
  const { setDxIx } = useEvaluacionContext();
  const label = lado === 'dx' ? 'Dx' : 'Ix';
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer">
      <input
        type="checkbox"
        className="rounded text-sky-600 w-4 h-4"
        checked={checked[lado]}
        onChange={(e) => setDxIx(basePath, lado, e.target.checked)}
      />
      <span className="text-[10px] font-bold uppercase">{label}</span>
    </label>
  );
}

interface CheckSimpleProps {
  path: string;
  checked: boolean;
}

function CheckSimple({ path, checked }: CheckSimpleProps) {
  const { setField } = useEvaluacionContext();
  return (
    <input
      type="checkbox"
      className="rounded text-sky-600 w-4 h-4"
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
    <label className="flex flex-col items-center gap-1 cursor-pointer">
      <input
        type="radio"
        name={groupName}
        value={value}
        className="w-4 h-4 text-sky-600"
        checked={current === value}
        onChange={() => setField(path, value)}
      />
      <span className="text-[10px] font-bold text-white">{value}</span>
    </label>
  );
}

const BASE = 'evaluacionClinicaOsteomuscular.miembrosSuperiores';

export function EvaluacionFormPag2() {
  const { state, setField } = useEvaluacionContext();

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

  return (
    <div className="space-y-6">
      {/* ---- Page Header ---- */}
      <div className="flex justify-between items-end border-b-2 border-sky-600 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">I.- MIEMBROS SUPERIORES (Cont.)</h1>
          <p className="text-slate-500 text-xs font-medium mt-1 uppercase tracking-wider">
            EVALUACIÓN CLÍNICA OSTEMUSCULAR — PÁGINA 2
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white px-4 py-2 border border-slate-200 rounded-lg">
          <span className="text-xs font-bold text-sky-600 uppercase">Expediente No.</span>
          <span className="text-lg font-semibold text-slate-700">
            {state.idAtencion}
          </span>
        </div>
      </div>

      {/* ===================== SECCIÓN A: CODO (Continuación) ===================== */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-sky-600">
            A) CODO (Continuación)
          </h3>
        </div>

        <div className="p-6 space-y-8">
          {/* Palpación Músculo Epicóndilo - Epitróclear */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">
              Palpación Músculo Epicóndilo - Epitróclear {'(EFECTÚA A 2 CM DEL EPICÓNDILO)'}
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-8">
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
                  <p className="text-xs font-bold text-slate-700 uppercase">
                    Dolor Músculo Epicóndilo
                  </p>
                  <div className="flex gap-4">
                    <CheckDxIx
                      basePath={`${baseCodo}.palpacionEpicondileoEpitroclear.dolorMusculoEpicondileo`}
                      checked={codo.palpacionEpicondileoEpitroclear.dolorMusculoEpicondileo}
                      lado="dx"
                    />
                    <CheckDxIx
                      basePath={`${baseCodo}.palpacionEpicondileoEpitroclear.dolorMusculoEpicondileo`}
                      checked={codo.palpacionEpicondileoEpitroclear.dolorMusculoEpicondileo}
                      lado="ix"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
                  <p className="text-xs font-bold text-slate-700 uppercase">
                    Dolor Músculo Epitróclear
                  </p>
                  <div className="flex gap-4">
                    <CheckDxIx
                      basePath={`${baseCodo}.palpacionEpicondileoEpitroclear.dolorMusculoEpitroclear`}
                      checked={codo.palpacionEpicondileoEpitroclear.dolorMusculoEpitroclear}
                      lado="dx"
                    />
                    <CheckDxIx
                      basePath={`${baseCodo}.palpacionEpicondileoEpitroclear.dolorMusculoEpitroclear`}
                      checked={codo.palpacionEpicondileoEpitroclear.dolorMusculoEpitroclear}
                      lado="ix"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tests de Codo (Epicondilitis + Atrapamiento N. Ulnar) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Test para Epicondilitis */}
            <div className="border border-slate-200 rounded-lg p-4">
              <h4 className="text-xs font-bold text-slate-600 uppercase border-b border-slate-200 pb-2 mb-4">
                Test para Epicondilitis
              </h4>
              <div className="flex gap-4 items-start">
                <div className="w-24 h-20 bg-slate-100 rounded flex items-center justify-center shrink-0">
                  <span className="text-[9px] text-slate-400 italic">[Gráfico]</span>
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold text-slate-600 leading-tight">
                    Flexión pasiva de la muñeca con extensión del codo
                  </p>
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <CheckSimple
                        path={`${baseCodo}.testEpicondilitis.presenciaDolorLateralCodo.dx`}
                        checked={codo.testEpicondilitis.presenciaDolorLateralCodo.dx}
                      />
                      Presencia de dolor lateral en el codo Dx
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <CheckSimple
                        path={`${baseCodo}.testEpicondilitis.presenciaDolorLateralCodo.ix`}
                        checked={codo.testEpicondilitis.presenciaDolorLateralCodo.ix}
                      />
                      Presencia de dolor lateral en el codo Ix
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Test Atrapamiento N. Ulnar */}
            <div className="border border-slate-200 rounded-lg p-4">
              <h4 className="text-xs font-bold text-slate-600 uppercase border-b border-slate-200 pb-2 mb-4">
                Test para Atrapamiento N. Ulnar en el Codo
              </h4>
              <div className="flex gap-4 items-start">
                <div className="w-24 h-20 bg-slate-100 rounded flex items-center justify-center shrink-0">
                  <span className="text-[9px] text-slate-400 italic">[Gráfico]</span>
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold text-slate-600 leading-tight">
                    Parestesias irradian al antebrazo y/o al 4° y 5° dedo:
                  </p>
                  <div className="flex gap-4">
                    <CheckDxIx
                      basePath={`${baseCodo}.testAtrapamientoNervioUlnar.parestesiasIrradianAntebrazoODedos`}
                      checked={codo.testAtrapamientoNervioUlnar.parestesiasIrradianAntebrazoODedos}
                      lado="dx"
                    />
                    <CheckDxIx
                      basePath={`${baseCodo}.testAtrapamientoNervioUlnar.parestesiasIrradianAntebrazoODedos`}
                      checked={codo.testAtrapamientoNervioUlnar.parestesiasIrradianAntebrazoODedos}
                      lado="ix"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Examen Instrumental + Gravedad Codo */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-50 p-4 rounded-lg">
              <p className="text-xs font-bold uppercase text-slate-600 mb-4">
                Examen Instrumental
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <CheckSimple
                    path={`${baseCodo}.examenInstrumental.noRealizado`}
                    checked={codo.examenInstrumental.noRealizado}
                  />
                  NO
                </label>
                <div className="flex items-center gap-2">
                  <CheckSimple
                    path={`${baseCodo}.examenInstrumental.ecografia`}
                    checked={codo.examenInstrumental.ecografia}
                  />
                  <span className="text-xs font-medium">ECOGRAFÍA (año</span>
                  <input
                    type="number"
                    value={codo.examenInstrumental.ecografiaAno ?? ''}
                    onChange={(e) =>
                      setField(
                        `${baseCodo}.examenInstrumental.ecografiaAno`,
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                    className="w-16 border-b border-slate-300 bg-transparent text-xs focus:ring-0 outline-none text-center"
                  />
                  <span className="text-xs">)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckSimple
                    path={`${baseCodo}.examenInstrumental.rx`}
                    checked={codo.examenInstrumental.rx}
                  />
                  <span className="text-xs font-medium">RX (año</span>
                  <input
                    type="number"
                    value={codo.examenInstrumental.rxAno ?? ''}
                    onChange={(e) =>
                      setField(
                        `${baseCodo}.examenInstrumental.rxAno`,
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                    className="w-16 border-b border-slate-300 bg-transparent text-xs focus:ring-0 outline-none text-center"
                  />
                  <span className="text-xs">)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckSimple
                    path={`${baseCodo}.examenInstrumental.emg`}
                    checked={codo.examenInstrumental.emg}
                  />
                  <span className="text-xs font-medium">EMG (año</span>
                  <input
                    type="number"
                    value={codo.examenInstrumental.emgAno ?? ''}
                    onChange={(e) =>
                      setField(
                        `${baseCodo}.examenInstrumental.emgAno`,
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                    className="w-16 border-b border-slate-300 bg-transparent text-xs focus:ring-0 outline-none text-center"
                  />
                  <span className="text-xs">)</span>
                </div>
              </div>
            </div>

            <div className="bg-sky-600 text-white p-4 rounded-lg flex flex-col justify-between">
              <p className="text-xs font-bold uppercase mb-4 opacity-80">
                Gravedad Patología del Codo
              </p>
              <div className="flex justify-between items-center">
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
          </div>
        </div>
      </section>

      {/* ===================== SECCIÓN B: MUÑECA - MANO ===================== */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-sky-600">
            B) MUÑECA - MANO
          </h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              REALIZA MANIOBRAS
            </span>
            <input
              type="checkbox"
              className="w-5 h-5 rounded text-sky-600 focus:ring-sky-500"
              checked={munecaMano.realizaManiobras}
              onChange={(e) => setField(`${baseMuneca}.realizaManiobras`, e.target.checked)}
            />
          </label>
        </div>

        <div className="p-6 space-y-8">
          {/* Molestia meses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Molestia Muñeca Dx Desde (meses)
              </label>
              <input
                type="number"
                min={0}
                value={munecaMano.molestiaMunecaDxDesdeMeses ?? ''}
                onChange={(e) =>
                  setField(
                    `${baseMuneca}.molestiaMunecaDxDesdeMeses`,
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-1 focus:ring-sky-500 outline-none"
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Molestia Muñeca Ix Desde (meses)
              </label>
              <input
                type="number"
                min={0}
                value={munecaMano.molestiaMunecaIxDesdeMeses ?? ''}
                onChange={(e) =>
                  setField(
                    `${baseMuneca}.molestiaMunecaIxDesdeMeses`,
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-1 focus:ring-sky-500 outline-none"
                placeholder="0"
              />
            </div>
          </div>

          {/* Observación Mano/Muñeca */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">
              Observación Mano / Muñeca
            </div>
            <div className="divide-y divide-slate-200">
              {/* Quistes */}
              <div className="grid grid-cols-12 items-center">
                <div className="col-span-3 font-bold text-[10px] uppercase text-slate-500 pl-4 py-3 bg-slate-50">
                  Quiste
                </div>
                <div className="col-span-4 p-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">Quiste Dorsal</span>
                  <div className="flex gap-3">
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.quisteDorsal`}
                      checked={munecaMano.observacionManoMuneca.quisteDorsal}
                      lado="dx"
                    />
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.quisteDorsal`}
                      checked={munecaMano.observacionManoMuneca.quisteDorsal}
                      lado="ix"
                    />
                  </div>
                </div>
                <div className="col-span-5 p-3 flex items-center justify-between border-l border-slate-200">
                  <span className="text-xs font-medium text-slate-700">Quiste Ventral</span>
                  <div className="flex gap-3">
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.quisteVentral`}
                      checked={munecaMano.observacionManoMuneca.quisteVentral}
                      lado="dx"
                    />
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.quisteVentral`}
                      checked={munecaMano.observacionManoMuneca.quisteVentral}
                      lado="ix"
                    />
                  </div>
                </div>
              </div>

              {/* Edema */}
              <div className="grid grid-cols-12 items-center">
                <div className="col-span-3 font-bold text-[10px] uppercase text-slate-500 pl-4 py-3 bg-slate-50">
                  Edema
                </div>
                <div className="col-span-4 p-3 flex items-center justify-between">
                  <div className="text-[10px] leading-tight">
                    <p className="font-medium text-slate-700">Ventral (muñeca)</p>
                    <p className="text-slate-500">Estiloide Radial</p>
                  </div>
                  <div className="flex gap-3">
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.edemaVentralEstiloideRadial`}
                      checked={munecaMano.observacionManoMuneca.edemaVentralEstiloideRadial}
                      lado="dx"
                    />
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.edemaVentralEstiloideRadial`}
                      checked={munecaMano.observacionManoMuneca.edemaVentralEstiloideRadial}
                      lado="ix"
                    />
                  </div>
                </div>
                <div className="col-span-5 p-3 flex items-center justify-between border-l border-slate-200">
                  <div className="text-[10px] leading-tight">
                    <p className="font-medium text-slate-700">Dorsal (muñeca)</p>
                    <p className="text-slate-500">Estiloide Ulnar</p>
                  </div>
                  <div className="flex gap-3">
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.edemaDorsalEstiloideUlnar`}
                      checked={munecaMano.observacionManoMuneca.edemaDorsalEstiloideUlnar}
                      lado="dx"
                    />
                    <CheckDxIx
                      basePath={`${baseMuneca}.observacionManoMuneca.edemaDorsalEstiloideUlnar`}
                      checked={munecaMano.observacionManoMuneca.edemaDorsalEstiloideUlnar}
                      lado="ix"
                    />
                  </div>
                </div>
              </div>

              {/* Hipotrofia */}
              <div className="grid grid-cols-12 items-center">
                <div className="col-span-3 font-bold text-[10px] uppercase text-slate-500 pl-4 py-3 bg-slate-50">
                  Hipotrofia
                </div>
                <div className="col-span-4 p-3">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.observacionManoMuneca.hipotrofiaPosterior.dx`}
                      checked={munecaMano.observacionManoMuneca.hipotrofiaPosterior.dx}
                    />
                    <span className="font-medium">Dx posterior</span>
                  </label>
                </div>
                <div className="col-span-5 p-3 border-l border-slate-200">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.observacionManoMuneca.hipotrofiaPosterior.ix`}
                      checked={munecaMano.observacionManoMuneca.hipotrofiaPosterior.ix}
                    />
                    <span className="font-medium">Ix posterior</span>
                  </label>
                </div>
              </div>

              {/* Deformidad Articular */}
              <div className="grid grid-cols-12 items-center">
                <div className="col-span-3 font-bold text-[10px] uppercase text-slate-500 pl-4 py-3 bg-slate-50 leading-tight">
                  Deform. Artic. Trapecio - Metacarpal
                </div>
                <div className="col-span-4 p-3">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.observacionManoMuneca.deformidadArticularTrapecioMetacarpal.dx`}
                      checked={
                        munecaMano.observacionManoMuneca.deformidadArticularTrapecioMetacarpal.dx
                      }
                    />
                    <span className="font-medium">Dx</span>
                  </label>
                </div>
                <div className="col-span-5 p-3 border-l border-slate-200">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.observacionManoMuneca.deformidadArticularTrapecioMetacarpal.ix`}
                      checked={
                        munecaMano.observacionManoMuneca.deformidadArticularTrapecioMetacarpal.ix
                      }
                    />
                    <span className="font-medium">Ix</span>
                  </label>
                </div>
              </div>

              {/* Retacciones Palmares */}
              <div className="grid grid-cols-12 items-center">
                <div className="col-span-3 font-bold text-[10px] uppercase text-slate-500 pl-4 py-3 bg-slate-50 leading-tight">
                  Retacciones Palmares
                </div>
                <div className="col-span-4 p-3">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.observacionManoMuneca.retaccionesPalmares.dx`}
                      checked={munecaMano.observacionManoMuneca.retaccionesPalmares.dx}
                    />
                    <span className="font-medium">Dx</span>
                  </label>
                </div>
                <div className="col-span-5 p-3 border-l border-slate-200">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.observacionManoMuneca.retaccionesPalmares.ix`}
                      checked={munecaMano.observacionManoMuneca.retaccionesPalmares.ix}
                    />
                    <span className="font-medium">Ix</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Palpación + Maniobra Clic Dedos Gatillo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Palpación */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">
                Palpación
              </div>
              <div className="p-4 flex gap-4">
                <div className="w-20 h-24 bg-slate-100 rounded flex flex-col items-center justify-center shrink-0">
                  <span className="text-[8px] text-slate-400 italic">[Esquema</span>
                  <span className="text-[8px] text-slate-400 italic">Mano]</span>
                  <span className="text-[9px] font-bold text-slate-500 mt-1">A / B</span>
                </div>
                <div className="space-y-2 text-[10px]">
                  <label className="flex items-start gap-1.5 cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.palpacion.dolorArticulacionTrapecioMetacarpal.dx`}
                      checked={munecaMano.palpacion.dolorArticulacionTrapecioMetacarpal.dx}
                    />
                    <span className="leading-tight">
                      (A) Dolor palpación arti. trapecio-metacarpal Dx
                    </span>
                  </label>
                  <label className="flex items-start gap-1.5 cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.palpacion.dolorArticulacionTrapecioMetacarpal.ix`}
                      checked={munecaMano.palpacion.dolorArticulacionTrapecioMetacarpal.ix}
                    />
                    <span className="leading-tight">
                      (A) Dolor palpación arti. trapecio-metacarpal Ix
                    </span>
                  </label>
                  <label className="flex items-start gap-1.5 cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.palpacion.dolorEstiloideRadial.dx`}
                      checked={munecaMano.palpacion.dolorEstiloideRadial.dx}
                    />
                    <span className="leading-tight">
                      (B) Dolor palpación estiloide radial Dx
                    </span>
                  </label>
                  <label className="flex items-start gap-1.5 cursor-pointer">
                    <CheckSimple
                      path={`${baseMuneca}.palpacion.dolorEstiloideRadial.ix`}
                      checked={munecaMano.palpacion.dolorEstiloideRadial.ix}
                    />
                    <span className="leading-tight">
                      (B) Dolor palpación estiloide radial Ix
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Maniobra Clic Dedos Gatillo */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">
                Maniobra para Clic {'(chasquido)'} de Dedos {'(Gatillo)'}
              </div>
              <div className="p-4 space-y-4">
                <div className="flex gap-3">
                  <div className="w-16 h-16 bg-slate-100 rounded flex items-center justify-center shrink-0">
                    <span className="text-[8px] text-slate-400 italic">[Gráfico</span>
                  </div>
                  <div className="space-y-3 flex-1">
                    {/* Dx */}
                    <div>
                      <p className="text-[10px] font-bold text-slate-600 mb-1">
                        Clic durante la extensión dedo Dx:
                      </p>
                      <div className="flex gap-1">
                        {(['dedo1', 'dedo2', 'dedo3', 'dedo4', 'dedo5'] as const).map((dedo, i) => (
                          <label
                            key={`dx-${dedo}`}
                            className="inline-flex items-center gap-0.5 cursor-pointer text-[10px]"
                          >
                            <CheckSimple
                              path={`${baseMuneca}.maniobraClicDedosGatillo.clicExtensionDedos.dx.${dedo}`}
                              checked={
                                munecaMano.maniobraClicDedosGatillo.clicExtensionDedos.dx[dedo]
                              }
                            />
                            <span>{i + 1}°</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    {/* Ix */}
                    <div>
                      <p className="text-[10px] font-bold text-slate-600 mb-1">
                        Clic durante la extensión dedo Ix:
                      </p>
                      <div className="flex gap-1">
                        {(['dedo1', 'dedo2', 'dedo3', 'dedo4', 'dedo5'] as const).map((dedo, i) => (
                          <label
                            key={`ix-${dedo}`}
                            className="inline-flex items-center gap-0.5 cursor-pointer text-[10px]"
                          >
                            <CheckSimple
                              path={`${baseMuneca}.maniobraClicDedosGatillo.clicExtensionDedos.ix.${dedo}`}
                              checked={
                                munecaMano.maniobraClicDedosGatillo.clicExtensionDedos.ix[dedo]
                              }
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

          {/* Footer legend */}
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase pt-4 border-t border-slate-200">
            <div>Dx. = Derecho | Ix. = Izquierdo</div>
            <div>Fo. JJC-SIG-13-31 Cuestionario anamnesico y evaluación. Rev. 0</div>
          </div>
        </div>
      </section>
    </div>
  );
}
