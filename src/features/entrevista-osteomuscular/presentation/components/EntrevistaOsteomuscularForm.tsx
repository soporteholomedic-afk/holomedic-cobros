'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { useEntrevistaContext } from '@/features/entrevista-osteomuscular/presentation/context/EntrevistaOsteomuscularContext';
import { SectionCard, type TableRow, type InfoReportadaItem } from './SectionCard';
import { Paginacion } from './Paginacion';

const INFO_LABELS: Record<string, string> = {
  haTomadoMedicamentos: 'Medicamentos',
  fisioterapia: 'Fisioterapia',
  visitaOrtopedistaFisiatra: 'Ortopedista / Fisiatra',
  rx: 'RX',
  ecografiaResonancia: 'Ecografía / Resonancia',
  emg: 'EMG',
};

function buildInfoItems<T>(
  obj: T,
  keys: (keyof T & string)[],
  basePath: string,
): InfoReportadaItem[] {
  return keys.map((key) => ({
    label: INFO_LABELS[key] ?? key,
    path: `${basePath}.${key}`,
    checked: (obj as Record<string, boolean>)[key],
  }));
}

export function EntrevistaOsteomuscularForm() {
  const { idAtencion, atencion, state, setField, reset } = useEntrevistaContext();

  const handleCheck = (path: string, value: boolean) => setField(path, value);

  // ---- Info reportada per section ----

  const hombroInfo: InfoReportadaItem[] = useMemo(
    () =>
      buildInfoItems(
        state.miembrosSuperiores.hombro.infoReportada,
        ['haTomadoMedicamentos', 'fisioterapia', 'visitaOrtopedistaFisiatra', 'rx', 'ecografiaResonancia'],
        'miembrosSuperiores.hombro.infoReportada',
      ),
    [state.miembrosSuperiores.hombro.infoReportada],
  );

  const codoInfo: InfoReportadaItem[] = useMemo(
    () =>
      buildInfoItems(
        state.miembrosSuperiores.codo.infoReportada,
        ['haTomadoMedicamentos', 'fisioterapia', 'visitaOrtopedistaFisiatra', 'rx', 'ecografiaResonancia', 'emg'],
        'miembrosSuperiores.codo.infoReportada',
      ),
    [state.miembrosSuperiores.codo.infoReportada],
  );

  const manoInfo: InfoReportadaItem[] = useMemo(
    () =>
      buildInfoItems(
        state.miembrosSuperiores.manoMuneca.infoReportada,
        ['haTomadoMedicamentos', 'fisioterapia', 'visitaOrtopedistaFisiatra', 'rx', 'ecografiaResonancia', 'emg'],
        'miembrosSuperiores.manoMuneca.infoReportada',
      ),
    [state.miembrosSuperiores.manoMuneca.infoReportada],
  );

  // ---- Sintoma rows per section ----

  const hombroRows: TableRow[] = useMemo(() => {
    const s = state.miembrosSuperiores.hombro.sintomas;
    const p = 'miembrosSuperiores.hombro.sintomas';
    return [
      { kind: 'row' as const, label: 'Dolor al movimiento', dxPath: `${p}.dolorMovimiento.dx`, ixPath: `${p}.dolorMovimiento.ix`, dxChecked: s.dolorMovimiento.dx, ixChecked: s.dolorMovimiento.ix },
      { kind: 'row' as const, label: 'Dolor en reposo', dxPath: `${p}.dolorReposo.dx`, ixPath: `${p}.dolorReposo.ix`, dxChecked: s.dolorReposo.dx, ixChecked: s.dolorReposo.ix },
      { kind: 'group-label' as const, label: 'Umbral doloroso positivo' },
      { kind: 'row' as const, label: '  • Dolor continuo', dxPath: `${p}.umbralPositivo.dolorContinuo.dx`, ixPath: `${p}.umbralPositivo.dolorContinuo.ix`, dxChecked: s.umbralPositivo.dolorContinuo.dx, ixChecked: s.umbralPositivo.dolorContinuo.ix, isSubItem: true },
      { kind: 'row' as const, label: '  • Al menos 1 semana de dolor en los últimos 12 meses', dxPath: `${p}.umbralPositivo.unaSemanaDolor12Meses.dx`, ixPath: `${p}.umbralPositivo.unaSemanaDolor12Meses.ix`, dxChecked: s.umbralPositivo.unaSemanaDolor12Meses.dx, ixChecked: s.umbralPositivo.unaSemanaDolor12Meses.ix, isSubItem: true },
      { kind: 'row' as const, label: '  • Al menos 1 vez al mes en los últimos 12 meses', dxPath: `${p}.umbralPositivo.unaVezMes12Meses.dx`, ixPath: `${p}.umbralPositivo.unaVezMes12Meses.ix`, dxChecked: s.umbralPositivo.unaVezMes12Meses.dx, ixChecked: s.umbralPositivo.unaVezMes12Meses.ix, isSubItem: true },
      { kind: 'row' as const, label: 'Molestias leves esporádicas', dxPath: `${p}.molestiasLeves.dx`, ixPath: `${p}.molestiasLeves.ix`, dxChecked: s.molestiasLeves.dx, ixChecked: s.molestiasLeves.ix },
    ];
  }, [state.miembrosSuperiores.hombro.sintomas]);

  const codoRows: TableRow[] = useMemo(() => {
    const s = state.miembrosSuperiores.codo.sintomas;
    const p = 'miembrosSuperiores.codo.sintomas';
    return [
      { kind: 'row' as const, label: 'Dolor al agarrar o pesar', dxPath: `${p}.dolorAgarrarSoportarPeso.dx`, ixPath: `${p}.dolorAgarrarSoportarPeso.ix`, dxChecked: s.dolorAgarrarSoportarPeso.dx, ixChecked: s.dolorAgarrarSoportarPeso.ix },
      { kind: 'row' as const, label: 'Dolor en reposo', dxPath: `${p}.dolorReposo.dx`, ixPath: `${p}.dolorReposo.ix`, dxChecked: s.dolorReposo.dx, ixChecked: s.dolorReposo.ix },
      { kind: 'group-label' as const, label: 'Umbral doloroso positivo' },
      { kind: 'row' as const, label: '  • Dolor continuo', dxPath: `${p}.umbralPositivo.dolorContinuo.dx`, ixPath: `${p}.umbralPositivo.dolorContinuo.ix`, dxChecked: s.umbralPositivo.dolorContinuo.dx, ixChecked: s.umbralPositivo.dolorContinuo.ix, isSubItem: true },
      { kind: 'row' as const, label: '  • Al menos 1 semana de dolor en los últimos 12 meses', dxPath: `${p}.umbralPositivo.unaSemanaDolor12Meses.dx`, ixPath: `${p}.umbralPositivo.unaSemanaDolor12Meses.ix`, dxChecked: s.umbralPositivo.unaSemanaDolor12Meses.dx, ixChecked: s.umbralPositivo.unaSemanaDolor12Meses.ix, isSubItem: true },
      { kind: 'row' as const, label: '  • Al menos 1 vez al mes en los últimos 12 meses', dxPath: `${p}.umbralPositivo.unaVezMes12Meses.dx`, ixPath: `${p}.umbralPositivo.unaVezMes12Meses.ix`, dxChecked: s.umbralPositivo.unaVezMes12Meses.dx, ixChecked: s.umbralPositivo.unaVezMes12Meses.ix, isSubItem: true },
      { kind: 'row' as const, label: 'Molestias leves esporádicas', dxPath: `${p}.molestiasLeves.dx`, ixPath: `${p}.molestiasLeves.ix`, dxChecked: s.molestiasLeves.dx, ixChecked: s.molestiasLeves.ix },
    ];
  }, [state.miembrosSuperiores.codo.sintomas]);

  const manoRows: TableRow[] = useMemo(() => {
    const s = state.miembrosSuperiores.manoMuneca.sintomas;
    const p = 'miembrosSuperiores.manoMuneca.sintomas';
    return [
      { kind: 'row' as const, label: 'Dolor al agarrar o pinza', dxPath: `${p}.dolorAgarrarPresionar.dx`, ixPath: `${p}.dolorAgarrarPresionar.ix`, dxChecked: s.dolorAgarrarPresionar.dx, ixChecked: s.dolorAgarrarPresionar.ix },
      { kind: 'row' as const, label: 'Dolor al movimiento articular', dxPath: `${p}.dolorMovimiento.dx`, ixPath: `${p}.dolorMovimiento.ix`, dxChecked: s.dolorMovimiento.dx, ixChecked: s.dolorMovimiento.ix },
      { kind: 'row' as const, label: 'Dolor en reposo', dxPath: `${p}.dolorReposo.dx`, ixPath: `${p}.dolorReposo.ix`, dxChecked: s.dolorReposo.dx, ixChecked: s.dolorReposo.ix },
      { kind: 'row' as const, label: 'Molestia en 1er dedo', dxPath: `${p}.dolorUnDedo.dx`, ixPath: `${p}.dolorUnDedo.ix`, dxChecked: s.dolorUnDedo.dx, ixChecked: s.dolorUnDedo.ix },
      { kind: 'row' as const, label: 'Molestia en 3 primeros dedos', dxPath: `${p}.dolorTresDedos.dx`, ixPath: `${p}.dolorTresDedos.ix`, dxChecked: s.dolorTresDedos.dx, ixChecked: s.dolorTresDedos.ix },
      { kind: 'row' as const, label: 'Molestia en Palma', dxPath: `${p}.dolorPalma.dx`, ixPath: `${p}.dolorPalma.ix`, dxChecked: s.dolorPalma.dx, ixChecked: s.dolorPalma.ix },
      { kind: 'row' as const, label: 'Molestia en Dorso', dxPath: `${p}.dolorDorso.dx`, ixPath: `${p}.dolorDorso.ix`, dxChecked: s.dolorDorso.dx, ixChecked: s.dolorDorso.ix },
      { kind: 'group-label' as const, label: 'Umbral doloroso positivo' },
      { kind: 'row' as const, label: '  • Dolor continuo', dxPath: `${p}.umbralPositivo.dolorContinuo.dx`, ixPath: `${p}.umbralPositivo.dolorContinuo.ix`, dxChecked: s.umbralPositivo.dolorContinuo.dx, ixChecked: s.umbralPositivo.dolorContinuo.ix, isSubItem: true },
      { kind: 'row' as const, label: '  • Al menos 1 semana de dolor en los últimos 12 meses', dxPath: `${p}.umbralPositivo.unaSemanaDolor12Meses.dx`, ixPath: `${p}.umbralPositivo.unaSemanaDolor12Meses.ix`, dxChecked: s.umbralPositivo.unaSemanaDolor12Meses.dx, ixChecked: s.umbralPositivo.unaSemanaDolor12Meses.ix, isSubItem: true },
      { kind: 'row' as const, label: '  • Al menos 1 vez al mes en los últimos 12 meses', dxPath: `${p}.umbralPositivo.unaVezMes12Meses.dx`, ixPath: `${p}.umbralPositivo.unaVezMes12Meses.ix`, dxChecked: s.umbralPositivo.unaVezMes12Meses.dx, ixChecked: s.umbralPositivo.unaVezMes12Meses.ix, isSubItem: true },
      { kind: 'row' as const, label: 'Molestias leves esporádicas', dxPath: `${p}.molestiasLeves.dx`, ixPath: `${p}.molestiasLeves.ix`, dxChecked: s.molestiasLeves.dx, ixChecked: s.molestiasLeves.ix },
    ];
  }, [state.miembrosSuperiores.manoMuneca.sintomas]);

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
        {/* Datos Generales */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-4">
            <h3 className="text-lg font-semibold text-sky-700 flex items-center gap-2">
              Datos Generales
            </h3>
            <span className="text-xs font-semibold px-3 py-1 bg-sky-50 rounded text-sky-700">
              ID: {idAtencion}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                FECHA DE ENTREVISTA
              </label>
              <input
                type="date"
                value={state.datosGenerales.fechaEntrevista}
                onChange={(e) => setField('datosGenerales.fechaEntrevista', e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm transition-all focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                EMPRESA
              </label>
              <input
                type="text"
                value={state.datosGenerales.empresa}
                onChange={(e) => setField('datosGenerales.empresa', e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm transition-all focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="Nombre empresa"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                ÁREA
              </label>
              <input
                type="text"
                value={state.datosGenerales.area}
                onChange={(e) => setField('datosGenerales.area', e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm transition-all focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="Departamento"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                TIPO DE EXAMEN
              </label>
              <div className="flex flex-wrap gap-3 mt-2">
                {(['ingreso', 'periodico', 'retiro', 'otro'] as const).map((tipo) => (
                  <label key={tipo} className="flex items-center text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mr-1.5 rounded text-sky-600"
                      checked={state.datosGenerales.tipoExamen[tipo]}
                      onChange={(e) => setField(`datosGenerales.tipoExamen.${tipo}`, e.target.checked)}
                    />
                    {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                NOMBRE Y APELLIDOS
              </label>
              <input
                type="text"
                value={state.datosGenerales.nombreApellidos}
                onChange={(e) => setField('datosGenerales.nombreApellidos', e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm transition-all focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="Nombre completo del paciente"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                FECHA DE NACIMIENTO
              </label>
              <input
                type="date"
                value={state.datosGenerales.fechaNacimiento}
                onChange={(e) => setField('datosGenerales.fechaNacimiento', e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm transition-all focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                EDAD
              </label>
              <input
                type="number"
                value={state.datosGenerales.edad ?? ''}
                onChange={(e) => setField('datosGenerales.edad', e.target.value ? Number(e.target.value) : null)}
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm transition-all focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                SEXO
              </label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="sexo"
                    className="mr-1.5 text-sky-600"
                    checked={state.datosGenerales.sexo === 'M'}
                    onChange={() => setField('datosGenerales.sexo', 'M')}
                  />
                  M
                </label>
                <label className="flex items-center text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="sexo"
                    className="mr-1.5 text-sky-600"
                    checked={state.datosGenerales.sexo === 'F'}
                    onChange={() => setField('datosGenerales.sexo', 'F')}
                  />
                  F
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                ANTIGÜEDAD PUESTO (Meses)
              </label>
              <input
                type="text"
                value={state.datosGenerales.antiguedadPuesto}
                onChange={(e) => setField('datosGenerales.antiguedadPuesto', e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm transition-all focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                ANTIGÜEDAD EMPRESA (Meses)
              </label>
              <input
                type="text"
                value={state.datosGenerales.antiguedadEmpresa}
                onChange={(e) => setField('datosGenerales.antiguedadEmpresa', e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm transition-all focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                MIEMBRO DOMINANTE
              </label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center text-sm text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    className="mr-1.5 rounded text-sky-600"
                    checked={state.datosGenerales.miembroDominante.dx}
                    onChange={(e) => setField('datosGenerales.miembroDominante.dx', e.target.checked)}
                  />
                  Dx
                </label>
                <label className="flex items-center text-sm text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    className="mr-1.5 rounded text-sky-600"
                    checked={state.datosGenerales.miembroDominante.ix}
                    onChange={(e) => setField('datosGenerales.miembroDominante.ix', e.target.checked)}
                  />
                  Ix
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* Título sección I */}
        <div>
          <h2 className="text-base font-bold text-slate-800">
            I.- MIEMBROS SUPERIORES{' '}
            <span className="font-normal text-sm text-slate-500">
              (SINTOMATOLOGÍA DOLOROSA ARTICULAR E INDAGACIÓN POR SEGMENTO EN LOS ÚLTIMOS 12 MESES)
            </span>
          </h2>
        </div>

        {/* HOMBRO */}
        <SectionCard
          titulo="HOMBRO"
          tieneDolor={state.miembrosSuperiores.hombro.tieneDolor}
          onTieneDolorChange={(v) => setField('miembrosSuperiores.hombro.tieneDolor', v)}
          inicioMolestia={state.miembrosSuperiores.hombro.inicioMolestia}
          onInicioMolestiaChange={(v) => setField('miembrosSuperiores.hombro.inicioMolestia', v)}
          infoReportada={hombroInfo}
          rows={hombroRows}
          onCheckChange={handleCheck}
          observaciones={state.miembrosSuperiores.hombro.observaciones}
          onObservacionesChange={(v) => setField('miembrosSuperiores.hombro.observaciones', v)}
        />

        {/* CODO */}
        <SectionCard
          titulo="CODO"
          tieneDolor={state.miembrosSuperiores.codo.tieneDolor}
          onTieneDolorChange={(v) => setField('miembrosSuperiores.codo.tieneDolor', v)}
          inicioMolestia={state.miembrosSuperiores.codo.inicioMolestia}
          onInicioMolestiaChange={(v) => setField('miembrosSuperiores.codo.inicioMolestia', v)}
          infoReportada={codoInfo}
          rows={codoRows}
          onCheckChange={handleCheck}
          observaciones={state.miembrosSuperiores.codo.observaciones}
          onObservacionesChange={(v) => setField('miembrosSuperiores.codo.observaciones', v)}
        />

        {/* MANO / MUÑECA */}
        {/* PENDIENTE: areaDistribucionAnotaciones */}
        <SectionCard
          titulo="MANO / MUÑECA"
          tieneDolor={state.miembrosSuperiores.manoMuneca.tieneDolor}
          onTieneDolorChange={(v) => setField('miembrosSuperiores.manoMuneca.tieneDolor', v)}
          inicioMolestia={state.miembrosSuperiores.manoMuneca.inicioMolestia}
          onInicioMolestiaChange={(v) => setField('miembrosSuperiores.manoMuneca.inicioMolestia', v)}
          infoReportada={manoInfo}
          rows={manoRows}
          onCheckChange={handleCheck}
          observaciones={state.miembrosSuperiores.manoMuneca.observaciones}
          onObservacionesChange={(v) => setField('miembrosSuperiores.manoMuneca.observaciones', v)}
        />

        {/* Footer legend */}
        <div className="text-xs font-semibold text-slate-500">
          Dx.= Derecho &nbsp;&nbsp;&nbsp; Ix.= Izquierdo
        </div>

        {/* Paginación */}
        <Paginacion
          totalPaginas={3}
          paginaActual={1}
          baseUrl={`/areas/musculoesqueletica/jjc/${idAtencion}/entrevista`}
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
