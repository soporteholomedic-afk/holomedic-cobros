'use client';

import { useEntrevistaContext } from '@/features/entrevista-osteomuscular/presentation/context/EntrevistaOsteomuscularContext';
import { Paginacion } from './Paginacion';

export function EntrevistaOsteomuscularFormPag4() {
  const { idAtencion, state, setField } = useEntrevistaContext();

  const lumbalgia = state.lumbalgiaAguda;
  const diagnostico = state.diagnosticoPatologiaColumna;
  const hernia = state.diagnosticoPatologiaColumna.herniaDiscoLumboSacra;
  const medico = state.medicoEvaluador;

  return (
    <div className="anamnesis-page min-h-screen bg-gray-100 py-6 text-[11px] leading-tight text-black">
      <form
        onSubmit={(e) => e.preventDefault()}
        className="max-w-[850px] mx-auto bg-white p-8 shadow-md border border-gray-300 min-h-[950px] flex flex-col justify-between"
      >
        <div>
          {/* SECCIÓN 1: LUMBALGIA AGUDA */}
          <div className="border border-black mb-6">
            <div className="bg-[#e6e6e6] border-b border-black p-1.5 flex justify-between items-center font-bold">
              <div className="text-[12px] uppercase tracking-wide">LUMBALGIA AGUDA</div>
              <div className="space-x-4 pr-4">
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="lumbalgiaAguda.tieneLumbalgiaAguda"
                    checked={lumbalgia.tieneLumbalgiaAguda === true}
                    onChange={() => setField('lumbalgiaAguda.tieneLumbalgiaAguda', true)}
                  />{' '}
                  SI
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="lumbalgiaAguda.tieneLumbalgiaAguda"
                    checked={lumbalgia.tieneLumbalgiaAguda === false}
                    onChange={() => setField('lumbalgiaAguda.tieneLumbalgiaAguda', false)}
                  />{' '}
                  NO
                </label>
              </div>
            </div>

            <table className="w-full border-collapse">
              <tbody>
                <tr className="border-b border-black">
                  <td className="w-[45%] p-1.5 border-r border-black font-normal">
                    N° total de episodios agudos
                  </td>
                  <td className="w-[55%] p-1">
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
                      className="w-full px-1"
                    />
                  </td>
                </tr>

                <tr className="border-b border-black">
                  <td className="p-1.5 border-r border-black font-normal">
                    N° episodios agudos en el último año
                  </td>
                  <td className="p-1 flex items-center space-x-6">
                    <div className="flex items-center space-x-1">
                      <input
                        type="checkbox"
                        checked={lumbalgia.episodiosUltimoAno.lumbalgia.aplica}
                        onChange={(e) =>
                          setField('lumbalgiaAguda.episodiosUltimoAno.lumbalgia.aplica', e.target.checked)
                        }
                      />
                      <label className="cursor-pointer">lumbalgia</label>
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
                        className="dotted-input w-16 text-center"
                        placeholder="N°"
                      />
                    </div>

                    <div className="flex items-center space-x-1">
                      <input
                        type="checkbox"
                        checked={lumbalgia.episodiosUltimoAno.lumbociatalgia.aplica}
                        onChange={(e) =>
                          setField(
                            'lumbalgiaAguda.episodiosUltimoAno.lumbociatalgia.aplica',
                            e.target.checked,
                          )
                        }
                      />
                      <label className="cursor-pointer">lumbociatalgia</label>
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
                        className="dotted-input w-16 text-center"
                        placeholder="N°"
                      />
                    </div>
                  </td>
                </tr>

                <tr className="border-b border-black">
                  <td className="p-1.5 border-r border-black font-normal">año del 1° episodio</td>
                  <td className="p-1">
                    <input
                      type="text"
                      value={lumbalgia.anoPrimerEpisodio}
                      onChange={(e) => setField('lumbalgiaAguda.anoPrimerEpisodio', e.target.value)}
                      className="w-full px-1"
                      placeholder="Ej. 2020"
                    />
                  </td>
                </tr>

                <tr>
                  <td className="p-1.5 border-r border-black font-normal">
                    N° de días de ausencia al trabajo por lumbalgia aguda
                  </td>
                  <td className="p-1">
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
                      className="w-full px-1"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* SECCIÓN 2: DIAGNOSTICO PATOLOGIA DE LA COLUMNA */}
          <div className="border border-black mb-12">
            <div className="bg-[#d9e1f2] border-b border-black p-1.5 flex justify-between items-center font-bold">
              <div className="text-[#b25900] text-[12px] uppercase">
                DIAGNOSTICO PATOLOGIA DE LA COLUMNA{' '}
                <span className="font-normal text-[11px] text-[#b25900]">(conocido)</span>
              </div>
              <div className="text-black space-x-4 pr-4">
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="diagnosticoPatologiaColumna.tieneDiagnosticoConocido"
                    checked={diagnostico.tieneDiagnosticoConocido === true}
                    onChange={() =>
                      setField('diagnosticoPatologiaColumna.tieneDiagnosticoConocido', true)
                    }
                  />{' '}
                  SI
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="diagnosticoPatologiaColumna.tieneDiagnosticoConocido"
                    checked={diagnostico.tieneDiagnosticoConocido === false}
                    onChange={() =>
                      setField('diagnosticoPatologiaColumna.tieneDiagnosticoConocido', false)
                    }
                  />{' '}
                  NO
                </label>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Hernia de Disco */}
              <div className="space-y-2">
                <div className="font-bold text-[11px]">HERNIA DE DISCO LUMBO SACRA</div>
                <div className="pl-4 space-y-1.5">
                  <div>
                    <label className="cursor-pointer">
                      <input
                        type="checkbox"
                        className="mr-1"
                        checked={hernia.diagnosticada}
                        onChange={(e) =>
                          setField(
                            'diagnosticoPatologiaColumna.herniaDiscoLumboSacra.diagnosticada',
                            e.target.checked,
                          )
                        }
                      />
                      DIAGNOSTICADA
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <label className="cursor-pointer">
                      <input
                        type="checkbox"
                        className="mr-1"
                        checked={hernia.tratadaQuirurgicamente}
                        onChange={(e) =>
                          setField(
                            'diagnosticoPatologiaColumna.herniaDiscoLumboSacra.tratadaQuirurgicamente',
                            e.target.checked,
                          )
                        }
                      />
                      TRATADA QUIRURGICAMENTE
                    </label>
                    <span className="ml-4">Cuando</span>
                    <input
                      type="text"
                      value={hernia.cuando}
                      onChange={(e) =>
                        setField(
                          'diagnosticoPatologiaColumna.herniaDiscoLumboSacra.cuando',
                          e.target.value,
                        )
                      }
                      className="dotted-input w-48 text-center"
                    />
                  </div>
                  <div className="pt-1 pl-12 flex items-center space-x-2">
                    <span>Fecha de intervención</span>
                    <input
                      type="text"
                      value={hernia.fechaIntervencion}
                      onChange={(e) =>
                        setField(
                          'diagnosticoPatologiaColumna.herniaDiscoLumboSacra.fechaIntervencion',
                          e.target.value,
                        )
                      }
                      className="dotted-input w-48 text-center"
                      placeholder="DD/MM/AAAA"
                    />
                  </div>
                </div>
              </div>

              {/* Patología/Trauma por zona de columna */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center">
                  <span className="whitespace-nowrap">
                    PATOLOGIA/TRAUMA DE LA COLUMNA CERVICAL Cual/s.
                  </span>
                  <input
                    type="text"
                    value={diagnostico.patologiaTraumaCervical}
                    onChange={(e) =>
                      setField('diagnosticoPatologiaColumna.patologiaTraumaCervical', e.target.value)
                    }
                    className="dotted-input flex-grow ml-1"
                  />
                </div>

                <div className="flex items-center">
                  <span className="whitespace-nowrap">
                    PATOLOGIA/TRAUMA DE LA COLUMNA DORSAL. Cual/s.
                  </span>
                  <input
                    type="text"
                    value={diagnostico.patologiaTraumaDorsal}
                    onChange={(e) =>
                      setField('diagnosticoPatologiaColumna.patologiaTraumaDorsal', e.target.value)
                    }
                    className="dotted-input flex-grow ml-1"
                  />
                </div>

                <div className="flex items-center">
                  <span className="whitespace-nowrap">
                    PATOLOGIA/TRAUMA DE LA COLUMNA LUMBOSACRA Cual/s.
                  </span>
                  <input
                    type="text"
                    value={diagnostico.patologiaTraumaLumbosacra}
                    onChange={(e) =>
                      setField(
                        'diagnosticoPatologiaColumna.patologiaTraumaLumbosacra',
                        e.target.value,
                      )
                    }
                    className="dotted-input flex-grow ml-1"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: FIRMA Y DATOS DEL MÉDICO */}
          <div className="mt-16 w-[320px] text-[10px]">
            <div className="border-b border-black border-dashed mb-1" />
            <div className="space-y-0.5">
              <div className="flex items-center">
                <span className="w-32">NOMBRE Y APELLIDOS</span>
                <span>:</span>
                <input
                  type="text"
                  value={medico.nombreYApellidos}
                  onChange={(e) => setField('medicoEvaluador.nombreYApellidos', e.target.value)}
                  className="w-full ml-1 outline-none"
                />
              </div>
              <div>FIRMA-SELLO</div>
              <div>MEDICO EVALUADOR / OCUPACIONAL</div>
              <div className="flex items-center">
                <span className="w-12">FECHA</span>
                <span>:</span>
                <input
                  type="text"
                  value={medico.fechaEvaluacion}
                  onChange={(e) => setField('medicoEvaluador.fechaEvaluacion', e.target.value)}
                  className="w-full ml-1 outline-none"
                  placeholder="DD/MM/AAAA"
                />
              </div>
            </div>
          </div>
        </div>
      </form>

      <Paginacion
        paginaActual={4}
        baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/entrevista`}
      />
    </div>
  );
}
