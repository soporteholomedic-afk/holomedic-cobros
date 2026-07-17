import { Building, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Medicina | Holomedic',
};

export default function MedicinaPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
      <div className="flex items-center space-x-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400">
          <Stethoscope className="w-5 h-5" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Medicina
        </h1>
      </div>
      <p className="text-slate-500 dark:text-slate-400 mb-8">
        Gestión documental y plantillas del área de Medicina.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link
          href="/areas/medicina/jjc"
          className="flex flex-col p-6 rounded-2xl bg-white/50 dark:bg-slate-900/30 border border-slate-200/40 dark:border-slate-800/40 hover:border-sky-300 dark:hover:border-sky-700 transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-3">
            <Building className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-800 dark:text-slate-200">
            Empresa JJC
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Medicina · JJC
          </p>
        </Link>
      </div>
    </div>
  );
}
