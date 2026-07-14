'use client';

import { Suspense, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CompanySelector } from '@/features/envio-resultados/presentation/components/CompanySelector';
import {
  ConsolidadosViewSwitch,
  type ConsolidadosView,
} from '@/features/envio-resultados/presentation/components/ConsolidadosViewSwitch';
import { PatientsList } from '@/features/envio-resultados/presentation/components/PatientsList';
import { getLocalDateString, parseDateParam } from '@/lib/dates';
import type { SpResultRow, OrderRow, UnifiedPerson, UnifiedFicha } from '@/types/sp-result';

import { FilesModal } from '@/features/envio-resultados/presentation/components/FilesModal';
import { normalizeDni } from '@/lib/normalize-dni';

import { useCompanies } from '@/features/envio-resultados/presentation/hooks/useCompanies';
import { EmailEditor } from '@/features/envio-resultados/presentation/components/EmailEditor';
import {
  emailViewDataFromFiles,
  type EmailViewData,
} from '@/features/envio-resultados/presentation/helpers/emailViewDataFromFiles';
import type { FileNode } from '@/features/envio-resultados/domain/ports';

function normalizeFecAte(raw: string | undefined): string {
  if (!raw) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function ConsolidadosContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const today = getLocalDateString();
  const [fechaInicio, setFechaInicio] = useState(() =>
    parseDateParam(searchParams.get('fechaInicio'), today),
  );
  const [fechaFin, setFechaFin] = useState(() =>
    parseDateParam(searchParams.get('fechaFin'), today),
  );
  const [view, setView] = useState<ConsolidadosView>('pacientes');

  // Modal and loading states
  const [modalState, setModalState] = useState<{
    ruc: string;
    dni: string;
    idAten: string;
    nombrePaciente: string;
    empresa: string;
    proyecto: string;
    fecAte?: string;
  } | null>(null);
  const [loadingPatientId, setLoadingPatientId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { companies } = useCompanies();
  const [emailViewData, setEmailViewData] = useState<EmailViewData | null>(null);

  const isInvalidRange =
    fechaInicio.length > 0 &&
    fechaFin.length > 0 &&
    fechaInicio > fechaFin;

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalidRange) return;
    const params = new URLSearchParams();
    if (fechaInicio) params.set('fechaInicio', fechaInicio);
    if (fechaFin) params.set('fechaFin', fechaFin);
    const queryString = params.toString();
    router.push(queryString ? `/consolidados?${queryString}` : '/consolidados');
  };

  const handleCompanySelect = (companyName: string) => {
    const params = new URLSearchParams({
      companyName,
      fechaInicio,
      fechaFin,
    });
    router.push(`/consolidados/envio-resultados?${params.toString()}`);
  };

  const handleViewFiles = async (row: SpResultRow) => {
    setErrorMessage(null);
    setLoadingPatientId(row.NroDId);

    try {
      const resultsParams = new URLSearchParams();
      resultsParams.set('companyName', row.NomCom);
      if (fechaInicio) resultsParams.set('fechaInicio', fechaInicio);
      if (fechaFin) resultsParams.set('fechaFin', fechaFin);

      const res = await fetch(`/api/consolidados/results_by_companies?${resultsParams.toString()}`);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const orders = (await res.json()) as OrderRow[];
      const normalizedRowDni = normalizeDni(row.NroDId);
      const normalizedRowFec = normalizeFecAte(row.FecAte);

      // Find order matching DNI and FecAte (date)
      let matchingOrder = orders.find(
        (o) => normalizeDni(o.NroDId) === normalizedRowDni && normalizeFecAte(o.FecAte) === normalizedRowFec
      );

      // Fallback: match DNI only
      if (!matchingOrder) {
        matchingOrder = orders.find((o) => normalizeDni(o.NroDId) === normalizedRowDni);
      }

      if (matchingOrder) {
        setModalState({
          ruc: matchingOrder.NroRuc,
          dni: normalizedRowDni,
          idAten: matchingOrder.IdAten,
          nombrePaciente: row.Pacien,
          empresa: row.NomCom,
          proyecto: row.DesDes,
          fecAte: normalizeFecAte(matchingOrder.FecAte),
        });
      } else {
        setErrorMessage(
          `No se encontró una orden de atención para el paciente ${row.Pacien} (DNI ${row.NroDId}) en la empresa ${row.NomCom}.`
        );
      }
    } catch (error) {
      console.error('Error fetching patient order details:', error);
      setErrorMessage('Ocurrió un error al buscar los archivos del paciente. Intente nuevamente.');
    } finally {
      setLoadingPatientId(null);
    }
  };

  const closeFilesModal = () => {
    setModalState(null);
  };

  const handleSendFromModal = useCallback(
    (selected: ReadonlyMap<string, FileNode>): void => {
      if (!modalState) return;

      const person: UnifiedPerson = {
        dni: modalState.dni,
        nombre: modalState.nombrePaciente,
        empresa: modalState.empresa,
        tipoExamen: '',
        proyecto: modalState.proyecto,
        condic: '',
        fichas: [],
      };

      const ficha: UnifiedFicha = {
        idAten: modalState.idAten,
        nroRuc: modalState.ruc,
        nomCFa: '',
        proyecto: modalState.proyecto,
        tipoExamen: '',
        condic: '',
        fecAte: modalState.fecAte ?? '',
      };

      const companyId = companies.find((c) => c.name === modalState.empresa)?.id ?? '';
      const refs = Array.from(selected.keys());
      const files = Array.from(selected.values());

      setEmailViewData(
        emailViewDataFromFiles(
          person,
          ficha,
          files,
          refs,
          companyId,
          modalState.empresa,
        ),
      );
      setModalState(null);
    },
    [modalState, companies],
  );

  const returnToTable = useCallback((): void => {
    setEmailViewData(null);
  }, []);


  return (
    <div className="flex flex-col gap-6">
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between shadow-sm">
          <p className="text-sm font-medium text-rose-800">{errorMessage}</p>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs font-semibold text-rose-500 hover:text-rose-700 bg-rose-100 hover:bg-rose-200 px-2 py-1 rounded-lg transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Date filter — lifted to page so both views share dates */}
      <form
        onSubmit={handleFilter}
        className="flex flex-col sm:flex-row gap-4 items-end p-4 bg-white rounded-xl border border-slate-200 shadow-sm"
      >
        <div className="flex-1 w-full">
          <label
            htmlFor="fechaInicio"
            className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
          >
            Fecha Inicio
          </label>
          <input
            type="date"
            id="fechaInicio"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700"
          />
        </div>
        <div className="flex-1 w-full">
          <label
            htmlFor="fechaFin"
            className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
          >
            Fecha Fin
          </label>
          <input
            type="date"
            id="fechaFin"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700"
          />
        </div>
        <button
          type="submit"
          disabled={isInvalidRange}
          className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition-all duration-200 cursor-pointer shadow-sm hover:shadow flex items-center justify-center gap-2 h-[38px] sm:w-auto w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Filtrar
        </button>
      </form>

      {isInvalidRange && (
        <p role="alert" className="text-xs font-medium text-rose-600 -mt-4">
          La fecha de inicio no puede ser mayor a la fecha final.
        </p>
      )}

      <ConsolidadosViewSwitch activeView={view} onViewChange={setView} />

      {view === 'pacientes' ? (
        <PatientsList
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
          onViewFiles={handleViewFiles}
        />
      ) : (
        <CompanySelector
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
          onSelect={handleCompanySelect}
        />
      )}

      {loadingPatientId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-6 py-5 rounded-2xl shadow-xl flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Buscando datos del paciente...
            </p>
          </div>
        </div>
      )}

      {modalState && (
        <FilesModal
          key={`${modalState.dni}-${modalState.idAten}`}
          ruc={modalState.ruc}
          dni={modalState.dni}
          idAten={modalState.idAten}
          nombrePaciente={modalState.nombrePaciente}
          empresa={modalState.empresa}
          destino={modalState.proyecto}
          fecAte={modalState.fecAte}
          onClose={closeFilesModal}
          onSend={handleSendFromModal}
        />
      )}

      {emailViewData && (
        <section
          data-testid="email-editor-overlay"
          className="fixed inset-0 z-50 bg-white dark:bg-slate-900 overflow-auto"
        >
          <div className="max-w-7xl mx-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                Redactar correo
              </h2>
              <button
                type="button"
                onClick={returnToTable}
                data-testid="email-editor-back"
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold cursor-pointer"
              >
                Volver a la tabla
              </button>
            </div>
            <EmailEditor
              companyId={emailViewData.companyId}
              companyName={emailViewData.companyName}
              selectedPatients={emailViewData.selectedPatients}
              patients={emailViewData.patients}
              fileRefs={emailViewData.fileRefs}
              nombreCompleto={emailViewData.nombreCompleto}
              destino={emailViewData.destino}
            />
          </div>
        </section>
      )}
    </div>
  );
}

export default function ConsolidadosPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">Consolidados</h1>
          <p className="text-slate-500 mt-1">
            Lista de pacientes o empresas según el rango de fechas seleccionado
          </p>
        </div>
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <ConsolidadosContent />
        </Suspense>
      </div>
    </main>
  );
}
