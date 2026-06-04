'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import FileUpload from '@/components/FileUpload';
import DashboardStats from '@/components/DashboardStats';
import ClientList from '@/components/ClientList';
import ClientDetailModal from '@/components/ClientDetailModal';
import { EmailComposerModal } from '@/components/EmailComposerModal';
import { ClienteGroup } from '@/types';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function CobranzaPage() {
  const [uploadedData, setUploadedData] = useState<ClienteGroup[] | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClienteGroup | null>(null);
  const [isEmailComposerOpen, setIsEmailComposerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleReset = () => {
    setUploadedData(null);
    setSelectedClient(null);
    setIsEmailComposerOpen(false);
  };

  const triggerToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans transition-colors duration-300">
      <Navbar onReset={handleReset} hasData={!!uploadedData} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
        {uploadedData ? (
          /* Dashboard View */
          <div className="flex-1 flex flex-col">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Panel de Control de Cobranza
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Resumen general y listado analítico de cuentas corrientes por cliente.
                </p>
              </div>
              <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 px-3 py-1.5 rounded-xl self-start sm:self-auto">
                <span>Reporte Activo:</span>
                <span className="text-sky-500 font-mono">Consolidado.xlsx</span>
              </div>
            </div>

            {/* Metrics cards */}
            <DashboardStats data={uploadedData} />

            {/* Interactive Client list */}
            <div className="flex-1">
              <ClientList
                clients={uploadedData}
                onSelectClient={(client) => setSelectedClient(client)}
              />
            </div>
          </div>
        ) : (
          /* Upload View */
          <div className="flex-1 flex flex-col items-center justify-center py-8 lg:py-16">
            <div className="w-full max-w-3xl animate-scale-in">
              <FileUpload onDataLoaded={(data) => setUploadedData(data)} />
            </div>
          </div>
        )}
      </main>

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

      {/* Client Detail Modal */}
      {selectedClient && !isEmailComposerOpen && (
        <ClientDetailModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onOpenEmailComposer={(client) => {
            setIsEmailComposerOpen(true);
          }}
        />
      )}

      {/* Email Composer Modal */}
      {selectedClient && isEmailComposerOpen && (
        <EmailComposerModal
          client={selectedClient}
          onClose={() => setIsEmailComposerOpen(false)}
          onSuccess={(msg) => {
            triggerToast(msg);
            setSelectedClient(null);
          }}
        />
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-slate-900 dark:bg-slate-800 border border-slate-800 dark:border-slate-700/80 shadow-2xl flex items-center space-x-3 text-white animate-slide-up">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500 text-white shadow-md shadow-emerald-500/10">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Acción Completada</div>
            <div className="text-sm font-bold mt-0.5">{toastMessage}</div>
          </div>
        </div>
      )}
    </div>
  );
}
