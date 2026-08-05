'use client';

import { useMemo } from 'react';
import { useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { Paginacion } from './Paginacion';
import { AnatomicalImage } from './AnatomicalImage';
import type {
  DxIxBool,
  GravedadPatologia,
} from '@/types/evaluacion-osteomuscular';

type Lado = 'dx' | 'ix';

interface CheckDxIxProps {
  basePath: string;
  checked: DxIxBool;
  lado: Lado;
  className?: string;
}

function CheckDxIx({ basePath, checked, lado, className }: CheckDxIxProps) {
  const { setDxIx } = useEvaluacionContext();
  return (
    <label className={`cursor-pointer ${className ?? ''}`}>
      <input
        type="checkbox"
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
    <label className="cursor-pointer">
      <input
        type="radio"
        name={groupName}
        value={value}
        checked={current === value}
        onChange={() => setField(path, value)}
      />{' '}
      {value}
    </label>
  );
}

const BASE = 'evaluacionClinicaOsteomuscular.miembrosSuperiores';

export function EvaluacionFormPag1() {
  const { idAtencion, state, setField } = useEvaluacionContext();

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
    <div className="evaluation-page min-h-screen bg-gray-100 py-6 text-[10px] leading-tight text-black">
      <form
        onSubmit={(e) => e.preventDefault()}
        className="max-w-[850px] mx-auto bg-white p-6 shadow-md border border-gray-300"
      >
        {/* BANNER TÍTULO PRINCIPAL */}
        <div className="bg-[#0070c0] text-white font-bold text-center py-1.5 text-[12px] tracking-wide mb-2 uppercase">
          EVALUACION CLINICA OSTEMUSCULAR
        </div>

        {/* TÍTULO SECCIÓN */}
        <div className="font-bold text-[11px] mb-1 uppercase">
          I.- MIEMBROS SUPERIORES
        </div>

        {/* CONTENEDOR PRINCIPAL MARCO NEGRO */}
        <div className="border border-black mb-2">
          {/* ================= SUBSECCIÓN A: ESCAPULO HUMERAL ================= */}
          <div>
            {/* Sub-banner A */}
            <div className="bg-[#d9e1f2] border-b border-black p-1 flex justify-between items-center font-bold">
              <div className="text-[#b25900] text-[10px] uppercase">
                a) ESCAPULO HUMERAL: REALIZA MANIOBRAS
              </div>
              <div className="text-[#b25900] font-bold space-x-2 pr-2">
                <label className="cursor-pointer">
                  <CheckSimple
                    path={`${baseEsc}.realizaManiobras`}
                    checked={esc.realizaManiobras}
                  />{' '}
                  SI
                </label>
              </div>
            </div>

            {/* Tiempos de Molestia */}
            <div className="border-b border-black p-1 flex justify-around text-[9.5px]">
              <div>
                <span className="font-bold">MOLESTIA DE HOMBRO Dx Desde</span>{' '}
                <input
                  type="number"
                  min={0}
                  aria-label="Molestia hombro Dx desde meses"
                  value={esc.molestiaHombroDxDesdeMeses ?? ''}
                  onChange={(e) =>
                    setField(
                      `${baseEsc}.molestiaHombroDxDesdeMeses`,
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                  className="dotted-input w-16 text-center"
                />
                <span>(meses)</span>
              </div>
              <div>
                <span className="font-bold">MOLESTIA DE HOMBRO Ix desde</span>{' '}
                <input
                  type="number"
                  min={0}
                  aria-label="Molestia hombro Ix desde meses"
                  value={esc.molestiaHombroIxDesdeMeses ?? ''}
                  onChange={(e) =>
                    setField(
                      `${baseEsc}.molestiaHombroIxDesdeMeses`,
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                  className="dotted-input w-16 text-center"
                />
                <span>(meses)</span>
              </div>
            </div>

            {/* Tabla 1: Palpación Hombro */}
            <table className="w-full border-collapse border-b border-black">
              <thead>
                <tr className="bg-[#e6e6e6] border-b border-black font-bold text-center">
                  <th colSpan={6} className="py-1 text-[11px] font-bold uppercase">PALPACIÓN HOMBRO</th>
                </tr>
                <tr className="border-b border-black">
                  <th colSpan={2} className="border-r border-black px-2 py-0.5 text-left font-normal text-[9.5px] uppercase">DOLOR ANTERIOR</th>
                  <th colSpan={2} className="border-r border-black px-2 py-0.5 text-left font-normal text-[9.5px] uppercase">DOLOR LATERAL</th>
                  <th colSpan={2} className="px-2 py-0.5 text-left font-normal text-[9.5px] uppercase">DOLOR POSTERIOR</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-center">
                  <td className="w-[16.66%] border-r border-black py-1">
                    <CheckDxIx
                      basePath={`${baseEsc}.palpacionHombro.dolorAnterior`}
                      checked={esc.palpacionHombro.dolorAnterior}
                      lado="dx"
                    />
                  </td>
                  <td className="w-[16.66%] border-r border-black py-1">
                    <CheckDxIx
                      basePath={`${baseEsc}.palpacionHombro.dolorAnterior`}
                      checked={esc.palpacionHombro.dolorAnterior}
                      lado="ix"
                    />
                  </td>
                  <td className="w-[16.66%] border-r border-black py-1">
                    <CheckDxIx
                      basePath={`${baseEsc}.palpacionHombro.dolorLateral`}
                      checked={esc.palpacionHombro.dolorLateral}
                      lado="dx"
                    />
                  </td>
                  <td className="w-[16.66%] border-r border-black py-1">
                    <CheckDxIx
                      basePath={`${baseEsc}.palpacionHombro.dolorLateral`}
                      checked={esc.palpacionHombro.dolorLateral}
                      lado="ix"
                    />
                  </td>
                  <td className="w-[16.66%] border-r border-black py-1">
                    <CheckDxIx
                      basePath={`${baseEsc}.palpacionHombro.dolorPosterior`}
                      checked={esc.palpacionHombro.dolorPosterior}
                      lado="dx"
                    />
                  </td>
                  <td className="w-[16.66%] py-1">
                    <CheckDxIx
                      basePath={`${baseEsc}.palpacionHombro.dolorPosterior`}
                      checked={esc.palpacionHombro.dolorPosterior}
                      lado="ix"
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Tabla 2: Evaluación de Movilidad Cintura Escapulohumeral */}
            <table className="w-full border-collapse border-b border-black">
              <thead>
                <tr className="bg-[#e6e6e6] border-b border-black font-bold">
                  <th colSpan={4} className="px-2 py-1 text-left text-[11px] uppercase tracking-tight">
                    EVALUACIÓN DE LA MOVILIDAD DE LA CINTURA ESCAPULOHUMERAL PRESENCIA DE DOLOR AL MOVIMIENTO
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Gráficos */}
                <tr className="border-b border-black">
                  <td className="w-1/4 border-r border-black p-1 text-center h-28 align-middle">
                    <AnatomicalImage
                      src="/assets/images/musculo/entrevista/flexion-hombro.jpg"
                      alt="Maniobra de flexión del hombro"
                      className="w-20 h-20 mx-auto"
                      sizes="80px"
                    />
                  </td>
                  <td className="w-1/4 border-r border-black p-1 text-center h-28 align-middle">
                    <AnatomicalImage
                      src="/assets/images/musculo/entrevista/abduccion-hombro.jpg"
                      alt="Maniobra de abducción del hombro"
                      className="w-20 h-20 mx-auto"
                      sizes="80px"
                    />
                  </td>
                  <td className="w-1/4 border-r border-black p-1 text-center h-28 align-middle">
                    <AnatomicalImage
                      src="/assets/images/musculo/entrevista/rotacion-interna-hombro.jpg"
                      alt="Maniobra de rotación interna del hombro"
                      className="w-20 h-20 mx-auto"
                      sizes="80px"
                    />
                  </td>
                  <td className="w-1/4 p-1 text-center h-28 align-middle">
                    <AnatomicalImage
                      src="/assets/images/musculo/entrevista/rotacion-externa-hombro.jpg"
                      alt="Maniobra de rotación externa del hombro"
                      className="w-20 h-20 mx-auto"
                      sizes="80px"
                    />
                  </td>
                </tr>

                {/* Fila Texto PRESENCIA DE DOLOR */}
                <tr className="border-b border-black text-left text-[9px]">
                  <td className="border-r border-black px-2 py-0.5 uppercase">PRESENCIA DE DOLOR</td>
                  <td className="border-r border-black px-2 py-0.5 uppercase">PRESENCIA DE DOLOR</td>
                  <td className="border-r border-black px-2 py-0.5 uppercase">PRESENCIA DE DOLOR</td>
                  <td className="px-2 py-0.5 uppercase">PRESENCIA DE DOLOR</td>
                </tr>

                {/* Fila Checkboxes */}
                <tr className="text-center">
                  <td className="border-r border-black py-1">
                    <div className="flex justify-center space-x-4">
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
                  </td>
                  <td className="border-r border-black py-1">
                    <div className="flex justify-center space-x-4">
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
                  </td>
                  <td className="border-r border-black p-0">
                    <div className="grid grid-cols-2 h-full items-center">
                      <div className="border-r border-black py-1">
                        <CheckDxIx
                          basePath={`${baseEsc}.movilidadPresenciaDolor.rotacionInterna`}
                          checked={esc.movilidadPresenciaDolor.rotacionInterna}
                          lado="dx"
                        />
                      </div>
                      <div className="py-1">
                        <CheckDxIx
                          basePath={`${baseEsc}.movilidadPresenciaDolor.rotacionInterna`}
                          checked={esc.movilidadPresenciaDolor.rotacionInterna}
                          lado="ix"
                        />
                      </div>
                    </div>
                  </td>
                  <td className="p-0">
                    <div className="grid grid-cols-2 h-full items-center">
                      <div className="border-r border-black py-1">
                        <CheckDxIx
                          basePath={`${baseEsc}.movilidadPresenciaDolor.rotacionExterna`}
                          checked={esc.movilidadPresenciaDolor.rotacionExterna}
                          lado="dx"
                        />
                      </div>
                      <div className="py-1">
                        <CheckDxIx
                          basePath={`${baseEsc}.movilidadPresenciaDolor.rotacionExterna`}
                          checked={esc.movilidadPresenciaDolor.rotacionExterna}
                          lado="ix"
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Tabla 3: Arco Doloroso / Test Tendinitis */}
            <table className="w-full border-collapse border-b border-black">
              <thead>
                <tr className="bg-[#e6e6e6] border-b border-black font-bold">
                  <th className="w-1/2 border-r border-black px-2 py-1 text-left text-[11px] uppercase">
                    ARCO DOLOROSO <span className="font-normal text-[9.5px] lowercase">(DOLOR ENTRE 70° Y 120°)</span>
                  </th>
                  <th className="w-1/2 px-2 py-1 text-left text-[11px] uppercase">
                    TEST TENDINITIS TENDÓN LARGO DE BÍCEPS
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {/* Arco Doloroso Body */}
                  <td className="border-r border-black p-2 align-top">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2 text-[8.5px]">
                        <div>
                          <label className="cursor-pointer">
                            <CheckSimple
                              path={`${baseEsc}.arcoDoloroso.presenteDx`}
                              checked={esc.arcoDoloroso.presenteDx}
                            />{' '}
                            PRESENTE Dx
                          </label>
                        </div>
                        <div>
                          <label className="cursor-pointer">
                            <CheckSimple
                              path={`${baseEsc}.arcoDoloroso.presenteIx`}
                              checked={esc.arcoDoloroso.presenteIx}
                            />{' '}
                            PRESENTE Ix
                          </label>
                        </div>
                      </div>
                      <AnatomicalImage
                        src="/assets/images/musculo/entrevista/arco-doloroso-hombro.jpg"
                        alt="Arco doloroso del hombro"
                        className="w-20 h-16"
                        sizes="80px"
                      />
                      <div>
                        <label className="cursor-pointer text-[8.5px]">
                          <CheckSimple
                            path={`${baseEsc}.arcoDoloroso.ausente`}
                            checked={esc.arcoDoloroso.ausente}
                          />{' '}
                          AUSENTE
                        </label>
                      </div>
                    </div>
                  </td>

                  {/* Test Bíceps Body */}
                  <td className="p-2 align-top">
                    <div className="flex items-center justify-between">
                      <AnatomicalImage
                        src="/assets/images/musculo/entrevista/test-biceps.jpg"
                        alt="Test del tendón largo del bíceps"
                        className="w-20 h-16"
                        sizes="80px"
                      />
                      <div className="space-y-1 text-[8px] pl-1">
                        <div>
                          <label className="cursor-pointer">
                            <CheckSimple
                              path={`${baseEsc}.testTendinitisTendonLargoBiceps.dolorAusente`}
                              checked={esc.testTendinitisTendonLargoBiceps.dolorAusente}
                            />{' '}
                            DOLOR AUSENTE
                          </label>
                        </div>
                        <div>
                          <label className="cursor-pointer">
                            <CheckSimple
                              path={`${baseEsc}.testTendinitisTendonLargoBiceps.presenciaDolorAnteriorHombroDx`}
                              checked={esc.testTendinitisTendonLargoBiceps.presenciaDolorAnteriorHombroDx}
                            />{' '}
                            PRESENCIA DE DOLOR ANTERIOR HOMBRO DX
                          </label>
                        </div>
                        <div>
                          <label className="cursor-pointer">
                            <CheckSimple
                              path={`${baseEsc}.testTendinitisTendonLargoBiceps.presenciaDolorAnteriorHombroIx`}
                              checked={esc.testTendinitisTendonLargoBiceps.presenciaDolorAnteriorHombroIx}
                            />{' '}
                            PRESENCIA DE DOLOR ANTERIOR HOMBRO IX
                          </label>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Examen Instrumental */}
            <div className="border-b border-black p-1 flex items-center justify-between text-[9px]">
              <div>
                <span className="font-bold">Examen instrumental:</span>
                <label className="cursor-pointer ml-2">
                  <CheckSimple
                    path={`${baseEsc}.examenInstrumental.noRealizo`}
                    checked={esc.examenInstrumental.noRealizo}
                  />{' '}
                  NO
                </label>
              </div>
              <div>
                <label className="cursor-pointer">
                  <CheckSimple
                    path={`${baseEsc}.examenInstrumental.ecografia.realiza`}
                    checked={esc.examenInstrumental.ecografia.realiza}
                  />{' '}
                  ECOGRAFÍA
                </label>{' '}
                (año{' '}
                <input
                  type="text"
                  aria-label="Año ecografía"
                  value={esc.examenInstrumental.ecografia.ano}
                  onChange={(e) =>
                    setField(`${baseEsc}.examenInstrumental.ecografia.ano`, e.target.value)
                  }
                  className="dotted-input w-12 text-center"
                />
                )
              </div>
              <div>
                <label className="cursor-pointer">
                  <CheckSimple
                    path={`${baseEsc}.examenInstrumental.rx.realiza`}
                    checked={esc.examenInstrumental.rx.realiza}
                  />{' '}
                  RX
                </label>{' '}
                (año{' '}
                <input
                  type="text"
                  aria-label="Año RX"
                  value={esc.examenInstrumental.rx.ano}
                  onChange={(e) =>
                    setField(`${baseEsc}.examenInstrumental.rx.ano`, e.target.value)
                  }
                  className="dotted-input w-12 text-center"
                />
                )
              </div>
              <div>
                <label className="cursor-pointer">
                  <CheckSimple
                    path={`${baseEsc}.examenInstrumental.rmn.realiza`}
                    checked={esc.examenInstrumental.rmn.realiza}
                  />{' '}
                  RMN
                </label>{' '}
                (año{' '}
                <input
                  type="text"
                  aria-label="Año RMN"
                  value={esc.examenInstrumental.rmn.ano}
                  onChange={(e) =>
                    setField(`${baseEsc}.examenInstrumental.rmn.ano`, e.target.value)
                  }
                  className="dotted-input w-12 text-center"
                />
                )
              </div>
            </div>

            {/* Otros exámenes instrumentales */}
            <div className="border-b border-black p-1 text-[9px]">
              <span className="font-bold">OTROS:</span>{' '}
              <input
                type="text"
                aria-label="Otros exámenes instrumentales"
                value={esc.examenInstrumental.otros}
                onChange={(e) =>
                  setField(`${baseEsc}.examenInstrumental.otros`, e.target.value)
                }
                className="dotted-input w-[calc(100%-4.5rem)] text-center"
              />
            </div>

            {/* Gravedad Patología Hombro */}
            <div className="p-1 flex items-center justify-between text-[9px] font-bold">
              <div>
                GRAVEDAD PATOLOGÍA DE HOMBRO <span className="font-normal text-[8px]">(última página*)</span>
              </div>
              <div className="space-x-6 pr-6">
                <RadioGravedad
                  value="LEVE"
                  current={esc.gravedadPatologiaHombro}
                  path={`${baseEsc}.gravedadPatologiaHombro`}
                  groupName="gravedadHombro"
                />
                <RadioGravedad
                  value="MEDIA"
                  current={esc.gravedadPatologiaHombro}
                  path={`${baseEsc}.gravedadPatologiaHombro`}
                  groupName="gravedadHombro"
                />
                <RadioGravedad
                  value="GRAVE"
                  current={esc.gravedadPatologiaHombro}
                  path={`${baseEsc}.gravedadPatologiaHombro`}
                  groupName="gravedadHombro"
                />
              </div>
            </div>
          </div>

          {/* ================= SUBSECCIÓN B: CODO ================= */}
          <div className="border-t border-black">
            <table className="w-full border-collapse">
              <thead>
                {/* Sub-banner B */}
                <tr className="bg-[#d9e1f2] border-b border-black font-bold text-[#b25900]">
                  <th colSpan={4} className="p-1">
                    <div className="flex justify-between items-center text-[10px] uppercase">
                      <span>b) CODO: REALIZA MANIOBRAS</span>
                      <label className="cursor-pointer pr-2">
                        <CheckSimple
                          path={`${baseCodo}.realizaManiobras`}
                          checked={codo.realizaManiobras}
                        />{' '}
                        SI
                      </label>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Tiempos de Molestia Codo */}
                <tr className="border-b border-black text-[9.5px]">
                  <td colSpan={4} className="p-1.5">
                    <div className="flex justify-around items-center">
                      <div>
                        <span className="font-bold">MOLESTIA CODO Dx desde</span>{' '}
                        <input
                          type="number"
                          min={0}
                          aria-label="Molestia codo Dx desde meses"
                          value={codo.molestiaCodoDxDesdeMeses ?? ''}
                          onChange={(e) =>
                            setField(
                              `${baseCodo}.molestiaCodoDxDesdeMeses`,
                              e.target.value === '' ? null : Number(e.target.value),
                            )
                          }
                          className="dotted-input w-20 text-center"
                        />
                        <span>(meses)</span>
                      </div>
                      <div>
                        <span className="font-bold">MOLESTIA CODO Ix desde</span>{' '}
                        <input
                          type="number"
                          min={0}
                          aria-label="Molestia codo Ix desde meses"
                          value={codo.molestiaCodoIxDesdeMeses ?? ''}
                          onChange={(e) =>
                            setField(
                              `${baseCodo}.molestiaCodoIxDesdeMeses`,
                              e.target.value === '' ? null : Number(e.target.value),
                            )
                          }
                          className="dotted-input w-20 text-center"
                        />
                        <span>(meses)</span>
                      </div>
                    </div>
                  </td>
                </tr>

                {/* Observación / Inspección Codo Header */}
                <tr className="bg-[#e6e6e6] border-b border-black font-bold text-center text-[9.5px] uppercase">
                  <td colSpan={4} className="py-0.5">OBSERVACIÓN, INSPECCIÓN</td>
                </tr>

                {/* Observación / Inspección Codo Content */}
                <tr className="border-b border-black text-[9px]">
                  <td colSpan={2} className="w-[60%] border-r border-black p-1.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span>EDEMA LOCALIZADO</span>
                        <CheckDxIx
                          basePath={`${baseCodo}.observacionInspeccion.edemaLocalizado`}
                          checked={codo.observacionInspeccion.edemaLocalizado}
                          lado="dx"
                          className="ml-1"
                        />
                        <CheckDxIx
                          basePath={`${baseCodo}.observacionInspeccion.edemaLocalizado`}
                          checked={codo.observacionInspeccion.edemaLocalizado}
                          lado="ix"
                          className="ml-1"
                        />
                      </div>
                      <div className="grow ml-2 flex items-center">
                        <input
                          type="text"
                          placeholder="Sitio"
                          value={codo.observacionInspeccion.sitio}
                          onChange={(e) =>
                            setField(`${baseCodo}.observacionInspeccion.sitio`, e.target.value)
                          }
                          className="dotted-input grow text-center"
                        />
                      </div>
                    </div>
                  </td>
                  <td colSpan={2} className="w-[40%] p-1.5">
                    <div className="flex items-center space-x-2">
                      <span>EDEMA NO LOCALIZADO</span>
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
                  </td>
                </tr>

                {/* Palpación Header */}
                <tr className="bg-[#e6e6e6] border-b border-black font-bold text-[9.5px]">
                  <td colSpan={2} className="border-r border-black px-2 py-1 text-left uppercase">
                    PALPACIÓN EPICÓNDILO (LATERAL) – EPITRÓCLEA (MEDIAL) - OLÉCRANON
                  </td>
                  <td className="w-[10%] border-r border-black text-center py-1">Dx</td>
                  <td className="w-[10%] text-center py-1">Ix</td>
                </tr>

                {/* Palpación Fila 1: Epicóndilo */}
                <tr className="border-b border-gray-300 text-[9px]">
                  <td rowSpan={3} className="w-[40%] border-r border-black p-2 text-center align-middle">
                        <AnatomicalImage
                          src="/assets/images/musculo/entrevista/atrapamiento-nervio-ulnar.png"
                          alt="Palpación del codo"
                          className="w-48 h-24 mx-auto"
                          sizes="192px"
                        />
                  </td>
                  <td className="border-r border-black p-1.5 text-left">
                    DOLOR EPICÓNDILO...........................................................
                  </td>
                  <td className="border-r border-black text-center py-1.5">
                    <CheckSimple
                      path={`${baseCodo}.palpacion.dolorEpicondilo.dx`}
                      checked={codo.palpacion.dolorEpicondilo.dx}
                      ariaLabel="Dolor epicóndilo Dx"
                    />
                  </td>
                  <td className="text-center py-1.5">
                    <CheckSimple
                      path={`${baseCodo}.palpacion.dolorEpicondilo.ix`}
                      checked={codo.palpacion.dolorEpicondilo.ix}
                      ariaLabel="Dolor epicóndilo Ix"
                    />
                  </td>
                </tr>

                {/* Palpación Fila 2: Epitróclea */}
                <tr className="border-b border-gray-300 text-[9px]">
                  <td className="border-r border-black p-1.5 text-left">
                    DOLOR EPITRÓCLEA...........................................................
                  </td>
                  <td className="border-r border-black text-center py-1.5">
                    <CheckSimple
                      path={`${baseCodo}.palpacion.dolorEpitroclea.dx`}
                      checked={codo.palpacion.dolorEpitroclea.dx}
                      ariaLabel="Dolor epitróclea Dx"
                    />
                  </td>
                  <td className="text-center py-1.5">
                    <CheckSimple
                      path={`${baseCodo}.palpacion.dolorEpitroclea.ix`}
                      checked={codo.palpacion.dolorEpitroclea.ix}
                      ariaLabel="Dolor epitróclea Ix"
                    />
                  </td>
                </tr>

                {/* Palpación Fila 3: Olécranon */}
                <tr className="text-[9px]">
                  <td className="border-r border-black p-1.5 text-left">
                    DOLOR OLÉCRANON..........................................................
                  </td>
                  <td className="border-r border-black text-center py-1.5">
                    <CheckSimple
                      path={`${baseCodo}.palpacion.dolorOlecranon.dx`}
                      checked={codo.palpacion.dolorOlecranon.dx}
                      ariaLabel="Dolor olécranon Dx"
                    />
                  </td>
                  <td className="text-center py-1.5">
                    <CheckSimple
                      path={`${baseCodo}.palpacion.dolorOlecranon.ix`}
                      checked={codo.palpacion.dolorOlecranon.ix}
                      ariaLabel="Dolor olécranon Ix"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* LEYENDA */}
        <div className="text-[9px] font-bold mb-4">
          Dx. = Derecho&nbsp;&nbsp;&nbsp;&nbsp; Ix. = Izquierdo
        </div>

        {/* PIE DE PÁGINA */}
        <div className="flex justify-between items-center text-[9px] border-t border-gray-300 pt-2 text-black">
          <div>
            Fo. JJC-SIG-13-31 Cuestionario anamnesico y evaluación de extremidad superior y espalda. Rev. 0
          </div>
          <div className="font-bold text-[11px] pr-2">
            3
          </div>
        </div>
      </form>

      <Paginacion
        paginaActual={1}
        baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/evaluacion`}
      />
    </div>
  );
}
