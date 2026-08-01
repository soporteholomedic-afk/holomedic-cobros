'use client';

import type { GravedadPatologia, SintomatologiaParestesica } from '@/types/evaluacion-osteomuscular';
import { useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { parseOptionalNumber } from '../../helpers/parseOptionalNumber';

const SPX = 'evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano.sintomatologiaParestesica';
const EXAMENES: ReadonlyArray<{ flag: 'ecografia' | 'rx' | 'rmn' | 'emg'; label: string }> = [
  { flag: 'ecografia', label: 'Ecografía' },
  { flag: 'rx', label: 'RX' },
  { flag: 'rmn', label: 'RMN' },
  { flag: 'emg', label: 'EMG' },
];
const GRAVEDADES: ReadonlyArray<GravedadPatologia> = ['LEVE', 'MEDIA', 'GRAVE'];
interface MunecaInstrumentalSeveridadDiagnosticoBlockProps {
  sintomatologiaParestesica: SintomatologiaParestesica;
}
export function MunecaInstrumentalSeveridadDiagnosticoBlock({ sintomatologiaParestesica: s }: MunecaInstrumentalSeveridadDiagnosticoBlockProps) {
  const { setField } = useEvaluacionContext();
  const e = s.examenInstrumental;
  return (
    <div className="space-y-8">
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">Examen Instrumental</div>
        <div className="p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input type="checkbox" className="rounded text-sky-600 w-4 h-4" checked={e.noRealizado} onChange={(ev) => setField(`${SPX}.examenInstrumental.noRealizado`, ev.target.checked)} />
            No Realizado
          </label>
          {EXAMENES.map((ex) => <div key={ex.flag} className="flex items-center gap-2 text-xs"><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="rounded text-sky-600 w-4 h-4" checked={e[ex.flag]} onChange={(ev) => setField(`${SPX}.examenInstrumental.${ex.flag}`, ev.target.checked)} /><span className="font-medium">{ex.label}</span></label><span className="text-slate-400">(año</span><input type="number" min={0} aria-label={`Año ${ex.label}`} value={e[`${ex.flag}Ano`] ?? ''} onChange={(ev) => setField(`${SPX}.examenInstrumental.${ex.flag}Ano`, parseOptionalNumber(ev.target.value))} className="w-16 border-b border-slate-300 bg-transparent text-xs text-center outline-none" /><span className="text-slate-400">)</span></div>)}
        </div>
      </div>
      <div className="bg-sky-600 text-white p-4 rounded-lg flex flex-col justify-between">
        <p className="text-xs font-bold uppercase mb-4 opacity-80">Gravedad Patología de la Mano / Muñeca</p>
        <div className="flex justify-between items-center">
          {GRAVEDADES.map((value) => <label key={value} className="flex flex-col items-center gap-1 cursor-pointer"><input type="radio" name="gravedadManoMuneca" value={value} className="w-4 h-4 text-sky-600" checked={s.gravedadPatologiaManoMuneca === value} onChange={() => setField(`${SPX}.gravedadPatologiaManoMuneca`, value)} /><span className="text-[10px] font-bold text-white">{value}</span></label>)}
        </div>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">Aproximación Diagnóstica de la Evaluación</div>
        <div className="p-4">
          <textarea aria-label="Aproximación Diagnóstica de la Evaluación" value={s.aproximacionDiagnosticaEvaluacion} onChange={(ev) => setField(`${SPX}.aproximacionDiagnosticaEvaluacion`, ev.target.value)} rows={3} className="w-full border border-slate-200 rounded-lg p-3 text-sm outline-none focus:ring-1 focus:ring-sky-500" placeholder="Escriba la aproximación diagnóstica..." />
        </div>
      </div>
    </div>
  );
}
