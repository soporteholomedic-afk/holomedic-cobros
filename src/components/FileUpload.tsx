import React, { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { parseExcelData } from '../utils/excelParser';
import { ClienteGroup } from '../types';

interface FileUploadProps {
  onDataLoaded: (data: ClienteGroup[]) => void;
}

export default function FileUpload({ onDataLoaded }: FileUploadProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          const parsed = parseExcelData(buffer);
          if (parsed.length === 0) {
            setError('El archivo Excel parece no contener datos válidos o no coincide con el formato esperado.');
          } else {
            onDataLoaded(parsed);
          }
        } catch (err: any) {
          setError(`Error al procesar el archivo: ${err.message || 'Formato no soportado.'}`);
        } finally {
          setIsLoading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      setError(`Error al leer el archivo: ${err.message}`);
      setIsLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        processFile(file);
      } else {
        setError('Por favor, sube solo archivos de formato Excel (.xlsx, .xls)');
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Helper to load sample files from API
  const loadSample = async (fileNumber: '1' | '2') => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sample?file=${fileNumber}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'No se pudo obtener el archivo de ejemplo.');
      }
      const blob = await res.blob();
      const buffer = await blob.arrayBuffer();
      const parsed = parseExcelData(buffer);
      onDataLoaded(parsed);
    } catch (err: any) {
      setError(`Error al cargar el ejemplo: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* File Upload Zone */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
        className={`relative flex flex-col items-center justify-center min-h-[320px] rounded-3xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-500 overflow-hidden backdrop-blur-md group ${
          isDragActive
            ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/20 scale-[0.99] shadow-inner shadow-sky-500/5'
            : 'border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 hover:border-sky-400 hover:shadow-xl hover:shadow-sky-500/5'
        }`}
      >
        {/* Glow effect */}
        <div className="absolute -inset-10 bg-gradient-to-tr from-sky-400/10 to-blue-500/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".xlsx, .xls"
          onChange={handleChange}
          disabled={isLoading}
        />

        {isLoading ? (
          <div className="flex flex-col items-center space-y-4">
            <div className="relative flex items-center justify-center w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-slate-800" />
              <div className="absolute inset-0 rounded-full border-4 border-t-sky-500 border-r-sky-500 animate-spin" />
              <FileSpreadsheet className="w-6 h-6 text-sky-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Procesando archivo...</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Extrayendo filas y agrupando cuentas por cliente.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-4 z-10">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500/10 to-blue-600/10 text-sky-600 dark:text-sky-400 border border-sky-200/50 dark:border-sky-800/30 group-hover:scale-110 transition-transform duration-500">
              <UploadCloud className="w-8 h-8" />
            </div>
            
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">
                Arrastra tu reporte de cobranza aquí
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                o haz clic para explorar en tus archivos
              </p>
            </div>
            
            <div className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
              Formatos soportados: Excel (.xlsx, .xls)
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/30 flex items-start space-x-3 text-rose-800 dark:text-rose-300 animate-shake">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="text-sm font-medium">{error}</div>
        </div>
      )}

      {/* Sample Files Selection */}
      <div className="mt-8 p-6 rounded-3xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 text-center">
        <div className="flex items-center justify-center space-x-2 text-slate-700 dark:text-slate-300 mb-4 font-semibold">
          <Sparkles className="w-4 h-4 text-sky-500" />
          <span>¿No tienes un archivo a la mano?</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Prueba la plataforma instantáneamente cargando uno de los reportes de referencia del servidor.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => loadSample('1')}
            disabled={isLoading}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border border-sky-200/60 dark:border-sky-800/40 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-all duration-300 hover:scale-105"
          >
            Cargar Plantilla Principal (Con Cuenta)
          </button>
          <button
            onClick={() => loadSample('2')}
            disabled={isLoading}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-all duration-300 hover:scale-105"
          >
            Cargar Plantilla Alterna (Sin Cuenta)
          </button>
        </div>
      </div>
    </div>
  );
}
