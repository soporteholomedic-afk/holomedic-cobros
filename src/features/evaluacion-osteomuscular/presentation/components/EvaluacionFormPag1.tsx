'use client';

import { useMemo } from 'react';
import { Bone, Activity } from 'lucide-react';
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
  return (
    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
      <input
        type="checkbox"
        className="rounded text-sky-600"
        checked={checked[lado]}
        onChange={(e) => setDxIx(basePath, lado, e.target.checked)}
      />
      {lado === 'dx' ? 'Dx' : 'Ix'}
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
      className="rounded text-sky-600"
      checked={checked}
      onChange={(e) => setField(path, e.target.checked)}
    />
  );
}

interface RadioGravedadProps {
  value: GravedadPatologia;
  current: GravedadPatologia | null;
  path: string;
}

function RadioGravedad({ value, current, path }: RadioGravedadProps) {
  const { setField } = useEvaluacionContext();
  return (
    <label className="flex flex-col items-center gap-1 cursor-pointer">
      <input
        type="radio"
        name="gravedadHombro"
        value={value}
        className="w-4 h-4 text-sky-600"
        checked={current === value}
        onChange={() => setField(path, value)}
      />
      <span className="text-[10px] font-bold text-white">{value}</span>
    </label>
  );
}

interface ImagePlaceholderProps {
  label: string;
}

function ImagePlaceholder({ label }: ImagePlaceholderProps) {
  return (
    <div className="w-full h-32 mb-3 bg-slate-100 rounded flex items-center justify-center">
      <span className="text-xs text-slate-400 italic">[Imagen {label}]</span>
    </div>
  );
}

const BASE = 'evaluacionClinicaOsteomuscular.miembrosSuperiores';

export function EvaluacionFormPag1() {
  const { state, setField } = useEvaluacionContext();

  const esc = useMemo(
    () => state.evaluacionClinicaOsteomuscular.miembrosSuperiores.escapuloHumeral,
    [state],
  );
  const codo = useMemo(
    () => state.evaluacionClinicaOsteomuscular.miembrosSuperiores.codo,
    [state],
  );

  const baseEsc = `${BASE}.escapuloHumeral`;
  const baseCodo = `${BASE}.codo`;

  return (
    <div className="space-y-6">
      {/* ---- Page Header ---- */}
      <div className="flex justify-between items-end border-b-2 border-sky-600 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">I.- MIEMBROS SUPERIORES</h1>
          <p className="text-slate-500 text-xs font-medium mt-1 uppercase tracking-wider">
            EVALUACIÓN CLÍNICA OSTEMUSCULAR
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white px-4 py-2 border border-slate-200 rounded-lg">
          <span className="text-xs font-bold text-sky-600 uppercase">Expediente No.</span>
          <span className="text-lg font-semibold text-slate-700">
            {state.idAtencion}
          </span>
        </div>
      </div>

      {/* ===================== SECCIÓN A: ESCAPULO HUMERAL ===================== */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-sky-600">
            a) ESCAPULO HUMERAL
          </h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              REALIZA MANIOBRAS
            </span>
            <input
              type="checkbox"
              className="w-5 h-5 rounded text-sky-600 focus:ring-sky-500"
              checked={esc.realizaManiobras}
              onChange={(e) => setField(`${baseEsc}.realizaManiobras`, e.target.checked)}
            />
          </label>
        </div>

        <div className="p-6 space-y-8">
          {/* Molestia meses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Molestia de Hombro Dx Desde (meses)
              </label>
              <input
                type="number"
                min={0}
                value={esc.molestiaHombroDxDesdeMeses ?? ''}
                onChange={(e) =>
                  setField(`${baseEsc}.molestiaHombroDxDesdeMeses`, e.target.value === '' ? null : Number(e.target.value))
                }
                className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-1 focus:ring-sky-500 outline-none"
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Molestia de Hombro Ix Desde (meses)
              </label>
              <input
                type="number"
                min={0}
                value={esc.molestiaHombroIxDesdeMeses ?? ''}
                onChange={(e) =>
                  setField(`${baseEsc}.molestiaHombroIxDesdeMeses`, e.target.value === '' ? null : Number(e.target.value))
                }
                className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-1 focus:ring-sky-500 outline-none"
                placeholder="0"
              />
            </div>
          </div>

          {/* Palpación Hombro */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 text-center font-bold text-xs py-2 border-b border-slate-200 uppercase tracking-widest text-slate-500">
              Palpación Hombro (Dolor)
            </div>
            <div className="grid grid-cols-3 divide-x divide-slate-200">
              <div className="p-4 space-y-3">
                <p className="text-xs font-bold text-center border-b border-slate-200 pb-2">
                  DOLOR ANTERIOR
                </p>
                <div className="flex justify-around">
                  <CheckDxIx
                    basePath={`${baseEsc}.palpacionHombro.dolorAnterior`}
                    checked={esc.palpacionHombro.dolorAnterior}
                    lado="dx"
                  />
                  <CheckDxIx
                    basePath={`${baseEsc}.palpacionHombro.dolorAnterior`}
                    checked={esc.palpacionHombro.dolorAnterior}
                    lado="ix"
                  />
                </div>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-xs font-bold text-center border-b border-slate-200 pb-2">
                  DOLOR LATERAL
                </p>
                <div className="flex justify-around">
                  <CheckDxIx
                    basePath={`${baseEsc}.palpacionHombro.dolorLateral`}
                    checked={esc.palpacionHombro.dolorLateral}
                    lado="dx"
                  />
                  <CheckDxIx
                    basePath={`${baseEsc}.palpacionHombro.dolorLateral`}
                    checked={esc.palpacionHombro.dolorLateral}
                    lado="ix"
                  />
                </div>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-xs font-bold text-center border-b border-slate-200 pb-2">
                  DOLOR POSTERIOR
                </p>
                <div className="flex justify-around">
                  <CheckDxIx
                    basePath={`${baseEsc}.palpacionHombro.dolorPosterior`}
                    checked={esc.palpacionHombro.dolorPosterior}
                    lado="dx"
                  />
                  <CheckDxIx
                    basePath={`${baseEsc}.palpacionHombro.dolorPosterior`}
                    checked={esc.palpacionHombro.dolorPosterior}
                    lado="ix"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Evaluación de Movilidad */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold uppercase text-sky-600 border-l-4 border-sky-600 pl-3">
              Evaluación de Movilidad de la Cintura Escapulohumeral
            </h4>
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
              Presencia de dolor al movimiento
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Flexión */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col items-center">
                <ImagePlaceholder label="Flexión" />
                <p className="text-[10px] font-bold text-slate-600 text-center uppercase mb-3">
                  Flexión / Elevación Anterior
                </p>
                <div className="flex gap-4">
                  <CheckDxIx
                    basePath={`${baseEsc}.movilidadPresenciaDolor.flexionElevacionAnterior`}
                    checked={esc.movilidadPresenciaDolor.flexionElevacionAnterior}
                    lado="dx"
                  />
                  <CheckDxIx
                    basePath={`${baseEsc}.movilidadPresenciaDolor.flexionElevacionAnterior`}
                    checked={esc.movilidadPresenciaDolor.flexionElevacionAnterior}
                    lado="ix"
                  />
                </div>
              </div>

              {/* Abducción */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col items-center">
                <ImagePlaceholder label="Abducción" />
                <p className="text-[10px] font-bold text-slate-600 text-center uppercase mb-3">
                  Abducción / Elevación Lateral
                </p>
                <div className="flex gap-4">
                  <CheckDxIx
                    basePath={`${baseEsc}.movilidadPresenciaDolor.abduccionElevacionLateral`}
                    checked={esc.movilidadPresenciaDolor.abduccionElevacionLateral}
                    lado="dx"
                  />
                  <CheckDxIx
                    basePath={`${baseEsc}.movilidadPresenciaDolor.abduccionElevacionLateral`}
                    checked={esc.movilidadPresenciaDolor.abduccionElevacionLateral}
                    lado="ix"
                  />
                </div>
              </div>

              {/* Rotación Interna */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col items-center">
                <ImagePlaceholder label="Rotación Interna" />
                <p className="text-[10px] font-bold text-slate-600 text-center uppercase mb-3">
                  Rotación Interna
                </p>
                <div className="flex gap-4">
                  <CheckDxIx
                    basePath={`${baseEsc}.movilidadPresenciaDolor.rotacionInterna`}
                    checked={esc.movilidadPresenciaDolor.rotacionInterna}
                    lado="dx"
                  />
                  <CheckDxIx
                    basePath={`${baseEsc}.movilidadPresenciaDolor.rotacionInterna`}
                    checked={esc.movilidadPresenciaDolor.rotacionInterna}
                    lado="ix"
                  />
                </div>
              </div>

              {/* Rotación Externa */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col items-center">
                <ImagePlaceholder label="Rotación Externa" />
                <p className="text-[10px] font-bold text-slate-600 text-center uppercase mb-3">
                  Rotación Externa
                </p>
                <div className="flex gap-4">
                  <CheckDxIx
                    basePath={`${baseEsc}.movilidadPresenciaDolor.rotacionExterna`}
                    checked={esc.movilidadPresenciaDolor.rotacionExterna}
                    lado="dx"
                  />
                  <CheckDxIx
                    basePath={`${baseEsc}.movilidadPresenciaDolor.rotacionExterna`}
                    checked={esc.movilidadPresenciaDolor.rotacionExterna}
                    lado="ix"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Specialized Tests */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Arco Doloroso */}
            <div className="border border-slate-200 rounded-lg p-4">
              <h4 className="text-xs font-bold uppercase text-slate-600 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-500" />
                Arco Doloroso (70° y 120°)
              </h4>
              <div className="flex gap-6 items-start">
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <CheckSimple
                      path={`${baseEsc}.arcoDoloroso.presenteDx`}
                      checked={esc.arcoDoloroso.presenteDx}
                    />
                    Presente Dx
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <CheckSimple
                      path={`${baseEsc}.arcoDoloroso.presenteIx`}
                      checked={esc.arcoDoloroso.presenteIx}
                    />
                    Presente Ix
                  </label>
                  <label className="flex items-center gap-2 text-sm mt-2 font-bold text-sky-600 cursor-pointer">
                    <CheckSimple
                      path={`${baseEsc}.arcoDoloroso.ausente`}
                      checked={esc.arcoDoloroso.ausente}
                    />
                    Ausente
                  </label>
                </div>
                <div className="flex-1 bg-slate-50 rounded-lg p-2 flex items-center justify-center">
                  <span className="text-xs text-slate-400 italic">[Diagrama Arco Doloroso]</span>
                </div>
              </div>
            </div>

            {/* Test Bíceps */}
            <div className="border border-slate-200 rounded-lg p-4">
              <h4 className="text-xs font-bold uppercase text-slate-600 mb-4 flex items-center gap-2">
                <Bone className="w-4 h-4 text-sky-500" />
                Test Tendinitis Bíceps
              </h4>
              <div className="flex gap-6 items-start">
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <CheckSimple
                      path={`${baseEsc}.testTendinitisTendonLargoBiceps.dolorAusente`}
                      checked={esc.testTendinitisTendonLargoBiceps.dolorAusente}
                    />
                    Dolor Ausente
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <CheckSimple
                      path={`${baseEsc}.testTendinitisTendonLargoBiceps.presenciaDolorAnteriorHombroDx`}
                      checked={esc.testTendinitisTendonLargoBiceps.presenciaDolorAnteriorHombroDx}
                    />
                    Presencia Dolor Anterior Hombro Dx
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <CheckSimple
                      path={`${baseEsc}.testTendinitisTendonLargoBiceps.presenciaDolorAnteriorHombroIx`}
                      checked={esc.testTendinitisTendonLargoBiceps.presenciaDolorAnteriorHombroIx}
                    />
                    Presencia Dolor Anterior Hombro Ix
                  </label>
                </div>
                <div className="flex-1 bg-slate-50 rounded-lg p-2 flex items-center justify-center">
                  <span className="text-xs text-slate-400 italic">[Diagrama Test Bíceps]</span>
                </div>
              </div>
            </div>
          </div>

          {/* Examen Instrumental + Gravedad */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-50 p-4 rounded-lg">
              <p className="text-xs font-bold uppercase text-slate-600 mb-4">
                Examen Instrumental
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <CheckSimple
                    path={`${baseEsc}.examenInstrumental.noRealizo`}
                    checked={esc.examenInstrumental.noRealizo}
                  />
                  No Realizó
                </label>
                <div className="flex items-center gap-2">
                  <CheckSimple
                    path={`${baseEsc}.examenInstrumental.ecografia.realiza`}
                    checked={esc.examenInstrumental.ecografia.realiza}
                  />
                  <span className="text-xs font-medium">ECO (año)</span>
                  <input
                    type="text"
                    value={esc.examenInstrumental.ecografia.ano}
                    onChange={(e) => setField(`${baseEsc}.examenInstrumental.ecografia.ano`, e.target.value)}
                    className="w-12 border-b border-slate-300 bg-transparent text-xs focus:ring-0 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <CheckSimple
                    path={`${baseEsc}.examenInstrumental.rx.realiza`}
                    checked={esc.examenInstrumental.rx.realiza}
                  />
                  <span className="text-xs font-medium">RX (año)</span>
                  <input
                    type="text"
                    value={esc.examenInstrumental.rx.ano}
                    onChange={(e) => setField(`${baseEsc}.examenInstrumental.rx.ano`, e.target.value)}
                    className="w-12 border-b border-slate-300 bg-transparent text-xs focus:ring-0 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <CheckSimple
                    path={`${baseEsc}.examenInstrumental.rmn.realiza`}
                    checked={esc.examenInstrumental.rmn.realiza}
                  />
                  <span className="text-xs font-medium">RMN (año)</span>
                  <input
                    type="text"
                    value={esc.examenInstrumental.rmn.ano}
                    onChange={(e) => setField(`${baseEsc}.examenInstrumental.rmn.ano`, e.target.value)}
                    className="w-12 border-b border-slate-300 bg-transparent text-xs focus:ring-0 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="bg-sky-600 text-white p-4 rounded-lg flex flex-col justify-between">
              <p className="text-xs font-bold uppercase mb-4 opacity-80">
                Gravedad Patología de Hombro
              </p>
              <div className="flex justify-between items-center">
                <RadioGravedad
                  value="LEVE"
                  current={esc.gravedadPatologiaHombro}
                  path={`${baseEsc}.gravedadPatologiaHombro`}
                />
                <RadioGravedad
                  value="MEDIA"
                  current={esc.gravedadPatologiaHombro}
                  path={`${baseEsc}.gravedadPatologiaHombro`}
                />
                <RadioGravedad
                  value="GRAVE"
                  current={esc.gravedadPatologiaHombro}
                  path={`${baseEsc}.gravedadPatologiaHombro`}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== SECCIÓN B: CODO ===================== */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-sky-600">
            b) CODO
          </h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              REALIZA MANIOBRAS
            </span>
            <input
              type="checkbox"
              className="w-5 h-5 rounded text-sky-600 focus:ring-sky-500"
              checked={codo.realizaManiobras}
              onChange={(e) => setField(`${baseCodo}.realizaManiobras`, e.target.checked)}
            />
          </label>
        </div>

        <div className="p-6 space-y-8">
          {/* Molestia meses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Molestia Codo Dx Desde (meses)
              </label>
              <input
                type="number"
                min={0}
                value={codo.molestiaCodoDxDesdeMeses ?? ''}
                onChange={(e) =>
                  setField(`${baseCodo}.molestiaCodoDxDesdeMeses`, e.target.value === '' ? null : Number(e.target.value))
                }
                className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-1 focus:ring-sky-500 outline-none"
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Molestia Codo Ix Desde (meses)
              </label>
              <input
                type="number"
                min={0}
                value={codo.molestiaCodoIxDesdeMeses ?? ''}
                onChange={(e) =>
                  setField(`${baseCodo}.molestiaCodoIxDesdeMeses`, e.target.value === '' ? null : Number(e.target.value))
                }
                className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-1 focus:ring-sky-500 outline-none"
                placeholder="0"
              />
            </div>
          </div>

          {/* Observación e Inspección */}
          <div className="bg-slate-50 p-4 rounded-lg">
            <p className="text-xs font-bold uppercase text-slate-600 mb-4">
              Observación e Inspección
            </p>
            <div className="flex flex-wrap items-center gap-8">
              <div className="flex items-center gap-4">
                <span className="text-xs font-semibold text-slate-700">Edema Localizado:</span>
                <CheckDxIx
                  basePath={`${baseCodo}.observacionInspeccion.edemaLocalizado`}
                  checked={codo.observacionInspeccion.edemaLocalizado}
                  lado="dx"
                />
                <CheckDxIx
                  basePath={`${baseCodo}.observacionInspeccion.edemaLocalizado`}
                  checked={codo.observacionInspeccion.edemaLocalizado}
                  lado="ix"
                />
              </div>
              <div className="flex-1 flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-700">Sitio:</span>
                <input
                  type="text"
                  value={codo.observacionInspeccion.sitio}
                  onChange={(e) => setField(`${baseCodo}.observacionInspeccion.sitio`, e.target.value)}
                  className="flex-1 bg-transparent border-b border-slate-300 text-xs focus:ring-0 outline-none py-1"
                  placeholder="Indicar localización específica..."
                />
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs font-semibold text-slate-700">Edema No Localizado:</span>
                <CheckDxIx
                  basePath={`${baseCodo}.observacionInspeccion.edemaNoLocalizado`}
                  checked={codo.observacionInspeccion.edemaNoLocalizado}
                  lado="dx"
                />
                <CheckDxIx
                  basePath={`${baseCodo}.observacionInspeccion.edemaNoLocalizado`}
                  checked={codo.observacionInspeccion.edemaNoLocalizado}
                  lado="ix"
                />
              </div>
            </div>
          </div>

          {/* Palpación Codo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 flex justify-center">
              <div className="w-full h-48 flex items-center justify-center">
                <span className="text-xs text-slate-400 italic">
                  [Imagen Palpación Codo: Epicóndilo, Epitróclea, Olécranon]
                </span>
              </div>
            </div>
            <table className="w-full border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 p-3 text-left text-[10px] font-bold uppercase text-slate-500">
                    Zona de Palpación
                  </th>
                  <th className="border border-slate-200 p-3 text-center text-[10px] font-bold uppercase text-slate-500">
                    Dx
                  </th>
                  <th className="border border-slate-200 p-3 text-center text-[10px] font-bold uppercase text-slate-500">
                    Ix
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr>
                  <td className="border border-slate-200 p-3 text-slate-700 font-medium">
                    Dolor Epicóndilo (Lateral)
                  </td>
                  <td className="border border-slate-200 p-3 text-center">
                    <CheckSimple
                      path={`${baseCodo}.palpacion.dolorEpicondilo.dx`}
                      checked={codo.palpacion.dolorEpicondilo.dx}
                    />
                  </td>
                  <td className="border border-slate-200 p-3 text-center">
                    <CheckSimple
                      path={`${baseCodo}.palpacion.dolorEpicondilo.ix`}
                      checked={codo.palpacion.dolorEpicondilo.ix}
                    />
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-200 p-3 text-slate-700 font-medium">
                    Dolor Epitróclea (Medial)
                  </td>
                  <td className="border border-slate-200 p-3 text-center">
                    <CheckSimple
                      path={`${baseCodo}.palpacion.dolorEpitroclea.dx`}
                      checked={codo.palpacion.dolorEpitroclea.dx}
                    />
                  </td>
                  <td className="border border-slate-200 p-3 text-center">
                    <CheckSimple
                      path={`${baseCodo}.palpacion.dolorEpitroclea.ix`}
                      checked={codo.palpacion.dolorEpitroclea.ix}
                    />
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-200 p-3 text-slate-700 font-medium">
                    Dolor Olécranon
                  </td>
                  <td className="border border-slate-200 p-3 text-center">
                    <CheckSimple
                      path={`${baseCodo}.palpacion.dolorOlecranon.dx`}
                      checked={codo.palpacion.dolorOlecranon.dx}
                    />
                  </td>
                  <td className="border border-slate-200 p-3 text-center">
                    <CheckSimple
                      path={`${baseCodo}.palpacion.dolorOlecranon.ix`}
                      checked={codo.palpacion.dolorOlecranon.ix}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
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
