'use client';

import { AlertCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { RELACION_LABELS } from '../../domain/entities';
import { INPUT, ALERTA, BOTON_PRIMARIO, BOTON_SECUNDARIO } from './crmUi';
import { badgeSunat, useConsultaRuc } from './useConsultaRuc';

export interface OtraEmpresa {
  idEmpresa: string;
  razonSocial: string;
  /** Plain string on purpose: it mirrors RucDeOtraEmpresaError.otra ("cliente" | "prospecto"). */
  relacion: string;
}

/** What saving a RUC came to; the board turns it into toasts and board changes. */
export type ResultadoRuc = { tipo: 'ok' } | { tipo: 'conflicto'; otra: OtraEmpresa } | { tipo: 'error' };

interface Props {
  razonSocial: string;
  onGuardar: (ruc: string, unir: boolean) => Promise<ResultadoRuc>;
}

/** Label of the other ficha's relación; mirrors the domain error message. */
const etiquetaRelacion = (relacion: string): string =>
  relacion === 'cliente' ? RELACION_LABELS.cliente : relacion === 'prospecto' ? RELACION_LABELS.prospecto : relacion;

/** "Falta RUC" mark with the inline field to complete it, and the merge question when the RUC is taken. */
export function RucFaltante({ razonSocial, onGuardar }: Props) {
  const ids = useId();
  const idInput = `${ids}-ruc`;
  const idError = `${ids}-ruc-err`;
  const [valor, setValor] = useState('');
  const [error, setError] = useState('');
  const [otra, setOtra] = useState<OtraEmpresa | null>(null);
  const [enviando, setEnviando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const botonUnir = useRef<HTMLButtonElement>(null);

  const consulta = useConsultaRuc(valor);

  const volverAlCampo = useRef(false);

  useEffect(() => {
    if (otra) botonUnir.current?.focus();
    else if (volverAlCampo.current) {
      volverAlCampo.current = false;
      input.current?.focus();
    }
  }, [otra]);

  async function guardar(unir: boolean) {
    if (enviando) return;
    const ruc = valor.trim();
    if (!/^\d{11}$/.test(ruc)) {
      setError('El RUC debe tener 11 dígitos.');
      input.current?.focus();
      return;
    }
    setError('');
    setEnviando(true);
    const r = await onGuardar(ruc, unir);
    setEnviando(false);
    if (r.tipo === 'conflicto') setOtra(r.otra);
  }

  function noUnir() {
    volverAlCampo.current = true;
    setOtra(null);
  }

  return (
    <>
      <span className="inline-flex w-fit items-center gap-1 rounded-full border border-amber-400/50 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Falta RUC
      </span>
      {otra ? (
        <div
          role="alert"
          className="grid gap-2 rounded-xl border border-amber-500 bg-amber-100 px-3 py-2.5 text-[13px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <p>
            Este RUC ya es de <b>{otra.razonSocial}</b> («{etiquetaRelacion(otra.relacion)}»). ¿Unir las dos fichas?
          </p>
          <p className="text-slate-600 dark:text-slate-300">
            {`El historial y los contactos de «${razonSocial}» pasan a «${otra.razonSocial}» y esta ficha desaparece.`}
          </p>
          <div className="flex gap-2">
            <button
              ref={botonUnir}
              type="button"
              disabled={enviando}
              onClick={() => void guardar(true)}
              className={`${BOTON_PRIMARIO} !h-9`}
            >
              Unir fichas
            </button>
            <button type="button" onClick={noUnir} className={`${BOTON_SECUNDARIO} !h-9`}>
              No unir
            </button>
          </div>
        </div>
      ) : (
        <>
          {consulta.estado.tipo === 'encontrada' && (() => {
            const chip = badgeSunat(consulta.estado.datos);
            return (
              <p
                role="status"
                className="grid gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
              >
                <b className="truncate">{consulta.estado.datos.razonSocial}</b>
                {chip && <span className={chip.clase}>{chip.texto}</span>}
              </p>
            );
          })()}
          {consulta.estado.tipo === 'cargando' && (
            <p aria-live="polite" className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Consultando SUNAT…
            </p>
          )}
          {'mensaje' in consulta.estado && (
            <p role="status" className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              {consulta.estado.mensaje}
            </p>
          )}
          <div className="flex gap-2">
            <label htmlFor={idInput} className="sr-only">
              RUC
            </label>
            <input
              ref={input}
              id={idInput}
              inputMode="numeric"
              maxLength={11}
              placeholder="11 dígitos"
              value={valor}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? idError : undefined}
              onChange={(ev) => {
                setValor(ev.target.value);
                setError('');
              }}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') {
                  ev.preventDefault();
                  void guardar(false);
                }
              }}
              className={`${INPUT} min-w-0 flex-1`}
            />
            <button
              type="button"
              disabled={enviando}
              onClick={() => void guardar(false)}
              className={`${BOTON_SECUNDARIO} !h-9 shrink-0`}
            >
              Guardar RUC
            </button>
          </div>
          {error && (
            <p id={idError} role="alert" className={ALERTA}>
              {error}
            </p>
          )}
        </>
      )}
    </>
  );
}
