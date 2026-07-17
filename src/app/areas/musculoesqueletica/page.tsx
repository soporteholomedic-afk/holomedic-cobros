import { Bone } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MusculoEsqueletica | Holomedic',
};

export default function MusculoEsqueleticaPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
      <div className="flex items-center space-x-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400">
          <Bone className="w-5 h-5" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          MusculoEsqueletica
        </h1>
      </div>
      <p className="text-slate-500 dark:text-slate-400 mb-8">
        Gestión documental y plantillas del área de MusculoEsqueletica.
      </p>
      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Próximamente
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          Esta sección está en desarrollo.
        </p>
      </div>
    </div>
  );
}
