'use client';

import { useState, useRef, useCallback } from 'react';
import { Loader2, FileSpreadsheet, Upload, X, ArrowLeft } from 'lucide-react';
import CompanyList from '@/components/CompanyList';
import CompanyDetailModal from '@/components/CompanyDetailModal';
import { parseValoracionesCsvContent } from '@/utils/valoracionesCore';
import type { CompanyGroup, GroupedData } from '@/utils/valoracionesCore';

type ViewState = 'upload' | 'list';

/**
 * Download a valoraciones Excel by POSTing the original CSV to the API,
 * optionally filtered to a single company.
 */
async function downloadValoraciones(
  file: File,
  company?: string,
): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  if (company) formData.append('company', company);

  const res = await fetch('/api/valoraciones/generate', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(
      errData?.error || `Error del servidor (${res.status})`,
    );
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  const filename =
    disposition?.match(/filename="?(.+?)"?$/)?.[1] ||
    'valoraciones.xlsx';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ValoracionesPage() {
  const [view, setView] = useState<ViewState>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<GroupedData | null>(null);
  const [selectedCompany, setSelectedCompany] =
    useState<CompanyGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- File Handling ----

  const handleFile = useCallback((f: File) => {
    setError(null);

    if (!f.name.endsWith('.csv')) {
      setError('Solo se aceptan archivos CSV');
      return;
    }

    // Read CSV client-side and parse into grouped company data
    setLoading(true);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const csvText = e.target?.result as string;
        const data = parseValoracionesCsvContent(csvText);
        setParsedData(data);
        setFile(f);
        setView('list');
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Error al procesar el archivo CSV',
        );
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError('Error al leer el archivo');
      setLoading(false);
    };

    reader.readAsText(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  // ---- Navigation ----

  const handleReset = useCallback(() => {
    setView('upload');
    setFile(null);
    setParsedData(null);
    setSelectedCompany(null);
    setError(null);
    setDownloadError(null);
  }, []);

  const handleSelectCompany = useCallback((company: CompanyGroup) => {
    setSelectedCompany(company);
    setDownloadError(null);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedCompany(null);
    setDownloadError(null);
  }, []);

  // ---- Downloads ----

  const handleDownloadAll = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      await downloadValoraciones(file);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al generar el Excel',
      );
    } finally {
      setLoading(false);
    }
  }, [file]);

  const handleDownloadCompany = useCallback(
    async (companyName: string) => {
      if (!file) return;
      setLoading(true);
      setDownloadError(null);
      try {
        await downloadValoraciones(file, companyName);
      } catch (err) {
        setDownloadError(
          err instanceof Error
            ? err.message
            : 'Error al generar el Excel',
        );
      } finally {
        setLoading(false);
      }
    },
    [file],
  );

  // ---- Render ----

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-sm">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Generación de Valoraciones
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Arrastra el archivo CSV de valoraciones para generar un Excel
                  agrupado por empresa con cálculo de IGV y totales.
                </p>
              </div>

              {/* Reset / New File button — visible only in list view */}
              {view === 'list' && (
                <button
                  onClick={handleReset}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Nuevo archivo</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 max-w-2xl p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {view === 'upload' ? (
        /* ======== UPLOAD VIEW ======== */
        <div className="bg-white dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl p-8 max-w-2xl">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center text-center p-10 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
              dragging
                ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20'
                : 'border-slate-300 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-slate-50 dark:hover:bg-slate-900/30'
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
              {loading ? (
                <Loader2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">
              {loading
                ? 'Procesando archivo...'
                : 'Arrastra tu archivo CSV'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-2">
              {loading
                ? 'Leyendo y analizando el archivo...'
                : 'o haz clic para seleccionar el archivo'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Solo archivos .csv — archivos-crudos.csv
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleInputChange}
              className="hidden"
              data-testid="csv-input"
            />
          </div>
        </div>
      ) : (
        /* ======== LIST VIEW ======== */
        <div className="flex-1 flex flex-col">
          {parsedData && (
            <CompanyList
              companies={parsedData.companies}
              onSelectCompany={handleSelectCompany}
              onDownloadAll={handleDownloadAll}
            />
          )}
        </div>
      )}

      {/* Detail Modal — overlays above list view */}
      {selectedCompany && (
        <CompanyDetailModal
          company={selectedCompany}
          onClose={handleCloseDetail}
          onDownloadCompany={handleDownloadCompany}
          downloadError={downloadError}
        />
      )}
    </div>
  );
}
