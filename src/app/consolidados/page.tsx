'use client';

import { Suspense, useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { History } from 'lucide-react';
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
import { useSedes } from '@/features/envio-resultados/presentation/hooks/useSedes';
import { EmailEditor } from '@/features/envio-resultados/presentation/components/EmailEditor';
import {
  emailViewDataFromFiles,
  type EmailViewData,
} from '@/features/envio-resultados/presentation/helpers/emailViewDataFromFiles';
import {
  normalizeFecAte,
  resolveMatchingOrder,
} from '@/features/envio-resultados/presentation/helpers/resolveMatchingOrder';
import {
  buildReenvioViewData,
  type InitialEmail,
  type UnavailableAttachment,
} from '@/features/envio-resultados/presentation/helpers/buildReenvioViewData';
import type { EnvioHistoryRow } from '@/features/envio-resultados/domain/entities';
import type { FileNode } from '@/features/envio-resultados/domain/ports';

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
  const [codSed, setCodSed] = useState(() => searchParams.get('codSed') ?? '1');
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
    // PR-2 (nomenclatura-adicionales) — the DesTCh discriminator. The
    // ONLY signal that marks an order as ADICIONALES; DesDes/proyecto
    // are never used for this (REQ-6). Raw DesTCh is forwarded as-is
    // so pane hrefs carry `&tipoExamen=ADICIONALES` (S-9) and the
    // routes/email bridge normalize it at the boundary.
    tipoExamen?: string;
  } | null>(null);
  const [loadingPatientId, setLoadingPatientId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { companies } = useCompanies();
  const { sedes } = useSedes();
  const [emailViewData, setEmailViewData] = useState<EmailViewData | null>(null);

  // ---- Reenvío hydration (historial-envios-consolidados PR4, OQ4) ----
  // `/consolidados?reenvio=<id>` (pushed by the history page's Reenviar
  // button) fetches the row by id and hydrates the EXISTING editor
  // overlay pre-populated. The param stays in the URL so a refresh
  // re-hydrates; the date Filtrar submit rebuilds params without it —
  // the intentional exit from reenvío mode.
  const reenvioId = searchParams.get('reenvio');
  const [reenvioSeed, setReenvioSeed] = useState<{
    initialEmail: InitialEmail;
    unavailableAttachments: UnavailableAttachment[];
  } | null>(null);
  const [hydratingReenvio, setHydratingReenvio] = useState(false);

  useEffect(() => {
    if (!reenvioId) return;
    let cancelled = false;
    // Deferred to a microtask to avoid set-state-in-effect warnings
    // (useEnviosHistory / useConsolidadosResults precedent).
    Promise.resolve().then(() => {
      if (cancelled) return;
      setHydratingReenvio(true);
    });
    const hydrate = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/consolidados/envios/${encodeURIComponent(reenvioId)}`);
        const payload = (await res.json().catch(() => null)) as
          | { success?: boolean; row?: EnvioHistoryRow; error?: string }
          | null;
        if (!res.ok || !payload?.success || !payload.row) {
          throw new Error(payload?.error ?? `HTTP ${res.status}`);
        }
        const built = buildReenvioViewData(payload.row);
        if (cancelled) return;
        setEmailViewData(built.emailViewData);
        setReenvioSeed({
          initialEmail: built.initialEmail,
          unavailableAttachments: built.unavailableAttachments,
        });
      } catch {
        if (cancelled) return;
        setErrorMessage(
          'No se pudo cargar el envío para reenvío. Regrese al historial e intente nuevamente.',
        );
      } finally {
        if (!cancelled) setHydratingReenvio(false);
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [reenvioId]);

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
    // Always encode codSed (empty string = "Todas las sedes") so the
    // selection survives reloads and back/forward navigation.
    params.set('codSed', codSed);
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
      if (codSed) resultsParams.set('codSed', codSed);

      const res = await fetch(`/api/consolidados/results_by_companies?${resultsParams.toString()}`);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const orders = (await res.json()) as OrderRow[];
      const normalizedRowDni = normalizeDni(row.NroDId);

      // Resolve the exact order: explicit NumOrd first, then DNI + FecAte,
      // then DNI-only (see resolveMatchingOrder for the precedence contract).
      const matchingOrder = resolveMatchingOrder(orders, row);

      if (matchingOrder) {
        setModalState({
          ruc: matchingOrder.NroRuc,
          dni: normalizedRowDni,
          idAten: matchingOrder.IdAten,
          nombrePaciente: row.Pacien,
          empresa: row.NomCom,
          proyecto: row.DesDes,
          fecAte: normalizeFecAte(matchingOrder.FecAte),
          // PR-2 — thread the DesTCh exam-type signal (REQ-6). DesTCh is
          // the only discriminator; DesDes/proyecto are never consulted.
          tipoExamen: row.DesTCh,
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
        // PR-2 — carry the DesTCh signal on the synthetic person/ficha so
        // `emailViewDataFromFiles` can stamp ADICIONAL refs (REQ-6).
        tipoExamen: modalState.tipoExamen ?? '',
        proyecto: modalState.proyecto,
        condic: '',
        fichas: [],
      };

      const ficha: UnifiedFicha = {
        idAten: modalState.idAten,
        nroRuc: modalState.ruc,
        nomCFa: '',
        proyecto: modalState.proyecto,
        tipoExamen: modalState.tipoExamen ?? '',
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
      // Normal compose path — drop any reenvío seed so the editor
      // mounts fresh (the seed only belongs to reenvío mode).
      setReenvioSeed(null);
      setModalState(null);
    },
    [modalState, companies],
  );

  const returnToTable = useCallback((): void => {
    setEmailViewData(null);
    setReenvioSeed(null);
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
        <div className="flex-1 w-full">
          <label
            htmlFor="sede"
            className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
          >
            Sede
          </label>
          <select
            id="sede"
            value={codSed}
            onChange={(e) => setCodSed(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700"
          >
            <option value="">Todas las sedes</option>
            {sedes.map((sede) => (
              <option key={sede.codSed} value={sede.codSed}>
                {sede.nomSed}
              </option>
            ))}
            {/* Fallback while sedes load or if the fetch failed: keep the
                current selection represented so the select stays controlled. */}
            {!sedes.some((s) => String(s.codSed) === codSed) && codSed !== '' && (
              <option value={codSed}>{codSed}</option>
            )}
          </select>
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
          codSed={codSed}
          onViewFiles={handleViewFiles}
        />
      ) : (
        <CompanySelector
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
          codSed={codSed}
          onSelect={handleCompanySelect}
        />
      )}

      {(loadingPatientId || hydratingReenvio) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-6 py-5 rounded-2xl shadow-xl flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {hydratingReenvio ? 'Cargando envío para reenvío...' : 'Buscando datos del paciente...'}
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
          // PR-2 (nomenclatura-adicionales) — forward the DesTCh signal so
          // pane download hrefs and the selected-files zip use ADICIONAL
          // nomenclature for ADICIONALES orders (S-9 / S-7). Absent signal
          // keeps CAMO/EMO fallback (REQ-6).
          tipoExamen={modalState.tipoExamen}
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
            {/* Keyed so a reenvío mount (whose initialEmail seeds the
                editor's useState initializers) always starts from a
                fresh editor instance, never from a stale compose. */}
            <EmailEditor
              key={reenvioSeed ? `reenvio-${reenvioId ?? ''}` : 'compose'}
              companyId={emailViewData.companyId}
              companyName={emailViewData.companyName}
              selectedPatients={emailViewData.selectedPatients}
              patients={emailViewData.patients}
              fileRefs={emailViewData.fileRefs}
              nombreCompleto={emailViewData.nombreCompleto}
              destino={emailViewData.destino}
              initialEmail={reenvioSeed?.initialEmail}
              unavailableAttachments={reenvioSeed?.unavailableAttachments}
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
      <div className="w-full">
        {/* Header — the HISTORIAL Link (historial-envios-consolidados
            PR4, OQ2) lives in this hook-free outer wrapper, outside the
            Suspense boundary, so it stays mounted and visible through
            any ConsolidadosContent suspense or URL-param churn. Styling
            follows the JJC detail-page header Link precedent. */}
        <div className="mb-8 flex items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Consolidados</h1>
            <p className="text-slate-500 mt-1">
              Lista de pacientes o empresas según el rango de fechas seleccionado
            </p>
          </div>
          <div className="ml-auto">
            <Link
              href="/consolidados/historial-envios"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
            >
              <History className="w-4 h-4" />
              HISTORIAL
            </Link>
          </div>
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
