import { Sparkles, ShieldCheck } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col font-sans">
      {/* Welcome / Landing View */}
      <div className="flex-1 flex flex-col items-center justify-center py-8 lg:py-16">
        <div className="text-center max-w-3xl mx-auto mb-10 space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/30 text-sky-700 dark:text-sky-400 text-xs font-bold uppercase tracking-wider animate-fade-in">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Gestión Financiera Inteligente</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white tracking-tight leading-[1.1] animate-fade-in delay-75">
            Plataforma de Facturación <br />
            <span className="bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 bg-clip-text text-transparent">
              Holomedic Facturación
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed animate-fade-in delay-100">
            Optimiza la gestión de facturación y cobranza. Centraliza reportes contables, audita saldos por cliente y genera valoraciones automatizadas desde una sola plataforma.
          </p>
        </div>

        {/* Process Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mt-8 w-full animate-fade-in delay-200">
          <div className="flex flex-col items-center text-center p-5 rounded-2xl bg-white/50 dark:bg-slate-900/30 border border-slate-200/40 dark:border-slate-800/40">
            <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold mb-3">
              1
            </div>
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Sube tu Reporte</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[200px]">
              Carga el reporte exportado en Excel. Procesamos columnas clave como debe, haber y saldo.
            </p>
          </div>

          <div className="flex flex-col items-center text-center p-5 rounded-2xl bg-white/50 dark:bg-slate-900/30 border border-slate-200/40 dark:border-slate-800/40">
            <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold mb-3">
              2
            </div>
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Filtra y Audita</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[200px]">
              Visualiza los saldos agrupados por cliente. Identifica rápidamente deudores y saldos a favor.
            </p>
          </div>

          <div className="flex flex-col items-center text-center p-5 rounded-2xl bg-white/50 dark:bg-slate-900/30 border border-slate-200/40 dark:border-slate-800/40">
            <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold mb-3">
              3
            </div>
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Genera Valoraciones</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[200px]">
              Procesa archivos CSV y genera valoraciones por empresa con cálculo de IGV y totales.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 border-t border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            &copy; {new Date().getFullYear()} Holomedic S.A.C. Todos los derechos reservados.
          </div>
          <div className="flex items-center space-x-1 text-slate-400 font-medium">
            <ShieldCheck className="w-4 h-4 text-sky-500" />
            <span>Datos procesados de forma local y segura en el navegador</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
