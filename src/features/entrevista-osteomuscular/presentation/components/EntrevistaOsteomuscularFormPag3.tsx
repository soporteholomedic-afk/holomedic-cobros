'use client';

import { useEntrevistaContext } from '@/features/entrevista-osteomuscular/presentation/context/EntrevistaOsteomuscularContext';
import { Paginacion } from './Paginacion';
import type {
  SeccionCervical,
  SeccionDorsal,
  SeccionLumboSacra,
} from '@/types/entrevista-osteomuscular';

const FRECUENCIA_KEYS = [
  'raramente',
  'episodios2a3Dias',
  'episodiosConMedicamentos',
  'presenteTodoElDia',
] as const;

const COL_LABELS = [
  'RARAMENTE',
  'AL MENOS 3-4 EPISODIOS DE 2-3 DIAS C/U',
  'AL MENOS 3-4 EPISODIOS CON USO DE MEDICAMENTOS O TRATAMIENTO MD',
  'PRESENTE TODO EL DIA',
];

const COL_LABELS_LUMBO = [
  'RARAMENTE',
  'AL MENOS 3-4 EPISODIOS DE 2-3 DIAS C/U',
  'AL MENOS 3-4 EPISODIOS CON USO DE MEDICAMENTOS O TRATAMIENTO MD',
  'PRESENTE TODOEL DIA',
];

type Region = 'cervical' | 'dorsal' | 'lumboSacra';

interface BloqueColumnaProps {
  titulo: string;
  subtitulo: string;
  region: Region;
  basePath: string;
  seccion: SeccionCervical | SeccionDorsal | SeccionLumboSacra;
  colLabels: string[];
  tituloAusencia: string;
  esUltima: boolean;
}

function CeldasIrradiacionRegion({ region, basePath }: { region: Region; basePath: string }) {
  const { setField, state } = useEntrevistaContext();
  const p = `${basePath}.irradiacion`;

  if (region === 'cervical') {
    const irr = state.columna.cervical.irradiacion;
    return (
      <>
        <td className="border-r border-black p-1">MIEMBRO SUPERIOR</td>
        <td className="p-1">
          <label className="cursor-pointer mr-2">
            <input
              type="checkbox"
              checked={irr.miembroSuperior.dx}
              onChange={(e) => setField(`${p}.miembroSuperior.dx`, e.target.checked)}
            />{' '}
            DX
          </label>
          <label className="cursor-pointer">
            <input
              type="checkbox"
              checked={irr.miembroSuperior.ix}
              onChange={(e) => setField(`${p}.miembroSuperior.ix`, e.target.checked)}
            />{' '}
            IX
          </label>
        </td>
      </>
    );
  }

  if (region === 'dorsal') {
    const irr = state.columna.dorsal.irradiacion;
    return (
      <>
        <td className="border-r border-black p-1">
          <label className="cursor-pointer">
            <input
              type="checkbox"
              className="mr-1"
              checked={irr.emitorax}
              onChange={(e) => setField(`${p}.emitorax`, e.target.checked)}
            />{' '}
            EMITORAX
          </label>
        </td>
        <td className="p-1">
          <label className="cursor-pointer mr-2">
            <input
              type="checkbox"
              checked={irr.dx}
              onChange={(e) => setField(`${p}.dx`, e.target.checked)}
            />{' '}
            DX
          </label>
          <label className="cursor-pointer">
            <input
              type="checkbox"
              checked={irr.ix}
              onChange={(e) => setField(`${p}.ix`, e.target.checked)}
            />{' '}
            IX
          </label>
        </td>
      </>
    );
  }

  const irr = state.columna.lumboSacra.irradiacion;
  return (
    <>
      <td className="border-r border-black p-1">
        <label className="cursor-pointer">
          <input
            type="checkbox"
            className="mr-1"
            checked={irr.miembrosInferiores}
            onChange={(e) => setField(`${p}.miembrosInferiores`, e.target.checked)}
          />{' '}
          MIEMBROS INFERIORES
        </label>
      </td>
      <td className="p-1">
        <label className="cursor-pointer mr-2">
          <input
            type="checkbox"
            checked={irr.dx}
            onChange={(e) => setField(`${p}.dx`, e.target.checked)}
          />{' '}
          DX
        </label>
        <label className="cursor-pointer">
          <input
            type="checkbox"
            checked={irr.ix}
            onChange={(e) => setField(`${p}.ix`, e.target.checked)}
          />{' '}
          IX
        </label>
      </td>
    </>
  );
}

function BloqueColumna({
  titulo,
  subtitulo,
  region,
  basePath,
  seccion,
  colLabels,
  tituloAusencia,
  esUltima,
}: BloqueColumnaProps) {
  const { setField } = useEntrevistaContext();

  const handleCheck = (path: string, value: boolean) => setField(path, value);
  const handleRadio = (path: string, value: boolean) => setField(path, value);

  return (
    <div>
      {/* Encabezado */}
      <div className="bg-[#d9e1f2] border-b border-black p-1 flex justify-between items-center">
        <div className="font-bold text-[#b25900] text-[11px]">
          {titulo} <span className="font-normal text-[10px] text-[#b25900]">{subtitulo}</span>
        </div>
        <div className="font-bold text-black space-x-3 pr-2">
          <label className="cursor-pointer">
            <input
              type="radio"
              name={`${basePath}.presentaDisturbio`}
              checked={seccion.presentaDisturbio === true}
              onChange={() => handleRadio(`${basePath}.presentaDisturbio`, true)}
            />{' '}
            SI
          </label>
          <label className="cursor-pointer">
            <input
              type="radio"
              name={`${basePath}.presentaDisturbio`}
              checked={seccion.presentaDisturbio === false}
              onChange={() => handleRadio(`${basePath}.presentaDisturbio`, false)}
            />{' '}
            NO
          </label>
        </div>
      </div>

      {/* Tabla de opciones */}
      <table className="w-full border-collapse text-center text-[9px]">
        <thead>
          <tr className="font-bold border-b border-black bg-white">
            {colLabels.map((label, i) => (
              <td
                key={label}
                className={`${i < colLabels.length - 1 ? 'border-r border-black' : ''} p-1 ${
                  i === 0 ? 'w-[22%]' : i === colLabels.length - 1 ? 'w-[22%]' : 'w-[28%]'
                }`}
              >
                {label}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-black bg-[#f2f2f2]">
            {FRECUENCIA_KEYS.map((key, i) => (
              <td key={key} className={`${i < FRECUENCIA_KEYS.length - 1 ? 'border-r border-black' : ''} p-1 text-left`}>
                <label className="cursor-pointer">
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={seccion.frecuenciaMolestia[key]}
                    onChange={(e) =>
                      handleCheck(`${basePath}.frecuenciaMolestia.${key}`, e.target.checked)
                    }
                  />{' '}
                  MOLESTIA
                </label>
              </td>
            ))}
          </tr>
          <tr className="border-b border-black bg-[#e6e6e6]">
            {FRECUENCIA_KEYS.map((key, i) => (
              <td key={key} className={`${i < FRECUENCIA_KEYS.length - 1 ? 'border-r border-black' : ''} p-1 text-left`}>
                <label className="cursor-pointer">
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={seccion.frecuenciaDolor[key]}
                    onChange={(e) =>
                      handleCheck(`${basePath}.frecuenciaDolor.${key}`, e.target.checked)
                    }
                  />{' '}
                  DOLOR
                </label>
              </td>
            ))}
          </tr>
          {/* Fila irradiación */}
          <tr className="border-b border-black font-bold">
            <td className="border-r border-black p-1 text-left">IRRADIACION</td>
            <td className="border-r border-black p-1">
              <label className="cursor-pointer mr-2">
                <input
                  type="radio"
                  name={`${basePath}.irradiacion.tieneIrradiacion`}
                  checked={seccion.irradiacion.tieneIrradiacion === false}
                  onChange={() => handleRadio(`${basePath}.irradiacion.tieneIrradiacion`, false)}
                />{' '}
                NO
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name={`${basePath}.irradiacion.tieneIrradiacion`}
                  checked={seccion.irradiacion.tieneIrradiacion === true}
                  onChange={() => handleRadio(`${basePath}.irradiacion.tieneIrradiacion`, true)}
                />{' '}
                SI
              </label>
            </td>
            <CeldasIrradiacionRegion region={region} basePath={basePath} />
          </tr>
        </tbody>
      </table>

      {/* Ausencia laboral */}
      <div
        className={`${esUltima ? '' : 'border-b-2 border-black'} p-1 font-bold bg-white text-[10px]`}
      >
        {tituloAusencia}
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
          className="border-b border-black w-24 text-center font-normal outline-none px-1"
        />{' '}
        días
      </div>
    </div>
  );
}

export function EntrevistaOsteomuscularFormPag3() {
  const { idAtencion, state } = useEntrevistaContext();

  return (
    <div className="anamnesis-page anamnesis-page--page3 min-h-screen bg-gray-100 py-6 text-[10px] leading-tight text-black">
      <form
        onSubmit={(e) => e.preventDefault()}
        className="max-w-[850px] mx-auto bg-white p-6 shadow-md border border-gray-300"
      >
        {/* TÍTULO DE SECCIÓN */}
        <div className="font-bold text-[12px] mb-2 uppercase">
          II.- COLUMNA{' '}
          <span className="font-normal text-[11px]">
            (DISTURBIOS EN LA COLUMNA ULTIMOS 12 MESES)
          </span>
        </div>

        {/* CONTENEDOR PRINCIPAL TABLA DE COLUMNA */}
        <div className="border border-black flex mb-3">
          {/* Columna izquierda: ilustraciones */}
          <div className="w-[30%] border-r border-black p-2 flex flex-col justify-between items-center text-left bg-white">
            <div className="font-bold text-[9px] mb-2 leading-tight w-full">
              N: Señale en la figura el area del disturbioy la irradiación.
            </div>

            {/* Figura Cervical */}
            <div className="my-auto py-2 text-center w-full">
              <svg viewBox="0 0 150 140" className="w-36 h-32 mx-auto">
                <path
                  d="M 50 40 C 50 15, 100 15, 100 40 C 100 50, 95 65, 88 70 C 95 72, 120 80, 135 110 L 140 135"
                  fill="none"
                  stroke="#000"
                  strokeWidth={1.2}
                />
                <path
                  d="M 50 40 C 50 50, 55 65, 62 70 C 55 72, 30 80, 15 110 L 10 135"
                  fill="none"
                  stroke="#000"
                  strokeWidth={1.2}
                />
                <path
                  d="M 50 40 C 47 40, 47 48, 52 48"
                  fill="none"
                  stroke="#000"
                  strokeWidth={1}
                />
                <path
                  d="M 100 40 C 103 40, 103 48, 98 48"
                  fill="none"
                  stroke="#000"
                  strokeWidth={1}
                />
                <rect x="70" y="65" width="10" height="30" fill="#e5533c" opacity="0.85" />
              </svg>
            </div>

            {/* Figura Dorsal / Lumbo Sacra */}
            <div className="my-auto py-2 text-center w-full">
              <svg viewBox="0 0 150 200" className="w-36 h-48 mx-auto">
                <path
                  d="M 55 25 C 55 8, 95 8, 95 25 C 95 35, 90 45, 84 50 C 92 52, 115 60, 125 90 L 145 150 L 135 155 L 120 115 C 115 125, 112 140, 115 155 C 108 160, 95 160, 88 150 C 85 165, 82 180, 80 195 L 70 195 C 68 180, 65 165, 62 150 C 55 160, 42 160, 35 155 C 38 140, 35 125, 30 115 L 15 155 L 5 150 L 25 90 C 35 60, 58 52, 66 50 C 60 45, 55 35, 55 25 Z"
                  fill="none"
                  stroke="#000"
                  strokeWidth={1.2}
                />
                <rect x="71" y="75" width="8" height="80" fill="#e5533c" opacity="0.85" />
                <path
                  d="M 60 148 C 60 140, 90 140, 90 148 C 95 158, 80 165, 75 165 C 70 165, 55 158, 60 148 Z"
                  fill="#e5533c"
                  opacity="0.85"
                />
              </svg>
            </div>
          </div>

          {/* Columna derecha: bloques de evaluación */}
          <div className="w-[70%]">
            <BloqueColumna
              titulo="CERVICAL"
              subtitulo="(molestia, sensación de peso, dolor)"
              region="cervical"
              basePath="columna.cervical"
              seccion={state.columna.cervical}
              colLabels={COL_LABELS}
              tituloAusencia="AUSENCIA AL TRABAJO POR DISTURBIO CERVICAL"
              esUltima={false}
            />

            <BloqueColumna
              titulo="DORSAL"
              subtitulo="(molestia, sensación de peso, dolor)"
              region="dorsal"
              basePath="columna.dorsal"
              seccion={state.columna.dorsal}
              colLabels={COL_LABELS}
              tituloAusencia="AUSENCIA AL TRABAJO POR DISTURBIO DORSAL"
              esUltima={false}
            />

            <BloqueColumna
              titulo="LUMBO SACRA"
              subtitulo="(molestia, sensación de peso,)"
              region="lumboSacra"
              basePath="columna.lumboSacra"
              seccion={state.columna.lumboSacra}
              colLabels={COL_LABELS_LUMBO}
              tituloAusencia="AUSENCIA AL TRABAJO POR DISTURBIO LUMBAR"
              esUltima
            />
          </div>
        </div>

        {/* NOTAS AL PIE Y DEFINICIONES */}
        <div className="text-[9px] leading-tight space-y-1 mb-6 text-justify">
          <p>
            <strong>NB*:</strong> umbral anamnésico positivo para la <strong>COLUMNA</strong>{' '}
            (identificado por cuadros grises) es la presencia de: dolor / malestar casi todos los
            días en los últimos 12 meses o episodios de dolor (3-4 episodios de 2-3 días, 10
            episodios de 1 día, 8 episodios de hace 2 días, 2 episodios de 30 días, un episodio de
            90 días).
          </p>
          <p>
            Dolor agudo de espalda baja significa: episodio de dolor intenso en la espalda baja que
            no permite la flexión, inclinación y rotación (&ldquo;lumbago), cuyo comienzo puede ser
            agudo o insidioso y se prolongó durante al menos 2 días (o uno con tratamiento
            farmacológico)
          </p>
        </div>

        {/* PIE DE PÁGINA */}
        <div className="flex justify-between items-center text-[9px] border-t border-gray-200 pt-2 text-gray-700">
          <div>
            Fo. JJC-SIG-13-31 Cuestionario anamnesico y evaluación de extremidad superior y
            espalda. Rev. 0
          </div>
          <div className="font-bold">1</div>
        </div>
      </form>

      <Paginacion
        paginaActual={3}
        baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/entrevista`}
      />
    </div>
  );
}
