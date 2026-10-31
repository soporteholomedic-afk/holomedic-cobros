'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { Empresa } from '../../domain/entities';
import { CONTACTO_VACIO, ContactoFields, type ContactoForm } from './ContactoFields';
import { ALERTA, BOTON_PRIMARIO, BOTON_SECUNDARIO, INPUT } from './crmUi';
import { SectorSelect } from './SectorSelect';

interface Props {
  sectores: string[];
  onCerrar: () => void;
  onCrearSector: (nombre: string) => Promise<string | { error: string }>;
  /** Resolves to the created empresa, or `{ error }` to show in the panel. */
  onCrear: (cuerpo: Record<string, unknown>) => Promise<Empresa | { error: string }>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ETIQUETA = 'grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200';
const LEYENDA = 'mb-0.5 text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400';

/**
 * Floating "Nueva empresa" panel. It is `position: fixed`: it covers the right
 * side of the screen without changing the layout of the board behind it
 * (design comment pr6cscqf).
 */
export function AltaPanel({ sectores, onCerrar, onCrearSector, onCrear }: Props) {
  const [razonSocial, setRazonSocial] = useState('');
  const [ruc, setRuc] = useState('');
  const [sector, setSector] = useState('');
  const [contacto, setContacto] = useState<ContactoForm>(CONTACTO_VACIO);
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const cerrar = useRef(onCerrar);

  useEffect(() => {
    cerrar.current = onCerrar;
  });

  useEffect(() => {
    document.getElementById('alta-razon')?.focus();
    function onKey(e: KeyboardEvent) {
      // A medium or reason dialog open over the panel takes the Escape for itself.
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) cerrar.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function falla(mensaje: string, campo: string) {
    setError(mensaje);
    document.getElementById(campo)?.focus();
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    if (!razonSocial.trim()) return falla('Falta la razón social.', 'alta-razon');
    if (!/^\d{11}$/.test(ruc.trim())) return falla('El RUC debe tener 11 dígitos.', 'alta-ruc');
    if (!contacto.nombre.trim()) return falla('Falta el nombre del contacto.', 'alta-c0-nombre');
    if (contacto.telefono.replace(/\D/g, '').length !== 9) {
      return falla('El teléfono debe tener 9 dígitos.', 'alta-c0-telefono');
    }
    if (contacto.correo.trim() && !EMAIL_RE.test(contacto.correo.trim())) {
      return falla('El correo no es válido.', 'alta-c0-correo');
    }
    setError('');
    setGuardando(true);
    const principal: Record<string, string> = {
      nombre: contacto.nombre.trim(),
      telefono: contacto.telefono.trim(),
    };
    if (contacto.correo.trim()) principal.correo = contacto.correo.trim();
    const cuerpo: Record<string, unknown> = {
      razonSocial: razonSocial.trim(),
      ruc: ruc.trim(),
      contactos: [principal],
    };
    if (sector) cuerpo.sector = sector;
    if (notas.trim()) cuerpo.notas = notas.trim();
    const r = await onCrear(cuerpo);
    if ('error' in r) {
      setError(r.error);
      setGuardando(false);
    }
  }

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="crm-panel-title"
      className="fixed bottom-0 right-0 top-0 z-40 w-[420px] max-w-full overflow-y-auto border-l border-slate-200 bg-white shadow-[-10px_0_30px_rgba(15,23,42,0.14)] dark:border-slate-800 dark:bg-slate-900"
    >
      <header className="flex items-start gap-3 px-6 pb-1.5 pt-5">
        <div>
          <h2 id="crm-panel-title" className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Nueva empresa
          </h2>
          <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-400">
            Se agrega a “Por contactar”. El tablero sigue disponible.
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar panel"
          className="ml-auto grid h-9 w-9 place-items-center rounded-[10px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <form onSubmit={enviar} autoComplete="off" noValidate className="grid gap-3.5 px-6 pb-6 pt-3">
        <fieldset className="grid gap-3.5">
          <legend className={LEYENDA}>Empresa</legend>
          <label className={ETIQUETA}>
            <span>
              Razón social <em className="not-italic text-red-700">*</em>
            </span>
            <input
              id="alta-razon"
              value={razonSocial}
              onChange={(ev) => setRazonSocial(ev.target.value)}
              placeholder="Ej. Constructora Andina S.A.C."
              className={INPUT}
            />
          </label>
          <div className="grid grid-cols-2 items-start gap-3.5">
            <label className={ETIQUETA}>
              <span>
                RUC <em className="not-italic text-red-700">*</em>
              </span>
              <input
                id="alta-ruc"
                inputMode="numeric"
                maxLength={11}
                value={ruc}
                onChange={(ev) => setRuc(ev.target.value)}
                placeholder="11 dígitos"
                className={INPUT}
              />
            </label>
            <SectorSelect
              id="alta-sector"
              sectores={sectores}
              valor={sector}
              onCambio={setSector}
              onCrear={onCrearSector}
            />
          </div>
        </fieldset>

        <fieldset className="grid gap-3.5">
          <legend className={LEYENDA}>Contacto principal</legend>
          <ContactoFields prefijo="alta-c0" contacto={contacto} onCambio={setContacto} />
          <label className={ETIQUETA}>
            <span>
              Notas <small className="font-normal text-slate-500">(opcional)</small>
            </span>
            <textarea
              value={notas}
              onChange={(ev) => setNotas(ev.target.value)}
              placeholder="Cómo llegó, qué necesita, mejor horario…"
              className={`${INPUT} min-h-[72px] resize-y`}
            />
          </label>
        </fieldset>

        {error && (
          <p role="alert" className={ALERTA}>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2.5 pt-1.5">
          <button type="button" onClick={onCerrar} className={BOTON_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
            {guardando ? 'Creando…' : 'Crear empresa'}
          </button>
        </div>
      </form>
    </aside>
  );
}
