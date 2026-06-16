import { GeneratePdfsForm } from '@/components/GeneratePdfsForm';

export default function GeneradorPdfsPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Generador de PDFs SIGLA
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8">
          Ejecuta SIGLA.PdfCli.exe desde el navegador y descarga los reportes en un ZIP.
        </p>
        <GeneratePdfsForm />
      </div>
    </div>
  );
}
