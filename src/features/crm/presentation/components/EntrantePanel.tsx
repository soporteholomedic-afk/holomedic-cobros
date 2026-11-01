'use client';

import { Info, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { ORIGENES, ORIGEN_LABELS, type Empresa, type Origen } from '../../domain/entities';
import {
  ORDEN_ENTRANTE,
  agendaDe,
  cuerpoEntrante,
  empresaCoincidente,
  entranteInicial,
  previaEntrante,
  primerFallo,
  validarEntrante,
  type CampoContacto,
  type EntranteForm,
  type Fallos,
} from './contactoForm';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, ERROR_CAMPO, ETIQUETA_CAMPO, INPUT_VALIDABLE, LEYENDA, ORIGEN_ESTILO } from './crmUi';
import { CrmSelect, type OpcionSelect } from './CrmSelect';
import { MedioPills } from './MedioPills';
import { ProximaAccionCampos } from './ProximaAccionCampos';
import { useEntrante } from './useEntrante';

interface Props {
  /** Every empresa, to recognize a name or RUC that is already in the CRM and to mark the calendar. */
  empresas: Empresa[];
  /** Today as `YYYY-MM-DD` in the business time zone. */
  hoy: string;
  onCerrar: () => void;
  /** The server saved the contact: the empresa as it is now, and whether it already existed. */
  onGuardado: (empresa: Empresa, existente: boolean) => void;
}

const BASE = 'ent';
const CAMPO: Record<CampoContacto, string> = {
  razon: `${BASE}-razon`,
  ruc: `${BASE}-ruc`,
  otro: `${BASE}-otro`,
  dato: `${BASE}-dato`,
  resumen: `${BASE}-necesita`,
  accion: `${BASE}-acc`,
  accionDetalle: `${BASE}-acc-det`,
  fecha: `${BASE}-fec`,
};

const ORIGEN_OPCIONES: OpcionSelect<Origen>[] = ORIGENES.map((o) => ({
  value: o,
  label: ORIGEN_LABELS[o],
  icon: ORIGEN_ESTILO[o].icono,
  description: ORIGEN_ESTILO[o].descripcion,
}));

interface CampoProps {
  id: string;
  etiqueta: ReactNode;
  error?: string;
  children: (a: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string; className: string }) => ReactNode;
}

/** Label, control and the error linked to it with `aria-describedby`. */
function Campo({ id, etiqueta, error, children }: CampoProps) {
  return (
    <div className={ETIQUETA_CAMPO}>
      <label htmlFor={id}>{etiqueta}</label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? `${id}-err` : undefined,
        className: INPUT_VALIDABLE,
      })}
      {error && (
        <p id={`${id}-err`} role="alert" className={ERROR_CAMPO}>
          {error}
        </p>
      )}
    </div>
  );
}

const Opcional = ({ texto = '(opcional)' }: { texto?: string }) => (
  <small className="font-normal text-slate-500 dark:text-slate-400">{texto}</small>
);

/**
 * Floating "Nos contactaron" panel (`position: fixed`). It records an inbound
 * contact: a new card in Contactado marked "Falta responder", or, when the
 * name or RUC is already in the CRM, a new entry on that card (spec S5, L8).
 */
export function EntrantePanel({ empresas, hoy, onCerrar, onGuardado }: Props) {
  const [form, setForm] = useState<EntranteForm>(() => entranteInicial(hoy));
  const [fallos, setFallos] = useState<Fallos>({});
  const { guardando, registrar } = useEntrante();
  const cerrar = useRef(onCerrar);

  const destino = useMemo(() => empresaCoincidente(empresas, form.razonSocial, form.ruc), [empresas, form.razonSocial, form.ruc]);
  const marcados = useMemo(() => agendaDe(empresas, destino?.idEmpresa ?? null), [empresas, destino]);

  useEffect(() => {
    cerrar.current = onCerrar;
  });

  useEffect(() => {
    document.getElementById(CAMPO.razon)?.focus();
    function onKey(e: KeyboardEvent) {
      // A medium or reason dialog open over the panel takes the Escape for itself.
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) cerrar.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function cambiar(cambios: Partial<EntranteForm>) {
    setForm((f) => ({ ...f, ...cambios }));
    setFallos({});
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (guardando) return;
    const malos = validarEntrante(form, hoy, destino);
    const primero = primerFallo(malos, ORDEN_ENTRANTE);
    if (primero) {
      setFallos(malos);
      document.getElementById(CAMPO[primero])?.focus();
      return;
    }
    setFallos({});
    const r = await registrar(cuerpoEntrante(form));
    if (r) onGuardado(r.empresa, r.existente);
  }

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="crm-entrante-title"
      className="fixed bottom-0 right-0 top-0 z-40 flex w-[420px] max-w-full flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-[-10px_0_30px_rgba(15,23,42,0.14)] dark:border-slate-800 dark:bg-slate-900"
    >
      <header className="flex items-start gap-3 px-6 pb-1.5 pt-5">
        <div className="min-w-0">
          <h2 id="crm-entrante-title" className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Nos contactaron
          </h2>
          <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-400">Anótalo apenas llegue. El tablero sigue disponible.</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar panel"
          className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <form onSubmit={enviar} autoComplete="off" noValidate className="flex flex-1 flex-col">
        <div className="grid gap-4 px-6 pb-4 pt-3">
          <fieldset className="grid gap-3.5">
            <legend className={LEYENDA}>Empresa</legend>
            <Campo id={CAMPO.razon} etiqueta="Empresa" error={fallos.razon}>
              {(a) => (
                <input
                  {...a}
                  value={form.razonSocial}
                  onChange={(ev) => cambiar({ razonSocial: ev.target.value })}
                  placeholder="Razón social o nombre comercial"
                />
              )}
            </Campo>
            {destino && (
              <p
                data-testid="entrante-coincidencia"
                className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2.5 text-[13px] text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
              >
                {`Ya está en el CRM: ${destino.razonSocial}. Se suma a esa tarjeta.`}
              </p>
            )}
            <Campo id={CAMPO.ruc} etiqueta={<>RUC <Opcional /></>} error={fallos.ruc}>
              {(a) => (
                <input
                  {...a}
                  inputMode="numeric"
                  maxLength={11}
                  value={form.ruc}
                  onChange={(ev) => cambiar({ ruc: ev.target.value })}
                  placeholder="11 dígitos · si no lo tienes, se completa después"
                />
              )}
            </Campo>
          </fieldset>

          <MedioPills
            base={BASE}
            leyenda="¿Por dónde llegó?"
            medio={form.medio}
            medioOtro={form.medioOtro}
            onMedio={(medio) => cambiar({ medio })}
            onMedioOtro={(medioOtro) => cambiar({ medioOtro })}
            error={fallos.otro}
          />

          <fieldset className="grid gap-3.5">
            <legend className={LEYENDA}>Contacto</legend>
            <Campo id={`${BASE}-persona`} etiqueta={<>Persona <Opcional /></>}>
              {(a) => (
                <input
                  {...a}
                  value={form.persona}
                  onChange={(ev) => cambiar({ persona: ev.target.value })}
                  placeholder="Nombre y apellido"
                />
              )}
            </Campo>
            <Campo
              id={CAMPO.dato}
              etiqueta={destino ? <>Teléfono o correo <Opcional texto="(opcional: ya tenemos sus datos)" /></> : 'Teléfono o correo'}
              error={fallos.dato}
            >
              {(a) => (
                <input
                  {...a}
                  value={form.dato}
                  onChange={(ev) => cambiar({ dato: ev.target.value })}
                  placeholder="9XX XXX XXX o nombre@empresa.com"
                />
              )}
            </Campo>
            <Campo id={CAMPO.resumen} etiqueta={<>¿Qué necesita? <Opcional /></>}>
              {(a) => (
                <textarea
                  {...a}
                  value={form.necesita}
                  onChange={(ev) => cambiar({ necesita: ev.target.value })}
                  placeholder="Ej. Exámenes de ingreso para 25 trabajadores esta semana"
                  className={`${a.className} min-h-[72px] resize-y`}
                />
              )}
            </Campo>
            <CrmSelect<Origen>
              id={`${BASE}-como`}
              label="¿Cómo nos conoció?"
              nota="(opcional)"
              value={form.origen}
              options={ORIGEN_OPCIONES}
              placeholder="Elige una opción"
              onChange={(origen) => cambiar({ origen })}
            />
          </fieldset>

          <ProximaAccionCampos
            base={BASE}
            requerida={(destino?.etapa ?? 'contactado') !== 'cliente'}
            valor={form.accion}
            onCambio={(accion) => cambiar({ accion })}
            hoy={hoy}
            marcados={marcados}
            fallos={fallos}
          />

          <p
            data-testid="entrante-previa"
            aria-live="polite"
            className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Info className="mt-px h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden="true" />
            <span>{previaEntrante(destino, form.ruc)}</span>
          </p>
        </div>

        <div
          data-pie-entrante
          className="sticky bottom-0 mt-auto flex justify-end gap-2.5 border-t border-slate-200 bg-white px-6 pb-4 pt-3 shadow-[0_-8px_12px_-8px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-900"
        >
          <button type="button" onClick={onCerrar} className={BOTON_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </aside>
  );
}
