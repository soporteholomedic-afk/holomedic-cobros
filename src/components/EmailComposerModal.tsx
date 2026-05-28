import React, { useState } from 'react';
import { X, Send, Mail, CheckCircle2, ChevronRight, Edit3, Landmark, ExternalLink } from 'lucide-react';
import { ClienteGroup, Documento } from '../types';
import { formatNumber } from '../utils/excelParser';

interface EmailComposerModalProps {
  client: ClienteGroup;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export default function EmailComposerModal({ client, onClose, onSuccess }: EmailComposerModalProps) {
  const [to, setTo] = useState(`administracion@${client.razonSocial.toLowerCase().replace(/[^a-z0-9]/g, '') || 'cliente'}.com`);
  const [subject, setSubject] = useState(`RECORDATORIO DE PAGO - HOLOMEDIC - ${client.razonSocial}`);
  
  // Build details list of outstanding documents
  const outstandingDocs = client.documentos.filter(d => d.saldo > 0.01);
  
  const getDocsTextList = () => {
    return outstandingDocs.map(d => 
      `- Doc: ${d.tipoDoc} ${d.serie}-${d.numero} | Venc.: ${d.fechaVen || 'S/V'} | Saldo Pendiente: ${d.moneda} ${formatNumber(d.saldo)}`
    ).join('\n');
  };

  const getOutstandingTotalsText = () => {
    return Object.keys(client.saldosPorMoneda)
      .map(mon => `${mon} ${formatNumber(client.saldosPorMoneda[mon].saldo)}`)
      .join(' / ');
  };

  const initialBody = `Estimados señores de ${client.razonSocial},

Les saludamos cordialmente de parte del área de Cobranzas de HOLOMEDIC.

A través de la presente, le hacemos llegar un estado resumido de sus facturas y documentos que registran saldos pendientes de pago en nuestra cuenta corriente al día de hoy:

${getDocsTextList()}

TOTAL PENDIENTE DE PAGO: ${getOutstandingTotalsText()}

Agradecemos puedan programar la regularización de estos importes a la brevedad en nuestras cuentas bancarias autorizadas:

- BANCO DE CRÉDITO DEL PERÚ (BCP)
  * Cuenta Corriente Soles: 193-2345678-0-91
  * CCI Soles: 002-193-002345678091-14
  * Cuenta Corriente Dólares: 193-8765432-1-89
  * CCI Dólares: 002-193-008765432189-10
  * Beneficiario: HOLOMEDIC S.A.C.
  * RUC: 20601234567

Una vez realizada la transferencia, les solicitamos por favor enviar el comprobante de pago a este correo (cobranzas@holomedic.com) indicando el RUC del cliente y los números de documentos cancelados para su debida conciliación.

Si tiene alguna consulta o si ya realizó el pago en las últimas 24 horas, por favor no dude en contactarnos para actualizar nuestros registros.

Atentamente,

Área de Cobranzas y Créditos
HOLOMEDIC S.A.C.
Teléfono: (01) 456-7890
cobranzas@holomedic.com`;

  const [body, setBody] = useState(initialBody);
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  // Generate mailto link
  const mailtoLink = useMemoMailto(to, subject, body);

  function useMemoMailto(toAddress: string, sub: string, textBody: string) {
    const encodedSubject = encodeURIComponent(sub);
    const encodedBody = encodeURIComponent(textBody);
    return `mailto:${toAddress}?subject=${encodedSubject}&body=${encodedBody}`;
  }

  const handleSimulateSend = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsSending(false);
      setSentSuccess(true);
      setTimeout(() => {
        onSuccess(`Correo de cobro enviado con éxito a ${client.razonSocial}`);
        onClose();
      }, 1800);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-scale-in flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
          <div className="flex items-center space-x-2">
            <Mail className="w-5 h-5 text-sky-500" />
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Redactar Correo de Cobro
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {sentSuccess ? (
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-4 flex-1">
            <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 border border-emerald-200 dark:border-emerald-800/30 flex items-center justify-center animate-bounce-slow">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">¡Correo Enviado!</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                La simulación de cobranza se ha completado con éxito. Se envió la notificación de pago para {client.razonSocial}.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSimulateSend} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              
              {/* Recipient Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Para (Destinatario)
                </label>
                <input
                  type="email"
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800 dark:text-slate-100 font-mono"
                  placeholder="correo@cliente.com"
                />
              </div>

              {/* Email Subject */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Asunto del Correo
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              {/* Email Body */}
              <div className="space-y-1.5 flex-1 flex flex-col min-h-[220px]">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Cuerpo del Mensaje
                </label>
                <textarea
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800 dark:text-slate-100 font-sans resize-none min-h-[180px] leading-relaxed"
                />
              </div>

              {/* Payment Details Warning info */}
              <div className="p-4 rounded-xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30 flex items-start space-x-2 text-sky-800 dark:text-sky-400">
                <Landmark className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="text-[11px] leading-normal">
                  <span className="font-bold block">Cuentas Bancarias Incluidas</span>
                  El cuerpo del correo contiene los datos de transferencia para el BCP (Soles/Dólares) correspondientes a <strong>HOLOMEDIC S.A.C.</strong> para facilitar la regularización de deuda.
                </div>
              </div>

            </div>

            {/* Modal Footer Actions */}
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSending}
                className="w-full sm:w-auto order-3 sm:order-1 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors"
              >
                Cancelar
              </button>
              
              <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2 order-1 sm:order-2">
                <a
                  href={mailtoLink}
                  onClick={() => setTimeout(onClose, 200)}
                  className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Abrir en Outlook/Gmail</span>
                </a>

                <button
                  type="submit"
                  disabled={isSending}
                  className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-sm font-bold text-white shadow-md shadow-sky-500/10 hover:shadow-sky-500/20 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Enviar (Simulación)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
