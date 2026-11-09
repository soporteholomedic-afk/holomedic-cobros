'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import {
  MONTO_MAXIMO,
  ORIGENES,
  ORIGEN_LABELS,
  type Empresa,
  type Origen,
} from '../../domain/entities';
import { CONTACTO_VACIO, ContactoFields, type ContactoForm } from './ContactoFields';
import { CrmSelect } from './CrmSelect';
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
  /**
   * Creates the optional primera oportunidad of the JUST-CREATED empresa
   * (spec S4/S7.1). It runs only after `onCrear` succeeded, so a failure here
   * leaves the ficha standing for the retry affordance.
   */
  onCrearOportunidad: (idEmpresa: string, cuerpo: Record<string, unknown>) => Promise<unknown | { error: string }>;
  /**
   * Optional prefill (S11): creating a ficha for a SIGLA-only dormant client
   * — razón social, RUC and contact data straight from SIGLA. The caller
   * remounts the panel per client (key), so seeding the states once is enough.
   */
  inicial?: { razonSocial: string; ruc: string; contacto: string | null; telefono: string | null; correo: string | null };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ETIQUETA = 'grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200';
const LEYENDA = 'mb-0.5 text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400';

const ORIGEN_OPCIONES: { value: Origen; label: string }[] = ORIGENES.map((o) => ({ value: o, label: ORIGEN_LABELS[o] }));

/**
 * Floating "Nueva empresa" panel. It is `position: fixed`: it covers the right
 * side of the screen without changing the layout of the board behind it
 * (design comment pr6cscqf). It creates ONLY the ficha by default (S7.1); the
 * collapsible "Primera oportunidad" section offers the optional first deal of
 * S4 in the same flow — two POSTs, and if the second fails the ficha stays
 * created with a retry affordance.
 */
export function AltaPanel({ sectores, onCerrar, oculto, onCrearSector, onCrear, onCrearOportunidad, inicial }: Props) {
  const [razonSocial, setRazonSocial] = useState(inicial?.razonSocial ?? '');
  const [ruc, setRuc] = useState(inicial?.ruc ?? '');
  const [direccion, setDireccion] = useState('');
  const [sector, setSector] = useState('');
  const [contacto, setContacto] = useState<ContactoForm>(
    inicial
      ? { nombre: inicial.contacto ?? '', telefono: inicial.telefono ?? '', correo: inicial.correo ?? '' }
      : CONTACTO_VACIO,
  );
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Optional primera oportunidad (S4): collapsed (unchecked) by default.
  const [conOportunidad, setConOportunidad] = useState(false);
  const [opNombre, setOpNombre] = useState('');
  const [opServicio, setOpServicio] = useState('');
  const [opOrigen, setOpOrigen] = useState<Origen | null>(null);
  const [opResponsable, setOpResponsable] = useState('');
  const [opMonto, setOpMonto] = useState('');
  // The ficha already created while the deal could not be: the retry affordance works on it.
  const [fichaCreada, setFichaCreada] = useState<Empresa | null>(null);
  const [errorOportunidad, setErrorOportunidad] = useState('');
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
    if (conOportunidad && !opNombre.trim()) {
      return falla('Falta el nombre de la oportunidad.', 'alta-op-nombre');
    }
    if (conOportunidad && opMonto.trim()) {
      const monto = Number(opMonto);
      if (!Number.isFinite(monto) || monto <= 0) return falla('El monto estimado debe ser un número mayor a 0.', 'alta-op-monto');
      if (monto > MONTO_MAXIMO) return falla(`El monto estimado admite hasta ${MONTO_MAXIMO}.`, 'alta-op-monto');
    }
    setError('');
    setErrorOportunidad('');
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
      return;
    }
    // S7.1: the section off means ONE POST — the ficha alone, and the deal is left for later.
    if (!conOportunidad) {
      setGuardando(false);
      cerrar.current();
      return;
    }
    const ok = await crearLaOportunidad(r);
    setGuardando(false);
    if (ok) cerrar.current();
    // On failure the panel stays: the ficha is created and the retry affordance shows below.
  }

  /** Second POST of the flow (S4): the deal of the ficha just created. */
  async function crearLaOportunidad(empresa: Empresa): Promise<boolean> {
    const cuerpo: Record<string, unknown> = { nombre: opNombre.trim() };
    if (opServicio.trim()) cuerpo.servicio = opServicio.trim();
    if (opOrigen) cuerpo.origen = opOrigen;
    if (opResponsable.trim()) cuerpo.responsableNombre = opResponsable.trim();
    if (opMonto.trim()) cuerpo.montoEstimado = Number(opMonto);
    const r = await onCrearOportunidad(empresa.idEmpresa, cuerpo);
    if (r && typeof r === 'object' && 'error' in r && typeof r.error === 'string') {
      setFichaCreada(empresa);
      setErrorOportunidad(r.error);
      return false;
    }
    return true;
  }

  /** The retry affordance: the ficha is already standing, only the deal is sent again. */
  async function reintentarOportunidad() {
    if (!fichaCreada || guardando) return;
    setErrorOportunidad('');
    setGuardando(true);
    const ok = await crearLaOportunidad(fichaCreada);
    setGuardando(false);
    if (ok) cerrar.current();
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
            Crea solo la ficha; su primera oportunidad es opcional, más abajo.
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

        <fieldset className="grid gap-3.5">
          <legend className={LEYENDA}>Primera oportunidad (opcional)</legend>
          <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
            <input
              id="alta-op-check"
              type="checkbox"
              checked={conOportunidad}
              onChange={(ev) => {
                setConOportunidad(ev.target.checked);
                setErrorOportunidad('');
              }}
              className="h-4 w-4 accent-sky-600"
            />
            Crear también su primera oportunidad en “Por contactar”
          </label>
          {conOportunidad && (
            <div className="grid gap-3.5">
              <label className={ETIQUETA}>
                <span>
                  Nombre de la oportunidad <em className="not-italic text-red-700">*</em>
                </span>
                <input
                  id="alta-op-nombre"
                  value={opNombre}
                  maxLength={120}
                  onChange={(ev) => setOpNombre(ev.target.value)}
                  placeholder="Ej. Exámenes de ingreso 2026"
                  className={INPUT}
                />
              </label>
              <label className={ETIQUETA}>
                <span>
                  Servicio de interés <small className="font-normal text-slate-500">(opcional)</small>
                </span>
                <input
                  id="alta-op-servicio"
                  value={opServicio}
                  maxLength={120}
                  onChange={(ev) => setOpServicio(ev.target.value)}
                  placeholder="Ej. Exámenes ocupacionales"
                  className={INPUT}
                />
              </label>
              <div className="grid grid-cols-2 items-start gap-3.5">
                <CrmSelect<Origen>
                  id="alta-op-origen"
                  label="¿Cómo nos conoció?"
                  nota="(opcional)"
                  value={opOrigen}
                  options={ORIGEN_OPCIONES}
                  placeholder="Elige una opción"
                  onChange={setOpOrigen}
                />
                <label className={ETIQUETA}>
                  <span>
                    Responsable <small className="font-normal text-slate-500">(opcional)</small>
                  </span>
                  <input
                    id="alta-op-responsable"
                    value={opResponsable}
                    onChange={(ev) => setOpResponsable(ev.target.value)}
                    placeholder="Quién lleva el negocio"
                    className={INPUT}
                  />
                </label>
              </div>
              <label className={ETIQUETA}>
                <span>
                  Monto estimado (S/) <small className="font-normal text-slate-500">(opcional)</small>
                </span>
                <input
                  id="alta-op-monto"
                  inputMode="decimal"
                  value={opMonto}
                  onChange={(ev) => setOpMonto(ev.target.value)}
                  placeholder="Ej. 7500"
                  className={INPUT}
                />
              </label>
              {errorOportunidad && (
                <div role="alert" className={`grid gap-2 ${ALERTA}`}>
                  <span>{`La empresa «${fichaCreada?.razonSocial ?? ''}» quedó creada, pero la oportunidad no:`}</span>
                  <span>{errorOportunidad}</span>
                  <button
                    type="button"
                    onClick={() => void reintentarOportunidad()}
                    disabled={guardando}
                    className={`${BOTON_PRIMARIO} justify-self-start`}
                  >
                    {guardando ? 'Creando…' : 'Reintentar oportunidad'}
                  </button>
                </div>
              )}
            </div>
          )}
        </fieldset>

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
