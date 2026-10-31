'use client';

import { INPUT } from './crmUi';

export interface ContactoForm {
  nombre: string;
  telefono: string;
  correo: string;
}

export const CONTACTO_VACIO: ContactoForm = { nombre: '', telefono: '', correo: '' };

interface Props {
  /** Prefix of the input ids, so the board can move the focus to a field. */
  prefijo: string;
  contacto: ContactoForm;
  onCambio: (c: ContactoForm) => void;
}

const ETIQUETA = 'grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200';

/** Name, phone and email of one contact. Used by the create and the edit panels. */
export function ContactoFields({ prefijo, contacto, onCambio }: Props) {
  const set = (campo: keyof ContactoForm) => (ev: { target: { value: string } }) =>
    onCambio({ ...contacto, [campo]: ev.target.value });
  return (
    <>
      <div className="grid grid-cols-2 gap-3.5">
        <label className={ETIQUETA}>
          <span>
            Nombre <em className="not-italic text-red-700">*</em>
          </span>
          <input
            id={`${prefijo}-nombre`}
            value={contacto.nombre}
            onChange={set('nombre')}
            placeholder="Nombre y apellido"
            className={INPUT}
          />
        </label>
        <label className={ETIQUETA}>
          <span>
            Teléfono <em className="not-italic text-red-700">*</em>
          </span>
          <input
            id={`${prefijo}-telefono`}
            inputMode="tel"
            value={contacto.telefono}
            onChange={set('telefono')}
            placeholder="9XX XXX XXX"
            className={INPUT}
          />
        </label>
      </div>
      <label className={ETIQUETA}>
        <span>
          Correo <small className="font-normal text-slate-500">(opcional)</small>
        </span>
        <input
          id={`${prefijo}-correo`}
          type="email"
          value={contacto.correo}
          onChange={set('correo')}
          placeholder="nombre@empresa.com"
          className={INPUT}
        />
      </label>
    </>
  );
}
