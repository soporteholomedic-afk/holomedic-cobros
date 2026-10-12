'use client';

import { useState, type ChangeEvent } from 'react';

import {
  useIngestasConocimiento,
  type IngestaConocimientoVista,
} from '../../hooks/useIngestasConocimiento';

/**
 * PanelConocimiento (agente-ia-crm E4·T8) — the client half of
 * /admin/crm/conocimiento: TWO upload cards ('Pegar texto' JSON /
 * 'Subir archivo' multipart, both with optional vigencia) over the
 * 'Ingestas recientes' live list. Deliberately MINIMAL — no CRUD, no
 * editing (the E6 editor owns that): everything uploaded enters the
 * knowledge La Guía uses immediately, and the state badges
 * (PENDIENTE/PROCESANDO/COMPLETADA·n/FALLIDA·error) refresh via the
 * hook's polling. Copy in Spanish, product voice.
 */

const LARGO_ERROR_VISIBLE = 80;
/** Antes de un viaje en vano: el título es obligatorio (validación local). */
const inputClasses =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500';

function recortar(texto: string, largo: number = LARGO_ERROR_VISIBLE): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length > largo ? `${limpio.slice(0, largo - 1)}…` : limpio;
}

function formatearFecha(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${fecha.getFullYear()} ${horas}:${minutos}`;
}

function badgeDeEstado(ingesta: IngestaConocimientoVista): { texto: string; clase: string } {
  switch (ingesta.estado) {
    case 'PENDIENTE':
      return { texto: 'PENDIENTE', clase: 'bg-amber-100 text-amber-800' };
    case 'PROCESANDO':
      return { texto: 'PROCESANDO', clase: 'bg-sky-100 text-sky-800' };
    case 'COMPLETADA':
      return {
        texto: `COMPLETADA · ${ingesta.entradasCreadas} ${ingesta.entradasCreadas === 1 ? 'entrada' : 'entradas'}`,
        clase: 'bg-emerald-100 text-emerald-800',
      };
    case 'FALLIDA':
      return { texto: `FALLIDA · ${recortar(ingesta.error ?? 'sin detalle')}`, clase: 'bg-red-100 text-red-800' };
  }
}

interface ClasesVigencia {
  desde: string;
  hasta: string;
}

/** El mensaje de la última carga, DERIVADO de la fila (sin estado duplicado). */
function mensajeDeUltimaCarga(ultima: IngestaConocimientoVista | undefined): string {
  if (!ultima || ultima.estado === 'PENDIENTE' || ultima.estado === 'PROCESANDO') {
    return 'Ingesta creada — procesando…';
  }
  if (ultima.estado === 'COMPLETADA') {
    return `Ingesta completada — ${ultima.entradasCreadas} ${ultima.entradasCreadas === 1 ? 'entrada creada' : 'entradas creadas'}.`;
  }
  return `La carga falló: ${recortar(ultima.error ?? 'sin detalle')}`;
}

export function PanelConocimiento() {
  const {
    ingestas,
    status,
    error,
    cargarTexto,
    cargarArchivo,
    subiendo,
    errorSubida,
    limpiarErrorSubida,
  } = useIngestasConocimiento();

  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [vigenciaTexto, setVigenciaTexto] = useState<ClasesVigencia>({ desde: '', hasta: '' });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vigenciaArchivo, setVigenciaArchivo] = useState<ClasesVigencia>({ desde: '', hasta: '' });
  const [ultimoId, setUltimoId] = useState<number | null>(null);

  const ultima = ultimoId === null ? undefined : ingestas.find((i) => i.id === ultimoId);

  async function cargarTextoDelFormulario(): Promise<void> {
    if (titulo.trim() === '' || subiendo) return;
    const creada = await cargarTexto({
      nombre: titulo,
      contenido,
      vigencia: vigenciaTexto,
    });
    if (creada) {
      setUltimoId(creada.id);
      setTitulo('');
      setContenido('');
      setVigenciaTexto({ desde: '', hasta: '' });
    }
  }

  async function cargarArchivoDelFormulario(): Promise<void> {
    if (archivo === null || subiendo) return;
    const creada = await cargarArchivo({ file: archivo, vigencia: vigenciaArchivo });
    if (creada) {
      setUltimoId(creada.id);
      setArchivo(null);
      setVigenciaArchivo({ desde: '', hasta: '' });
    }
  }

  function alElegirArchivo(evento: ChangeEvent<HTMLInputElement>): void {
    setArchivo(evento.target.files?.[0] ?? null);
  }

  return (
    <div className="space-y-6">
      {errorSubida !== null && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorSubida}
          <button
            type="button"
            onClick={limpiarErrorSubida}
            className="ml-3 font-semibold underline hover:no-underline"
          >
            Cerrar
          </button>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Pegar texto" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Pegar texto</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pega políticas, condiciones o manuales como texto plano.
          </p>

          <div className="mt-4 space-y-4">
            <input
              type="text"
              aria-label="Título"
              placeholder="Título del documento"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className={inputClasses}
            />
            <textarea
              aria-label="Contenido"
              placeholder="Pega aquí el contenido…"
              rows={6}
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              className={inputClasses}
            />
            <VigenciaInputs valores={vigenciaTexto} alCambiar={setVigenciaTexto} />
            <button
              type="button"
              onClick={cargarTextoDelFormulario}
              disabled={subiendo || titulo.trim() === ''}
              className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {subiendo ? 'Cargando…' : 'Cargar'}
            </button>
          </div>
        </section>

        <section aria-label="Subir archivo" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Subir archivo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            PDF, TXT o DOCX de hasta 5 MB. El texto se extrae al subirlo.
          </p>

          <div className="mt-4 space-y-4">
            <input
              type="file"
              aria-label="Archivo"
              accept=".pdf,.txt,.docx"
              onChange={alElegirArchivo}
              className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-sky-700 hover:file:bg-sky-100"
            />
            <VigenciaInputs valores={vigenciaArchivo} alCambiar={setVigenciaArchivo} />
            <button
              type="button"
              onClick={cargarArchivoDelFormulario}
              disabled={subiendo || archivo === null}
              className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {subiendo ? 'Cargando…' : 'Cargar'}
            </button>
          </div>
        </section>
      </div>

      {ultimoId !== null && (
        <p aria-live="polite" className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {mensajeDeUltimaCarga(ultima)}
        </p>
      )}

      <section aria-label="Ingestas recientes" className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Ingestas recientes</h2>
        </div>

        {status === 'loading' && <p className="px-6 py-6 text-sm text-muted-foreground">Cargando ingestas…</p>}
        {status === 'error' && (
          <p role="alert" className="px-6 py-6 text-sm text-red-800">
            {error ?? 'No se pudieron cargar las ingestas.'}
          </p>
        )}
        {status === 'populated' && ingestas.length === 0 && (
          <p className="px-6 py-6 text-sm text-muted-foreground">
            Aún no hay ingestas. Cargá tu primer documento arriba.
          </p>
        )}
        {status === 'populated' && ingestas.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {ingestas.map((ingesta) => {
              const badge = badgeDeEstado(ingesta);
              return (
                <li key={ingesta.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-6 py-3 text-sm">
                  <span className="font-medium text-slate-900">{ingesta.nombre}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                    {ingesta.tipo}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.clase}`} title={ingesta.error ?? undefined}>
                    {badge.texto}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatearFecha(ingesta.creadoEn)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Dos date inputs de vigencia opcional (vacíos = sin límite). */
function VigenciaInputs(props: {
  valores: ClasesVigencia;
  alCambiar: (valores: ClasesVigencia) => void;
}): React.JSX.Element {
  const { valores, alCambiar } = props;
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs font-medium text-slate-600">
        Vigencia desde
        <input
          type="date"
          aria-label="Vigencia desde"
          value={valores.desde}
          onChange={(e) => alCambiar({ ...valores, desde: e.target.value })}
          className={`${inputClasses} mt-1`}
        />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Vigencia hasta
        <input
          type="date"
          aria-label="Vigencia hasta"
          value={valores.hasta}
          onChange={(e) => alCambiar({ ...valores, hasta: e.target.value })}
          className={`${inputClasses} mt-1`}
        />
      </label>
    </div>
  );
}
