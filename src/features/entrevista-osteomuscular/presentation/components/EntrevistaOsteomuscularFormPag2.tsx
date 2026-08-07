'use client';

import { useEntrevistaContext } from '@/features/entrevista-osteomuscular/presentation/context/EntrevistaOsteomuscularContext';
import { FigureAreaMarking } from './FigureAreaMarking';
import { Paginacion } from './Paginacion';
import type {
  FigureAreaMark,
  UmbralPositivoParestesiaNocturna,
  UmbralPositivoParestesiaDiurna,
} from '@/types/entrevista-osteomuscular';

/** Dimensiones intrínsecas de los assets (ver FigureAreaMarking). */
const MANOS_IMAGE_WIDTH = 117;
const MANOS_IMAGE_HEIGHT = 81;
const TORSO_IMAGE_WIDTH = 110;
const TORSO_IMAGE_HEIGHT = 136;

const INFO_LABELS: Record<string, string> = {
  haTomadoMedicamentos: 'ha tomado medicamentos',
  fisioterapia: 'fisioterapia',
  visitaTraumatologiaMedicinaGeneral: 'visita a traumatología / medicina general',
  rx: 'RX',
  ecografiaRmn: 'ECOGRAFÍA / RMN',
  emg: 'EMG (electromiografía)',
};

const DIAGNOSTICOS = [
  {
    key: 'hombro',
    label: 'HOMBRO',
    sub: 'tendinopatía del manguito rotador; tendinitis, etc.',
  },
  {
    key: 'codo',
    label: 'CODO',
    sub: 'epicondilitis; epitrocleitis; etc.',
  },
  {
    key: 'manoMunecaTendinitis',
    label: 'MANO/MUÑECA',
    sub: 'tendinitis; quiste en el tendón; etc.',
  },
  {
    key: 'manoMunecaTunelCarpiano',
    label: 'MANO/MUÑECA:',
    sub: 'Síndrome del túnel carpiano, Síndrome del canal de Guyón',
  },
] as const;

interface InfoItem {
  label: string;
  path: string;
  checked: boolean;
}

interface FilaSintoma {
  label: string;
  dxPath: string;
  ixPath: string;
  dxChecked: boolean;
  ixChecked: boolean;
}

interface CriterioUmbral {
  label: string;
  dxPath: string;
  dxChecked: boolean;
}

interface UmbralBlock {
  dxPath: string;
  ixPath: string;
  dxChecked: boolean;
  ixChecked: boolean;
  criterios: CriterioUmbral[];
  otrasVecesPath: string;
  otrasVeces: string;
}

interface MolestiasLevesBlock {
  dxPath: string;
  ixPath: string;
  dxChecked: boolean;
  ixChecked: boolean;
  detallePath: string;
  detalle: string;
}

interface ParestesiaTableProps {
  titulo: string;
  radioName: string;
  inicioTitulo: string;
  variante: 'nocturna' | 'diurna';
  imagenSrc: string;
  imagenAlt: string;
  tieneParestesia: boolean;
  onTieneParestesiaChange: (value: boolean) => void;
  inicioMolestia: string;
  onInicioMolestiaChange: (value: string) => void;
  infoInicial: InfoItem[];
  infoRealizado: InfoItem[];
  filas: FilaSintoma[];
  umbral: UmbralBlock;
  molestiasLeves: MolestiasLevesBlock;
  onCheckChange: (path: string, value: boolean) => void;
  onFieldChange: (path: string, value: string) => void;
  /** Marcas X normalizadas y callback de la figura de esta tabla. */
  marcas: FigureAreaMark[];
  onMarcasChange: (marks: FigureAreaMark[]) => void;
}

function ParestesiaTable({
  titulo,
  radioName,
  inicioTitulo,
  variante,
  imagenSrc,
  imagenAlt,
  tieneParestesia,
  onTieneParestesiaChange,
  inicioMolestia,
  onInicioMolestiaChange,
  infoInicial,
  infoRealizado,
  filas,
  umbral,
  molestiasLeves,
  onCheckChange,
  onFieldChange,
  marcas,
  onMarcasChange,
}: ParestesiaTableProps) {
  const rowSpan = filas.length + 2;

  return (
    <table className="w-full border-collapse border border-black mb-2 text-[11px]">
      <colgroup>
        <col className="w-[22%]" />
        <col className="w-[28%]" />
        <col className="w-[38%]" />
        <col className="w-[6%]" />
        <col className="w-[6%]" />
      </colgroup>
      <thead>
        <tr className="bg-[#d9e1f2]">
          <td colSpan={2} className="border border-black p-1 font-bold text-[#b25900]">
            {titulo}
            <span className="text-black font-normal ml-3">
              <label className="cursor-pointer mr-2">
                <input
                  type="radio"
                  name={radioName}
                  checked={!tieneParestesia}
                  onChange={() => onTieneParestesiaChange(false)}
                />{' '}
                NO
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name={radioName}
                  checked={tieneParestesia}
                  onChange={() => onTieneParestesiaChange(true)}
                />{' '}
                SI
              </label>
            </span>
          </td>
          <td className="border border-black p-1 text-[10px]">
            <strong>{inicioTitulo}</strong> <span className="text-[9px]">(años, meses, semanas o días):</span>
            <input
              type="text"
              value={inicioMolestia}
              onChange={(e) => onInicioMolestiaChange(e.target.value)}
              className="w-full border-b border-gray-400 font-normal outline-none mt-0.5"
            />
          </td>
          <td className="border border-black p-1 text-center font-bold">Dx</td>
          <td className="border border-black p-1 text-center font-bold">Ix</td>
        </tr>
      </thead>
      <tbody>
        {filas.map((fila, idx) => {
          const celdasRowSpan =
            idx === 0 ? (
              <>
                <td className="border border-black p-1 text-center align-top" rowSpan={rowSpan}>
                  {variante === 'nocturna' ? (
                    <>
                      <div className="text-[9px] leading-tight mb-1 text-left font-bold">
                        hormigueo, ardor, entumecimiento, sensación de pinchazo o corrientazo ^
                      </div>
                      <div className="flex justify-between font-bold px-2 text-[9px] my-1">
                        <span>Ix</span>
                        <span>DX</span>
                      </div>
                      <FigureAreaMarking
                        imageSrc={imagenSrc}
                        imageAlt={imagenAlt}
                        ariaLabel="Figura de manos — parestesia nocturna"
                        imageWidth={MANOS_IMAGE_WIDTH}
                        imageHeight={MANOS_IMAGE_HEIGHT}
                        marks={marcas}
                        onMarksChange={onMarcasChange}
                        className="w-32 h-24 mx-auto"
                        sizes="128px"
                      />
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between font-bold px-4 text-[10px] mb-1">
                        <span>Dx</span>
                        <span>Ix</span>
                      </div>
                      <FigureAreaMarking
                        imageSrc={imagenSrc}
                        imageAlt={imagenAlt}
                        ariaLabel="Figura de torso — parestesia diurna"
                        imageWidth={TORSO_IMAGE_WIDTH}
                        imageHeight={TORSO_IMAGE_HEIGHT}
                        marks={marcas}
                        onMarksChange={onMarcasChange}
                        className="w-24 h-28 mx-auto"
                        sizes="96px"
                      />
                    </>
                  )}
                  <div className="text-[8px] text-left font-bold mt-1 leading-tight">
                    N: Indicar sobre la figura el área de distribución de la molestia
                    {variante === 'diurna' ? '.' : ''}
                  </div>
                </td>
                <td className="border border-black p-1 align-top space-y-1" rowSpan={rowSpan}>
                  <div className="font-bold leading-snug">Información reportada sobre la molestia:</div>
                  {infoInicial.map((item) => (
                    <div key={item.path}>
                      <label className="cursor-pointer">
                        <input
                          type="checkbox"
                          className="mr-1"
                          checked={item.checked}
                          onChange={(e) => onCheckChange(item.path, e.target.checked)}
                        />
                        {item.label}
                      </label>
                    </div>
                  ))}
                  <div className="font-bold mt-1">ha realizado:</div>
                  {infoRealizado.map((item) => (
                    <div key={item.path}>
                      <label className="cursor-pointer">
                        <input
                          type="checkbox"
                          className="mr-1"
                          checked={item.checked}
                          onChange={(e) => onCheckChange(item.path, e.target.checked)}
                        />
                        {item.label}
                      </label>
                    </div>
                  ))}
                </td>
              </>
            ) : null;

          return (
            <tr key={idx}>
              {celdasRowSpan}
              <td className="border border-black p-1">{fila.label}</td>
              <td className="border border-black p-1 text-center align-middle">
                <input
                  type="checkbox"
                  checked={fila.dxChecked}
                  onChange={(e) => onCheckChange(fila.dxPath, e.target.checked)}
                />
              </td>
              <td className="border border-black p-1 text-center align-middle">
                <input
                  type="checkbox"
                  checked={fila.ixChecked}
                  onChange={(e) => onCheckChange(fila.ixPath, e.target.checked)}
                />
              </td>
            </tr>
          );
        })}

        <tr>
          <td className="border border-black p-1 space-y-0.5">
            <div className="font-bold">
              UMBRAL POSITIVO
              <span className="font-normal">
                (marcar x en <span className="box-check" />)
              </span>
            </div>
            {umbral.criterios.map((c) => (
              <div key={c.dxPath}>
                <label className="cursor-pointer">
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={c.dxChecked}
                    onChange={(e) => onCheckChange(c.dxPath, e.target.checked)}
                  />
                  {c.label}
                </label>
              </div>
            ))}
            <label className="block mt-1 font-normal">
              otras veces:{' '}
              <input
                type="text"
                value={umbral.otrasVeces}
                onChange={(e) => onFieldChange(umbral.otrasVecesPath, e.target.value)}
                className="border-b border-gray-400 w-full outline-none"
              />
            </label>
          </td>
          <td className="border border-black p-1 text-center align-middle">
            <input
              type="checkbox"
              checked={umbral.dxChecked}
              onChange={(e) => onCheckChange(umbral.dxPath, e.target.checked)}
            />
          </td>
          <td className="border border-black p-1 text-center align-middle">
            <input
              type="checkbox"
              checked={umbral.ixChecked}
              onChange={(e) => onCheckChange(umbral.ixPath, e.target.checked)}
            />
          </td>
        </tr>

        <tr>
          <td className="border border-black p-1">
            <div className="font-bold">MOLESTIAS LEVES</div>
            <div>episodios de molestias por debajo del umbral</div>
            <label className="block mt-1 font-normal">
              detalle:{' '}
              <input
                type="text"
                value={molestiasLeves.detalle}
                onChange={(e) => onFieldChange(molestiasLeves.detallePath, e.target.value)}
                className="border-b border-gray-400 w-full outline-none"
              />
            </label>
          </td>
          <td className="border border-black p-1 text-center align-middle">
            <input
              type="checkbox"
              checked={molestiasLeves.dxChecked}
              onChange={(e) => onCheckChange(molestiasLeves.dxPath, e.target.checked)}
            />
          </td>
          <td className="border border-black p-1 text-center align-middle">
            <input
              type="checkbox"
              checked={molestiasLeves.ixChecked}
              onChange={(e) => onCheckChange(molestiasLeves.ixPath, e.target.checked)}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function buildInfoItems<T extends object>(
  info: T,
  basePath: string,
  keys: (keyof T & string)[],
): InfoItem[] {
  return keys.map((key) => ({
    label: INFO_LABELS[key] ?? key,
    path: `${basePath}.${key}`,
    checked: Boolean(info[key]),
  }));
}

function buildCriteriosUmbralParestesia(
  u: UmbralPositivoParestesiaNocturna | UmbralPositivoParestesiaDiurna,
  basePath: string,
): CriterioUmbral[] {
  return [
    {
      label: 'molestia durante el sueño casi toda la noche.',
      dxPath: `${basePath}.molestiaSuenoCasiTodaNoche.dx`,
      dxChecked: u.molestiaSuenoCasiTodaNoche.dx,
    },
    {
      label: 'ocurrencia por lo menos en 1 semana en los últimos 3 meses',
      dxPath: `${basePath}.ocurrenciaUnaSemana3Meses.dx`,
      dxChecked: u.ocurrenciaUnaSemana3Meses.dx,
    },
    {
      label: 'ocurrencia una vez al mes',
      dxPath: `${basePath}.ocurrenciaUnaVezMes.dx`,
      dxChecked: u.ocurrenciaUnaVezMes.dx,
    },
  ];
}

export function EntrevistaOsteomuscularFormPag2() {
  const { idAtencion, state, setField } = useEntrevistaContext();
  const handleCheck = (path: string, value: boolean) => setField(path, value);
  const handleFieldChange = (path: string, value: string) => setField(path, value);

  const nocturna = state.parestesiaNocturna;
  const diurna = state.parestesiaDiurna;
  const cervical = state.molestiaCervicalIrradiada;
  const ausencia = state.ausenciaYTrastornos;

  const nocturnaInfoInicial = buildInfoItems(
    nocturna.infoReportada,
    'parestesiaNocturna.infoReportada',
    ['haTomadoMedicamentos'],
  );
  const nocturnaInfoRealizado = buildInfoItems(
    nocturna.infoReportada,
    'parestesiaNocturna.infoReportada',
    ['fisioterapia', 'visitaTraumatologiaMedicinaGeneral', 'rx', 'ecografiaRmn', 'emg'],
  );

  const diurnaInfoInicial = buildInfoItems(
    diurna.infoReportada,
    'parestesiaDiurna.infoReportada',
    ['haTomadoMedicamentos'],
  );
  const diurnaInfoRealizado = buildInfoItems(
    diurna.infoReportada,
    'parestesiaDiurna.infoReportada',
    ['fisioterapia', 'visitaTraumatologiaMedicinaGeneral', 'rx', 'ecografiaRmn', 'emg'],
  );

  const nocturnaFilas: FilaSintoma[] = [
    { label: 'brazo', dxPath: 'parestesiaNocturna.sintomas.brazo.dx', ixPath: 'parestesiaNocturna.sintomas.brazo.ix', dxChecked: nocturna.sintomas.brazo.dx, ixChecked: nocturna.sintomas.brazo.ix },
    { label: 'antebrazo', dxPath: 'parestesiaNocturna.sintomas.antebrazo.dx', ixPath: 'parestesiaNocturna.sintomas.antebrazo.ix', dxChecked: nocturna.sintomas.antebrazo.dx, ixChecked: nocturna.sintomas.antebrazo.ix },
    { label: 'mano', dxPath: 'parestesiaNocturna.sintomas.mano.dx', ixPath: 'parestesiaNocturna.sintomas.mano.ix', dxChecked: nocturna.sintomas.mano.dx, ixChecked: nocturna.sintomas.mano.ix },
    { label: 'Duración menor a 10 minutos.', dxPath: 'parestesiaNocturna.sintomas.duracionMenor10Min.dx', ixPath: 'parestesiaNocturna.sintomas.duracionMenor10Min.ix', dxChecked: nocturna.sintomas.duracionMenor10Min.dx, ixChecked: nocturna.sintomas.duracionMenor10Min.ix },
    { label: 'Duración mayor a 10 minutos.', dxPath: 'parestesiaNocturna.sintomas.duracionMayor10Min.dx', ixPath: 'parestesiaNocturna.sintomas.duracionMayor10Min.ix', dxChecked: nocturna.sintomas.duracionMayor10Min.dx, ixChecked: nocturna.sintomas.duracionMayor10Min.ix },
    { label: 'Presencia durante el sueño', dxPath: 'parestesiaNocturna.sintomas.presenciaDuranteSueno.dx', ixPath: 'parestesiaNocturna.sintomas.presenciaDuranteSueno.ix', dxChecked: nocturna.sintomas.presenciaDuranteSueno.dx, ixChecked: nocturna.sintomas.presenciaDuranteSueno.ix },
    { label: 'Aparición al despertar', dxPath: 'parestesiaNocturna.sintomas.aparicionAlDespertar.dx', ixPath: 'parestesiaNocturna.sintomas.aparicionAlDespertar.ix', dxChecked: nocturna.sintomas.aparicionAlDespertar.dx, ixChecked: nocturna.sintomas.aparicionAlDespertar.ix },
  ];

  const diurnaFilas: FilaSintoma[] = [
    { label: 'brazo', dxPath: 'parestesiaDiurna.sintomas.brazo.dx', ixPath: 'parestesiaDiurna.sintomas.brazo.ix', dxChecked: diurna.sintomas.brazo.dx, ixChecked: diurna.sintomas.brazo.ix },
    { label: 'antebrazo', dxPath: 'parestesiaDiurna.sintomas.antebrazo.dx', ixPath: 'parestesiaDiurna.sintomas.antebrazo.ix', dxChecked: diurna.sintomas.antebrazo.dx, ixChecked: diurna.sintomas.antebrazo.ix },
    { label: 'mano', dxPath: 'parestesiaDiurna.sintomas.mano.dx', ixPath: 'parestesiaDiurna.sintomas.mano.ix', dxChecked: diurna.sintomas.mano.dx, ixChecked: diurna.sintomas.mano.ix },
    { label: 'Duración menor a 10 minutos.', dxPath: 'parestesiaDiurna.sintomas.duracionMenor10Min.dx', ixPath: 'parestesiaDiurna.sintomas.duracionMenor10Min.ix', dxChecked: diurna.sintomas.duracionMenor10Min.dx, ixChecked: diurna.sintomas.duracionMenor10Min.ix },
    { label: 'Duración mayor a 10 minutos.', dxPath: 'parestesiaDiurna.sintomas.duracionMayor10Min.dx', ixPath: 'parestesiaDiurna.sintomas.duracionMayor10Min.ix', dxChecked: diurna.sintomas.duracionMayor10Min.dx, ixChecked: diurna.sintomas.duracionMayor10Min.ix },
    { label: 'Aparecen con los brazos levantados', dxPath: 'parestesiaDiurna.sintomas.aparecenBrazosLevantados.dx', ixPath: 'parestesiaDiurna.sintomas.aparecenBrazosLevantados.ix', dxChecked: diurna.sintomas.aparecenBrazosLevantados.dx, ixChecked: diurna.sintomas.aparecenBrazosLevantados.ix },
    { label: 'Aparecen cuando se apoya el codo', dxPath: 'parestesiaDiurna.sintomas.aparecenApoyaCodo.dx', ixPath: 'parestesiaDiurna.sintomas.aparecenApoyaCodo.ix', dxChecked: diurna.sintomas.aparecenApoyaCodo.dx, ixChecked: diurna.sintomas.aparecenApoyaCodo.ix },
    { label: 'Aparicio con la presencia de fuerza y/o durante la ejecución del trabajo.', dxPath: 'parestesiaDiurna.sintomas.aparicionFuerzaEjecucionTrabajo.dx', ixPath: 'parestesiaDiurna.sintomas.aparicionFuerzaEjecucionTrabajo.ix', dxChecked: diurna.sintomas.aparicionFuerzaEjecucionTrabajo.dx, ixChecked: diurna.sintomas.aparicionFuerzaEjecucionTrabajo.ix },
  ];

  const nocturnaUmbral: UmbralBlock = {
    dxPath: 'parestesiaNocturna.sintomas.umbralPositivo.dx',
    ixPath: 'parestesiaNocturna.sintomas.umbralPositivo.ix',
    dxChecked: nocturna.sintomas.umbralPositivo.dx,
    ixChecked: nocturna.sintomas.umbralPositivo.ix,
    otrasVecesPath: 'parestesiaNocturna.sintomas.umbralPositivo.otrasVeces',
    otrasVeces: nocturna.sintomas.umbralPositivo.otrasVeces,
    criterios: buildCriteriosUmbralParestesia(
      nocturna.sintomas.umbralPositivo,
      'parestesiaNocturna.sintomas.umbralPositivo',
    ),
  };

  const diurnaUmbral: UmbralBlock = {
    dxPath: 'parestesiaDiurna.sintomas.umbralPositivo.dx',
    ixPath: 'parestesiaDiurna.sintomas.umbralPositivo.ix',
    dxChecked: diurna.sintomas.umbralPositivo.dx,
    ixChecked: diurna.sintomas.umbralPositivo.ix,
    otrasVecesPath: 'parestesiaDiurna.sintomas.umbralPositivo.otrasVeces',
    otrasVeces: diurna.sintomas.umbralPositivo.otrasVeces,
    criterios: buildCriteriosUmbralParestesia(
      diurna.sintomas.umbralPositivo,
      'parestesiaDiurna.sintomas.umbralPositivo',
    ),
  };

  const nocturnaMolestiasLeves: MolestiasLevesBlock = {
    dxPath: 'parestesiaNocturna.sintomas.molestiasLeves.dx',
    ixPath: 'parestesiaNocturna.sintomas.molestiasLeves.ix',
    dxChecked: nocturna.sintomas.molestiasLeves.dx,
    ixChecked: nocturna.sintomas.molestiasLeves.ix,
    detallePath: 'parestesiaNocturna.sintomas.molestiasLeves.detalle',
    detalle: nocturna.sintomas.molestiasLeves.detalle,
  };

  const diurnaMolestiasLeves: MolestiasLevesBlock = {
    dxPath: 'parestesiaDiurna.sintomas.molestiasLeves.dx',
    ixPath: 'parestesiaDiurna.sintomas.molestiasLeves.ix',
    dxChecked: diurna.sintomas.molestiasLeves.dx,
    ixChecked: diurna.sintomas.molestiasLeves.ix,
    detallePath: 'parestesiaDiurna.sintomas.molestiasLeves.detalle',
    detalle: diurna.sintomas.molestiasLeves.detalle,
  };

  return (
    <div className="anamnesis-page min-h-screen bg-gray-100 py-6 text-[11px] leading-tight text-black">
      <form
        onSubmit={(e) => e.preventDefault()}
        className="max-w-[850px] mx-auto bg-white p-6 shadow-md border border-gray-300"
      >
        {/* LOGO ENCABEZADO */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <div className="flex flex-col">
              <span className="text-2xl font-black text-[#003366] tracking-tighter leading-none">
                JJC
              </span>
              <span className="text-[7px] text-gray-500 tracking-wider">
                INGENIERIA Y CONSTRUCCIÓN
              </span>
            </div>
            <div className="ml-2 flex items-center">
              <div className="w-0 h-0 border-y-[8px] border-y-transparent border-r-[12px] border-r-[#008080]" />
              <div className="w-0 h-0 border-y-[8px] border-y-transparent border-l-[12px] border-l-[#003366] -ml-1" />
            </div>
          </div>
        </div>

        {/* PARESTESIA NOCTURNA */}
        <ParestesiaTable
          titulo="PARESTESIA NOCTURNA"
          radioName="parestesiaNocturna.tieneParestesia"
          inicioTitulo="¿CUÁNDO SE INCIO LA MOLESTIA?:"
          variante="nocturna"
          imagenSrc="/assets/images/musculo/entrevista/manos.png"
          imagenAlt="Diagrama de manos"
          tieneParestesia={nocturna.tieneParestesia}
          onTieneParestesiaChange={(v) => setField('parestesiaNocturna.tieneParestesia', v)}
          inicioMolestia={nocturna.inicioMolestia}
          onInicioMolestiaChange={(v) => setField('parestesiaNocturna.inicioMolestia', v)}
          infoInicial={nocturnaInfoInicial}
          infoRealizado={nocturnaInfoRealizado}
          filas={nocturnaFilas}
          umbral={nocturnaUmbral}
          molestiasLeves={nocturnaMolestiasLeves}
          onCheckChange={handleCheck}
          onFieldChange={handleFieldChange}
          marcas={nocturna.areaDistribucionAnotaciones}
          onMarcasChange={(m) => setField('parestesiaNocturna.areaDistribucionAnotaciones', m)}
        />

        {/* PARESTESIA DIURNA */}
        <ParestesiaTable
          titulo="PARESTESIA DIURNA"
          radioName="parestesiaDiurna.tieneParestesia"
          inicioTitulo="¿CUÁNDO SE INCIO LA MOLESTIA? :"
          variante="diurna"
          imagenSrc="/assets/images/musculo/entrevista/cuerpo_torso.png"
          imagenAlt="Diagrama de torso"
          tieneParestesia={diurna.tieneParestesia}
          onTieneParestesiaChange={(v) => setField('parestesiaDiurna.tieneParestesia', v)}
          inicioMolestia={diurna.inicioMolestia}
          onInicioMolestiaChange={(v) => setField('parestesiaDiurna.inicioMolestia', v)}
          infoInicial={diurnaInfoInicial}
          infoRealizado={diurnaInfoRealizado}
          filas={diurnaFilas}
          umbral={diurnaUmbral}
          molestiasLeves={diurnaMolestiasLeves}
          onCheckChange={handleCheck}
          onFieldChange={handleFieldChange}
          marcas={diurna.areaDistribucionAnotaciones}
          onMarcasChange={(m) => setField('parestesiaDiurna.areaDistribucionAnotaciones', m)}
        />

        {/* MOLESTIA CERVICAL IRRADIADA */}
        <div className="border border-black mb-2 text-[11px]">
          <div className="bg-[#d9e1f2] border-b border-black p-1">
            <div className="font-bold text-[#b25900]">
              MOLESTIA CERVICAL IRRADIADA A LA EXTREMIDAD SUPERIOR.
              <span className="text-black font-normal ml-3">
                <label className="cursor-pointer mr-3">
                  <input
                    type="radio"
                    name="molestiaCervicalIrradiada.tieneMolestia"
                    checked={cervical.tieneMolestia}
                    onChange={() => setField('molestiaCervicalIrradiada.tieneMolestia', true)}
                  />{' '}
                  SI
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="molestiaCervicalIrradiada.tieneMolestia"
                    checked={!cervical.tieneMolestia}
                    onChange={() => setField('molestiaCervicalIrradiada.tieneMolestia', false)}
                  />{' '}
                  NO
                </label>
              </span>
            </div>
            <div className="text-[10px] mt-1">
              <strong>¿CUÁNDO SE INCIO LA MOLESTIA?</strong>{' '}
              <span className="text-[9px]">(años, meses, semanas o días) :</span>
              <input
                type="text"
                value={cervical.inicioMolestia}
                onChange={(e) => setField('molestiaCervicalIrradiada.inicioMolestia', e.target.value)}
                className="border-b border-gray-400 w-96 font-normal outline-none ml-1"
              />
            </div>
          </div>

          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className="border-b border-r border-black p-1 font-bold w-[75%]">
                  EXTREMIDAD SUPERIOR AFECTADA
                </td>
                <td className="border-b border-black p-1 text-center w-[25%]">
                  <label className="cursor-pointer mr-4">
                    <input
                      type="checkbox"
                      checked={cervical.extremidadAfectada.dx}
                      onChange={(e) =>
                        setField('molestiaCervicalIrradiada.extremidadAfectada.dx', e.target.checked)
                      }
                    />{' '}
                    Dx
                  </label>
                  <label className="cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cervical.extremidadAfectada.ix}
                      onChange={(e) =>
                        setField('molestiaCervicalIrradiada.extremidadAfectada.ix', e.target.checked)
                      }
                    />{' '}
                    Ix
                  </label>
                </td>
              </tr>
              <tr>
                <td className="border-r border-black p-1 font-bold align-top">
                  INICIAN O EMPEORAN ELEVANDO LAS EXTREMIDADES SUPERIORES
                  <div className="font-normal space-y-0.5 mt-1">
                    <div>
                      <label className="cursor-pointer">
                        <input
                          type="checkbox"
                          className="mr-1"
                          checked={cervical.frecuencia.presentandoCasiTodoDia}
                          onChange={(e) =>
                            setField(
                              'molestiaCervicalIrradiada.frecuencia.presentandoCasiTodoDia',
                              e.target.checked,
                            )
                          }
                        />{' '}
                        se está presentando casi todo el día.
                      </label>
                    </div>
                    <div>
                      <label className="cursor-pointer">
                        <input
                          type="checkbox"
                          className="mr-1"
                          checked={cervical.frecuencia.presenciaUnaSemana12Meses}
                          onChange={(e) =>
                            setField(
                              'molestiaCervicalIrradiada.frecuencia.presenciaUnaSemana12Meses',
                              e.target.checked,
                            )
                          }
                        />{' '}
                        presencia por lo menos en 1 semana en los últimos 12 meses
                      </label>
                    </div>
                    <div>
                      <label className="cursor-pointer">
                        <input
                          type="checkbox"
                          className="mr-1"
                          checked={cervical.frecuencia.presenciaUnDiaMes}
                          onChange={(e) =>
                            setField(
                              'molestiaCervicalIrradiada.frecuencia.presenciaUnDiaMes',
                              e.target.checked,
                            )
                          }
                        />{' '}
                        presencia por lo menos un día al mes
                      </label>
                    </div>
                  </div>
                </td>
                <td className="border-black p-1 text-center align-top">
                  <label className="cursor-pointer mr-3">
                    <input
                      type="radio"
                      name="molestiaCervicalIrradiada.inicianOEmpeoranElevandoExtremidades"
                      checked={cervical.inicianOEmpeoranElevandoExtremidades}
                      onChange={() =>
                        setField('molestiaCervicalIrradiada.inicianOEmpeoranElevandoExtremidades', true)
                      }
                    />{' '}
                    SI
                  </label>
                  <label className="cursor-pointer">
                    <input
                      type="radio"
                      name="molestiaCervicalIrradiada.inicianOEmpeoranElevandoExtremidades"
                      checked={!cervical.inicianOEmpeoranElevandoExtremidades}
                      onChange={() =>
                        setField('molestiaCervicalIrradiada.inicianOEmpeoranElevandoExtremidades', false)
                      }
                    />{' '}
                    NO
                  </label>
                  <label className="block mt-2 text-left font-normal">
                    otros momentos:
                    <textarea
                      value={cervical.otrosMomentos}
                      onChange={(e) =>
                        setField('molestiaCervicalIrradiada.otrosMomentos', e.target.value)
                      }
                      rows={2}
                      className="mt-1 w-full border border-gray-400 p-1 outline-none"
                    />
                  </label>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* AUSENCIA DEL TRABAJO Y TRASTORNOS */}
        <div className="border border-black p-1 font-bold text-[11px] bg-white">
          Ausencia del trabajo por trastornos/dolencias en extremidad superior
          <input
            type="number"
            min={0}
            value={ausencia.diasAusenciaExtremidadSuperior ?? ''}
            onChange={(e) =>
              setField(
                'ausenciaYTrastornos.diasAusenciaExtremidadSuperior',
                e.target.value ? Number(e.target.value) : null,
              )
            }
            className="border-b border-black w-24 text-center font-normal outline-none px-1"
          />{' '}
          días
        </div>

        <table className="w-full border-collapse border border-black text-[11px]">
          <thead>
            <tr className="bg-[#d9e1f2]">
              <td colSpan={3} className="border border-black p-1 font-bold text-[#b25900]">
                TRASTORNO - DIAGNÓSTICO (ya conocido)
                <span className="text-black font-normal ml-3">
                  <label className="cursor-pointer mr-3">
                    <input
                      type="radio"
                      name="ausenciaYTrastornos.tieneTrastornoDiagnosticado"
                      checked={ausencia.tieneTrastornoDiagnosticado}
                      onChange={() =>
                        setField('ausenciaYTrastornos.tieneTrastornoDiagnosticado', true)
                      }
                    />{' '}
                    SI
                  </label>
                  <label className="cursor-pointer">
                    <input
                      type="radio"
                      name="ausenciaYTrastornos.tieneTrastornoDiagnosticado"
                      checked={!ausencia.tieneTrastornoDiagnosticado}
                      onChange={() =>
                        setField('ausenciaYTrastornos.tieneTrastornoDiagnosticado', false)
                      }
                    />{' '}
                    NO
                  </label>
                </span>
              </td>
            </tr>
          </thead>
          <tbody>
            {DIAGNOSTICOS.map((d) => {
              const diag = ausencia.diagnosticos[d.key];
              return (
                <tr key={d.key}>
                  <td className="border border-black p-1 font-bold w-[55%]">
                    {d.label} <span className="font-normal">({d.sub})</span>
                  </td>
                  <td className="border border-black p-1 text-center w-[20%]">
                    <label className="cursor-pointer mr-2">
                      <input
                        type="radio"
                        name={`ausenciaYTrastornos.diagnosticos.${d.key}.tiene`}
                        checked={diag.tiene}
                        onChange={() =>
                          setField(`ausenciaYTrastornos.diagnosticos.${d.key}.tiene`, true)
                        }
                      />{' '}
                      SI
                    </label>
                    <label className="cursor-pointer">
                      <input
                        type="radio"
                        name={`ausenciaYTrastornos.diagnosticos.${d.key}.tiene`}
                        checked={!diag.tiene}
                        onChange={() =>
                          setField(`ausenciaYTrastornos.diagnosticos.${d.key}.tiene`, false)
                        }
                      />{' '}
                      NO
                    </label>
                  </td>
                  <td className="border border-black p-1 w-[25%] font-bold">
                    ¿CUÁNDO?{' '}
                    <input
                      type="text"
                      value={diag.cuando}
                      onChange={(e) =>
                        setField(
                          `ausenciaYTrastornos.diagnosticos.${d.key}.cuando`,
                          e.target.value,
                        )
                      }
                      className="border-b border-gray-400 font-normal outline-none w-28 ml-1"
                    />
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={3} className="border border-black p-1 font-bold text-[11px]">
                N ° TOTAL DE DÍAS DE ENFERMEDAD EN LOS ÚLTIMOS 12 MESES:
                <input
                  type="number"
                  min={0}
                  value={ausencia.totalDiasEnfermedad12Meses ?? ''}
                  onChange={(e) =>
                    setField(
                      'ausenciaYTrastornos.totalDiasEnfermedad12Meses',
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  className="border-b border-black w-24 text-center font-normal outline-none px-1 ml-2"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </form>

      <Paginacion
        paginaActual={2}
        baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/entrevista`}
      />
    </div>
  );
}
