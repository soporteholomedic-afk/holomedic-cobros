'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';

import type { FilaEvaluada, ResumenImportacion } from '../../application/importarEmpresas';
import { ALERTA, BOTON_PRIMARIO, BOTON_SECUNDARIO } from './crmUi';

interface Revision {
  archivo: File;
  filas: FilaEvaluada[];
  resumen: ResumenImportacion;
}

const COLUMNAS = ['Razón social *', 'RUC *', 'Sector *', 'Contacto *', 'Teléfono *', 'Correo (opcional)'];

const CAJA =
  'grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-6';
const TITULO_PASO = 'm-0 flex items-center gap-2.5 text-[17px] font-bold text-slate-900 dark:text-slate-100';
const NUMERO_PASO =
  'grid h-6 w-6 place-items-center rounded-full bg-sky-600 text-[13px] font-bold text-white';
const TEXTO = 'm-0 text-sm text-slate-600 dark:text-slate-400';
const BOTON_ENLACE = `${BOTON_SECUNDARIO} inline-flex items-center gap-2 justify-self-start whitespace-nowrap`;

const PILDORA: Record<FilaEvaluada['estado'], string> = {
  ok: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200',
  err: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200',
  dup: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
};

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Message of a failed answer: the server's own text when it sent one. */
async function mensajeDeError(res: Response, general: string): Promise<string> {
  try {
    const cuerpo = (await res.json()) as { error?: string };
    return cuerpo.error || general;
  } catch {
    return general;
  }
}

/** `/crm/importar` — upload an Excel, review each row, then import the ready ones. */
export function ImportarEmpresas() {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const tituloRevision = useRef<HTMLHeadingElement>(null);
  const turno = useRef(0);
  const importando = useRef(false);

  const [revision, setRevision] = useState<Revision | null>(null);
  const [leyendo, setLeyendo] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState('');
  const [errorImportar, setErrorImportar] = useState('');
  const [sobreZona, setSobreZona] = useState(false);
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // A file dropped outside the zone must not make the browser open it.
  useEffect(() => {
    const frenar = (ev: Event) => {
      const tipos = (ev as unknown as globalThis.DragEvent).dataTransfer?.types;
      if (tipos && Array.from(tipos).includes('Files')) ev.preventDefault();
    };
    window.addEventListener('dragover', frenar);
    window.addEventListener('drop', frenar);
    return () => {
      window.removeEventListener('dragover', frenar);
      window.removeEventListener('drop', frenar);
    };
  }, []);

  useEffect(() => {
    if (!revision) return;
    tituloRevision.current?.focus();
    // Bring the whole review (table and confirm button) into view, as the design does.
    tituloRevision.current?.closest('section')?.scrollIntoView({ block: 'nearest' });
  }, [revision]);

  async function revisar(archivo: File | undefined) {
    if (!archivo) return;
    const miTurno = ++turno.current;
    setErrorArchivo('');
    setErrorImportar('');
    setRevision(null);
    setSoloProblemas(false);
    setLeyendo(archivo.name);

    const cuerpo = new FormData();
    cuerpo.append('archivo', archivo);
    let respuesta: Response;
    try {
      respuesta = await fetch('/api/crm/importar/vista-previa', { method: 'POST', body: cuerpo });
    } catch {
      if (miTurno !== turno.current) return;
      setLeyendo(null);
      setErrorArchivo('No se pudo revisar el archivo. Inténtalo de nuevo.');
      return;
    }
    if (!respuesta.ok) {
      const mensaje = await mensajeDeError(respuesta, 'No se pudo revisar el archivo. Inténtalo de nuevo.');
      if (miTurno !== turno.current) return;
      setLeyendo(null);
      setErrorArchivo(mensaje);
      return;
    }
    const datos = (await respuesta.json()) as { filas: FilaEvaluada[]; resumen: ResumenImportacion };
    if (miTurno !== turno.current) return;
    setLeyendo(null);
    setRevision({ archivo, filas: datos.filas, resumen: datos.resumen });
  }

  async function importar() {
    if (!revision || importando.current) return;
    importando.current = true;
    setEnviando(true);
    setErrorImportar('');
    // After a success the button stays disabled: the page is leaving, and a late
    // click would send the same file again and be told nothing was imported.
    let importado = false;
    try {
      const cuerpo = new FormData();
      cuerpo.append('archivo', revision.archivo);
      let respuesta: Response;
      try {
        respuesta = await fetch('/api/crm/importar', { method: 'POST', body: cuerpo });
      } catch {
        setErrorImportar('No se pudieron importar las empresas. Inténtalo de nuevo.');
        return;
      }
      if (!respuesta.ok) {
        setErrorImportar(await mensajeDeError(respuesta, 'No se pudieron importar las empresas. Inténtalo de nuevo.'));
        return;
      }
      const { importadas, sectoresNuevos } = (await respuesta.json()) as {
        importadas: number;
        sectoresNuevos: number;
      };
      if (importadas === 0) {
        setErrorImportar('No se importó ninguna empresa. Revisa el archivo y vuelve a intentarlo.');
        return;
      }
      const sectores =
        sectoresNuevos > 0 ? ` · ${sectoresNuevos} ${plural(sectoresNuevos, 'sector nuevo', 'sectores nuevos')}` : '';
      // S4: the import creates fichas ONLY — no oportunidades, so nothing lands in Por contactar.
      toast.success(`${importadas} ${plural(importadas, 'empresa importada', 'empresas importadas')}${sectores}`);
      importado = true;
      router.push('/crm');
    } finally {
      if (!importado) {
        importando.current = false;
        setEnviando(false);
      }
    }
  }

  function elegirArchivo() {
    entrada.current?.click();
  }

  function alSoltar(ev: DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    setSobreZona(false);
    void revisar(ev.dataTransfer.files[0]);
  }

  const filasVisibles = revision ? revision.filas.filter((f) => !soloProblemas || f.estado !== 'ok') : [];
  const listas = revision?.resumen.listas ?? 0;

  return (
    <div className="h-full overflow-auto px-8 py-7">
      <div className="mb-5">
        <Link
          href="/crm"
          className="mb-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:underline dark:text-sky-400"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver al CRM
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Importar empresas</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Sube un Excel con las empresas a las que puedes contactar
        </p>
      </div>

      <div className="grid max-w-[1000px] gap-4 pb-6">
        <section className={CAJA} aria-labelledby="imp-h1">
          <h2 id="imp-h1" className={TITULO_PASO}>
            <b className={NUMERO_PASO}>1</b>Descarga la plantilla
          </h2>
          <p className={TEXTO}>Llena una fila por empresa. Las columnas con * son obligatorias.</p>
          <ul aria-label="Columnas de la plantilla" className="m-0 flex list-none flex-wrap gap-2 p-0">
            {COLUMNAS.map((c, i) => (
              <li
                key={c}
                className={`rounded-full border px-3 py-0.5 text-[13px] ${
                  i === COLUMNAS.length - 1
                    ? 'border-dashed border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-400'
                    : 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {c}
              </li>
            ))}
          </ul>
          <a href="/api/crm/importar/plantilla" download className={BOTON_ENLACE}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Descargar plantilla (.xlsx)
          </a>
        </section>

        <section className={CAJA} aria-labelledby="imp-h2">
          <h2 id="imp-h2" className={TITULO_PASO}>
            <b className={NUMERO_PASO}>2</b>Sube tu archivo
          </h2>
          <div
            aria-busy={leyendo !== null}
            onDragEnter={(ev) => {
              ev.preventDefault();
              setSobreZona(true);
            }}
            onDragOver={(ev) => {
              ev.preventDefault();
              setSobreZona(true);
            }}
            onDragLeave={(ev) => {
              if (ev.currentTarget.contains(ev.relatedTarget as Node | null)) return;
              setSobreZona(false);
            }}
            onDrop={alSoltar}
            className={`grid justify-items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center text-slate-600 dark:text-slate-400 ${
              sobreZona
                ? 'border-sky-600 bg-sky-100 dark:bg-sky-950/40'
                : 'border-slate-400 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/50'
            }`}
          >
            <Upload className="h-8 w-8 text-sky-600" aria-hidden="true" />
            <p className="m-0">
              <b>Arrastra tu Excel aquí</b> o
            </p>
            <button type="button" onClick={elegirArchivo} className={BOTON_SECUNDARIO}>
              Elegir archivo
            </button>
            <small>.xlsx · hasta 5 MB</small>
            <input
              ref={entrada}
              type="file"
              accept=".xlsx"
              hidden
              onChange={(ev) => {
                const elegido = ev.target.files?.[0];
                ev.target.value = '';
                void revisar(elegido);
              }}
            />
          </div>
          <p role="status" aria-live="polite" hidden={leyendo === null} className={TEXTO}>
            {leyendo !== null && `Leyendo “${leyendo}”…`}
          </p>
          {errorArchivo && (
            <p role="alert" className={ALERTA}>
              {errorArchivo}
            </p>
          )}
        </section>

        {revision && (
          <section className={CAJA} aria-labelledby="imp-h3">
            <h2 id="imp-h3" ref={tituloRevision} tabIndex={-1} className={`${TITULO_PASO} rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600`}>
              <b className={NUMERO_PASO}>3</b>Revisa y confirma
            </h2>
            <p className={TEXTO}>Archivo: {revision.archivo.name}</p>
            <div role="status" aria-live="polite" className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[13px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {revision.resumen.leidas} filas leídas
              </span>
              <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${PILDORA.ok}`}>
                {revision.resumen.listas} {plural(revision.resumen.listas, 'lista', 'listas')}
              </span>
              <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${PILDORA.err}`}>
                {revision.resumen.errores} {plural(revision.resumen.errores, 'con error', 'con errores')}
              </span>
              <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${PILDORA.dup}`}>
                {revision.resumen.repetidas} {plural(revision.resumen.repetidas, 'repetida', 'repetidas')}
              </span>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={soloProblemas}
                onChange={(ev) => setSoloProblemas(ev.target.checked)}
                className="h-4 w-4 accent-sky-600"
              />
              Mostrar solo las filas con problemas
            </label>
            <div
              tabIndex={0}
              role="region"
              aria-label="Filas del archivo"
              className="max-h-[340px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700"
            >
              <table className="w-full border-collapse text-[13px]">
                <caption className="sr-only">Filas leídas del archivo</caption>
                <thead>
                  <tr>
                    {['Fila', 'Razón social', 'RUC', 'Sector', 'Contacto', 'Teléfono', 'Estado'].map((t) => (
                      <th
                        key={t}
                        scope="col"
                        className="sticky top-0 whitespace-nowrap border-b border-slate-200 bg-slate-100 px-2.5 py-2 text-left font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filasVisibles.map((f) => (
                    <tr key={f.fila} className="align-top text-slate-800 dark:text-slate-200">
                      <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2 dark:border-slate-800">{f.fila}</td>
                      <td className="min-w-[150px] border-b border-slate-100 px-2.5 py-2 dark:border-slate-800">{f.razonSocial}</td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2 dark:border-slate-800">{f.ruc}</td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2 dark:border-slate-800">{f.sector}</td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2 dark:border-slate-800">{f.contacto || '—'}</td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-2.5 py-2 dark:border-slate-800">{f.telefono}</td>
                      <td className="min-w-[200px] border-b border-slate-100 px-2.5 py-2 dark:border-slate-800">
                        <span className={`mr-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILDORA[f.estado]}`}>
                          {f.estado === 'ok' ? 'Lista' : f.estado === 'err' ? `Error: ${f.nota}` : `Omitida: ${f.nota}`}
                        </span>
                        {f.sectorNuevo && (
                          <span className="inline-block rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
                            Sector nuevo: se creará
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={TEXTO}>Las filas con error o repetidas se omiten. Las demás se agregan a “Por contactar”.</p>
            {errorImportar && (
              <p role="alert" className={ALERTA}>
                {errorImportar}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={elegirArchivo} className={BOTON_SECUNDARIO}>
                Elegir otro archivo
              </button>
              <button type="button" onClick={() => void importar()} disabled={listas === 0 || enviando} className={BOTON_PRIMARIO}>
                Importar {listas} {plural(listas, 'empresa', 'empresas')}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
