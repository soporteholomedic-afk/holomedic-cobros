'use client';

interface SendConfirmationProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  recipients: string[];
  isSending: boolean;
  result: { success: boolean; messageId?: string } | null;
  error: string | null;
}

export function SendConfirmation({
  isOpen,
  onClose,
  onConfirm,
  recipients,
  isSending,
  result,
  error,
}: SendConfirmationProps) {
  if (!isOpen) return null;

  const successResult = result?.success === true;
  const errorResult = result?.success === false || error !== null;
  const displayError = error || (result && !result.success ? 'Error al enviar el correo' : null);

  // Success state
  if (successResult) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">
            Correo enviado correctamente
          </h3>
          <p className="text-sm text-slate-500 mb-6">
            Los resultados han sido enviados a {recipients.length} destinatario{recipients.length !== 1 ? 's' : ''}.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors font-medium text-sm cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (errorResult && !isSending) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">Error al enviar</h3>
          <p className="text-sm text-red-600 mb-6">{displayError}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={onConfirm}
              disabled={isSending}
              className="px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors font-medium text-sm cursor-pointer disabled:opacity-50"
            >
              Reintentar
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Confirmation / Sending state
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl">
        <h3 className="text-xl font-semibold text-slate-800 mb-2">
          ¿Enviar resultados a {recipients.length} destinatario{recipients.length !== 1 ? 's' : ''}?
        </h3>
        <p className="text-sm text-slate-500 mb-4">Los siguientes destinatarios recibirán el correo:</p>

        <ul className="space-y-1 mb-6">
          {recipients.map((email) => (
            <li key={email} className="text-sm text-slate-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-sky-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {email}
            </li>
          ))}
        </ul>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSending}
            className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isSending}
            className="px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors font-medium text-sm cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isSending && (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {isSending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
