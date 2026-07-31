'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { useEntrevistaContext } from '@/features/entrevista-osteomuscular/presentation/context/EntrevistaOsteomuscularContext';
import {
  ParestesiaCard,
  type ParestesiaRow,
  type UmbralBlock,
  type MolestiasLevesBlock,
} from './ParestesiaCard';
import { Paginacion } from './Paginacion';
import type { InfoReportadaItem } from './SectionCard';

const INFO_LABELS_PG2: Record<string, string> = {
  haTomadoMedicamentos: 'Medicamentos',
  fisioterapia: 'Fisioterapia',
  visitaOrtopedistaFisiatra: 'Ortopedista / Fisiatra',
  rx: 'RX',
  ecografiaRmn: 'Ecografía / RMN',
  emg: 'EMG',
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
    label: 'MANO/MUÑECA',
    sub: 'Síndrome del túnel carpiano, Síndrome del canal de Guyón',
  },
] as const;

function buildInfoItems<T>(
  obj: T,
  keys: (keyof T & string)[],
  basePath: string,
): InfoReportadaItem[] {
  return keys.map((key) => ({
    label: INFO_LABELS_PG2[key] ?? key,
    path: `${basePath}.${key}`,
    checked: (obj as Record<string, boolean>)[key],
  }));
}

export function EntrevistaOsteomuscularFormPag2() {
  const { idAtencion, atencion, state, setField, reset } = useEntrevistaContext();
  const router = useRouter();

  const handleCheck = (path: string, value: boolean) => setField(path, value);

  // ---- Info reportada ----

  const nocturnaInfo: InfoReportadaItem[] = useMemo(
    () =>
      buildInfoItems(
        state.parestesiaNocturna.infoReportada,
        ['haTomadoMedicamentos', 'fisioterapia', 'visitaOrtopedistaFisiatra', 'rx', 'ecografiaRmn', 'emg'],
        'parestesiaNocturna.infoReportada',
      ),
    [state.parestesiaNocturna.infoReportada],
  );

  const diurnaInfo: InfoReportadaItem[] = useMemo(
    () =>
      buildInfoItems(
        state.parestesiaDiurna.infoReportada,
        ['haTomadoMedicamentos', 'fisioterapia', 'visitaOrtopedistaFisiatra', 'rx', 'ecografiaRmn', 'emg'],
        'parestesiaDiurna.infoReportada',
      ),
    [state.parestesiaDiurna.infoReportada],
  );

  // ---- Filas de síntomas ----

  const nocturnaRows: ParestesiaRow[] = useMemo(() => {
    const s = state.parestesiaNocturna.sintomas;
    const p = 'parestesiaNocturna.sintomas';
    return [
      { label: 'Brazo', dxPath: `${p}.brazo.dx`, ixPath: `${p}.brazo.ix`, dxChecked: s.brazo.dx, ixChecked: s.brazo.ix },
      { label: 'Antebrazo', dxPath: `${p}.antebrazo.dx`, ixPath: `${p}.antebrazo.ix`, dxChecked: s.antebrazo.dx, ixChecked: s.antebrazo.ix },
      { label: 'Mano', dxPath: `${p}.mano.dx`, ixPath: `${p}.mano.ix`, dxChecked: s.mano.dx, ixChecked: s.mano.ix },
      { label: 'Duración menor a 10 minutos', dxPath: `${p}.duracionMenor10Min.dx`, ixPath: `${p}.duracionMenor10Min.ix`, dxChecked: s.duracionMenor10Min.dx, ixChecked: s.duracionMenor10Min.ix },
      { label: 'Duración mayor a 10 minutos', dxPath: `${p}.duracionMayor10Min.dx`, ixPath: `${p}.duracionMayor10Min.ix`, dxChecked: s.duracionMayor10Min.dx, ixChecked: s.duracionMayor10Min.ix },
      { label: 'Presencia durante el sueño', dxPath: `${p}.presenciaDuranteSueno.dx`, ixPath: `${p}.presenciaDuranteSueno.ix`, dxChecked: s.presenciaDuranteSueno.dx, ixChecked: s.presenciaDuranteSueno.ix },
      { label: 'Aparición al despertar', dxPath: `${p}.aparicionAlDespertar.dx`, ixPath: `${p}.aparicionAlDespertar.ix`, dxChecked: s.aparicionAlDespertar.dx, ixChecked: s.aparicionAlDespertar.ix },
    ];
  }, [state.parestesiaNocturna.sintomas]);

  const diurnaRows: ParestesiaRow[] = useMemo(() => {
    const s = state.parestesiaDiurna.sintomas;
    const p = 'parestesiaDiurna.sintomas';
    return [
      { label: 'Brazo', dxPath: `${p}.brazo.dx`, ixPath: `${p}.brazo.ix`, dxChecked: s.brazo.dx, ixChecked: s.brazo.ix },
      { label: 'Antebrazo', dxPath: `${p}.antebrazo.dx`, ixPath: `${p}.antebrazo.ix`, dxChecked: s.antebrazo.dx, ixChecked: s.antebrazo.ix },
      { label: 'Mano', dxPath: `${p}.mano.dx`, ixPath: `${p}.mano.ix`, dxChecked: s.mano.dx, ixChecked: s.mano.ix },
      { label: 'Duración menor a 10 minutos', dxPath: `${p}.duracionMenor10Min.dx`, ixPath: `${p}.duracionMenor10Min.ix`, dxChecked: s.duracionMenor10Min.dx, ixChecked: s.duracionMenor10Min.ix },
      { label: 'Duración mayor a 10 minutos', dxPath: `${p}.duracionMayor10Min.dx`, ixPath: `${p}.duracionMayor10Min.ix`, dxChecked: s.duracionMayor10Min.dx, ixChecked: s.duracionMayor10Min.ix },
      { label: 'Aparecen con los brazos levantados', dxPath: `${p}.aparecenBrazosLevantados.dx`, ixPath: `${p}.aparecenBrazosLevantados.ix`, dxChecked: s.aparecenBrazosLevantados.dx, ixChecked: s.aparecenBrazosLevantados.ix },
      { label: 'Aparecen cuando se apoya el codo', dxPath: `${p}.aparecenApoyaCodo.dx`, ixPath: `${p}.aparecenApoyaCodo.ix`, dxChecked: s.aparecenApoyaCodo.dx, ixChecked: s.aparecenApoyaCodo.ix },
      { label: 'Aparición con la presencia de fuerza y/o durante la ejecución del trabajo', dxPath: `${p}.aparicionFuerzaEjecucionTrabajo.dx`, ixPath: `${p}.aparicionFuerzaEjecucionTrabajo.ix`, dxChecked: s.aparicionFuerzaEjecucionTrabajo.dx, ixChecked: s.aparicionFuerzaEjecucionTrabajo.ix },
    ];
  }, [state.parestesiaDiurna.sintomas]);

  // ---- Umbral positivo ----

  const nocturnaUmbral: UmbralBlock = useMemo(() => {
    const u = state.parestesiaNocturna.sintomas.umbralPositivo;
    const p = 'parestesiaNocturna.sintomas.umbralPositivo';
    return {
      criterios: [
        { label: 'molestia durante el sueño casi toda la noche.', path: `${p}.molestiaSuenoCasiTodaNoche.dx`, ixPath: `${p}.molestiaSuenoCasiTodaNoche.ix`, checked: u.molestiaSuenoCasiTodaNoche.dx, ixChecked: u.molestiaSuenoCasiTodaNoche.ix },
        { label: 'ocurrencia por lo menos en 1 semana en los últimos 12 meses', path: `${p}.ocurrenciaUnaSemana12Meses.dx`, ixPath: `${p}.ocurrenciaUnaSemana12Meses.ix`, checked: u.ocurrenciaUnaSemana12Meses.dx, ixChecked: u.ocurrenciaUnaSemana12Meses.ix },
        { label: 'ocurrencia una vez al mes', path: `${p}.ocurrenciaUnaVezMes.dx`, ixPath: `${p}.ocurrenciaUnaVezMes.ix`, checked: u.ocurrenciaUnaVezMes.dx, ixChecked: u.ocurrenciaUnaVezMes.ix },
      ],
    };
  }, [state.parestesiaNocturna.sintomas.umbralPositivo]);

  const diurnaUmbral: UmbralBlock = useMemo(() => {
    const u = state.parestesiaDiurna.sintomas.umbralPositivo;
    const p = 'parestesiaDiurna.sintomas.umbralPositivo';
    return {
      criterios: [
        { label: 'molestia casi todos los días.', path: `${p}.molestiaCasiTodosDias.dx`, ixPath: `${p}.molestiaCasiTodosDias.ix`, checked: u.molestiaCasiTodosDias.dx, ixChecked: u.molestiaCasiTodosDias.ix },
        { label: 'ocurrencia por lo menos en 1 semana en los últimos 12 meses', path: `${p}.ocurrenciaUnaSemana12Meses.dx`, ixPath: `${p}.ocurrenciaUnaSemana12Meses.ix`, checked: u.ocurrenciaUnaSemana12Meses.dx, ixChecked: u.ocurrenciaUnaSemana12Meses.ix },
        { label: 'ocurrencia por lo menos un día al mes', path: `${p}.ocurrenciaUnDiaMes.dx`, ixPath: `${p}.ocurrenciaUnDiaMes.ix`, checked: u.ocurrenciaUnDiaMes.dx, ixChecked: u.ocurrenciaUnDiaMes.ix },
      ],
    };
  }, [state.parestesiaDiurna.sintomas.umbralPositivo]);

  // ---- Molestias leves ----

  const nocturnaMolestiasLeves: MolestiasLevesBlock = {
    dxPath: 'parestesiaNocturna.sintomas.molestiasLeves.dx',
    ixPath: 'parestesiaNocturna.sintomas.molestiasLeves.ix',
    dxChecked: state.parestesiaNocturna.sintomas.molestiasLeves.dx,
    ixChecked: state.parestesiaNocturna.sintomas.molestiasLeves.ix,
  };

  const diurnaMolestiasLeves: MolestiasLevesBlock = {
    dxPath: 'parestesiaDiurna.sintomas.molestiasLeves.dx',
    ixPath: 'parestesiaDiurna.sintomas.molestiasLeves.ix',
    dxChecked: state.parestesiaDiurna.sintomas.molestiasLeves.dx,
    ixChecked: state.parestesiaDiurna.sintomas.molestiasLeves.ix,
  };

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
            II.- PARESTESIA Y TRASTORNOS DE LA EXTREMIDAD SUPERIOR
          </h2>
        </div>

        {/* PARESTESIA NOCTURNA */}
        <ParestesiaCard
          titulo="PARESTESIA NOCTURNA"
          tieneParestesia={state.parestesiaNocturna.tieneParestesia}
          onTieneParestesiaChange={(v) => setField('parestesiaNocturna.tieneParestesia', v)}
          inicioMolestia={state.parestesiaNocturna.inicioMolestia}
          onInicioMolestiaChange={(v) => setField('parestesiaNocturna.inicioMolestia', v)}
          infoReportada={nocturnaInfo}
          rows={nocturnaRows}
          umbral={nocturnaUmbral}
          molestiasLeves={nocturnaMolestiasLeves}
          onCheckChange={handleCheck}
        />

        {/* PARESTESIA DIURNA */}
        <ParestesiaCard
          titulo="PARESTESIA DIURNA"
          tieneParestesia={state.parestesiaDiurna.tieneParestesia}
          onTieneParestesiaChange={(v) => setField('parestesiaDiurna.tieneParestesia', v)}
          inicioMolestia={state.parestesiaDiurna.inicioMolestia}
          onInicioMolestiaChange={(v) => setField('parestesiaDiurna.inicioMolestia', v)}
          infoReportada={diurnaInfo}
          rows={diurnaRows}
          umbral={diurnaUmbral}
          molestiasLeves={diurnaMolestiasLeves}
          onCheckChange={handleCheck}
        />

        {/* MOLESTIA CERVICAL IRRADIADA */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-4">
            <h4 className="text-lg font-semibold text-sky-700">
              MOLESTIA CERVICAL IRRADIADA A LA EXTREMIDAD SUPERIOR
            </h4>
            <div className="flex items-center gap-3">
              <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  className="mr-1.5 text-sky-600"
                  checked={state.molestiaCervicalIrradiada.tieneMolestia}
                  onChange={() => setField('molestiaCervicalIrradiada.tieneMolestia', true)}
                />
                SI
              </label>
              <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  className="mr-1.5 text-sky-600"
                  checked={!state.molestiaCervicalIrradiada.tieneMolestia}
                  onChange={() => setField('molestiaCervicalIrradiada.tieneMolestia', false)}
                />
                NO
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  ¿CUÁNDO SE INICIÓ LA MOLESTIA?
                </label>
                <input
                  type="text"
                  value={state.molestiaCervicalIrradiada.inicioMolestia}
                  onChange={(e) => setField('molestiaCervicalIrradiada.inicioMolestia', e.target.value)}
                  className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm transition-all focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="(años, meses, semanas o días)"
                />
              </div>
              <div>
                <p className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  EXTREMIDAD SUPERIOR AFECTADA
                </p>
                <div className="flex gap-6">
                  <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mr-1.5 rounded text-sky-600"
                      checked={state.molestiaCervicalIrradiada.extremidadAfectada.dx}
                      onChange={(e) => setField('molestiaCervicalIrradiada.extremidadAfectada.dx', e.target.checked)}
                    />
                    Dx
                  </label>
                  <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mr-1.5 rounded text-sky-600"
                      checked={state.molestiaCervicalIrradiada.extremidadAfectada.ix}
                      onChange={(e) => setField('molestiaCervicalIrradiada.extremidadAfectada.ix', e.target.checked)}
                    />
                    Ix
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  ¿INICIAN O EMPEORAN ELEVANDO LAS EXTREMIDADES SUPERIORES?
                </p>
                <div className="flex gap-6">
                  <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      className="mr-1.5 text-sky-600"
                      checked={state.molestiaCervicalIrradiada.inicianOEmpeoranElevandoExtremidades}
                      onChange={() => setField('molestiaCervicalIrradiada.inicianOEmpeoranElevandoExtremidades', true)}
                    />
                    SI
                  </label>
                  <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      className="mr-1.5 text-sky-600"
                      checked={!state.molestiaCervicalIrradiada.inicianOEmpeoranElevandoExtremidades}
                      onChange={() => setField('molestiaCervicalIrradiada.inicianOEmpeoranElevandoExtremidades', false)}
                    />
                    NO
                  </label>
                </div>
              </div>
              <div>
                <p className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  FRECUENCIA DE OCURRENCIA
                </p>
                <div className="space-y-2">
                  <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mr-2 rounded text-sky-600"
                      checked={state.molestiaCervicalIrradiada.frecuencia.presentandoCasiTodoDia}
                      onChange={(e) => setField('molestiaCervicalIrradiada.frecuencia.presentandoCasiTodoDia', e.target.checked)}
                    />
                    se está presentando casi todo el día
                  </label>
                  <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mr-2 rounded text-sky-600"
                      checked={state.molestiaCervicalIrradiada.frecuencia.presenciaUnaSemana12Meses}
                      onChange={(e) => setField('molestiaCervicalIrradiada.frecuencia.presenciaUnaSemana12Meses', e.target.checked)}
                    />
                    presencia por lo menos en 1 semana en los últimos 12 meses
                  </label>
                  <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mr-2 rounded text-sky-600"
                      checked={state.molestiaCervicalIrradiada.frecuencia.presenciaUnDiaMes}
                      onChange={(e) => setField('molestiaCervicalIrradiada.frecuencia.presenciaUnDiaMes', e.target.checked)}
                    />
                    presencia por lo menos un día al mes
                  </label>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* AUSENCIA DEL TRABAJO Y TRASTORNOS */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="text-lg font-semibold text-sky-700">
              AUSENCIA DEL TRABAJO Y TRASTORNOS
            </h3>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  DÍAS DE AUSENCIA POR TRASTORNOS EN EXTREMIDAD SUPERIOR
                </label>
                <input
                  type="number"
                  min={0}
                  value={state.ausenciaYTrastornos.diasAusenciaExtremidadSuperior ?? ''}
                  onChange={(e) =>
                    setField(
                      'ausenciaYTrastornos.diasAusenciaExtremidadSuperior',
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm transition-all focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="0"
                />
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Trastorno - Diagnóstico (ya conocido)
                </p>
                <div className="flex items-center gap-3">
                  <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      className="mr-1.5 text-sky-600"
                      checked={state.ausenciaYTrastornos.tieneTrastornoDiagnosticado}
                      onChange={() => setField('ausenciaYTrastornos.tieneTrastornoDiagnosticado', true)}
                    />
                    SI
                  </label>
                  <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      className="mr-1.5 text-sky-600"
                      checked={!state.ausenciaYTrastornos.tieneTrastornoDiagnosticado}
                      onChange={() => setField('ausenciaYTrastornos.tieneTrastornoDiagnosticado', false)}
                    />
                    NO
                  </label>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="p-3">ZONA / PATOLOGÍA</th>
                    <th className="p-3 text-center w-16">SI</th>
                    <th className="p-3 text-center w-16">NO</th>
                    <th className="p-3">¿CUÁNDO?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {DIAGNOSTICOS.map((d) => {
                    const diag = state.ausenciaYTrastornos.diagnosticos[d.key];
                    return (
                      <tr key={d.key}>
                        <td className="p-3 font-medium text-sm text-slate-800">
                          {d.label}{' '}
                          <span className="font-normal text-slate-500">({d.sub})</span>
                        </td>
                        <td className="p-3 text-center">
                          <input
                            type="radio"
                            name={`diagnostico-${d.key}`}
                            className="text-sky-600"
                            checked={diag.tiene}
                            onChange={() =>
                              setField(`ausenciaYTrastornos.diagnosticos.${d.key}.tiene`, true)
                            }
                          />
                        </td>
                        <td className="p-3 text-center">
                          <input
                            type="radio"
                            name={`diagnostico-${d.key}`}
                            className="text-sky-600"
                            checked={!diag.tiene}
                            onChange={() =>
                              setField(`ausenciaYTrastornos.diagnosticos.${d.key}.tiene`, false)
                            }
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={diag.cuando}
                            onChange={(e) =>
                              setField(`ausenciaYTrastornos.diagnosticos.${d.key}.cuando`, e.target.value)
                            }
                            className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                            placeholder="Especifique..."
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-sky-50 p-4 rounded-xl border border-sky-200">
              <label className="font-bold text-sky-700 uppercase text-sm">
                N° TOTAL DE DÍAS DE ENFERMEDAD EN LOS ÚLTIMOS 12 MESES
              </label>
              <input
                type="number"
                min={0}
                value={state.ausenciaYTrastornos.totalDiasEnfermedad12Meses ?? ''}
                onChange={(e) =>
                  setField(
                    'ausenciaYTrastornos.totalDiasEnfermedad12Meses',
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                className="w-32 h-12 text-center text-xl font-bold border-2 border-sky-300 rounded-lg text-sky-700 focus:ring-4 focus:ring-sky-100 transition-all outline-none"
                placeholder="0"
              />
            </div>
          </div>
        </section>

        {/* Footer legend */}
        <div className="text-xs font-semibold text-slate-500">
          Dx.= Derecho &nbsp;&nbsp;&nbsp; Ix.= Izquierdo
        </div>

        {/* Paginación */}
        <Paginacion
          totalPaginas={2}
          paginaActual={2}
          onChange={(pagina) => {
            if (pagina === 1) {
              router.push(`/areas/musculoesqueletica/jjc/${idAtencion}/entrevista`);
            }
          }}
        />

        {/* Action Footer */}
        <div className="flex justify-end gap-4 border-t border-slate-200 pt-8">
          <button
            type="button"
            onClick={() => reset(atencion)}
            className="px-6 py-2 border border-sky-600 text-sky-600 font-medium rounded-lg hover:bg-sky-50 transition-all text-sm cursor-pointer"
          >
            Cancelar y Borrar
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-sky-600 text-white font-medium rounded-lg hover:bg-sky-700 shadow-md transition-all active:scale-95 text-sm cursor-pointer"
          >
            Guardar Registro de Evaluación
          </button>
        </div>
      </form>
    </div>
  );
}
