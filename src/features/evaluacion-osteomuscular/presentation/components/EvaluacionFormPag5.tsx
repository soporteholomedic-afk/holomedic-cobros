'use client';

import { useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { Paginacion } from './Paginacion';

const BASE_MOTILIDAD = 'evaluacionMotilidad';
const BASE_LASEGUE = 'maniobraLasegueRetraccionIsquioCrural';
const BASE_WASSERMAN = 'maniobraWassermanRetraccionIleopsoas';

const MOVIMIENTOS = [
  { key: 'flexion', label: 'Flexión' },
  { key: 'extension', label: 'Extensión' },
  { key: 'inclinacionDx', label: 'Inclinación Dx' },
  { key: 'inclinacionIx', label: 'Inclinación Ix' },
  { key: 'rotacionDx', label: 'Rotación Dx' },
  { key: 'rotacionIx', label: 'Rotación Ix' },
] as const;

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

function ImagePlaceholder({ label }: { label: string }) {
  return (
    <div className="w-full h-24 bg-slate-100 rounded flex items-center justify-center">
      <span className="text-[10px] text-slate-400 italic">[{label}]</span>
    </div>
  );
}

interface MotilidadColumnCardProps {
  title: string;
  ariaLabel: string;
  basePath: string;
}

function MotilidadColumnCard({ title, ariaLabel, basePath }: MotilidadColumnCardProps) {
  return (
    <div role="group" aria-label={ariaLabel} className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">
        {title}
      </div>
      <div className="p-4 space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
          Presencia de dolor al movimiento
        </p>
        {MOVIMIENTOS.map((mov) => (
          <CheckField key={mov.key} label={mov.label} path={`${basePath}.${mov.key}`} />
        ))}
      </div>
    </div>
  );
}

interface RadioOptionProps {
  label: string;
  ariaLabel: string;
  groupName: string;
  checked: boolean;
  onSelect: () => void;
}

function RadioOption({ label, ariaLabel, groupName, checked, onSelect }: RadioOptionProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        name={groupName}
        aria-label={ariaLabel}
        className="w-4 h-4 text-sky-600 focus:ring-sky-500 border-slate-300"
        checked={checked}
        onChange={onSelect}
      />
      <span className="text-xs font-medium text-slate-700">{label}</span>
    </label>
  );
}

export function EvaluacionFormPag5() {
  const { idAtencion, state, setField } = useEvaluacionContext();

  const lasegue = state.maniobraLasegueRetraccionIsquioCrural;
  const wasserman = state.maniobraWassermanRetraccionIleopsoas;

  const selectLasegue = (opcion: 'normal' | 'dx' | 'ix') => {
    setField(`${BASE_LASEGUE}.lasegueSlr.normal`, opcion === 'normal');
    setField(`${BASE_LASEGUE}.lasegueSlr.dx`, opcion === 'dx');
    setField(`${BASE_LASEGUE}.lasegueSlr.ix`, opcion === 'ix');
  };

  const selectWasserman = (opcion: 'dx' | 'ix') => {
    setField(`${BASE_WASSERMAN}.wassermanLasegueInvertido.dx`, opcion === 'dx');
    setField(`${BASE_WASSERMAN}.wassermanLasegueInvertido.ix`, opcion === 'ix');
  };

  return (
    <div className="space-y-6">
      {/* ---- Page Header ---- */}
      <div className="flex justify-between items-end border-b-2 border-sky-600 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">II.- COLUMNA (Cont.)</h1>
          <p className="text-slate-500 text-xs font-medium mt-1 uppercase tracking-wider">
            EVALUACIÓN CLÍNICA OSTEOMUSCULAR — PÁGINA 5
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white px-4 py-2 border border-slate-200 rounded-lg">
          <span className="text-xs font-bold text-sky-600 uppercase">Expediente No.</span>
          <span className="text-lg font-semibold text-slate-700">{state.idAtencion}</span>
        </div>
      </div>

      {/* ===================== SECCIÓN C: EVALUACIÓN DE LA MOTILIDAD ===================== */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-sky-600">C) EVALUACIÓN DE LA MOTILIDAD</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Presencia de dolor al movimiento — marcar el casillero según corresponda
          </p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <MotilidadColumnCard
              title="Columna Cervical"
              ariaLabel="Motilidad Columna Cervical"
              basePath={`${BASE_MOTILIDAD}.columnaCervical.presenciaDolorMovimiento`}
            />
            <MotilidadColumnCard
              title="Columna Dorso Lumbar"
              ariaLabel="Motilidad Columna Dorso Lumbar"
              basePath={`${BASE_MOTILIDAD}.columnaDorsoLumbar.presenciaDolorMovimiento`}
            />
          </div>
        </div>
      </section>

      {/* ===================== SECCIÓN D: MANIOBRA DE LASEGUE ===================== */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-sky-600">
            D) MANIOBRA DE LASEGUE / RETRACCIÓN ISQUIO CRURAL
          </h3>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            <div className="flex flex-col justify-center gap-2">
              <ImagePlaceholder label="Gráfico Lasègue / SLR" />
              <p className="text-[10px] text-slate-500 text-center italic">
                Lasègue / SLR (elevación de la pierna recta)
              </p>
            </div>

            <div role="group" aria-label="Maniobra de Lasègue" className="space-y-4">
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Lasègue / SLR
                </p>
                <div className="flex gap-6">
                  <RadioOption
                    label="Normal"
                    ariaLabel="Lasègue Normal"
                    groupName="lasegueSlr"
                    checked={lasegue.lasegueSlr.normal}
                    onSelect={() => selectLasegue('normal')}
                  />
                  <RadioOption
                    label="Derecho (Dx)"
                    ariaLabel="Lasègue Derecho Dx"
                    groupName="lasegueSlr"
                    checked={lasegue.lasegueSlr.dx}
                    onSelect={() => selectLasegue('dx')}
                  />
                  <RadioOption
                    label="Izquierdo (Ix)"
                    ariaLabel="Lasègue Izquierdo Ix"
                    groupName="lasegueSlr"
                    checked={lasegue.lasegueSlr.ix}
                    onSelect={() => selectLasegue('ix')}
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <CheckField
                  label="Presencia de retracción isquio crural"
                  path={`${BASE_LASEGUE}.presenciaRetraccionIsquioCrural`}
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Observación:
                </span>
                <input
                  type="text"
                  aria-label="Observación Lasègue"
                  value={lasegue.lasegueSlr.observacion}
                  onChange={(e) => setField(`${BASE_LASEGUE}.lasegueSlr.observacion`, e.target.value)}
                  className="flex-1 border-b border-slate-300 text-xs outline-none focus:border-sky-500 bg-transparent py-0.5"
                  placeholder="Detalle de la maniobra..."
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== SECCIÓN E: MANIOBRA DE WASSERMAN ===================== */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-sky-600">
            E) MANIOBRA DE WASSERMAN / RETRACCIÓN ILEOPSOAS
          </h3>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            <div className="flex flex-col justify-center">
              <ImagePlaceholder label="Gráfico Wasserman" />
            </div>

            <div role="group" aria-label="Maniobra de Wasserman" className="space-y-4">
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Wasserman (Lasègue invertido)
                </p>
                <div className="flex gap-6">
                  <RadioOption
                    label="Derecho (Dx)"
                    ariaLabel="Wasserman Derecho Dx"
                    groupName="wassermanLasegueInvertido"
                    checked={wasserman.wassermanLasegueInvertido.dx}
                    onSelect={() => selectWasserman('dx')}
                  />
                  <RadioOption
                    label="Izquierdo (Ix)"
                    ariaLabel="Wasserman Izquierdo Ix"
                    groupName="wassermanLasegueInvertido"
                    checked={wasserman.wassermanLasegueInvertido.ix}
                    onSelect={() => selectWasserman('ix')}
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <CheckField
                  label="Presencia de retracción ileopsoas"
                  path={`${BASE_WASSERMAN}.presenciaRetraccionIleopsoas`}
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Observación:
                </span>
                <input
                  type="text"
                  aria-label="Observación Wasserman"
                  value={wasserman.wassermanLasegueInvertido.observacion}
                  onChange={(e) =>
                    setField(`${BASE_WASSERMAN}.wassermanLasegueInvertido.observacion`, e.target.value)
                  }
                  className="flex-1 border-b border-slate-300 text-xs outline-none focus:border-sky-500 bg-transparent py-0.5"
                  placeholder="Detalle de la maniobra..."
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== SECCIÓN F: APROXIMACIÓN DIAGNÓSTICA ===================== */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-sky-600">
            F) APROXIMACIÓN DIAGNÓSTICA DE LA EVALUACIÓN
          </h3>
        </div>

        <div className="p-6 space-y-4">
          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">
              Conclusiones clínicas y observaciones
            </span>
            <textarea
              aria-label="Aproximación diagnóstica de la evaluación"
              rows={5}
              value={state.aproximacionDiagnosticaEvaluacion}
              onChange={(e) => setField('aproximacionDiagnosticaEvaluacion', e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-4 text-sm focus:ring-1 focus:ring-sky-500 outline-none"
              placeholder="Ingrese el resumen del hallazgo clínico, limitaciones observadas y recomendaciones..."
            />
          </label>
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase pt-2 border-t border-slate-200">
            <div>Dx. = Derecho(a) | Ix. = Izquierdo(a)</div>
          </div>
        </div>
      </section>

      <Paginacion
        paginaActual={5}
        baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/evaluacion`}
      />
    </div>
  );
}
