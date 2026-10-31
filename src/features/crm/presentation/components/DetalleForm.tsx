'use client';

import { Plus, Trash2 } from 'lucide-react';

import { MAX_CONTACTOS } from '../../domain/entities';
import { ContactoFields } from './ContactoFields';
import { INPUT } from './crmUi';
import type { Borrador, ContactoBorrador } from './detalleBorrador';
import { SectorSelect } from './SectorSelect';

interface Props {
  borrador: Borrador;
  sectores: string[];
  /** DOM id of the field the last validation rejected. */
  invalido: string | null;
  /** Polite announcement for screen readers (contact added, removed, made principal). */
  anuncio: string;
  onCambio: (b: Borrador) => void;
  onCrearSector: (nombre: string) => Promise<string | { error: string }>;
  onAgregar: () => void;
  onQuitar: (indice: number) => void;
  onHacerPrincipal: (indice: number) => void;
}

const ETIQUETA = 'grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200';
const TITULO = 'text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400';
const LINK = 'inline-flex items-center gap-1 text-[13px] font-semibold text-sky-700 hover:underline dark:text-sky-300';

/** Editable fields of the detail panel. The panel owns the draft, validation and saving. */
export function DetalleForm({
  borrador: b,
  sectores,
  invalido,
  anuncio,
  onCambio,
  onCrearSector,
  onAgregar,
  onQuitar,
  onHacerPrincipal,
}: Props) {
  const cambiarContacto = (i: number, c: ContactoBorrador) =>
    onCambio({ ...b, contactos: b.contactos.map((x, j) => (j === i ? c : x)) });
  const marca = (id: string) => (invalido === id ? true : undefined);

  return (
    <div className="grid gap-5 px-6 pb-4 pt-3">
      <p role="status" className="sr-only">
        {anuncio}
      </p>

      <fieldset className="grid gap-3.5">
        <legend className={`${TITULO} mb-1`}>Empresa</legend>
        <label className={ETIQUETA}>
          <span>
            Razón social <em className="not-italic text-red-700">*</em>
          </span>
          <input
            id="det-razon"
            value={b.razonSocial}
            aria-invalid={marca('det-razon')}
            onChange={(ev) => onCambio({ ...b, razonSocial: ev.target.value })}
            className={INPUT}
          />
        </label>
        <div className="grid grid-cols-2 items-start gap-3.5">
          <label className={ETIQUETA}>
            <span>
              RUC <em className="not-italic text-red-700">*</em>
            </span>
            <input
              id="det-ruc"
              inputMode="numeric"
              maxLength={11}
              value={b.ruc}
              aria-invalid={marca('det-ruc')}
              onChange={(ev) => onCambio({ ...b, ruc: ev.target.value })}
              className={INPUT}
            />
          </label>
          <SectorSelect
            id="det-sector"
            sectores={sectores}
            valor={b.sector}
            onCambio={(sector) => onCambio({ ...b, sector })}
            onCrear={onCrearSector}
          />
        </div>
      </fieldset>

      <div className="grid gap-3.5">
        <h3 className={TITULO}>Contactos</h3>
        {b.contactos.map((c, i) => (
          <fieldset
            key={c.clave}
            className="grid gap-3.5 rounded-xl border border-slate-200 p-3.5 dark:border-slate-700"
          >
            <legend className="px-1 text-[13px] font-bold text-slate-800 dark:text-slate-200">
              {i === 0 ? `Contacto ${i + 1} · Principal` : `Contacto ${i + 1}`}
            </legend>
            <ContactoFields
              prefijo={`det-c${c.clave}`}
              contacto={c}
              invalido={invalido}
              onCambio={(nuevo) => cambiarContacto(i, { ...c, ...nuevo })}
            />
            <div className="flex flex-wrap justify-between gap-2">
              {i > 0 ? (
                <button
                  type="button"
                  aria-label={`Hacer principal al contacto ${i + 1}`}
                  onClick={() => onHacerPrincipal(i)}
                  className={LINK}
                >
                  Hacer principal
                </button>
              ) : (
                <span />
              )}
              {b.contactos.length > 1 && (
                <button
                  type="button"
                  aria-label={`Quitar contacto ${i + 1}`}
                  onClick={() => onQuitar(i)}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-red-700 hover:underline dark:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Quitar
                </button>
              )}
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          onClick={onAgregar}
          disabled={b.contactos.length >= MAX_CONTACTOS}
          className={`${LINK} w-fit disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Agregar contacto
        </button>
      </div>

      <label className={ETIQUETA}>
        <span>
          Notas <small className="font-normal text-slate-500">(opcional)</small>
        </span>
        <textarea
          id="det-notas"
          value={b.notas}
          onChange={(ev) => onCambio({ ...b, notas: ev.target.value })}
          className={`${INPUT} min-h-[72px] resize-y`}
        />
      </label>
    </div>
  );
}
