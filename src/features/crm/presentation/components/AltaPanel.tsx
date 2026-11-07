'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { Empresa } from '../../domain/entities';
import { CONTACTO_VACIO, ContactoFields, type ContactoForm } from './ContactoFields';
import { ALERTA, BOTON_PRIMARIO, BOTON_SECUNDARIO, INPUT } from './crmUi';
import { SectorSelect } from './SectorSelect';
import { badgeSunat, useConsultaRuc } from './useConsultaRuc';

interface Props {
  sectores: string[];
  onCerrar: () => void;
  /** Hidden but mounted: the draft survives while the detail panel is open. */
  oculto: boolean;
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
export function AltaPanel({ sectores, onCerrar, oculto, onCrearSector, onCrear }: Props) {
  const [razonSocial, setRazonSocial] = useState('');
  const [ruc, setRuc] = useState('');
  const [direccion, setDireccion] = useState('');
  const [sector, setSector] = useState('');
  const [contacto, setContacto] = useState<ContactoForm>(CONTACTO_VACIO);
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Which half of the form the user is in: 0 = empresa, 1 = contacto. It follows the focus.
  const [paso, setPaso] = useState<0 | 1>(0);
  const cerrar = useRef(onCerrar);

  const consulta = useConsultaRuc(ruc);
  // Autofill (T5, S3/S4) as a render-phase adjustment (react.dev "you might
  // not need an effect"): fill razón social and dirección only while empty
  // and only once per SUNAT answer — manual typing always wins afterwards.
  const [autollenadoPara, setAutollenadoPara] = useState<string | null>(null);
  if (consulta.estado.tipo === 'encontrada' && autollenadoPara !== ruc.trim()) {
    setAutollenadoPara(ruc.trim());
    const { datos } = consulta.estado;
    if (!razonSocial.trim()) setRazonSocial(datos.razonSocial);
    if (!direccion.trim() && datos.direccion) setDireccion(datos.direccion);
  }

  useEffect(() => {
    cerrar.current = onCerrar;
  });

  useEffect(() => {
    if (oculto) return;
    document.getElementById('alta-razon')?.focus();
    function onKey(e: KeyboardEvent) {
      // A medium or reason dialog open over the panel takes the Escape for itself.
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) cerrar.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [oculto]);

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
    if (direccion.trim()) cuerpo.direccion = direccion.trim();
    const r = await onCrear(cuerpo);
    if ('error' in r) {
      setError(r.error);
      setGuardando(false);
    }
  }

  return (
    <aside
      role="dialog"
      hidden={oculto}
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

      <ol aria-label="Pasos" className="m-0 flex list-none gap-2 px-6 pb-1 pt-2">
        {(['Empresa', 'Contacto'] as const).map((nombre, i) => (
          <li
            key={nombre}
            aria-current={paso === i ? 'step' : undefined}
            className={`flex flex-1 items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13px] font-semibold ${
              paso === i
                ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            <b
              className={`grid h-[22px] w-[22px] place-items-center rounded-full text-xs ${
                paso === i ? 'bg-sky-600 text-white' : 'bg-slate-300 text-slate-900'
              }`}
            >
              {i + 1}
            </b>
            {nombre}
          </li>
        ))}
      </ol>

      <form onSubmit={enviar} autoComplete="off" noValidate className="grid gap-3.5 px-6 pb-0 pt-3">
        <fieldset className="grid gap-3.5" onFocus={() => setPaso(0)}>
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
          {consulta.estado.tipo === 'encontrada' && (() => {
            const chip = badgeSunat(consulta.estado.datos);
            return chip ? <span className={chip.clase}>{chip.texto}</span> : null;
          })()}
          <label className={ETIQUETA}>
            <span>Dirección fiscal</span>
            <input
              id="alta-direccion"
              value={direccion}
              onChange={(ev) => setDireccion(ev.target.value)}
              placeholder="Se completa con SUNAT al escribir el RUC"
              className={INPUT}
            />
          </label>
          {consulta.estado.tipo === 'cargando' && (
            <p aria-live="polite" className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Consultando SUNAT…
            </p>
          )}
          {'mensaje' in consulta.estado && (
            <p role="status" className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
              {consulta.estado.mensaje}
            </p>
          )}
        </fieldset>

        <fieldset className="grid gap-3.5" onFocus={() => setPaso(1)}>
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

        <div
          data-pie-alta
          className="sticky bottom-0 -mx-6 flex justify-end gap-2.5 border-t border-slate-200 bg-white px-6 pb-4 pt-3 shadow-[0_-8px_12px_-8px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-900"
        >
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
