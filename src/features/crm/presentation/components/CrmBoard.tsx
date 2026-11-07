'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, Plus, Search, Upload } from 'lucide-react';
import { toast } from 'sonner';

import {
  ETAPAS_OPORTUNIDAD,
  ETAPA_OPORTUNIDAD_LABELS,
  MEDIO_LABELS,
  type Direccion,
  type Empresa,
  type EtapaOportunidad,
  type Medio,
  type IconoSector,
  type Motivo,
  type Oportunidad,
  type Sector,
} from '../../domain/entities';
import { AltaPanel } from './AltaPanel';
import { CrmCard } from './CrmCard';
import { ETAPA_PUNTO } from './crmUi';
import type { OtraEmpresa, ResultadoRuc } from './RucFaltante';
import { DetallePanel, type DetalleHandle } from './DetallePanel';
import { MedioDialog } from './MedioDialog';
import { MotivoDialog } from './MotivoDialog';
import type { ResultadoSector } from './NuevoSectorBox';
import { hoyEnZona } from './fechas';
import { EntrantePanel } from './EntrantePanel';
import { PanelDia } from './PanelDia';
import { RegistrarContactoPanel } from './RegistrarContactoPanel';
import { capturar, focoEnTarjeta, reproducir, type Captura, type Foco, type Registro } from './vuelo';

interface ApiResult {
  ok: boolean;
  error?: string;
  empresa?: Empresa;
  oportunidad?: Oportunidad;
}

async function leerRespuesta(res: Response): Promise<ApiResult> {
  let data: { error?: string; empresa?: Empresa; oportunidad?: Oportunidad } = {};
  try {
    data = await res.json();
  } catch {
    // body is not JSON: fall through with the status only
  }
  return { ok: res.ok, error: data.error, empresa: data.empresa, oportunidad: data.oportunidad };
}

async function post(url: string, body: unknown): Promise<ApiResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await leerRespuesta(res);
  } catch {
    return { ok: false };
  }
}

async function patch(url: string, body: unknown): Promise<ApiResult> {
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await leerRespuesta(res);
  } catch {
    return { ok: false };
  }
}

/** A dialog the board is showing, and what saving it should do. */
type Dialogo =
  | { tipo: 'medio'; id: string; modo: 'mover' | 'editar'; inicial: Medio | null; destino: EtapaOportunidad }
  | { tipo: 'motivo'; id: string; modo: 'mover' | 'editar'; inicial: Motivo | null };

/**
 * Kanban board of the CRM by oportunidades (spec S2): one card per deal, six
 * stages, drag-and-drop or buttons to move. The empresas are joined client
 * side for the card header (name, RUC, sector). Entering Contactado asks for
 * the contact medium and entering Perdida asks for the loss reason; nothing
 * moves until that dialog is saved.
 */
export function CrmBoard() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [dragOver, setDragOver] = useState<EtapaOportunidad | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  // 'oculta': the create panel is mounted (draft kept) but hidden while a detail is open.
  const [alta, setAlta] = useState<'cerrada' | 'visible' | 'oculta'>('cerrada');
  const [detalleId, setDetalleId] = useState<string | null>(null);
  // The "Registrar actividad" panel: which card, and who started the contact when it opened.
  const [registro, setRegistro] = useState<{ id: string; direccion: Direccion } | null>(null);
  const abridorRegistro = useRef<HTMLElement | null>(null);
  const [entranteAbierto, setEntranteAbierto] = useState(false);
  const botonEntrante = useRef<HTMLButtonElement>(null);
  const detalleRef = useRef<DetalleHandle>(null);
  const [sectores, setSectores] = useState<Sector[]>([]);
  const nombresSector = useMemo(() => sectores.map((s) => s.nombre), [sectores]);
  const draggingId = useRef<string | null>(null);
  const botonNueva = useRef<HTMLButtonElement>(null);
  // Trip of a card that just changed column: photographed before the list is replaced, played after.
  const pendienteVuelo = useRef<Captura | null>(null);
  const vuelos = useRef<Registro>(new Map());
  // Where the focus was on a card when a dialog took it, so it can be given back when the card lands.
  const focoDeOrigen = useRef<{ id: string; foco: Foco } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const [resEmpresas, resOportunidades] = await Promise.all([
          fetch('/api/crm/empresas'),
          fetch('/api/crm/oportunidades'),
        ]);
        if (!resEmpresas.ok || !resOportunidades.ok) throw new Error('load failed');
        const dataEmpresas = (await resEmpresas.json()) as { empresas: Empresa[] };
        const dataOportunidades = (await resOportunidades.json()) as { oportunidades: Oportunidad[] };
        if (!cancelled) {
          setEmpresas(dataEmpresas.empresas);
          setOportunidades(dataOportunidades.oportunidades);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/crm/sectores');
        if (!res.ok) return;
        const data = (await res.json()) as { sectores?: Sector[] };
        if (!cancelled && Array.isArray(data.sectores)) setSectores(data.sectores);
      } catch {
        // the panel still works without the list: the sector is optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    const c = pendienteVuelo.current;
    if (!c) return;
    pendienteVuelo.current = null;
    reproducir(c, vuelos.current);
  }, [oportunidades]);

  useEffect(() => {
    const enVuelo = vuelos.current;
    return () => {
      // Leaving the page mid-trip: remove the flying copy.
      [...enVuelo.values()].forEach((fin) => fin(false));
    };
  }, []);

  /** Fichas by id, so each card can be joined with its empresa (S2). */
  const empresaDe = useMemo(() => new Map(empresas.map((x) => [x.idEmpresa, x])), [empresas]);

  /** Deals that have their ficha on screen, joined. A missing empresa is skipped quietly. */
  const tarjetas = useMemo(
    () =>
      oportunidades.flatMap((o) => {
        const e = empresaDe.get(o.idEmpresa);
        return e ? [{ o, e }] : [];
      }),
    [oportunidades, empresaDe],
  );

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tarjetas;
    return tarjetas.filter(({ o, e }) =>
      [o.nombre, o.servicio ?? '', o.responsableNombre ?? '', e.razonSocial, e.ruc ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [tarjetas, search]);

  const cerrarDialogo = useCallback(() => {
    focoDeOrigen.current = null;
    setDialogo(null);
  }, []);

  const cerrarPanel = useCallback(() => {
    setAlta('cerrada');
    botonNueva.current?.focus();
  }, []);

  /** Run `accion` now, or after the open detail panel lets go of its unsaved changes. */
  function conGuardia(accion: () => void) {
    if (detalleId && detalleRef.current) detalleRef.current.intentarSalir(accion);
    else accion();
  }

  function abrirDetalle(idEmpresa: string) {
    if (idEmpresa === detalleId) return;
    conGuardia(() => {
      setRegistro(null);
      setEntranteAbierto(false);
      setDetalleId(idEmpresa);
      if (alta === 'visible') {
        setAlta('oculta');
        toast.info('El borrador de “Nueva empresa” se conserva');
      }
    });
  }

  /** Give the focus to the first card of this empresa (its oportunidades are the cards now). */
  function enfocarTarjetaDeEmpresa(idEmpresa: string) {
    const primera = oportunidades.find((o) => o.idEmpresa === idEmpresa);
    if (primera) document.querySelector<HTMLElement>(`[data-empresa-id="${primera.idOportunidad}"]`)?.focus();
  }

  function cerrarDetalle() {
    const id = detalleId;
    setDetalleId(null);
    if (id) enfocarTarjetaDeEmpresa(id);
  }

  /** Open the activity panel for a card; the detail and the create panels step aside. */
  function abrirRegistro(id: string, direccion: Direccion) {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    conGuardia(() => {
      abridorRegistro.current = opener;
      setEntranteAbierto(false);
      setDetalleId(null);
      if (alta === 'visible') {
        setAlta('oculta');
        toast.info('El borrador de “Nueva empresa” se conserva');
      }
      setRegistro({ id, direccion });
    });
  }

  /** Close the activity panel and give the focus back to what opened it, or to the card when that is gone. */
  function cerrarRegistro() {
    const id = registro?.id;
    const opener = abridorRegistro.current;
    abridorRegistro.current = null;
    setRegistro(null);
    if (opener?.isConnected) opener.focus();
    else if (id) document.querySelector<HTMLElement>(`[data-empresa-id="${id}"]`)?.focus();
  }

  function contactoGuardado(nueva: Empresa) {
    // TODO('T8'): the activity panel will return the linked oportunidad too,
    // so the board can move its card; for now only the ficha is refreshed.
    reemplazarEmpresa(nueva, false);
    cerrarRegistro();
  }

  /** Open the "Nos contactaron" panel; the detail, contact and create panels step aside. */
  function pedirEntrante() {
    conGuardia(() => {
      setRegistro(null);
      setDetalleId(null);
      if (alta === 'visible') {
        setAlta('oculta');
        toast.info('El borrador de \u201cNueva empresa\u201d se conserva');
      }
      if (entranteAbierto) document.getElementById('ent-razon')?.focus();
      setEntranteAbierto(true);
    });
  }

  function cerrarEntrante() {
    setEntranteAbierto(false);
    botonEntrante.current?.focus();
  }

  function entranteGuardado(nueva: Empresa, existente: boolean) {
    // TODO('T8'): the inbound flow now creates the first oportunidad; the
    // board will need the new oportunidad returned to place the card.
    reemplazarEmpresa(nueva, !existente);
    setEntranteAbierto(false);
    botonEntrante.current?.focus();
    toast.success(`${nueva.razonSocial} quedó registrada.`);
  }

  function pedirNueva() {
    conGuardia(() => {
      setRegistro(null);
      setEntranteAbierto(false);
      setDetalleId(null);
      setAlta('visible');
      if (alta === 'visible') document.getElementById('alta-razon')?.focus();
    });
  }

  async function guardarEmpresa(id: string, cuerpo: Record<string, unknown>): Promise<Empresa | { error: string }> {
    const r = await patch(`/api/crm/empresas/${id}`, cuerpo);
    if (!r.ok || !r.empresa) return { error: r.error ?? 'No se pudo guardar la empresa' };
    reemplazarEmpresa(r.empresa, false);
    toast.success('Cambios guardados');
    return r.empresa;
  }

  /** Complete the RUC of a ficha. A RUC owned by another empresa comes back as a conflict to confirm. */
  async function guardarRuc(id: string, ruc: string, unir: boolean): Promise<ResultadoRuc> {
    try {
      const res = await fetch(`/api/crm/empresas/${id}/ruc`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unir ? { ruc, unir: true } : { ruc }),
      });
      let data: { error?: string; empresa?: Empresa; otra?: OtraEmpresa } = {};
      try {
        data = await res.json();
      } catch {
        // not JSON
      }
      if (res.ok && data.empresa) {
        const nueva = data.empresa;
        if (unir) {
          setEmpresas((prev) => prev.filter((x) => x.idEmpresa !== id).map((x) => (x.idEmpresa === nueva.idEmpresa ? nueva : x)));
          setDetalleId(nueva.idEmpresa);
          toast.success(`Fichas unidas. El historial quedó en «${nueva.razonSocial}».`);
        } else {
          reemplazarEmpresa(nueva, false);
          toast.success('RUC guardado.');
        }
        return { tipo: 'ok' };
      }
      if (res.status === 409 && data.otra && !unir) return { tipo: 'conflicto', otra: data.otra };
      toast.error(data.error ?? 'No se pudo guardar el RUC');
    } catch {
      toast.error('No se pudo guardar el RUC');
    }
    return { tipo: 'error' };
  }

  /** Store a sector (with its icon when given) and add it to the list. A 409 is reported as `duplicado`. */
  async function crearSector(nombre: string, icono?: IconoSector): Promise<ResultadoSector> {
    try {
      const res = await fetch('/api/crm/sectores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(icono ? { nombre, icono } : { nombre }),
      });
      let data: { error?: string; sector?: Sector } = {};
      try {
        data = await res.json();
      } catch {
        // not JSON
      }
      if (!res.ok || !data.sector) {
        return { error: data.error ?? 'No se pudo crear el sector.', duplicado: res.status === 409 };
      }
      const creado = data.sector;
      setSectores((prev) => [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      return creado;
    } catch {
      return { error: 'No se pudo crear el sector.' };
    }
  }

  /** Name-only variant for the empresa forms ("Nuevo sector" without icon). */
  async function crearSectorPorNombre(nombre: string): Promise<string | { error: string }> {
    const r = await crearSector(nombre);
    return 'error' in r ? { error: r.error } : r.nombre;
  }

  async function crearEmpresa(cuerpo: Record<string, unknown>): Promise<Empresa | { error: string }> {
    try {
      const res = await fetch('/api/crm/empresas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const r = await leerRespuesta(res);
      if (!r.ok || !r.empresa) return { error: r.error ?? 'No se pudo crear la empresa' };
      reemplazarEmpresa(r.empresa, true);
      cerrarPanel();
      toast.success('Empresa creada');
      return r.empresa;
    } catch {
      return { error: 'No se pudo crear la empresa' };
    }
  }

  /** Put the server's version of an empresa back in the list (its cards re-join on render). */
  function reemplazarEmpresa(nueva: Empresa, alFrente: boolean) {
    setEmpresas((prev) =>
      alFrente
        ? [nueva, ...prev.filter((x) => x.idEmpresa !== nueva.idEmpresa)]
        : prev.map((x) => (x.idEmpresa === nueva.idEmpresa ? nueva : x)),
    );
  }

  /** Put the server's version of an oportunidad in the list, in place. */
  function reemplazarOportunidad(nueva: Oportunidad, alFrente: boolean) {
    setOportunidades((prev) =>
      alFrente
        ? [nueva, ...prev.filter((x) => x.idOportunidad !== nueva.idOportunidad)]
        : prev.map((x) => (x.idOportunidad === nueva.idOportunidad ? nueva : x)),
    );
  }

  /** Put a card that changed column at the top of its new column, travelling there. */
  function colocar(nueva: Oportunidad) {
    // A trip still in the air ends now so its card is where it belongs before the next one starts.
    const origen = focoDeOrigen.current;
    focoDeOrigen.current = null;
    const foco = capturar(nueva.idOportunidad, nueva.etapa, origen && origen.id === nueva.idOportunidad ? origen.foco : undefined);
    [...vuelos.current.values()].forEach((fin) => fin(false));
    pendienteVuelo.current = foco;
    reemplazarOportunidad(nueva, true);
  }

  async function moverSinDialogo(id: string, body: Record<string, unknown>): Promise<boolean> {
    const r = await patch(`/api/crm/oportunidades/${id}/etapa`, body);
    if (!r.ok || !r.oportunidad) {
      toast.error(r.error ?? 'No se pudo mover la oportunidad');
      return false;
    }
    colocar(r.oportunidad);
    return true;
  }

  function mover(id: string, etapa: EtapaOportunidad) {
    const actual = oportunidades.find((o) => o.idOportunidad === id);
    if (!actual || actual.etapa === etapa) return;
    if (etapa === 'perdida' || (etapa === 'contactado' && !actual.medio)) {
      focoDeOrigen.current = { id, foco: focoEnTarjeta(id) };
    }
    if (etapa === 'perdida') {
      setDialogo({ tipo: 'motivo', id, modo: 'mover', inicial: null });
    } else if (etapa === 'contactado' && !actual.medio) {
      setDialogo({ tipo: 'medio', id, modo: 'mover', inicial: null, destino: etapa });
    } else {
      void moverSinDialogo(id, { etapa });
    }
  }

  async function guardarMedio(d: Extract<Dialogo, { tipo: 'medio' }>, medio: Medio): Promise<string | null> {
    const editar = d.modo === 'editar';
    const r = await patch(
      editar ? `/api/crm/oportunidades/${d.id}/seguimiento` : `/api/crm/oportunidades/${d.id}/etapa`,
      editar ? { medio } : { etapa: d.destino, medio },
    );
    if (!r.ok || !r.oportunidad) return r.error ?? 'No se pudo guardar el medio de contacto';
    if (editar) reemplazarOportunidad(r.oportunidad, false);
    else colocar(r.oportunidad);
    setDialogo(null);
    if (editar) toast.success('Medio de contacto actualizado');
    return null;
  }

  async function guardarMotivo(d: Extract<Dialogo, { tipo: 'motivo' }>, motivo: Motivo): Promise<string | null> {
    const editar = d.modo === 'editar';
    const r = await patch(
      editar ? `/api/crm/oportunidades/${d.id}/seguimiento` : `/api/crm/oportunidades/${d.id}/etapa`,
      editar ? { motivo } : { etapa: 'perdida', motivo },
    );
    if (!r.ok || !r.oportunidad) return r.error ?? 'No se pudo guardar el motivo';
    if (editar) reemplazarOportunidad(r.oportunidad, false);
    else colocar(r.oportunidad);
    setDialogo(null);
    if (editar) toast.success('Motivo actualizado');
    return null;
  }

  async function responderSugerencia(id: string, accion: 'perder' | 'seguir') {
    const r = await post(`/api/crm/oportunidades/${id}/sugerencia`, { accion });
    if (!r.ok || !r.oportunidad) {
      toast.error(r.error ?? 'No se pudo guardar la sugerencia');
      return;
    }
    if (accion === 'perder') colocar(r.oportunidad);
    else reemplazarOportunidad(r.oportunidad, false);
    toast.success(
      accion === 'perder'
        ? `${r.oportunidad.nombre} pasó a «Perdida» con el motivo «No contestan».`
        : 'Sugerencia ocultada. Vuelve a aparecer si suma otro intento sin respuesta.',
    );
  }

  function onDragStart(ev: DragEvent<HTMLElement>, id: string) {
    draggingId.current = id;
    ev.dataTransfer.setData('text/plain', id);
    ev.dataTransfer.effectAllowed = 'move';
  }

  function onDrop(ev: DragEvent<HTMLElement>, etapa: EtapaOportunidad) {
    ev.preventDefault();
    setDragOver(null);
    const id = ev.dataTransfer.getData('text/plain') || draggingId.current;
    draggingId.current = null;
    if (id) mover(id, etapa);
  }

  const ahora = new Date();
  const hoy = hoyEnZona(ahora);
  const detalleEmpresa = detalleId ? empresas.find((x) => x.idEmpresa === detalleId) : undefined;
  const registroOportunidad = registro ? oportunidades.find((o) => o.idOportunidad === registro.id) : undefined;
  const registroEmpresa = registroOportunidad ? empresaDe.get(registroOportunidad.idEmpresa) : undefined;
  const oportunidadDelDialogo = dialogo ? oportunidades.find((o) => o.idOportunidad === dialogo.id) : undefined;
  const empresaDelDialogo = oportunidadDelDialogo ? empresaDe.get(oportunidadDelDialogo.idEmpresa) : undefined;

  return (
    <div data-testid="crm-root" className="flex h-full flex-col px-8 py-7">
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">CRM</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Una tarjeta por oportunidad comercial</p>
        </div>
        <div className="flex-1" />
        <label className="flex h-10 w-64 max-w-full items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-slate-500 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-900">
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar oportunidad, empresa o responsable"
            placeholder="Buscar oportunidad, empresa o responsable"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
        </label>
        <Link
          href="/crm/importar"
          className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Importar empresas
        </Link>
        <button
          ref={botonEntrante}
          type="button"
          onClick={pedirEntrante}
          aria-haspopup="dialog"
          className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-sky-600 bg-white px-4 text-sm font-semibold text-sky-800 hover:bg-sky-50 dark:border-sky-500 dark:bg-slate-900 dark:text-sky-200 dark:hover:bg-slate-800"
        >
          <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
          Nos contactaron
        </button>
        <button
          ref={botonNueva}
          type="button"
          onClick={pedirNueva}
          className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-tr from-sky-600 to-blue-600 px-4 text-sm font-semibold text-white shadow-md shadow-sky-600/25 hover:brightness-110"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nueva empresa
        </button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          <span className="flex-1">No se pudieron cargar las empresas y oportunidades</span>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-lg border border-red-300 bg-white px-3 py-1 font-semibold hover:bg-red-100 dark:border-red-800 dark:bg-transparent"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* crm-notificaciones (S1/S5): "Tu día" above the board; every board
          mutation bumps reloadKey, so the alerts always mirror the columns. */}
      <PanelDia reloadKey={reloadKey} onAbrir={abrirDetalle} />

      <div
        data-testid="crm-board"
        aria-busy={loading}
        className="grid min-h-0 flex-1 grid-cols-[repeat(6,minmax(200px,1fr))] gap-4 overflow-x-auto pb-1.5"
      >
        {ETAPAS_OPORTUNIDAD.map((etapa, idx) => {
          const tarjetasEtapa = visibles.filter(({ o }) => o.etapa === etapa);
          return (
            <section
              key={etapa}
              aria-label={ETAPA_OPORTUNIDAD_LABELS[etapa]}
              data-etapa={etapa}
              onDragOver={(ev) => {
                ev.preventDefault();
                setDragOver(etapa);
              }}
              onDragLeave={(ev) => {
                if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setDragOver(null);
              }}
              onDrop={(ev) => onDrop(ev, etapa)}
              className={`flex min-h-0 flex-col rounded-2xl border ${
                dragOver === etapa
                  ? 'border-dashed border-sky-500 bg-sky-100 dark:bg-sky-950/40'
                  : 'border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60'
              }`}
            >
              <header className="flex items-center gap-2 px-3.5 pb-2.5 pt-3.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                <span className={`h-2.5 w-2.5 rounded-full ${ETAPA_PUNTO[etapa]}`} aria-hidden="true" />
                {ETAPA_OPORTUNIDAD_LABELS[etapa]}
                <span className="ml-auto min-w-[26px] rounded-full border border-slate-300 bg-white px-2 py-px text-center text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {tarjetasEtapa.length}
                </span>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-3">
                {tarjetasEtapa.length === 0 && !loading && (
                  <p className="rounded-xl border border-dashed border-slate-300 px-2 py-6 text-center text-[13px] text-slate-500 dark:border-slate-700">
                    Arrastra una oportunidad aquí
                  </p>
                )}
                {tarjetasEtapa.map(({ o, e }) => (
                  <CrmCard
                    key={o.idOportunidad}
                    empresa={e}
                    oportunidad={o}
                    anterior={ETAPAS_OPORTUNIDAD[idx - 1]}
                    siguiente={ETAPAS_OPORTUNIDAD[idx + 1]}
                    onMover={mover}
                    onEditarMedio={(x) =>
                      setDialogo({ tipo: 'medio', id: x.idOportunidad, modo: 'editar', inicial: x.medio, destino: x.etapa })
                    }
                    onEditarMotivo={(x) =>
                      setDialogo({ tipo: 'motivo', id: x.idOportunidad, modo: 'editar', inicial: x.motivo })
                    }
                    onAbrir={abrirDetalle}
                    seleccionada={e.idEmpresa === detalleId}
                    onDragStart={onDragStart}
                    ahora={ahora}
                    hoy={hoy}
                    onSugerencia={(id, accion) => void responderSugerencia(id, accion)}
                    onRegistrar={(id) => abrirRegistro(id, 'saliente')}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {detalleEmpresa && (
        <DetallePanel
          key={detalleEmpresa.idEmpresa}
          empresa={detalleEmpresa}
          empresas={empresas}
          sectores={nombresSector}
          controlRef={detalleRef}
          onCerrar={cerrarDetalle}
          onGuardar={guardarEmpresa}
          onCrearSector={crearSectorPorNombre}
          onCambiarMedio={() => {
            // TODO('T7'): the ficha will pick the oportunidad whose medium is edited.
          }}
          onEditarMotivo={() => {
            // TODO('T7'): the ficha will pick the oportunidad whose reason is edited.
          }}
          onGuardarRuc={guardarRuc}
          onRegistrar={() => {
            // TODO('T8'): the ficha will open the activity flow for one of its oportunidades.
          }}
        />
      )}

      {entranteAbierto && (
        <EntrantePanel
          empresas={empresas}
          sectores={sectores}
          hoy={hoy}
          onCerrar={cerrarEntrante}
          onGuardado={entranteGuardado}
          onCrearSector={crearSector}
        />
      )}

      {registroOportunidad && registroEmpresa && registro && (
        <RegistrarContactoPanel
          key={registroOportunidad.idOportunidad}
          empresa={registroEmpresa}
          empresas={empresas}
          direccion={registro.direccion}
          hoy={hoy}
          onCerrar={cerrarRegistro}
          onGuardado={contactoGuardado}
        />
      )}

      {alta !== 'cerrada' && (
        <AltaPanel
          sectores={nombresSector}
          oculto={alta === 'oculta'}
          onCerrar={cerrarPanel}
          onCrearSector={crearSectorPorNombre}
          onCrear={crearEmpresa}
        />
      )}

      {dialogo?.tipo === 'medio' && oportunidadDelDialogo && empresaDelDialogo && (
        <MedioDialog
          titulo={dialogo.modo === 'mover' ? '¿Cómo lo contactaste?' : 'Editar medio de contacto'}
          subtitulo={
            dialogo.modo === 'mover'
              ? `${oportunidadDelDialogo.nombre} · ${empresaDelDialogo.razonSocial} pasa a “${ETAPA_OPORTUNIDAD_LABELS.contactado}”.`
              : `${empresaDelDialogo.razonSocial} · ${oportunidadDelDialogo.nombre}${
                  dialogo.inicial ? ` · ahora: ${MEDIO_LABELS[dialogo.inicial]}` : ''
                }`
          }
          inicial={dialogo.inicial}
          onCancelar={cerrarDialogo}
          onGuardar={(medio) => guardarMedio(dialogo, medio)}
        />
      )}
      {dialogo?.tipo === 'motivo' && oportunidadDelDialogo && empresaDelDialogo && (
        <MotivoDialog
          subtitulo={
            dialogo.modo === 'mover'
              ? `${empresaDelDialogo.razonSocial} · ${oportunidadDelDialogo.nombre} pasa a “${ETAPA_OPORTUNIDAD_LABELS.perdida}”.`
              : `${empresaDelDialogo.razonSocial} · ${oportunidadDelDialogo.nombre}`
          }
          inicial={dialogo.inicial}
          onCancelar={cerrarDialogo}
          onGuardar={(motivo) => guardarMotivo(dialogo, motivo)}
        />
      )}
    </div>
  );
}
