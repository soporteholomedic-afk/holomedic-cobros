'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Phone, Plus, Search, User, X } from 'lucide-react';
import { toast } from 'sonner';

import { ETAPAS, ETAPA_LABELS, SECTORES, type Empresa, type Etapa } from '../../domain/entities';

const COLUMN_DOT: Record<Etapa, string> = {
  por_contactar: 'bg-slate-400',
  contactado: 'bg-sky-500',
  en_seguimiento: 'bg-amber-500',
  cliente: 'bg-emerald-500',
};

const CHIP_STYLES = [
  'bg-amber-100 text-amber-800',
  'bg-slate-200 text-slate-700',
  'bg-blue-100 text-blue-800',
  'bg-teal-100 text-teal-800',
  'bg-pink-100 text-pink-800',
  'bg-violet-100 text-violet-800',
];

const EMPTY_FORM = {
  razonSocial: '',
  ruc: '',
  sector: '',
  contactoNombre: '',
  contactoTelefono: '',
  contactoCorreo: '',
  notas: '',
};

const INPUT =
  'w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

interface ApiResult {
  ok: boolean;
  error?: string;
  empresa?: Empresa;
}

async function leerRespuesta(res: Response): Promise<ApiResult> {
  let data: { error?: string; empresa?: Empresa } = {};
  try {
    data = await res.json();
  } catch {
    // body is not JSON: fall through with the status only
  }
  return { ok: res.ok, error: data.error, empresa: data.empresa };
}

/**
 * Kanban board of the simple CRM: four columns, a floating side panel to
 * create empresas, drag-and-drop or buttons to move them.
 *
 * The panel is `position: fixed`: it covers the right side of the screen
 * without changing the layout of the board behind it (design comment
 * pr6cscqf).
 */
export function CrmBoard() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState<Etapa | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const draggingId = useRef<string | null>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await fetch('/api/crm/empresas');
        if (!res.ok) throw new Error('load failed');
        const data = (await res.json()) as { empresas: Empresa[] };
        if (!cancelled) setEmpresas(data.empresas);
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

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setForm(EMPTY_FORM);
    setFormError('');
    openButton.current?.focus();
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    firstField.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closePanel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panelOpen, closePanel]);

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return empresas;
    return empresas.filter((e) =>
      [e.razonSocial, e.ruc, e.contactoNombre, e.contactoTelefono, e.sector ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [empresas, search]);

  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    if (!/^\d{11}$/.test(form.ruc.trim())) {
      setFormError('El RUC debe tener 11 dígitos');
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      const body: Record<string, string> = {
        razonSocial: form.razonSocial,
        ruc: form.ruc.trim(),
        contactoNombre: form.contactoNombre,
        contactoTelefono: form.contactoTelefono,
      };
      if (form.sector) body.sector = form.sector;
      if (form.contactoCorreo.trim()) body.contactoCorreo = form.contactoCorreo;
      if (form.notas.trim()) body.notas = form.notas;

      const res = await fetch('/api/crm/empresas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const r = await leerRespuesta(res);
      if (!r.ok || !r.empresa) {
        setFormError(r.error ?? 'No se pudo crear la empresa');
        return;
      }
      setEmpresas((prev) => [r.empresa as Empresa, ...prev]);
      closePanel();
      toast.success('Empresa creada en “Por contactar”');
    } catch {
      setFormError('No se pudo crear la empresa');
    } finally {
      setSaving(false);
    }
  }

  async function mover(id: string, etapa: Etapa) {
    const actual = empresas.find((x) => x.idEmpresa === id);
    if (!actual || actual.etapa === etapa) return;
    const previa = actual.etapa;
    setEmpresas((prev) => prev.map((x) => (x.idEmpresa === id ? { ...x, etapa } : x)));
    try {
      const res = await fetch(`/api/crm/empresas/${id}/etapa`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etapa }),
      });
      if (!res.ok) throw new Error('move failed');
    } catch {
      setEmpresas((prev) => prev.map((x) => (x.idEmpresa === id ? { ...x, etapa: previa } : x)));
      toast.error('No se pudo mover la empresa');
    }
  }

  function onDragStart(ev: DragEvent<HTMLElement>, id: string) {
    draggingId.current = id;
    ev.dataTransfer.setData('text/plain', id);
    ev.dataTransfer.effectAllowed = 'move';
  }

  function onDrop(ev: DragEvent<HTMLElement>, etapa: Etapa) {
    ev.preventDefault();
    setDragOver(null);
    const id = ev.dataTransfer.getData('text/plain') || draggingId.current;
    draggingId.current = null;
    if (id) void mover(id, etapa);
  }

  const set = (campo: keyof typeof EMPTY_FORM) => (ev: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [campo]: ev.target.value }));

  return (
    <div data-testid="crm-root" className="flex h-full flex-col px-8 py-7">
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">CRM</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Empresas a las que puedes contactar
          </p>
        </div>
        <div className="flex-1" />
        <label className="flex h-10 w-64 max-w-full items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-slate-500 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-900">
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar empresa o contacto"
            placeholder="Buscar empresa o contacto"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
        </label>
        <button
          ref={openButton}
          type="button"
          onClick={() => setPanelOpen(true)}
          className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-tr from-sky-600 to-blue-600 px-4 text-sm font-semibold text-white shadow-md shadow-sky-600/25 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
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
          <span className="flex-1">No se pudieron cargar las empresas</span>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-lg border border-red-300 bg-white px-3 py-1 font-semibold hover:bg-red-100 dark:border-red-800 dark:bg-transparent"
          >
            Reintentar
          </button>
        </div>
      )}

      <div
        data-testid="crm-board"
        aria-busy={loading}
        className="grid min-h-0 flex-1 grid-cols-[repeat(4,minmax(220px,1fr))] gap-4 overflow-x-auto pb-1.5"
      >
        {ETAPAS.map((etapa, idx) => {
          const tarjetas = visibles.filter((e) => e.etapa === etapa);
          return (
            <section
              key={etapa}
              aria-label={ETAPA_LABELS[etapa]}
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
                <span className={`h-2.5 w-2.5 rounded-full ${COLUMN_DOT[etapa]}`} aria-hidden="true" />
                {ETAPA_LABELS[etapa]}
                <span className="ml-auto min-w-[26px] rounded-full border border-slate-300 bg-white px-2 py-px text-center text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {tarjetas.length}
                </span>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-3">
                {tarjetas.length === 0 && !loading && (
                  <p className="rounded-xl border border-dashed border-slate-300 px-2 py-6 text-center text-[13px] text-slate-500 dark:border-slate-700">
                    Arrastra una empresa aquí
                  </p>
                )}
                {tarjetas.map((e) => {
                  const siguiente = ETAPAS[idx + 1];
                  const anterior = ETAPAS[idx - 1];
                  const sectorIdx = e.sector ? SECTORES.indexOf(e.sector) : -1;
                  return (
                    <article
                      key={e.idEmpresa}
                      draggable
                      onDragStart={(ev) => onDragStart(ev, e.idEmpresa)}
                      className="group cursor-grab rounded-xl border border-slate-200 bg-white px-3 pb-2 pt-3 shadow-sm hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <h3 className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
                        {e.razonSocial}
                      </h3>
                      <p className="mb-2 mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        RUC {e.ruc}
                      </p>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          sectorIdx >= 0 ? CHIP_STYLES[sectorIdx] : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {e.sector ?? 'Sin sector'}
                      </span>
                      <div className="mt-2.5 grid gap-1 text-[13px] text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                          <span>{e.contactoNombre}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                          <span>{e.contactoTelefono}</span>
                        </div>
                      </div>
                      <div className="mt-1.5 flex justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        {anterior ? (
                          <button
                            type="button"
                            aria-label={`Mover ${e.razonSocial} a ${ETAPA_LABELS[anterior]}`}
                            onClick={() => void mover(e.idEmpresa, anterior)}
                            className="grid h-7 w-7 place-items-center rounded-lg text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            aria-label="Sin columna anterior"
                            className="grid h-7 w-7 place-items-center rounded-lg text-slate-600 opacity-30"
                          >
                            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                        {siguiente ? (
                          <button
                            type="button"
                            aria-label={`Mover ${e.razonSocial} a ${ETAPA_LABELS[siguiente]}`}
                            onClick={() => void mover(e.idEmpresa, siguiente)}
                            className="grid h-7 w-7 place-items-center rounded-lg text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            aria-label="Sin columna siguiente"
                            className="grid h-7 w-7 place-items-center rounded-lg text-slate-600 opacity-30"
                          >
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {panelOpen && (
        <aside
          role="dialog"
          aria-modal="false"
          aria-labelledby="crm-panel-title"
          className="fixed bottom-0 right-0 top-0 z-40 w-[420px] max-w-full overflow-y-auto border-l border-slate-200 bg-white shadow-[-10px_0_30px_rgba(15,23,42,0.14)] dark:border-slate-800 dark:bg-slate-950"
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
              onClick={closePanel}
              aria-label="Cerrar panel"
              className="ml-auto grid h-9 w-9 place-items-center rounded-[10px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <form onSubmit={crear} autoComplete="off" noValidate className="grid gap-3.5 px-6 pb-6 pt-3">
            <fieldset className="grid gap-3.5">
              <legend className="mb-0.5 text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                Empresa
              </legend>
              <label className="grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                <span>
                  Razón social <em className="not-italic text-red-700">*</em>
                </span>
                <input
                  ref={firstField}
                  required
                  value={form.razonSocial}
                  onChange={set('razonSocial')}
                  placeholder="Ej. Constructora Andina S.A.C."
                  className={INPUT}
                />
              </label>
              <div className="grid grid-cols-2 gap-3.5">
                <label className="grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                  <span>
                    RUC <em className="not-italic text-red-700">*</em>
                  </span>
                  <input
                    required
                    inputMode="numeric"
                    maxLength={11}
                    value={form.ruc}
                    onChange={set('ruc')}
                    placeholder="11 dígitos"
                    className={INPUT}
                  />
                </label>
                <label className="grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                  <span>Sector</span>
                  <select value={form.sector} onChange={set('sector')} className={INPUT}>
                    <option value="">Sin definir</option>
                    {SECTORES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="grid gap-3.5">
              <legend className="mb-0.5 text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                Contacto principal
              </legend>
              <div className="grid grid-cols-2 gap-3.5">
                <label className="grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                  <span>
                    Nombre <em className="not-italic text-red-700">*</em>
                  </span>
                  <input
                    required
                    value={form.contactoNombre}
                    onChange={set('contactoNombre')}
                    placeholder="Nombre y apellido"
                    className={INPUT}
                  />
                </label>
                <label className="grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                  <span>
                    Teléfono <em className="not-italic text-red-700">*</em>
                  </span>
                  <input
                    required
                    inputMode="tel"
                    value={form.contactoTelefono}
                    onChange={set('contactoTelefono')}
                    placeholder="9XX XXX XXX"
                    className={INPUT}
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                <span>
                  Correo <small className="font-normal text-slate-500">(opcional)</small>
                </span>
                <input
                  type="email"
                  value={form.contactoCorreo}
                  onChange={set('contactoCorreo')}
                  placeholder="nombre@empresa.com"
                  className={INPUT}
                />
              </label>
              <label className="grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                <span>
                  Notas <small className="font-normal text-slate-500">(opcional)</small>
                </span>
                <textarea
                  value={form.notas}
                  onChange={set('notas')}
                  placeholder="Cómo llegó, qué necesita, mejor horario…"
                  className={`${INPUT} min-h-[72px] resize-y`}
                />
              </label>
            </fieldset>

            {formError && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              >
                {formError}
              </p>
            )}

            <div className="flex justify-end gap-2.5 pt-1.5">
              <button
                type="button"
                onClick={closePanel}
                className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-blue-600 px-4 text-sm font-semibold text-white shadow-md shadow-sky-600/25 hover:brightness-110 disabled:opacity-60"
              >
                {saving ? 'Creando…' : 'Crear empresa'}
              </button>
            </div>
          </form>
        </aside>
      )}
    </div>
  );
}
