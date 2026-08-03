'use client';

import { useEntrevistaContext } from '@/features/entrevista-osteomuscular/presentation/context/EntrevistaOsteomuscularContext';
import { Paginacion } from './Paginacion';
import type { UmbralPositivo } from '@/types/entrevista-osteomuscular';

const INFO_LABELS: Record<string, string> = {
  haTomadoMedicamentos: 'ha tomado medicamentos',
  fisioterapia: 'fisioterapia',
  visitaOrtopedistaFisiatra: 'visita al ortopedista / fisiatra',
  rx: 'RX',
  ecografiaResonancia: 'ECOGRAFÍA / RESONANCIA',
  emg: 'EMG (electromiografía)',
};

const TIPO_EXAMEN_LABELS: Record<string, string> = {
  ingreso: 'Ingreso',
  periodico: 'Periódico',
  retiro: 'Retiro',
  otro: 'Otro',
};

interface InfoItem {
  label: string;
  path: string;
  checked: boolean;
}

interface CriterioUmbral {
  label: string;
  dxPath: string;
  ixPath: string;
  dxChecked: boolean;
  ixChecked: boolean;
}

type Fila =
  | {
      tipo: 'sintoma';
      label: string;
      dxPath: string;
      ixPath: string;
      dxChecked: boolean;
      ixChecked: boolean;
    }
  | { tipo: 'umbral'; criterios: CriterioUmbral[] }
  | {
      tipo: 'molestias';
      dxPath: string;
      ixPath: string;
      dxChecked: boolean;
      ixChecked: boolean;
    };

interface SeccionAnamnesisProps {
  titulo: string;
  radioName: string;
  esMano?: boolean;
  imagenLabel: string;
  inicioMolestia: string;
  onInicioMolestiaChange: (value: string) => void;
  tieneDolor: boolean;
  onTieneDolorChange: (value: boolean) => void;
  infoInicial: InfoItem[];
  infoRealizado: InfoItem[];
  filas: Fila[];
  onCheckChange: (path: string, value: boolean) => void;
}

function SeccionAnamnesis({
  titulo,
  radioName,
  esMano = false,
  imagenLabel,
  inicioMolestia,
  onInicioMolestiaChange,
  tieneDolor,
  onTieneDolorChange,
  infoInicial,
  infoRealizado,
  filas,
  onCheckChange,
}: SeccionAnamnesisProps) {
  const rowSpan = filas.length;

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
                  value="NO"
                  className="mr-0.5 align-middle"
                  checked={!tieneDolor}
                  onChange={() => onTieneDolorChange(false)}
                />
                NO
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name={radioName}
                  value="SI"
                  className="mr-0.5 align-middle"
                  checked={tieneDolor}
                  onChange={() => onTieneDolorChange(true)}
                />
                SI
              </label>
            </span>
          </td>
          <td className="border border-black p-1 text-[10px]">
            <strong>¿CUÁNDO SE INCIO LA MOLESTIA?:</strong>
            <input
              type="text"
              value={inicioMolestia}
              onChange={(e) => onInicioMolestiaChange(e.target.value)}
              className="w-full border-b border-gray-400 mt-0.5 px-1 font-normal text-xs"
              placeholder="(años, meses, semanas o días)"
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
                <td
                  rowSpan={rowSpan}
                  className={`border border-black p-2 text-center align-middle ${
                    esMano ? 'text-left align-top' : ''
                  }`}
                >
                  {esMano ? (
                    <>
                      <div className="text-[9px] font-bold leading-tight mb-2">
                        N: Indicar sobre la figura el área de distribución de la molestia
                      </div>
                      <div className="h-36 flex items-center justify-center text-gray-400 italic text-[10px]">
                        {imagenLabel}
                      </div>
                      <div className="flex justify-between font-bold px-2 text-[10px] mt-1">
                        <span>Ix</span>
                        <span>DX</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between font-bold px-2 text-[10px]">
                        <span>Dx</span>
                        <span>Ix</span>
                      </div>
                      <div className="h-28 flex items-center justify-center text-gray-400 italic text-[10px]">
                        {imagenLabel}
                      </div>
                    </>
                  )}
                </td>
                <td rowSpan={rowSpan} className="border border-black p-1 align-top space-y-1">
                  <div className="font-bold leading-snug">
                    Información reportada sobre la molestia:{' '}
                    <span className="font-normal">(marcar x)</span>
                  </div>
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
                  <div className="font-bold mt-1">
                    ha realizado: <span className="font-normal">(marcar x)</span>
                  </div>
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

          if (fila.tipo === 'sintoma') {
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
          }

          if (fila.tipo === 'umbral') {
            const allDx = fila.criterios.every((c) => c.dxChecked);
            const allIx = fila.criterios.every((c) => c.ixChecked);

            return (
              <tr key={idx}>
                {celdasRowSpan}
                <td className="border border-black p-1 space-y-0.5">
                  <div className="font-bold">
                    UMBRAL POSITIVO <span className="font-normal">(marcar x)</span>
                  </div>
                  {fila.criterios.map((c) => (
                    <div key={c.dxPath}>
                      <label className="cursor-pointer">
                        <input
                          type="checkbox"
                          className="mr-1"
                          checked={c.dxChecked || c.ixChecked}
                          onChange={(e) => {
                            onCheckChange(c.dxPath, e.target.checked);
                            onCheckChange(c.ixPath, e.target.checked);
                          }}
                        />
                        {c.label}
                      </label>
                    </div>
                  ))}
                </td>
                <td className="border border-black p-1 text-center align-middle">
                  <input
                    type="checkbox"
                    checked={allDx}
                    onChange={(e) =>
                      fila.criterios.forEach((c) => onCheckChange(c.dxPath, e.target.checked))
                    }
                  />
                </td>
                <td className="border border-black p-1 text-center align-middle">
                  <input
                    type="checkbox"
                    checked={allIx}
                    onChange={(e) =>
                      fila.criterios.forEach((c) => onCheckChange(c.ixPath, e.target.checked))
                    }
                  />
                </td>
              </tr>
            );
          }

          return (
            <tr key={idx}>
              {celdasRowSpan}
              <td className="border border-black p-1">
                <div className="font-bold">MOLESTIAS LEVES</div>
                <div>episodios de molestias por debajo del umbral</div>
              </td>
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

function buildCriteriosUmbral(umbral: UmbralPositivo, basePath: string): CriterioUmbral[] {
  const criterios: Array<{ label: string; key: keyof UmbralPositivo }> = [
    { label: 'dolor continuo', key: 'dolorContinuo' },
    { label: 'al menos 1 semana de dolor en los últimos 12 meses', key: 'unaSemanaDolor12Meses' },
    { label: 'al menos 1 vez al mes en los últimos 12 meses', key: 'unaVezMes12Meses' },
  ];

  return criterios.map((c) => {
    const item = umbral[c.key];
    return {
      label: c.label,
      dxPath: `${basePath}.umbralPositivo.${c.key}.dx`,
      ixPath: `${basePath}.umbralPositivo.${c.key}.ix`,
      dxChecked: item.dx,
      ixChecked: item.ix,
    };
  });
}

export function EntrevistaOsteomuscularForm() {
  const { idAtencion, state, setField } = useEntrevistaContext();
  const handleCheck = (path: string, value: boolean) => setField(path, value);

  const hombro = state.miembrosSuperiores.hombro;
  const codo = state.miembrosSuperiores.codo;
  const mano = state.miembrosSuperiores.manoMuneca;

  const hombroInfoInicial = buildInfoItems(hombro.infoReportada, 'miembrosSuperiores.hombro.infoReportada', [
    'haTomadoMedicamentos',
  ]);
  const hombroInfoRealizado = buildInfoItems(
    hombro.infoReportada,
    'miembrosSuperiores.hombro.infoReportada',
    ['fisioterapia', 'visitaOrtopedistaFisiatra', 'rx', 'ecografiaResonancia'],
  );

  const codoInfoInicial = buildInfoItems(codo.infoReportada, 'miembrosSuperiores.codo.infoReportada', [
    'haTomadoMedicamentos',
  ]);
  const codoInfoRealizado = buildInfoItems(codo.infoReportada, 'miembrosSuperiores.codo.infoReportada', [
    'fisioterapia',
    'visitaOrtopedistaFisiatra',
    'rx',
    'ecografiaResonancia',
    'emg',
  ]);

  const manoInfoInicial = buildInfoItems(mano.infoReportada, 'miembrosSuperiores.manoMuneca.infoReportada', [
    'haTomadoMedicamentos',
  ]);
  const manoInfoRealizado = buildInfoItems(
    mano.infoReportada,
    'miembrosSuperiores.manoMuneca.infoReportada',
    ['fisioterapia', 'visitaOrtopedistaFisiatra', 'rx', 'ecografiaResonancia', 'emg'],
  );

  const hombroFilas: Fila[] = [
    {
      tipo: 'sintoma',
      label: 'Dolor al movimiento',
      dxPath: 'miembrosSuperiores.hombro.sintomas.dolorMovimiento.dx',
      ixPath: 'miembrosSuperiores.hombro.sintomas.dolorMovimiento.ix',
      dxChecked: hombro.sintomas.dolorMovimiento.dx,
      ixChecked: hombro.sintomas.dolorMovimiento.ix,
    },
    {
      tipo: 'sintoma',
      label: 'Dolor en reposo',
      dxPath: 'miembrosSuperiores.hombro.sintomas.dolorReposo.dx',
      ixPath: 'miembrosSuperiores.hombro.sintomas.dolorReposo.ix',
      dxChecked: hombro.sintomas.dolorReposo.dx,
      ixChecked: hombro.sintomas.dolorReposo.ix,
    },
    {
      tipo: 'umbral',
      criterios: buildCriteriosUmbral(hombro.sintomas.umbralPositivo, 'miembrosSuperiores.hombro.sintomas'),
    },
    {
      tipo: 'molestias',
      dxPath: 'miembrosSuperiores.hombro.sintomas.molestiasLeves.dx',
      ixPath: 'miembrosSuperiores.hombro.sintomas.molestiasLeves.ix',
      dxChecked: hombro.sintomas.molestiasLeves.dx,
      ixChecked: hombro.sintomas.molestiasLeves.ix,
    },
  ];

  const codoFilas: Fila[] = [
    {
      tipo: 'sintoma',
      label: 'Dolor al agarrar objetos o al soportar peso',
      dxPath: 'miembrosSuperiores.codo.sintomas.dolorAgarrarSoportarPeso.dx',
      ixPath: 'miembrosSuperiores.codo.sintomas.dolorAgarrarSoportarPeso.ix',
      dxChecked: codo.sintomas.dolorAgarrarSoportarPeso.dx,
      ixChecked: codo.sintomas.dolorAgarrarSoportarPeso.ix,
    },
    {
      tipo: 'sintoma',
      label: 'Dolor en reposo',
      dxPath: 'miembrosSuperiores.codo.sintomas.dolorReposo.dx',
      ixPath: 'miembrosSuperiores.codo.sintomas.dolorReposo.ix',
      dxChecked: codo.sintomas.dolorReposo.dx,
      ixChecked: codo.sintomas.dolorReposo.ix,
    },
    {
      tipo: 'umbral',
      criterios: buildCriteriosUmbral(codo.sintomas.umbralPositivo, 'miembrosSuperiores.codo.sintomas'),
    },
    {
      tipo: 'molestias',
      dxPath: 'miembrosSuperiores.codo.sintomas.molestiasLeves.dx',
      ixPath: 'miembrosSuperiores.codo.sintomas.molestiasLeves.ix',
      dxChecked: codo.sintomas.molestiasLeves.dx,
      ixChecked: codo.sintomas.molestiasLeves.ix,
    },
  ];

  const manoFilas: Fila[] = [
    {
      tipo: 'sintoma',
      label: 'Dolor al agarrar o al presionar',
      dxPath: 'miembrosSuperiores.manoMuneca.sintomas.dolorAgarrarPresionar.dx',
      ixPath: 'miembrosSuperiores.manoMuneca.sintomas.dolorAgarrarPresionar.ix',
      dxChecked: mano.sintomas.dolorAgarrarPresionar.dx,
      ixChecked: mano.sintomas.dolorAgarrarPresionar.ix,
    },
    {
      tipo: 'sintoma',
      label: 'Dolor al movimiento',
      dxPath: 'miembrosSuperiores.manoMuneca.sintomas.dolorMovimiento.dx',
      ixPath: 'miembrosSuperiores.manoMuneca.sintomas.dolorMovimiento.ix',
      dxChecked: mano.sintomas.dolorMovimiento.dx,
      ixChecked: mano.sintomas.dolorMovimiento.ix,
    },
    {
      tipo: 'sintoma',
      label: 'Dolor en reposo',
      dxPath: 'miembrosSuperiores.manoMuneca.sintomas.dolorReposo.dx',
      ixPath: 'miembrosSuperiores.manoMuneca.sintomas.dolorReposo.ix',
      dxChecked: mano.sintomas.dolorReposo.dx,
      ixChecked: mano.sintomas.dolorReposo.ix,
    },
    {
      tipo: 'sintoma',
      label: 'Dolor en un dedo',
      dxPath: 'miembrosSuperiores.manoMuneca.sintomas.dolorUnDedo.dx',
      ixPath: 'miembrosSuperiores.manoMuneca.sintomas.dolorUnDedo.ix',
      dxChecked: mano.sintomas.dolorUnDedo.dx,
      ixChecked: mano.sintomas.dolorUnDedo.ix,
    },
    {
      tipo: 'sintoma',
      label: 'Dolor en tres dedos',
      dxPath: 'miembrosSuperiores.manoMuneca.sintomas.dolorTresDedos.dx',
      ixPath: 'miembrosSuperiores.manoMuneca.sintomas.dolorTresDedos.ix',
      dxChecked: mano.sintomas.dolorTresDedos.dx,
      ixChecked: mano.sintomas.dolorTresDedos.ix,
    },
    {
      tipo: 'sintoma',
      label: 'Dolor en la palma',
      dxPath: 'miembrosSuperiores.manoMuneca.sintomas.dolorPalma.dx',
      ixPath: 'miembrosSuperiores.manoMuneca.sintomas.dolorPalma.ix',
      dxChecked: mano.sintomas.dolorPalma.dx,
      ixChecked: mano.sintomas.dolorPalma.ix,
    },
    {
      tipo: 'sintoma',
      label: 'Dolor en el dorso',
      dxPath: 'miembrosSuperiores.manoMuneca.sintomas.dolorDorso.dx',
      ixPath: 'miembrosSuperiores.manoMuneca.sintomas.dolorDorso.ix',
      dxChecked: mano.sintomas.dolorDorso.dx,
      ixChecked: mano.sintomas.dolorDorso.ix,
    },
    {
      tipo: 'umbral',
      criterios: buildCriteriosUmbral(
        mano.sintomas.umbralPositivo,
        'miembrosSuperiores.manoMuneca.sintomas',
      ),
    },
    {
      tipo: 'molestias',
      dxPath: 'miembrosSuperiores.manoMuneca.sintomas.molestiasLeves.dx',
      ixPath: 'miembrosSuperiores.manoMuneca.sintomas.molestiasLeves.ix',
      dxChecked: mano.sintomas.molestiasLeves.dx,
      ixChecked: mano.sintomas.molestiasLeves.ix,
    },
  ];

  return (
    <div className="anamnesis-page min-h-screen bg-gray-100 py-6 text-[11px] leading-tight text-black">
      <form
        onSubmit={(e) => e.preventDefault()}
        className="max-w-[850px] mx-auto bg-white p-6 shadow-md border border-gray-300"
      >
        {/* LOGO Y ENCABEZADO */}
        <div className="flex items-center justify-between mb-2">
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

        {/* TÍTULO AZUL */}
        <div className="bg-[#0070c0] text-white font-bold text-center py-1.5 text-sm uppercase tracking-wide mb-3">
          ENTREVISTA DE CUESTIONARIO ANAMNÉSICO OSTEMUSCULAR
        </div>

        {/* FECHA DE ENTREVISTA */}
        <div className="flex justify-center items-center mb-3 font-bold">
          <label htmlFor="fechaEntrevista" className="mr-2">
            Fecha de entrevista
          </label>
          <input
            type="date"
            id="fechaEntrevista"
            value={state.datosGenerales.fechaEntrevista}
            onChange={(e) => setField('datosGenerales.fechaEntrevista', e.target.value)}
            className="border-b border-black w-60 px-2 py-0.5 font-normal"
          />
        </div>

        {/* TABLA DATOS GENERALES */}
        <table className="w-full border-collapse border border-black mb-3 text-[11px]">
          <tbody>
            <tr>
              <td className="border border-black p-1 w-1/2">
                <strong className="mr-1">Empresa:</strong>
                <input
                  type="text"
                  value={state.datosGenerales.empresa}
                  onChange={(e) => setField('datosGenerales.empresa', e.target.value)}
                  className="w-[80%] px-1"
                  placeholder="Ingrese empresa"
                />
              </td>
              <td className="border border-black p-1 w-1/2">
                <strong className="mr-1">Área:</strong>
                <input
                  type="text"
                  value={state.datosGenerales.area}
                  onChange={(e) => setField('datosGenerales.area', e.target.value)}
                  className="w-[85%] px-1"
                  placeholder="Ingrese área"
                />
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="border border-black p-1">
                <strong className="mr-1">Nombre y apellidos:</strong>
                <input
                  type="text"
                  value={state.datosGenerales.nombreApellidos}
                  onChange={(e) => setField('datosGenerales.nombreApellidos', e.target.value)}
                  className="w-[85%] px-1"
                  placeholder="Nombre completo del trabajador"
                />
              </td>
            </tr>
            <tr>
              <td className="border border-black p-1">
                <strong className="mr-1">Fecha de nacimiento:</strong>
                <input
                  type="date"
                  value={state.datosGenerales.fechaNacimiento}
                  onChange={(e) => setField('datosGenerales.fechaNacimiento', e.target.value)}
                  className="px-1"
                />
              </td>
              <td className="border border-black p-1">
                <div className="flex items-center space-x-6">
                  <div>
                    <strong className="mr-1">Edad:</strong>
                    <input
                      type="number"
                      value={state.datosGenerales.edad ?? ''}
                      onChange={(e) =>
                        setField(
                          'datosGenerales.edad',
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      className="w-12 border-b border-gray-400 text-center"
                      min={18}
                      max={99}
                    />
                  </div>
                  <div>
                    <strong className="mr-1">Sexo:</strong>
                    <select
                      value={state.datosGenerales.sexo}
                      onChange={(e) => setField('datosGenerales.sexo', e.target.value)}
                      className="border-b border-gray-400 px-1"
                    >
                      <option value="">-</option>
                      <option value="M">M</option>
                      <option value="F">F</option>
                    </select>
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td className="border border-black p-1">
                <strong className="mr-1">Antigüedad en la empresa:</strong>
                <input
                  type="text"
                  value={state.datosGenerales.antiguedadEmpresa}
                  onChange={(e) => setField('datosGenerales.antiguedadEmpresa', e.target.value)}
                  className="w-[50%] px-1"
                  placeholder="Ej. 2 años"
                />
              </td>
              <td className="border border-black p-1">
                <strong className="mr-1">Antigüedad en el puesto:</strong>
                <input
                  type="text"
                  value={state.datosGenerales.antiguedadPuesto}
                  onChange={(e) => setField('datosGenerales.antiguedadPuesto', e.target.value)}
                  className="w-[50%] px-1"
                  placeholder="Ej. 6 meses"
                />
              </td>
            </tr>
            <tr>
              <td className="border border-black p-1">
                <strong>Miembro superior dominante:</strong>
                <span className="ml-2">
                  <label className="cursor-pointer mr-2">
                    <input
                      type="checkbox"
                      className="mr-0.5"
                      checked={state.datosGenerales.miembroDominante.dx}
                      onChange={(e) =>
                        setField('datosGenerales.miembroDominante.dx', e.target.checked)
                      }
                    />{' '}
                    Dx
                  </label>
                  <label className="cursor-pointer">
                    <input
                      type="checkbox"
                      className="mr-0.5"
                      checked={state.datosGenerales.miembroDominante.ix}
                      onChange={(e) =>
                        setField('datosGenerales.miembroDominante.ix', e.target.checked)
                      }
                    />{' '}
                    Ix
                  </label>
                </span>
              </td>
              <td className="border border-black p-1">
                <strong>Exam.</strong>
                {(['ingreso', 'periodico', 'retiro', 'otro'] as const).map((tipo) => (
                  <label key={tipo} className="cursor-pointer ml-1">
                    <input
                      type="checkbox"
                      checked={state.datosGenerales.tipoExamen[tipo]}
                      onChange={(e) =>
                        setField(`datosGenerales.tipoExamen.${tipo}`, e.target.checked)
                      }
                    />{' '}
                    {TIPO_EXAMEN_LABELS[tipo]}
                  </label>
                ))}
              </td>
            </tr>
          </tbody>
        </table>

        {/* SECCIÓN I TÍTULO */}
        <div className="font-bold text-[11px] mb-1">
          I.- MIEMBROS SUPERIORES{' '}
          <span className="font-normal text-[10px]">
            (SINTOMATOLOGÍA DOLOROSA ARTICULAR E INDAGACIÓN POR SEGMENTO EN LOS ÚLTIMOS 12 MESES)
          </span>
        </div>

        {/* HOMBRO */}
        <SeccionAnamnesis
          titulo="DOLOR EN EL HOMBRO"
          radioName="dolorHombro"
          imagenLabel="[Imagen Hombro]"
          inicioMolestia={hombro.inicioMolestia}
          onInicioMolestiaChange={(v) => setField('miembrosSuperiores.hombro.inicioMolestia', v)}
          tieneDolor={hombro.tieneDolor}
          onTieneDolorChange={(v) => setField('miembrosSuperiores.hombro.tieneDolor', v)}
          infoInicial={hombroInfoInicial}
          infoRealizado={hombroInfoRealizado}
          filas={hombroFilas}
          onCheckChange={handleCheck}
        />

        {/* CODO */}
        <SeccionAnamnesis
          titulo="DOLOR EN EL CODO"
          radioName="dolorCodo"
          imagenLabel="[Imagen Codo]"
          inicioMolestia={codo.inicioMolestia}
          onInicioMolestiaChange={(v) => setField('miembrosSuperiores.codo.inicioMolestia', v)}
          tieneDolor={codo.tieneDolor}
          onTieneDolorChange={(v) => setField('miembrosSuperiores.codo.tieneDolor', v)}
          infoInicial={codoInfoInicial}
          infoRealizado={codoInfoRealizado}
          filas={codoFilas}
          onCheckChange={handleCheck}
        />

        {/* MANO / MUÑECA */}
        <SeccionAnamnesis
          titulo="DOLOR MANO/MUÑECA"
          radioName="dolorMano"
          esMano
          imagenLabel="[Imagen Manos]"
          inicioMolestia={mano.inicioMolestia}
          onInicioMolestiaChange={(v) => setField('miembrosSuperiores.manoMuneca.inicioMolestia', v)}
          tieneDolor={mano.tieneDolor}
          onTieneDolorChange={(v) => setField('miembrosSuperiores.manoMuneca.tieneDolor', v)}
          infoInicial={manoInfoInicial}
          infoRealizado={manoInfoRealizado}
          filas={manoFilas}
          onCheckChange={handleCheck}
        />

        {/* PIE DE PÁGINA */}
        <div className="flex justify-between items-center mt-3">
          <div className="text-[11px] font-bold">
            Dx.= Derecho &nbsp;&nbsp;&nbsp; Ix.= Izquierdo
          </div>
        </div>
      </form>

      <Paginacion
        paginaActual={1}
        baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/entrevista`}
      />
    </div>
  );
}
