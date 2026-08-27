'use client';

import { Loader2, RotateCcw, Search } from 'lucide-react';

import { MONEDAS } from '../../domain/entities';
import type {
  DestinoLookupItem,
  SedeLookupItem,
  TipoTrabajadorItem,
} from '../../domain/entities';
import type {
  ValoracionesFilterAction,
  ValoracionesFilterState,
} from '../hooks/useValoracionesFilters';
import { ClienteAutocomplete } from './ClienteAutocomplete';
import { PacienteAutocomplete } from './PacienteAutocomplete';

/**
 * Filter panel mirroring SIGLA's `RptFacturacionForm` 11 controls
 * (REQ-03 Q-R5): periodo (defaults today), moneda, IndFac tri-state
 * (default No Facturados), date mode (FecAte/FecSTA), cliente,
 * facturar-a, destino (gated by cliente), paciente, sede, tipo
 * trabajador. Consolidado stays DISABLED in slice 1 (enabled in slice 2).
 * All data fetching lives in hooks; this component only dispatches.
 */
export interface FiltersPanelProps {
  filtros: ValoracionesFilterState;
  onCambio: (action: ValoracionesFilterAction) => void;
  onConsultar: () => void;
  onLimpiar: () => void;
  consultando: boolean;
  destinos: DestinoLookupItem[];
  destinosCargando: boolean;
  sedes: SedeLookupItem[];
  tiposTrabajador: TipoTrabajadorItem[];
}

const OPCIONES_IND_FAC = [
  { value: '0', label: 'No Facturados' },
  { value: '1', label: 'Facturados' },
  { value: 'null', label: 'Todos' },
] as const;

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all';

export function FiltersPanel({
  filtros,
  onCambio,
  onConsultar,
  onLimpiar,
  consultando,
  destinos,
  destinosCargando,
  sedes,
  tiposTrabajador,
}: FiltersPanelProps) {
  const hayCliente = filtros.codCli !== undefined;
  const indFacValue = filtros.indFac === null ? 'null' : String(filtros.indFac);

  return (
    <section
      aria-label="Filtros de valorizaciones"
      className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-md shadow-slate-100/50 dark:shadow-none animate-fade-in"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* 1-2. Periodo (defaults today) */}
        <div>
          <label
            htmlFor="val-fec-ini"
            className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5"
          >
            Fecha inicio
          </label>
          <input
            id="val-fec-ini"
            type="date"
            value={filtros.fecIni}
            onChange={(e) => onCambio({ type: 'SET_PERIODO', fecIni: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="val-fec-fin"
            className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5"
          >
            Fecha fin
          </label>
          <input
            id="val-fec-fin"
            type="date"
            value={filtros.fecFin}
            onChange={(e) => onCambio({ type: 'SET_PERIODO', fecFin: e.target.value })}
            className={inputClass}
          />
        </div>

        {/* 3. Moneda */}
        <div>
          <label
            htmlFor="val-moneda"
            className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5"
          >
            Moneda
          </label>
          <select
            id="val-moneda"
            value={filtros.codMon}
            onChange={(e) =>
              onCambio({ type: 'SET_MONEDA', codMon: e.target.value === '2' ? 2 : 1 })
            }
            className={inputClass}
          >
            {Object.entries(MONEDAS).map(([cod, { descripcion }]) => (
              <option key={cod} value={cod}>
                {descripcion}
              </option>
            ))}
          </select>
        </div>

        {/* 4. IndFac tri-state (default No Facturados) */}
        <div>
          <label
            htmlFor="val-ind-fac"
            className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5"
          >
            Estado de facturación
          </label>
          <select
            id="val-ind-fac"
            value={indFacValue}
            onChange={(e) => {
              const raw = e.target.value;
              onCambio({
                type: 'SET_IND_FAC',
                indFac: raw === 'null' ? null : raw === '1' ? 1 : 0,
              });
            }}
            className={inputClass}
          >
            {OPCIONES_IND_FAC.map((opcion) => (
              <option key={opcion.value} value={opcion.value}>
                {opcion.label}
              </option>
            ))}
          </select>
        </div>

        {/* 5. Cliente (gates destinos) */}
        <ClienteAutocomplete
          id="val-cliente"
          etiqueta="Cliente"
          seleccionado={filtros.cliNombre ?? ''}
          onSeleccionar={(item) =>
            onCambio({ type: 'SET_CLIENTE', codCli: item.codCli, nombre: item.nomCom })
          }
          onLimpiar={() => onCambio({ type: 'SET_CLIENTE' })}
        />

        {/* 6. Facturar a (same Cliente table — design D3) */}
        <ClienteAutocomplete
          id="val-facturar-a"
          etiqueta="Facturar a"
          seleccionado={filtros.cfaNombre ?? ''}
          onSeleccionar={(item) =>
            onCambio({ type: 'SET_FACTURAR_A', codCfa: item.codCli, nombre: item.nomCom })
          }
          onLimpiar={() => onCambio({ type: 'SET_FACTURAR_A' })}
        />

        {/* 7. Destino (disabled without a client — spec Q-R4/Q-R5) */}
        <div>
          <label
            htmlFor="val-destino"
            className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5"
          >
            Destino
          </label>
          <select
            id="val-destino"
            value={filtros.codDes ?? ''}
            disabled={!hayCliente}
            onChange={(e) =>
              onCambio({
                type: 'SET_DESTINO',
                codDes: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <option value="">
              {!hayCliente
                ? 'Seleccione un cliente'
                : destinosCargando
                  ? 'Cargando destinos…'
                  : 'Todos los destinos'}
            </option>
            {destinos.map((destino) => (
              <option key={destino.codDes} value={destino.codDes}>
                {destino.desDes}
              </option>
            ))}
          </select>
        </div>

        {/* 8. Paciente */}
        <PacienteAutocomplete
          id="val-paciente"
          etiqueta="Paciente"
          seleccionado={filtros.pacNombre ?? ''}
          onSeleccionar={(item) =>
            onCambio({ type: 'SET_PACIENTE', codPac: item.codPac, nombre: item.nombre })
          }
          onLimpiar={() => onCambio({ type: 'SET_PACIENTE' })}
        />

        {/* 9. Sede */}
        <div>
          <label
            htmlFor="val-sede"
            className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5"
          >
            Sede
          </label>
          <select
            id="val-sede"
            value={filtros.codSed ?? ''}
            onChange={(e) =>
              onCambio({
                type: 'SET_SEDE',
                codSed: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            className={inputClass}
          >
            <option value="">Todas las sedes</option>
            {sedes.map((sede) => (
              <option key={sede.codSed} value={sede.codSed}>
                {sede.nomSed}
              </option>
            ))}
          </select>
        </div>

        {/* 10. Tipo trabajador */}
        <div>
          <label
            htmlFor="val-tipo-trabajador"
            className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5"
          >
            Tipo de trabajador
          </label>
          <select
            id="val-tipo-trabajador"
            value={filtros.tipTra ?? ''}
            onChange={(e) =>
              onCambio({
                type: 'SET_TIPO_TRABAJADOR',
                tipTra: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            className={inputClass}
          >
            <option value="">Todos</option>
            {tiposTrabajador.map((tipo) => (
              <option key={tipo.codTip} value={tipo.codTip}>
                {tipo.desTip}
              </option>
            ))}
          </select>
        </div>

        {/* 11. Fecha de estado (FecSTA date mode) + Consolidado (slice 2) */}
        <div className="flex flex-col gap-2 pt-6">
          <label
            htmlFor="val-modo-fecha"
            className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            <input
              id="val-modo-fecha"
              type="checkbox"
              checked={filtros.inFsta}
              onChange={(e) => onCambio({ type: 'SET_MODO_FECHA', inFsta: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500/20"
            />
            Usar fecha de estado (FecSTA)
          </label>
          <label
            htmlFor="val-consolidado"
            title="Disponible en una próxima etapa"
            className="inline-flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500 cursor-not-allowed"
          >
            <input
              id="val-consolidado"
              type="checkbox"
              checked={filtros.consolidado}
              disabled
              className="w-4 h-4 rounded border-slate-300 text-sky-600"
            />
            Consolidado (próximamente)
          </label>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6 pt-5 border-t border-slate-100 dark:border-slate-800/80">
        <button
          type="button"
          onClick={onLimpiar}
          disabled={consultando}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Limpiar
        </button>
        <button
          type="button"
          onClick={onConsultar}
          disabled={consultando}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 text-white text-sm font-bold shadow-lg shadow-sky-500/20 hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {consultando ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          Consultar
        </button>
      </div>
    </section>
  );
}
