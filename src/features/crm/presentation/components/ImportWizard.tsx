'use client';

import { useState, type ChangeEvent } from 'react';

import { useImportacion } from '../hooks/useImportacion';
import { parsearPlantillaCrm } from '../../infrastructure/importar/parsearPlantillaCliente';

/**
 * ImportWizard — the 3-step Excel import flow (tasks pr8/WU3, spec
 * G2/G3): Subir archivo → Vista previa → Resultado.
 *
 * Step ownership: the file is parsed in the BROWSER with the shared
 * client parser and handed to `useImportacion`, which owns every API
 * transition (this component holds no fetch logic). The preview step
 * shows what the SERVER validated (counts, groups, per-row Spanish
 * errors) and offers Confirmar/Cancelar — cancelling never reaches the
 * API (G2 writes nothing). The result step exposes the execution
 * counters. The "Descargar plantilla" link sits next to the upload
 * control and streams the server-generated template (G3).
 *
 * All labels Spanish (repo convention).
 */
export function ImportWizard() {
  const { status, vistaPrevia, resultado, error, validarFilas, confirmar, cancelar, reintentar } =
    useImportacion();
  const [leyendo, setLeyendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  // The step is DERIVED from the hook state — no effect, no duplicated
  // source of truth. A failed validation keeps the user on step 1; a
  // failed confirmation keeps the preview (step 2) visible.
  const paso = resultado ? 3 : vistaPrevia ? 2 : 1;
  const ocupado = leyendo || status === 'validando' || status === 'confirmando';

  async function alSeleccionarArchivo(evento: ChangeEvent<HTMLInputElement>): Promise<void> {
    const archivo = evento.target.files?.[0];
    evento.target.value = ''; // allow re-selecting the same file
    if (!archivo) return;

    setErrorArchivo(null);
    setLeyendo(true);
    try {
      const buffer = await archivo.arrayBuffer();
      const filas = parsearPlantillaCrm(buffer);
      await validarFilas(filas, archivo.name);
    } catch (err: unknown) {
      setErrorArchivo(
        err instanceof Error
          ? err.message
          : 'No se pudo leer el archivo. Verifique que sea un Excel .xlsx válido.',
      );
    } finally {
      setLeyendo(false);
    }
  }

  return (
    <section aria-label="Importación de empresas" className="space-y-4">
      {paso === 1 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Subir archivo</h2>
          <p className="mt-1 text-sm text-slate-500">
            Cada fila representa un encargado; para varias empresas, repita el RUC.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              aria-label="Archivo Excel de empresas"
              type="file"
              accept=".xlsx"
              onChange={alSeleccionarArchivo}
              disabled={ocupado}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-sky-700"
            />
            <a
              href="/api/crm/import/plantilla"
              download
              className="rounded-lg border border-sky-600 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
            >
              Descargar plantilla
            </a>
          </div>
          {ocupado && (
            <div role="status" className="mt-4 flex items-center gap-3 text-sm text-slate-500">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
              {leyendo ? 'Leyendo archivo…' : 'Validando en el servidor…'}
            </div>
          )}
        </div>
      )}

      {paso === 2 && vistaPrevia && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Vista previa</h2>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
            <span>
              Filas totales: <span className="font-medium text-slate-800">{vistaPrevia.totalFilas}</span>
            </span>
            <span>
              Filas válidas: <span className="font-medium text-slate-800">{vistaPrevia.filasValidas}</span>
            </span>
            <span>
              Empresas: <span className="font-medium text-slate-800">{vistaPrevia.empresas.length}</span>
            </span>
          </div>

          {vistaPrevia.empresas.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
              {vistaPrevia.empresas.map((empresa) => (
                <li key={empresa.ruc} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-medium text-slate-800">{empresa.razonSocial}</span>
                  <span className="text-slate-500">
                    RUC {empresa.ruc} · {empresa.contactos.length}{' '}
                    {empresa.contactos.length === 1 ? 'contacto' : 'contactos'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {vistaPrevia.errores.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-lg border border-amber-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-amber-50 text-xs uppercase tracking-wide text-amber-700">
                  <tr>
                    <th scope="col" className="px-3 py-2">Fila</th>
                    <th scope="col" className="px-3 py-2">Columna</th>
                    <th scope="col" className="px-3 py-2">Mensaje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {vistaPrevia.errores.map((errorFila, indice) => (
                    <tr key={`${errorFila.fila}-${errorFila.columna}-${indice}`}>
                      <td className="px-3 py-2 font-mono text-xs">{errorFila.fila}</td>
                      <td className="px-3 py-2">{errorFila.columna}</td>
                      <td className="px-3 py-2 text-slate-600">{errorFila.mensaje}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-emerald-700">Sin errores de validación.</p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void confirmar()}
              disabled={status === 'confirmando'}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
            >
              Confirmar importación
            </button>
            <button
              type="button"
              onClick={cancelar}
              disabled={status === 'confirmando'}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {paso === 3 && resultado && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Resultado</h2>
          <p className="mt-1 text-sm text-emerald-700">
            Importación registrada (n.º {resultado.importacionId}).
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-slate-500">Empresas creadas:</dt>
              <dd className="text-lg font-semibold text-slate-800">{resultado.empresasCreadas}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-slate-500">Empresas actualizadas:</dt>
              <dd className="text-lg font-semibold text-slate-800">{resultado.empresasActualizadas}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-slate-500">Contactos creados:</dt>
              <dd className="text-lg font-semibold text-slate-800">{resultado.contactosCreados}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-slate-500">Contactos actualizados:</dt>
              <dd className="text-lg font-semibold text-slate-800">{resultado.contactosActualizados}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-slate-500">Errores:</dt>
              <dd className="text-lg font-semibold text-slate-800">{resultado.errores.length}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-slate-500">Advertencias:</dt>
              <dd className="text-lg font-semibold text-slate-800">{resultado.advertencias.length}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={cancelar}
            className="mt-5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Importar otro archivo
          </button>
        </div>
      )}

      {errorArchivo && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorArchivo}
        </div>
      )}

      {status === 'error' && error && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void reintentar()}
            className="rounded-lg border border-red-300 px-3 py-1.5 font-medium text-red-700 hover:bg-red-100"
          >
            Reintentar
          </button>
        </div>
      )}
    </section>
  );
}
