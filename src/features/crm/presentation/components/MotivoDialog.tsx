'use client';

import { useId, useState, type FormEvent } from 'react';

import {
  MOTIVO_CAMPOS,
  MOTIVO_CATEGORIAS,
  MOTIVO_LABELS,
  type Motivo,
  type MotivoCampo,
  type MotivoCategoria,
} from '../../domain/entities';
import { ALERTA, BOTON_PRIMARIO, BOTON_SECUNDARIO, INPUT } from './crmUi';
import { ModalFrame } from './ModalFrame';

interface Props {
  subtitulo: string;
  inicial: Motivo | null;
  onCancelar: () => void;
  /** Resolves to an error message to show in the dialog, or `null` when it was saved. */
  onGuardar: (motivo: Motivo) => Promise<string | null>;
}

export function MotivoDialog({ subtitulo, inicial, onCancelar, onGuardar }: Props) {
  const uid = useId();
  const [categoria, setCategoria] = useState<MotivoCategoria | ''>(inicial?.categoria ?? '');
  const [d1, setD1] = useState(inicial?.detalle1 ?? '');
  const [d2, setD2] = useState(inicial?.detalle2 ?? '');
  const [notas, setNotas] = useState(inicial?.notas ?? '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const campos = categoria ? MOTIVO_CAMPOS[categoria] : {};

  function elegir(c: MotivoCategoria) {
    if (c === categoria) return;
    // Each category asks different things: the previous details do not carry over.
    setCategoria(c);
    setD1('');
    setD2('');
    setError('');
  }

  function falla(mensaje: string, campo?: string) {
    setError(mensaje);
    if (campo) document.getElementById(`${uid}-${campo}`)?.focus();
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    if (!categoria) return falla('Elige el motivo de la pérdida.');
    const c = MOTIVO_CAMPOS[categoria];
    if (c.detalle1?.requerido && !d1.trim()) return falla(`Falta: ${c.detalle1.label}`, 'd1');
    if (c.detalle2?.requerido && !d2.trim()) return falla(`Falta: ${c.detalle2.label}`, 'd2');
    setError('');
    setGuardando(true);
    const fallo = await onGuardar({
      categoria,
      detalle1: c.detalle1 ? d1.trim() || null : null,
      detalle2: c.detalle2 ? d2.trim() || null : null,
      notas: notas.trim() || null,
    });
    if (fallo) {
      setError(fallo);
      setGuardando(false);
    }
  }

  function campo(clave: 'd1' | 'd2', def: MotivoCampo, valor: string, set: (v: string) => void) {
    return (
      <label className="grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
        <span>
          {def.label}{' '}
          {def.requerido ? (
            <em className="not-italic text-red-700">*</em>
          ) : (
            <small className="font-normal text-slate-500">(opcional)</small>
          )}
        </span>
        <input
          id={`${uid}-${clave}`}
          value={valor}
          maxLength={200}
          onChange={(ev) => {
            set(ev.target.value);
            setError('');
          }}
          className={INPUT}
        />
      </label>
    );
  }

  return (
    <ModalFrame titulo="Motivo de la pérdida" subtitulo={subtitulo} onCerrar={onCancelar}>
      <form onSubmit={enviar} noValidate className="mt-4 grid gap-3.5">
        <fieldset className="grid gap-2">
          <legend className="sr-only">Motivo</legend>
          {MOTIVO_CATEGORIAS.map((c) => (
            <label
              key={c}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-slate-800 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50 dark:border-slate-700 dark:text-slate-100 dark:has-[:checked]:bg-sky-950/40"
            >
              <input
                type="radio"
                name="motivo"
                value={c}
                checked={categoria === c}
                onChange={() => elegir(c)}
                className="h-4 w-4"
              />
              <span>{MOTIVO_LABELS[c]}</span>
            </label>
          ))}
        </fieldset>
        {campos.detalle1 && campo('d1', campos.detalle1, d1, setD1)}
        {campos.detalle2 && campo('d2', campos.detalle2, d2, setD2)}
        <label className="grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
          <span>
            Notas <small className="font-normal text-slate-500">(opcional)</small>
          </span>
          <textarea
            value={notas}
            maxLength={300}
            onChange={(ev) => setNotas(ev.target.value)}
            className={`${INPUT} min-h-[64px] resize-y`}
          />
        </label>
        {error && (
          <p role="alert" className={ALERTA}>
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onCancelar} className={BOTON_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
            {guardando ? 'Guardando…' : 'Guardar motivo'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
