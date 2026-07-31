'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { useEntrevistaContext } from '@/features/entrevista-osteomuscular/presentation/context/EntrevistaOsteomuscularContext';
import { Paginacion } from './Paginacion';

export function EntrevistaOsteomuscularFormPag4() {
  const { idAtencion, atencion, state, setField } = useEntrevistaContext();

  const lumbalgia = useMemo(() => state.lumbalgiaAguda, [state.lumbalgiaAguda]);
  const diagnostico = useMemo(
    () => state.diagnosticoPatologiaColumna,
    [state.diagnosticoPatologiaColumna],
  );

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
        {/* Título sección */}
        <div>
          <h2 className="text-base font-bold text-slate-800">
            III.- LUMBALGIA AGUDA Y DIAGNÓSTICO{' '}
            <span className="font-normal text-sm text-slate-500">
              (PATOLOGÍA DE LA COLUMNA)
            </span>
          </h2>
        </div>

        {/* ======== SECCIÓN 1: LUMBALGIA AGUDA ======== */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 flex justify-between items-center border-b border-slate-200 bg-slate-50">
            <h3 className="text-lg font-semibold text-sky-700 uppercase tracking-tight">
              LUMBALGIA AGUDA
            </h3>
            <div className="flex gap-6 items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="lumbalgia-tiene"
                  className="w-4 h-4 text-sky-600"
                  checked={lumbalgia.tieneLumbalgiaAguda === true}
                  onChange={() => setField('lumbalgiaAguda.tieneLumbalgiaAguda', true)}
                />
                <span className="font-bold text-sm text-slate-700">SI</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="lumbalgia-tiene"
                  className="w-4 h-4 text-sky-600"
                  checked={lumbalgia.tieneLumbalgiaAguda === false}
                  onChange={() => setField('lumbalgiaAguda.tieneLumbalgiaAguda', false)}
                />
                <span className="font-bold text-sm text-slate-700">NO</span>
              </label>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {/* N° total episodios agudos */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                N° total de episodios agudos
              </label>
              <input
                type="number"
                min={0}
                value={lumbalgia.totalEpisodiosAgudos ?? ''}
                onChange={(e) =>
                  setField(
                    'lumbalgiaAguda.totalEpisodiosAgudos',
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="Ingrese cantidad"
              />
            </div>

            {/* N° episodios agudos en el último año */}
            <div className="md:col-span-2 bg-slate-50/50 p-4 rounded-lg border border-slate-200 space-y-3">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                N° episodios agudos en el último año
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Lumbalgia */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded text-sky-600"
                      checked={lumbalgia.episodiosUltimoAno.lumbalgia.aplica}
                      onChange={(e) =>
                        setField('lumbalgiaAguda.episodiosUltimoAno.lumbalgia.aplica', e.target.checked)
                      }
                    />
                    <span className="text-sm font-medium text-slate-700">Lumbalgia</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={lumbalgia.episodiosUltimoAno.lumbalgia.cantidad ?? ''}
                    onChange={(e) =>
                      setField(
                        'lumbalgiaAguda.episodiosUltimoAno.lumbalgia.cantidad',
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    className="w-20 h-9 border border-slate-200 rounded-lg px-2 text-sm text-center font-bold text-sky-700 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    placeholder="N°"
                  />
                </div>

                {/* Lumbociatalgia */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded text-sky-600"
                      checked={lumbalgia.episodiosUltimoAno.lumbociatalgia.aplica}
                      onChange={(e) =>
                        setField('lumbalgiaAguda.episodiosUltimoAno.lumbociatalgia.aplica', e.target.checked)
                      }
                    />
                    <span className="text-sm font-medium text-slate-700">Lumbociatalgia</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={lumbalgia.episodiosUltimoAno.lumbociatalgia.cantidad ?? ''}
                    onChange={(e) =>
                      setField(
                        'lumbalgiaAguda.episodiosUltimoAno.lumbociatalgia.cantidad',
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    className="w-20 h-9 border border-slate-200 rounded-lg px-2 text-sm text-center font-bold text-sky-700 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    placeholder="N°"
                  />
                </div>
              </div>
            </div>

            {/* año del 1° episodio */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Año del 1° episodio
              </label>
              <input
                type="text"
                value={lumbalgia.anoPrimerEpisodio}
                onChange={(e) => setField('lumbalgiaAguda.anoPrimerEpisodio', e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="Ej. 2020"
              />
            </div>

            {/* N° días de ausencia */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                N° de días de ausencia al trabajo por lumbalgia aguda
              </label>
              <input
                type="number"
                min={0}
                value={lumbalgia.diasAusenciaTrabajo ?? ''}
                onChange={(e) =>
                  setField(
                    'lumbalgiaAguda.diasAusenciaTrabajo',
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="Días totales de ausencia"
              />
            </div>
          </div>
        </section>

        {/* ======== SECCIÓN 2: DIAGNÓSTICO PATOLOGÍA DE LA COLUMNA ======== */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 flex justify-between items-center border-b border-slate-200 bg-slate-50">
            <h3 className="text-lg font-semibold text-sky-700 uppercase tracking-tight">
              DIAGNÓSTICO PATOLOGÍA DE LA COLUMNA{' '}
              <span className="font-normal text-sm text-slate-500">(conocido)</span>
            </h3>
            <div className="flex gap-6 items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="diagnostico-conocido"
                  className="w-4 h-4 text-sky-600"
                  checked={diagnostico.tieneDiagnosticoConocido === true}
                  onChange={() =>
                    setField('diagnosticoPatologiaColumna.tieneDiagnosticoConocido', true)
                  }
                />
                <span className="font-bold text-sm text-slate-700">SI</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="diagnostico-conocido"
                  className="w-4 h-4 text-sky-600"
                  checked={diagnostico.tieneDiagnosticoConocido === false}
                  onChange={() =>
                    setField('diagnosticoPatologiaColumna.tieneDiagnosticoConocido', false)
                  }
                />
                <span className="font-bold text-sm text-slate-700">NO</span>
              </label>
            </div>
          </div>

          <div className="p-6 space-y-8">
            {/* Hernia de Disco Lumbo Sacra */}
            <div className="p-5 border border-slate-200 rounded-lg bg-white">
              <h4 className="text-sm font-bold text-sky-700 mb-4 uppercase tracking-wide">
                HERNIA DE DISCO LUMBO SACRA
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                {/* Diagnosticada */}
                <label className="flex items-center gap-3 cursor-pointer h-10">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded text-sky-600"
                    checked={diagnostico.herniaDiscoLumboSacra.diagnosticada}
                    onChange={(e) =>
                      setField(
                        'diagnosticoPatologiaColumna.herniaDiscoLumboSacra.diagnosticada',
                        e.target.checked,
                      )
                    }
                  />
                  <span className="text-sm font-semibold text-slate-700 uppercase">
                    DIAGNOSTICADA
                  </span>
                </label>

                {/* Tratada quirúrgicamente + Cuándo + Fecha */}
                <div className="space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-5 h-5 rounded text-sky-600"
                      checked={diagnostico.herniaDiscoLumboSacra.tratadaQuirurgicamente}
                      onChange={(e) =>
                        setField(
                          'diagnosticoPatologiaColumna.herniaDiscoLumboSacra.tratadaQuirurgicamente',
                          e.target.checked,
                        )
                      }
                    />
                    <span className="text-sm font-semibold text-slate-700 uppercase">
                      TRATADA QUIRÚRGICAMENTE
                    </span>
                  </label>

                  <div className="pl-8 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">
                        Cuándo
                      </span>
                      <input
                        type="text"
                        value={diagnostico.herniaDiscoLumboSacra.cuando}
                        onChange={(e) =>
                          setField(
                            'diagnosticoPatologiaColumna.herniaDiscoLumboSacra.cuando',
                            e.target.value,
                          )
                        }
                        className="flex-1 h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                        placeholder="Lugar o situación"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">
                        Fecha de intervención
                      </span>
                      <input
                        type="date"
                        value={diagnostico.herniaDiscoLumboSacra.fechaIntervencion}
                        onChange={(e) =>
                          setField(
                            'diagnosticoPatologiaColumna.herniaDiscoLumboSacra.fechaIntervencion',
                            e.target.value,
                          )
                        }
                        className="flex-1 h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Patología/Trauma por zona de columna */}
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Patología/Trauma de la Columna Cervical (Cual/es)
                </label>
                <textarea
                  value={diagnostico.patologiaTraumaCervical}
                  onChange={(e) =>
                    setField(
                      'diagnosticoPatologiaColumna.patologiaTraumaCervical',
                      e.target.value,
                    )
                  }
                  className="w-full min-h-[80px] border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="Describa hallazgos o antecedentes..."
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Patología/Trauma de la Columna Dorsal (Cual/es)
                </label>
                <textarea
                  value={diagnostico.patologiaTraumaDorsal}
                  onChange={(e) =>
                    setField(
                      'diagnosticoPatologiaColumna.patologiaTraumaDorsal',
                      e.target.value,
                    )
                  }
                  className="w-full min-h-[80px] border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="Describa hallazgos o antecedentes..."
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Patología/Trauma de la Columna Lumbosacra (Cual/es)
                </label>
                <textarea
                  value={diagnostico.patologiaTraumaLumbosacra}
                  onChange={(e) =>
                    setField(
                      'diagnosticoPatologiaColumna.patologiaTraumaLumbosacra',
                      e.target.value,
                    )
                  }
                  className="w-full min-h-[80px] border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="Describa hallazgos o antecedentes..."
                />
              </div>
            </div>
          </div>
        </section>

        {/* Nota informativa */}
        <footer className="bg-sky-50/50 border border-sky-100 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-sky-600 font-bold text-lg">i</span>
            <div className="space-y-1 text-xs text-slate-600 leading-relaxed">
              <p>
                <span className="font-bold text-slate-800">NB*:</span> umbral anamnésico positivo
                para <span className="font-bold text-slate-800">LUMBALGIA AGUDA</span> es la
                presencia de episodio de dolor intenso en la espalda baja que no permite la
                flexión, inclinación y rotación (&ldquo;lumbago&rdquo;), cuyo comienzo puede ser
                agudo o insidioso y se prolongó durante al menos 2 días (o uno con tratamiento
                farmacológico).
              </p>
              <p className="italic">
                Asegúrese de registrar fechas precisas y descripciones detalladas de traumas
                previos. Esta información es fundamental para determinar el plan de tratamiento
                ocupacional y las restricciones laborales necesarias.
              </p>
            </div>
          </div>
        </footer>

        {/* Pie de página */}
        <div className="flex justify-between items-center text-[10px] text-slate-400 border-t border-slate-200 pt-4">
          <div>
            Fo. JJC-SIG-13-31 Cuestionario anamnésico y evaluación de extremidad superior y
            espalda. Rev. 0
          </div>
          <div className="flex items-center gap-4">
            <span>HOLOMEDIC SYSTEM v2.4</span>
            <span className="font-bold text-slate-600">Página 4</span>
          </div>
        </div>

        <Paginacion
          paginaActual={4}
          baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/entrevista`}
        />
      </form>
    </div>
  );
}
