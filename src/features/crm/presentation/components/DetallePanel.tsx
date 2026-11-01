'use client';

import { Pencil, X } from 'lucide-react';
import { useEffect, useId, useImperativeHandle, useRef, useState, type FormEvent, type Ref } from 'react';

import { ETAPA_LABELS, type Empresa } from '../../domain/entities';
import { ALERTA, BOTON_PRIMARIO, BOTON_SECUNDARIO, ETAPA_PUNTO } from './crmUi';
import { etiquetaDeTarjeta } from './etiquetas';
import { hoyEnZona } from './fechas';
import type { ResultadoRuc } from './RucFaltante';
import { useHistorial } from './useHistorial';
import { DetalleForm } from './DetalleForm';
import { DetalleVista } from './DetalleVista';
import {
  aCuerpo,
  contactoVacio,
  desdeEmpresa,
  estaSucio,
  idCampo,
  validar,
  type Borrador,
} from './detalleBorrador';

/** What the board can ask of the panel before it leaves it (open another card, "Nueva empresa"). */
export interface DetalleHandle {
  /** Runs `accion` now, or after the user discards unsaved changes. */
  intentarSalir: (accion: () => void) => void;
}

interface Props {
  empresa: Empresa;
  /** Every empresa, to reject a RUC that belongs to another one before calling the server. */
  empresas: Empresa[];
  sectores: string[];
  controlRef: Ref<DetalleHandle>;
  onCerrar: () => void;
  onGuardar: (id: string, cuerpo: Record<string, unknown>) => Promise<Empresa | { error: string }>;
  onCrearSector: (nombre: string) => Promise<string | { error: string }>;
  onCambiarMedio: (e: Empresa) => void;
  onEditarMotivo: (e: Empresa) => void;
  onGuardarRuc: (id: string, ruc: string, unir: boolean) => Promise<ResultadoRuc>;
}

/**
 * Floating detail panel of one empresa (`position: fixed`, so the board does
 * not move). Read-only by default; "Editar" turns it into a form. Leaving the
 * form with unsaved changes asks first.
 */
export function DetallePanel({
  empresa,
  empresas,
  sectores,
  controlRef,
  onCerrar,
  onGuardar,
  onCrearSector,
  onCambiarMedio,
  onEditarMotivo,
  onGuardarRuc,
}: Props) {
  const tituloId = useId();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [error, setError] = useState('');
  const [invalido, setInvalido] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [anuncio, setAnuncio] = useState('');

  const titulo = useRef<HTMLHeadingElement>(null);
  const botonEditar = useRef<HTMLButtonElement>(null);
  const botonSeguir = useRef<HTMLButtonElement>(null);
  const pendiente = useRef<(() => void) | null>(null);
  const focoPrevio = useRef<Element | null>(null);
  const focoPendiente = useRef<string | null>(null);
  const devolverAEditar = useRef(false);
  const alEscape = useRef<() => void>(() => undefined);

  const { reintentar, ...historial } = useHistorial(empresa.idEmpresa, empresa.updatedAt);
  const ahora = new Date();
  const etiqueta = etiquetaDeTarjeta(empresa, ahora);

  const editando = borrador !== null;
  const sucio = borrador !== null && estaSucio(borrador, empresa);

  function salirDeEdicion() {
    setBorrador(null);
    setError('');
    setInvalido(null);
    setAnuncio('');
    devolverAEditar.current = true;
  }

  function intentarSalir(accion: () => void) {
    if (!sucio) {
      accion();
      return;
    }
    pendiente.current = accion;
    focoPrevio.current = document.activeElement;
    setError('');
    setInvalido(null);
    setConfirmando(true);
  }

  function seguirEditando() {
    pendiente.current = null;
    setConfirmando(false);
    const previo = focoPrevio.current;
    const vuelta =
      previo instanceof HTMLElement && previo.isConnected && /^(INPUT|TEXTAREA|SELECT)$/.test(previo.tagName)
        ? previo
        : document.getElementById('det-razon');
    vuelta?.focus();
  }

  function descartar() {
    const accion = pendiente.current;
    pendiente.current = null;
    setConfirmando(false);
    accion?.();
  }

  useImperativeHandle(controlRef, () => ({ intentarSalir }));

  useEffect(() => {
    alEscape.current = () => (confirmando ? seguirEditando() : intentarSalir(onCerrar));
  });

  useEffect(() => {
    titulo.current?.focus();
    function onKey(e: KeyboardEvent) {
      // A medium or reason dialog open over the panel takes the Escape for itself.
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      alEscape.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Focus requested by an action (new contact, edit mode, back to "Editar"): applied once the DOM has changed.
  useEffect(() => {
    if (focoPendiente.current) {
      document.getElementById(focoPendiente.current)?.focus();
      focoPendiente.current = null;
    }
    if (devolverAEditar.current && !editando) {
      devolverAEditar.current = false;
      botonEditar.current?.focus();
    }
  });

  useEffect(() => {
    if (confirmando) botonSeguir.current?.focus();
  }, [confirmando]);

  function entrarEnEdicion() {
    setBorrador(desdeEmpresa(empresa));
    setError('');
    focoPendiente.current = 'det-razon';
  }

  function cambiar(b: Borrador) {
    setBorrador(b);
    setError('');
    setInvalido(null);
  }

  function agregar() {
    if (!borrador) return;
    const nuevo = contactoVacio();
    cambiar({ ...borrador, contactos: [...borrador.contactos, nuevo] });
    focoPendiente.current = idCampo(nuevo.clave, 'nombre');
    setAnuncio('Contacto agregado');
  }

  function quitar(i: number) {
    if (!borrador || borrador.contactos.length < 2) return;
    const resto = borrador.contactos.filter((_, j) => j !== i);
    cambiar({ ...borrador, contactos: resto });
    focoPendiente.current = idCampo(resto[Math.min(i, resto.length - 1)]!.clave, 'nombre');
    setAnuncio('Contacto quitado');
  }

  function hacerPrincipal(i: number) {
    if (!borrador) return;
    const elegido = borrador.contactos[i];
    if (!elegido) return;
    cambiar({ ...borrador, contactos: [elegido, ...borrador.contactos.filter((_, j) => j !== i)] });
    focoPendiente.current = idCampo(elegido.clave, 'nombre');
    setAnuncio(`Contacto ${i + 1} ahora es el principal`);
  }

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    if (!borrador || guardando) return;
    const fallo = validar(borrador, empresas, empresa.idEmpresa);
    if (fallo) {
      setError(fallo.mensaje);
      setInvalido(fallo.campo);
      document.getElementById(fallo.campo)?.focus();
      return;
    }
    setError('');
    setGuardando(true);
    const r = await onGuardar(empresa.idEmpresa, aCuerpo(borrador));
    setGuardando(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    salirDeEdicion();
  }

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={tituloId}
      className="fixed bottom-0 right-0 top-0 z-40 flex w-[420px] max-w-full flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-[-10px_0_30px_rgba(15,23,42,0.14)] dark:border-slate-800 dark:bg-slate-900"
    >
      <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-200 bg-white px-6 pb-3 pt-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-0">
          <h2
            id={tituloId}
            ref={titulo}
            tabIndex={-1}
            className="text-xl font-bold text-slate-900 outline-none dark:text-slate-100"
          >
            {empresa.razonSocial}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-600 dark:text-slate-400">
            <span className={`h-2.5 w-2.5 rounded-full ${ETAPA_PUNTO[empresa.etapa]}`} aria-hidden="true" />
            <span>{ETAPA_LABELS[empresa.etapa]}</span>
            {etiqueta && <span>{` · ${etiqueta.texto}`}</span>}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {!editando && (
            <button
              ref={botonEditar}
              type="button"
              onClick={entrarEnEdicion}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-slate-800"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Editar
            </button>
          )}
          <button
            type="button"
            onClick={() => intentarSalir(onCerrar)}
            aria-label="Cerrar detalle"
            className="grid h-9 w-9 place-items-center rounded-[10px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {borrador ? (
        <form onSubmit={guardar} autoComplete="off" noValidate className="flex flex-1 flex-col">
          <DetalleForm
            borrador={borrador}
            sectores={sectores}
            invalido={invalido}
            anuncio={anuncio}
            onCambio={cambiar}
            onCrearSector={onCrearSector}
            onAgregar={agregar}
            onQuitar={quitar}
            onHacerPrincipal={hacerPrincipal}
          />
          <div
            data-pie-detalle
            className="sticky bottom-0 mt-auto grid gap-3 border-t border-slate-200 bg-white px-6 pb-4 pt-3 shadow-[0_-8px_12px_-8px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-900"
          >
            {error && (
              <p role="alert" className={ALERTA}>
                {error}
              </p>
            )}
            {confirmando && (
              <div role="alert" className={`${ALERTA} grid gap-2.5`}>
                <p className="font-semibold">Tienes cambios sin guardar.</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <button ref={botonSeguir} type="button" onClick={seguirEditando} className={`${BOTON_SECUNDARIO} !h-9`}>
                    Seguir editando
                  </button>
                  <button
                    type="button"
                    onClick={descartar}
                    className="h-9 rounded-xl bg-red-700 px-3 text-sm font-semibold text-white hover:brightness-110"
                  >
                    Descartar cambios
                  </button>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2.5">
              <button type="button" onClick={() => intentarSalir(salirDeEdicion)} className={BOTON_SECUNDARIO}>
                Cancelar
              </button>
              <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <DetalleVista
          empresa={empresa}
          onCambiarMedio={onCambiarMedio}
          onEditarMotivo={onEditarMotivo}
          onGuardarRuc={(ruc, unir) => onGuardarRuc(empresa.idEmpresa, ruc, unir)}
          historial={historial}
          onReintentarHistorial={reintentar}
          ahora={ahora}
          hoy={hoyEnZona(ahora)}
        />
      )}
    </aside>
  );
}
