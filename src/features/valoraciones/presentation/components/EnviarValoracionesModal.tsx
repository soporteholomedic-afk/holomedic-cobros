'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, FileSpreadsheet, Loader2, Mail, Send, X } from 'lucide-react';

import { SpitchSelector } from '@/features/envio-resultados/presentation/components/SpitchSelector';
import { interpolate } from '@/features/envio-resultados/presentation/helpers/interpolate';
import { buildTokenResolverRegistry } from '@/features/envio-resultados/presentation/helpers/tokenResolvers/buildTokenResolverRegistry';
import { useFirmaCorreo } from '@/features/firma-correo/presentation/hooks/useFirmaCorreo';
import { replaceFirmaFallback } from '@/features/firma-correo/presentation/helpers/replaceFirmaFallback';
import type { InterpolationContext } from '@/features/envio-resultados/presentation/helpers/tokenResolvers/types';
import type { Spitch } from '@/features/envio-resultados/domain/entities';
import { sanitizeEmailHtml } from '@/components/email/sanitizeEmailHtml';
import { MONEDAS, type EmpresaGrupo, type ValoracionesFilter } from '../../domain/entities';
import { useEnviarValoraciones } from '../hooks/useEnviarValoraciones';
import { formatFechaDisplay, formatMonto } from '../helpers/format';

/**
 * EnviarValoracionesModal (REQ-03 M-R2/M-R3/M-R4, slice 3) — the
 * valorizaciones email modal.
 *
 *  - Recipients prefilled from the REQ-01 contact directory via the
 *    RUC-keyed `/api/valoraciones/contactos` lookup (corporate clients);
 *    DNI-keyed particulares and clientless queries degrade gracefully to
 *    manual entry (spec M-R3 — never an error state).
 *  - Plantillas picker (area `valoraciones`, SpitchSelector reuse) with
 *    live token interpolation (empresa, ruc, periodo, moneda, total,
 *    fecha, firma, tablaValoraciones).
 *  - PDF/Excel attachment toggles — the send route regenerates both from
 *    the posted filter (D4); the operator never uploads files.
 *
 * Closes on overlay click or Escape (EmpresaDetailModal pattern).
 */
export interface EnviarValoracionesModalProps {
  /** The CURRENT filter — the send route re-queries from it (D4). */
  filtro: ValoracionesFilter;
  /** Selected client code (prefill lookup key); undefined for clientless. */
  codCli?: number;
  /** Client display name ({{empresa}} interpolation source). */
  cliNombre?: string;
  /** Current empresa groups ({{total}} + {{tablaValoraciones}} source). */
  grupos: EmpresaGrupo[];
  /** U6 per-empresa scope — attachments regenerate from ONLY this empresa. */
  empresa?: string;
  onClose: () => void;
}

const AREA = 'valoraciones';

export function EnviarValoracionesModal({
  filtro,
  codCli,
  cliNombre,
  grupos,
  empresa,
  onClose,
}: EnviarValoracionesModalProps) {
  const {
    contacto,
    nroRuc,
    prefillStatus,
    prefillError,
    envioStatus,
    envioError,
    enviar,
  } = useEnviarValoraciones(codCli);

  // editor-firmas PR4 contract (composers parity) — the signature is
  // composed SERVER-SIDE (GET /api/plantillas/firma) and inlined at
  // {{firma}} by the token resolver. Empty firmaHtml → the resolver's
  // [Falta configurar firma] fallback (contract unchanged).
  const { firmaHtml } = useFirmaCorreo();

  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [adjuntarPdf, setAdjuntarPdf] = useState(true);
  const [adjuntarExcel, setAdjuntarExcel] = useState(true);

  // Escape-to-close (overlay click is handled on the backdrop element).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Async seed of the operator-editable to/cc fields from the directory
  // (REQ-01-DIR-03 precedent — editable state seeded by a network
  // response, cannot be derived at render).
  useEffect(() => {
    if (prefillStatus !== 'populated' || !contacto) return;
    /* eslint-disable react-hooks/set-state-in-effect -- async seed of editable fields from the contactos GET */
    setTo(contacto.emailPrincipal);
    setCc(contacto.emailCopia ?? '');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [prefillStatus, contacto]);

  // Interpolation inputs derived from the modal's context.
  const periodo = useMemo(
    () => `${formatFechaDisplay(filtro.fecIni)} al ${formatFechaDisplay(filtro.fecFin)}`,
    [filtro.fecIni, filtro.fecFin],
  );
  const simbol = grupos[0]?.simbol || MONEDAS[filtro.codMon].simbol;
  const montoTotal = useMemo(
    () =>
      grupos.length > 0
        ? `${simbol} ${formatMonto(grupos.reduce((acc, g) => acc + g.total, 0))}`
        : '',
    [grupos, simbol],
  );

  const handleSpitchSelect = useCallback(
    (spitch: Spitch) => {
      // Event-driven interpolation (CobranzaEmailComposer precedent):
      // subject/body are edit-transient state, re-interpolated only when a
      // template is selected.
      const ctx: InterpolationContext = {
        companyName: cliNombre ?? '',
        patientNames: [],
        fileNames: [],
        firma: firmaHtml,
        patients: [],
        files: [],
        area: AREA,
        today: new Date().toLocaleDateString('es-PE', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        destino: '',
        ...(nroRuc !== null ? { ruc: nroRuc } : {}),
        periodo,
        moneda: MONEDAS[filtro.codMon].descripcion,
        ...(montoTotal !== '' ? { montoTotal } : {}),
        tablaValoraciones: grupos.map((g) => ({
          empresa: g.empresa,
          registros: String(g.cantidad),
          subtotal: `${g.simbol || simbol} ${formatMonto(g.subtotal)}`,
          igv: `${g.simbol || simbol} ${formatMonto(g.igv)}`,
          total: `${g.simbol || simbol} ${formatMonto(g.total)}`,
        })),
      };
      const interpolated = interpolate(
        spitch.bodyHtml,
        spitch.subject,
        ctx,
        buildTokenResolverRegistry(AREA),
      );
      setSubject(interpolated.subject);
      setBodyHtml(interpolated.html);
    },
    [cliNombre, filtro.codMon, grupos, montoTotal, nroRuc, periodo, simbol, firmaHtml],
  );

  // Deferred-firma recovery (marker replacement — composers parity):
  // SpitchSelector auto-selects the first template on mount while the
  // firma GET is still in flight, baking the resolver's
  // [Falta configurar firma] fallback into the body. When the firma
  // lands, swap every baked marker for the real html in place (NO
  // re-interpolation — the body stays otherwise intact). This modal has
  // no visual editor; bodyHtml drives the sanitized preview and the
  // send payload directly. Guards: only the ''→non-empty firma
  // transition triggers recovery (ref latch); a body without the marker
  // is untouched; an empty resolved firma keeps the spec fallback.
  const prevFirmaHtmlRef = useRef('');
  useEffect(() => {
    const previous = prevFirmaHtmlRef.current;
    prevFirmaHtmlRef.current = firmaHtml;
    if (previous !== '' || firmaHtml === '') return;
    const recovered = replaceFirmaFallback(bodyHtml, firmaHtml);
    if (recovered === bodyHtml) return;
    /* eslint-disable react-hooks/set-state-in-effect -- async recovery of edit-transient body state baked by the mount-time firma GET race; cannot be derived at render */
    setBodyHtml(recovered);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [firmaHtml, bodyHtml]);

  const hayDestinatario = to.split(',').some((entry) => entry.trim() !== '');
  const puedeEnviar =
    envioStatus !== 'sending' && hayDestinatario && subject.trim() !== '' && bodyHtml !== '';

  const handleEnviar = useCallback(() => {
    if (!puedeEnviar) return;
    void enviar({
      filtro,
      to,
      cc,
      subject,
      html: bodyHtml,
      adjuntarPdf,
      adjuntarExcel,
      ...(empresa !== undefined ? { empresa } : {}),
    });
  }, [adjuntarExcel, adjuntarPdf, bodyHtml, enviar, empresa, filtro, puedeEnviar, subject, to, cc]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Enviar valorizaciones por correo"
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-scale-in flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-950/20">
          <div className="space-y-1">
            <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">
              Enviar Documentos
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">
              Valorizaciones por correo
            </h2>
            <p className="text-xs text-slate-400">
              Periodo {periodo} · {MONEDAS[filtro.codMon].descripcion}
              {nroRuc !== null ? ` · RUC ${nroRuc}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Plantilla (area valoraciones) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Plantilla
            </label>
            <SpitchSelector target="company" onSelect={handleSpitchSelect} area={AREA} />
          </div>

          {/* Recipients (prefill or manual) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="valoraciones-para"
                className="text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Para
              </label>
              <input
                id="valoraciones-para"
                type="text"
                placeholder="correo@empresa.com, otro@empresa.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="valoraciones-cc"
                className="text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                CC
              </label>
              <input
                id="valoraciones-cc"
                type="text"
                placeholder="copia@empresa.com"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          {prefillStatus === 'loading' && (
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Buscando contactos del cliente…
            </p>
          )}
          {prefillStatus === 'error' && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No se pudo consultar los contactos memorizados ({prefillError}). Ingrese los
              destinatarios manualmente.
            </p>
          )}
          {prefillStatus === 'skipped' && (
            <p className="text-xs text-slate-400">
              Consulta sin cliente seleccionado: ingrese los destinatarios manualmente.
            </p>
          )}

          {/* Subject */}
          <div className="space-y-1.5">
            <label
              htmlFor="valoraciones-asunto"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Asunto
            </label>
            <input
              id="valoraciones-asunto"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Body preview (sanitized template HTML) */}
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Cuerpo del correo
            </span>
            {bodyHtml ? (
              <div
                data-testid="valoraciones-body-preview"
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 text-sm text-slate-700 dark:text-slate-200 max-h-56 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(bodyHtml) }}
              />
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-4 text-sm text-slate-400 italic">
                Seleccione una plantilla para componer el correo.
              </p>
            )}
          </div>

          {/* Attachment toggles (server regenerates — M-R4) */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Adjuntos (se generan automáticamente)
            </legend>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adjuntarPdf}
                  onChange={(e) => setAdjuntarPdf(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
                />
                <FileDown className="w-4 h-4 text-rose-500" aria-hidden />
                Adjuntar PDF
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adjuntarExcel}
                  onChange={(e) => setAdjuntarExcel(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
                />
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" aria-hidden />
                Adjuntar Excel
              </label>
            </div>
          </fieldset>

          {/* Send outcome */}
          {envioStatus === 'success' && (
            <p
              role="status"
              className="text-sm font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-2"
            >
              <Mail className="w-4 h-4" aria-hidden />
              Correo enviado correctamente.
            </p>
          )}
          {envioStatus === 'error' && envioError && (
            <p role="alert" className="text-sm text-rose-500">
              {envioError}
            </p>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50/50 dark:bg-slate-950/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={handleEnviar}
            disabled={!puedeEnviar}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {envioStatus === 'sending' ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <Send className="w-4 h-4" aria-hidden />
            )}
            {envioStatus === 'sending' ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
