'use client';

import { Pencil, X } from 'lucide-react';
import { useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type FormEvent, type Ref } from 'react';

import { ESTADOS_ATENCION, ESTADO_ATENCION_LABELS, type EstadoAtencion } from '../../domain/actividadServicios';
import { RELACION_LABELS, type Empresa, type Oportunidad, type Relacion } from '../../domain/entities';
import { ALERTA, BOTON_PRIMARIO, BOTON_SECUNDARIO } from './crmUi';
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
  /** Every oportunidad of the board; the panel shows the ones of this empresa. */
  oportunidades: Oportunidad[];
  sectores: string[];
  controlRef: Ref<DetalleHandle>;
  onCerrar: () => void;
  onGuardar: (id: string, cuerpo: Record<string, unknown>) => Promise<Empresa | { error: string }>;
  /** Manual relación change (S6.3): never derived from a deal result. */
  onCambiarRelacion: (id: string, relacion: Relacion) => Promise<Empresa | { error: string }>;
  onCrearSector: (nombre: string) => Promise<string | { error: string }>;
  /** Opens the medium dialog for one oportunidad of this empresa (PATCH /seguimiento). */
  onCambiarMedio: (o: Oportunidad) => void;
  /** Opens the reason dialog for one oportunidad of this empresa (PATCH /seguimiento). */
  onEditarMotivo: (o: Oportunidad) => void;
  onGuardarRuc: (id: string, ruc: string, unir: boolean) => Promise<ResultadoRuc>;
  /** Opens the "Registrar actividad" panel for this empresa. */
  onRegistrar: (id: string) => void;
}

const CHIP_RELACION: Record<Relacion, string> = {
  cliente:
    'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
  prospecto:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
};

interface RespuestaAtencion {
  clave: string;
  datos: { etiqueta: string; ultimaAtencion: string | null } | null;
}

/** Live SIGLA attention signal of the ficha (S6.6/S6.7): fetched with no-store on open. */
function useAtencion(idEmpresa: string, version: string) {
  const [resultado, setResultado] = useState<RespuestaAtencion | null>(null);
  const clave = `${idEmpresa}|${version}`;

  useEffect(() => {
    let cancelado = false;
    (async () => {
      let datos: RespuestaAtencion['datos'] = null;
      try {
        const res = await fetch(`/api/crm/empresas/${idEmpresa}/atencion`, { cache: 'no-store' });
        if (res.ok) {
          const cuerpo = (await res.json()) as { estado?: unknown; actividad?: { ultimaAtencion?: unknown } };
          const estado = cuerpo.estado;
          if (typeof estado === 'string' && (ESTADOS_ATENCION as readonly string[]).includes(estado)) {
            const ultima = cuerpo.actividad?.ultimaAtencion;
            datos = {
              etiqueta: ESTADO_ATENCION_LABELS[estado as EstadoAtencion],
              ultimaAtencion: typeof ultima === 'string' ? ultima : null,
            };
          }
        }
      } catch {
        // SIGLA unreachable or an unusable answer: the error state says so inline
      }
      if (!cancelado) setResultado({ clave, datos });
    })();
    return () => {
      cancelado = true;
    };
  }, [idEmpresa, clave]);

  if (!resultado || resultado.clave !== clave) return { estado: 'cargando' } as const;
  if (!resultado.datos) return { estado: 'error' } as const;
  return { estado: 'listo', ...resultado.datos } as const;
}

/**
 * Floating detail panel of one empresa (`position: fixed`, so the board does
 * not move). Read-only by default; "Editar" turns it into a form. Leaving the
 * form with unsaved changes asks first.
 */
export function DetallePanel({
  empresa,
  empresas,
  oportunidades,
  sectores,
  controlRef,
  onCerrar,
  onGuardar,
  onCambiarRelacion,
  onCrearSector,
  onCambiarMedio,
  onEditarMotivo,
  onGuardarRuc,
  onRegistrar,
}: Props) {
  const tituloId = useId();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [error, setError] = useState('');
  const [invalido, setInvalido] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  const [guardandoRelacion, setGuardandoRelacion] = useState(false);
  const [errorRelacion, setErrorRelacion] = useState('');

  const titulo = useRef<HTMLHeadingElement>(null);
  const botonEditar = useRef<HTMLButtonElement>(null);
  const botonSeguir = useRef<HTMLButtonElement>(null);
  const pendiente = useRef<(() => void) | null>(null);
  const focoPrevio = useRef<Element | null>(null);
  const focoPendiente = useRef<string | null>(null);
  const devolverAEditar = useRef(false);
  const alEscape = useRef<() => void>(() => undefined);

  /** The deals of THIS empresa: the "Oportunidades" section. */
  const misOportunidades = useMemo(
    () => oportunidades.filter((o) => o.idEmpresa === empresa.idEmpresa),
    [oportunidades, empresa.idEmpresa],
  );
  // Any change in the empresa's deals (stage, merge, follow-up) refreshes the history.
  const versionOportunidades = misOportunidades.map((o) => `${o.idOportunidad}:${o.etapa}:${o.updatedAt}`).join('|');
  const { reintentar, ...historial } = useHistorial(empresa.idEmpresa, empresa.updatedAt, versionOportunidades);
  const atencion = useAtencion(empresa.idEmpresa, empresa.updatedAt);
  const ahora = new Date();

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

  /** Manual relation toggle (S6.3). The board PATCHes and returns the updated ficha. */
  async function cambiarRelacion(relacion: Relacion) {
    if (guardandoRelacion) return;
    setErrorRelacion('');
    setGuardandoRelacion(true);
    const r = await onCambiarRelacion(empresa.idEmpresa, relacion);
    setGuardandoRelacion(false);
    if ('error' in r) setErrorRelacion(r.error);
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
          <p className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CHIP_RELACION[empresa.relacion]}`}
            >
              {RELACION_LABELS[empresa.relacion]}
            </span>
            {!editando && (
              <button
                type="button"
                disabled={guardandoRelacion}
                onClick={() => void cambiarRelacion(empresa.relacion === 'cliente' ? 'prospecto' : 'cliente')}
                className="text-[13px] font-semibold text-sky-700 underline hover:brightness-110 disabled:opacity-50 dark:text-sky-300"
              >
                {`Cambiar a ${RELACION_LABELS[empresa.relacion === 'cliente' ? 'prospecto' : 'cliente'].toLowerCase()}`}
              </button>
            )}
          </p>
          {errorRelacion && (
            <p role="alert" className={`mt-1.5 ${ALERTA}`}>
              {errorRelacion}
            </p>
          )}
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
          oportunidades={misOportunidades}
          atencion={atencion}
          onCambiarMedio={onCambiarMedio}
          onEditarMotivo={onEditarMotivo}
          onGuardarRuc={(ruc, unir) => onGuardarRuc(empresa.idEmpresa, ruc, unir)}
          historial={historial}
          onReintentarHistorial={reintentar}
          ahora={ahora}
        />
      )}
      {!editando && (
        <div
          data-pie-detalle
          className="sticky bottom-0 mt-auto flex justify-end border-t border-slate-200 bg-white px-6 pb-4 pt-3 shadow-[0_-8px_12px_-8px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-900"
        >
          <button
            type="button"
            onClick={(ev) => {
              ev.currentTarget.focus();
              onRegistrar(empresa.idEmpresa);
            }}
            className={BOTON_PRIMARIO}
          >
            Registrar actividad
          </button>
        </div>
      )}
    </aside>
  );
}
