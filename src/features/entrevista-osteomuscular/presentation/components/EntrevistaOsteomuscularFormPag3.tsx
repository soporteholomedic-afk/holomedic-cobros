'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { useEntrevistaContext } from '@/features/entrevista-osteomuscular/presentation/context/EntrevistaOsteomuscularContext';
import { Paginacion } from './Paginacion';
import type {
  SeccionCervical,
  SeccionDorsal,
  SeccionLumboSacra,
} from '@/types/entrevista-osteomuscular';

// ---- Constantes ----

const FRECUENCIA_COLUMNAS = [
  { key: 'raramente', label: 'RARAMENTE' },
  { key: 'episodios2a3Dias', label: 'AL MENOS 3-4 EPISODIOS\nDE 2-3 DÍAS C/U' },
  { key: 'episodiosConMedicamentos', label: 'AL MENOS 3-4 EPISODIOS CON\nUSO DE MEDICAMENTOS O\nTRATAMIENTO MD' },
  { key: 'presenteTodoElDia', label: 'PRESENTE\nTODO EL DÍA' },
] as const;

// ---- Subcomponente: Sección de Columna ----

interface ColumnaSectionProps {
  titulo: string;
  subtitulo: string;
  region: 'cervical' | 'dorsal' | 'lumboSacra';
  seccion: SeccionCervical | SeccionDorsal | SeccionLumboSacra;
  basePath: string;
}

function ColumnaSection({ titulo, subtitulo, region, seccion, basePath }: ColumnaSectionProps) {
  const { setField } = useEntrevistaContext();

  const handleCheck = (path: string, value: boolean) => setField(path, value);

  const handleRadio = (path: string, value: boolean) => setField(path, value);

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Encabezado */}
      <div className="px-6 py-4 flex justify-between items-center border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-sky-700 uppercase">
            {titulo}
          </h3>
          <span className="text-sm italic text-slate-500">
            {subtitulo}
          </span>
        </div>
        <div className="flex gap-6 items-center">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`${region}-presenta`}
              className="w-4 h-4 text-sky-600"
              checked={seccion.presentaDisturbio === true}
              onChange={() => setField(`${basePath}.presentaDisturbio`, true)}
            />
            <span className="font-bold text-sm text-slate-700">SI</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`${region}-presenta`}
              className="w-4 h-4 text-sky-600"
              checked={seccion.presentaDisturbio === false}
              onChange={() => setField(`${basePath}.presentaDisturbio`, false)}
            />
            <span className="font-bold text-sm text-slate-700">NO</span>
          </label>
        </div>
      </div>

      <div className="p-6">
        {/* Tabla de frecuencias */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="p-3 text-left border border-slate-200 w-[18%]"></th>
                {FRECUENCIA_COLUMNAS.map((col) => (
                  <th
                    key={col.key}
                    className="p-3 text-center border border-slate-200 font-bold text-[10px] uppercase text-slate-500 leading-tight whitespace-pre-line"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border border-slate-200 font-bold text-sm bg-slate-50">
                  MOLESTIA
                </td>
                {FRECUENCIA_COLUMNAS.map((col) => (
                  <td key={col.key} className="p-3 border border-slate-200 text-center">
                    <input
                      type="checkbox"
                      className="rounded text-sky-600"
                      checked={seccion.frecuenciaMolestia[col.key]}
                      onChange={(e) =>
                        handleCheck(`${basePath}.frecuenciaMolestia.${col.key}`, e.target.checked)
                      }
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-3 border border-slate-200 font-bold text-sm bg-slate-50">
                  DOLOR
                </td>
                {FRECUENCIA_COLUMNAS.map((col) => (
                  <td key={col.key} className="p-3 border border-slate-200 text-center">
                    <input
                      type="checkbox"
                      className="rounded text-sky-600"
                      checked={seccion.frecuenciaDolor[col.key]}
                      onChange={(e) =>
                        handleCheck(`${basePath}.frecuenciaDolor.${col.key}`, e.target.checked)
                      }
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Irradiación */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="bg-slate-50/50 p-4 rounded-lg border border-slate-200">
            <div className="flex items-center gap-4 mb-3">
              <span className="font-bold text-sm text-sky-700 uppercase">IRRADIACIÓN:</span>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name={`${region}-irradiacion`}
                    className="text-sky-600"
                    checked={seccion.irradiacion.tieneIrradiacion === false}
                    onChange={() =>
                      handleRadio(`${basePath}.irradiacion.tieneIrradiacion`, false)
                    }
                  />
                  <span className="text-sm text-slate-700">NO</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name={`${region}-irradiacion`}
                    className="text-sky-600"
                    checked={seccion.irradiacion.tieneIrradiacion === true}
                    onChange={() =>
                      handleRadio(`${basePath}.irradiacion.tieneIrradiacion`, true)
                    }
                  />
                  <span className="text-sm text-slate-700">SI</span>
                </label>
              </div>
            </div>
            {IrradiacionCheckboxes(region, basePath)}
          </div>

          {/* Ausencia laboral */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              AUSENCIA AL TRABAJO POR DISTURBIO {region === 'lumboSacra' ? 'LUMBAR' : region.toUpperCase()}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                value={seccion.diasAusenciaTrabajo ?? ''}
                onChange={(e) =>
                  setField(
                    `${basePath}.diasAusenciaTrabajo`,
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                className="w-24 h-10 border border-slate-200 rounded-lg px-3 text-sm text-center font-bold text-sky-700 transition-all focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="0"
              />
              <span className="font-bold text-slate-500 text-sm">días</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function IrradiacionCheckboxes(region: 'cervical' | 'dorsal' | 'lumboSacra', basePath: string) {
  const { setField, state } = useEntrevistaContext();
  const p = `${basePath}.irradiacion`;

  const cerv = state.columna.cervical.irradiacion;
  const dors = state.columna.dorsal.irradiacion;
  const lumb = state.columna.lumboSacra.irradiacion;

  switch (region) {
    case 'cervical':
      return (
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">LOCALIZACIÓN:</span>
            <span className="px-3 py-1.5 border border-slate-200 bg-white text-sm rounded">
              Miembro Superior
            </span>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="rounded text-sky-600"
              checked={cerv.miembroSuperior.dx}
              onChange={(e) => setField(`${p}.miembroSuperior.dx`, e.target.checked)}
            />
            <span className="text-xs font-bold text-slate-700">DX</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="rounded text-sky-600"
              checked={cerv.miembroSuperior.ix}
              onChange={(e) => setField(`${p}.miembroSuperior.ix`, e.target.checked)}
            />
            <span className="text-xs font-bold text-slate-700">IX</span>
          </label>
        </div>
      );
    case 'dorsal':
      return (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">LOCALIZACIÓN:</span>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="rounded text-sky-600"
              checked={dors.emitorax}
              onChange={(e) => setField(`${p}.emitorax`, e.target.checked)}
            />
            <span className="text-xs font-bold text-slate-700">EMITORAX</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="rounded text-sky-600"
              checked={dors.dx}
              onChange={(e) => setField(`${p}.dx`, e.target.checked)}
            />
            <span className="text-xs font-bold text-slate-700">DX</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="rounded text-sky-600"
              checked={dors.ix}
              onChange={(e) => setField(`${p}.ix`, e.target.checked)}
            />
            <span className="text-xs font-bold text-slate-700">IX</span>
          </label>
        </div>
      );
    case 'lumboSacra':
      return (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">LOCALIZACIÓN:</span>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="rounded text-sky-600"
              checked={lumb.miembrosInferiores}
              onChange={(e) => setField(`${p}.miembrosInferiores`, e.target.checked)}
            />
            <span className="text-xs font-bold text-slate-700">MIEMBROS INFERIORES</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="rounded text-sky-600"
              checked={lumb.dx}
              onChange={(e) => setField(`${p}.dx`, e.target.checked)}
            />
            <span className="text-xs font-bold text-slate-700">DX</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="rounded text-sky-600"
              checked={lumb.ix}
              onChange={(e) => setField(`${p}.ix`, e.target.checked)}
            />
            <span className="text-xs font-bold text-slate-700">IX</span>
          </label>
        </div>
      );
  }
}

// ---- Componente principal ----

export function EntrevistaOsteomuscularFormPag3() {
  const { idAtencion, atencion, state } = useEntrevistaContext();

  const cervical = useMemo(() => state.columna.cervical, [state.columna.cervical]);
  const dorsal = useMemo(() => state.columna.dorsal, [state.columna.dorsal]);
  const lumboSacra = useMemo(() => state.columna.lumboSacra, [state.columna.lumboSacra]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center space-x-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 text-sky-600">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900">
              Entrevista de Cuestionario Anamnésico Osteomuscular
            </h1>
            <p className="text-sm text-slate-500">
              Atención #{idAtencion} — {atencion.paciente}
            </p>
          </div>
          <Link
            href={`/areas/musculoesqueletica/jjc/${idAtencion}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
        </div>
      </div>

      {/* Formulario */}
      <form
        onSubmit={(e) => e.preventDefault()}
        className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8"
      >
        {/* Título sección II */}
        <div>
          <h2 className="text-base font-bold text-slate-800">
            II.- COLUMNA{' '}
            <span className="font-normal text-sm text-slate-500">
              (DISTURBIOS EN LA COLUMNA ÚLTIMOS 12 MESES)
            </span>
          </h2>
        </div>

        {/* CERVICAL */}
        <ColumnaSection
          titulo="CERVICAL"
          subtitulo="(molestia, sensación de peso, dolor)"
          region="cervical"
          seccion={cervical}
          basePath="columna.cervical"
        />

        {/* DORSAL */}
        <ColumnaSection
          titulo="DORSAL"
          subtitulo="(molestia, sensación de peso, dolor)"
          region="dorsal"
          seccion={dorsal}
          basePath="columna.dorsal"
        />

        {/* LUMBO SACRA */}
        <ColumnaSection
          titulo="LUMBO SACRA"
          subtitulo="(molestia, sensación de peso, dolor)"
          region="lumboSacra"
          seccion={lumboSacra}
          basePath="columna.lumboSacra"
        />

        {/* Notas clínicas */}
        <footer className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-sky-600 font-bold text-lg">i</span>
            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                <span className="font-bold text-slate-800">NB*:</span> umbral anamnésico positivo para la{' '}
                <span className="font-bold text-slate-800">COLUMNA</span> (identificado por cuadros grises) es la
                presencia de: dolor / malestar casi todos los días en los últimos 12 meses o episodios de dolor
                (3-4 episodios de 2-3 días, 10 episodios de 1 día, 8 episodios de hace 2 días, 2 episodios de 30
                días, un episodio de 90 días).
              </p>
              <p className="italic">
                Dolor agudo de espalda baja significa: episodio de dolor intenso en la espalda baja que no
                permite la flexión, inclinación y rotación (&ldquo;lumbago&rdquo;), cuyo comienzo puede ser
                agudo o insidioso y se prolongó durante al menos 2 días (o uno con tratamiento farmacológico).
              </p>
            </div>
          </div>
        </footer>

        {/* Pie de página */}
        <div className="flex justify-between items-center text-[10px] text-slate-400 border-t border-slate-200 pt-4">
          <div>
            Fo. JJC-SIG-13-31 Cuestionario anamnésico y evaluación de extremidad superior y espalda. Rev. 0
          </div>
          <div className="flex items-center gap-4">
            <span>HOLOMEDIC SYSTEM v2.4</span>
            <span className="font-bold text-slate-600">Página 3</span>
          </div>
        </div>

        <Paginacion totalPaginas={3} paginaActual={3} baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/entrevista`} />
      </form>
    </div>
  );
}
