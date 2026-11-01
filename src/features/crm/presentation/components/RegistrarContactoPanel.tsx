'use client';

import { ArrowDownLeft, ArrowUpRight, Info, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import type { Direccion, Empresa } from '../../domain/entities';
import {
  ORDEN_REGISTRO,
  agendaDe,
  cuerpoRegistro,
  etiquetaResumen,
  previaContacto,
  primerFallo,
  registroInicial,
  validarRegistro,
  type CampoContacto,
  type Fallos,
  type RegistroForm,
  type ResultadoSaliente,
} from './contactoForm';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, ERROR_CAMPO, ETIQUETA_CAMPO, INPUT_VALIDABLE, LEYENDA } from './crmUi';
import { MedioPills, PildoraRadio } from './MedioPills';
import { ProximaAccionCampos } from './ProximaAccionCampos';
import { useRegistrarContacto } from './useRegistrarContacto';

interface Props {
  empresa: Empresa;
  /** Every empresa, to mark on the calendar the days that already have actions. */
  empresas: Empresa[];
  /** Who started the contact when the panel opens. */
  direccion: Direccion;
  /** Today as `YYYY-MM-DD` in the business time zone. */
  hoy: string;
  onCerrar: () => void;
  /** The server saved the contact: the empresa as it is now. */
  onGuardado: (nueva: Empresa) => void;
}

const BASE = 'reg';
const CAMPO: Record<CampoContacto, string> = {
  razon: '',
  ruc: '',
  dato: '',
  otro: `${BASE}-otro`,
  resumen: `${BASE}-res`,
  accion: `${BASE}-acc`,
  accionDetalle: `${BASE}-acc-det`,
  fecha: `${BASE}-fec`,
};

const RESULTADOS: [ResultadoSaliente, string][] = [
  ['conversamos', 'Conversamos'],
  ['no_contesto', 'No contestó'],
  ['deje_mensaje', 'Dejé mensaje'],
];

const TILE =
  'relative grid gap-1 rounded-xl border p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky-500';
const TILE_LIBRE = 'border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800';
const TILE_ELEGIDO = 'border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-950/40';

/**
 * Floating "Registrar contacto" panel (`position: fixed`, like the create and
 * detail panels). It records one contact on an existing card and previews what
 * saving does to it (L8).
 */
export function RegistrarContactoPanel({ empresa, empresas, direccion, hoy, onCerrar, onGuardado }: Props) {
  const [form, setForm] = useState<RegistroForm>(() => registroInicial(empresa, direccion, hoy));
  const [fallos, setFallos] = useState<Fallos>({});
  const { guardando, registrar } = useRegistrarContacto();
  const formRef = useRef<HTMLFormElement>(null);
  const cerrar = useRef(onCerrar);
  const marcados = useMemo(() => agendaDe(empresas, empresa.idEmpresa), [empresas, empresa.idEmpresa]);
  const requerida = empresa.etapa !== 'cliente';
  const resumen = etiquetaResumen(form);
  const entrante = form.direccion === 'entrante';

  useEffect(() => {
    cerrar.current = onCerrar;
  });

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('input:checked')?.focus();
    function onKey(e: KeyboardEvent) {
      // A medium or reason dialog open over the panel takes the Escape for itself.
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) cerrar.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function cambiar(cambios: Partial<RegistroForm>) {
    setForm((f) => ({ ...f, ...cambios }));
    setFallos({});
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (guardando) return;
    const malos = validarRegistro(form, hoy);
    const primero = primerFallo(malos, ORDEN_REGISTRO);
    if (primero) {
      setFallos(malos);
      document.getElementById(CAMPO[primero])?.focus();
      return;
    }
    setFallos({});
    const nueva = await registrar(empresa.idEmpresa, cuerpoRegistro(form));
    if (nueva) onGuardado(nueva);
  }

  const idResumen = CAMPO.resumen;
  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="crm-registro-title"
      className="fixed bottom-0 right-0 top-0 z-40 flex w-[420px] max-w-full flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-[-10px_0_30px_rgba(15,23,42,0.14)] dark:border-slate-800 dark:bg-slate-900"
    >
      <header className="flex items-start gap-3 px-6 pb-1.5 pt-5">
        <div className="min-w-0">
          <h2 id="crm-registro-title" className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Registrar contacto
          </h2>
          <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-400">
            {`${empresa.razonSocial} · ${empresa.contactos[0]?.nombre ?? 'Sin nombre'}`}
          </p>
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

      <form ref={formRef} onSubmit={enviar} autoComplete="off" noValidate className="flex flex-1 flex-col">
        <div className="grid gap-4 px-6 pb-4 pt-3">
          <fieldset className="grid gap-2.5">
            <legend className={LEYENDA}>¿Quién inició?</legend>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  ['saliente', 'Contactamos', 'Llamamos o escribimos nosotros', ArrowUpRight],
                  ['entrante', 'Nos contactaron', 'La empresa nos llamó o escribió', ArrowDownLeft],
                ] as const
              ).map(([valor, titulo, ayuda, Icono]) => (
                <label key={valor} className={`${TILE} ${form.direccion === valor ? TILE_ELEGIDO : TILE_LIBRE}`}>
                  <input
                    type="radio"
                    name={`${BASE}-dir`}
                    value={valor}
                    checked={form.direccion === valor}
                    onChange={() => cambiar({ direccion: valor })}
                    className="absolute inset-0 m-0 cursor-pointer opacity-0"
                  />
                  <b className="flex items-center gap-2 text-sm text-slate-900 dark:text-slate-100">
                    <Icono className="h-4 w-4" aria-hidden="true" />
                    {titulo}
                  </b>
                  <span className="text-xs text-slate-600 dark:text-slate-400">{ayuda}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <MedioPills
            base={BASE}
            leyenda="Medio"
            medio={form.medio}
            medioOtro={form.medioOtro}
            onMedio={(medio) => cambiar({ medio })}
            onMedioOtro={(medioOtro) => cambiar({ medioOtro })}
            error={fallos.otro}
          />

          <fieldset className="grid gap-2.5">
            <legend className={LEYENDA}>{entrante ? '¿Ya le respondiste?' : 'Resultado'}</legend>
            <div className="flex flex-wrap gap-2">
              {entrante
                ? (
                    [
                      [true, 'Sí, ya le respondí'],
                      [false, 'Todavía no'],
                    ] as const
                  ).map(([valor, texto]) => (
                    <PildoraRadio
                      key={texto}
                      name={`${BASE}-resp`}
                      value={texto}
                      marcada={form.respondido === valor}
                      onElegir={() => cambiar({ respondido: valor })}
                    >
                      {texto}
                    </PildoraRadio>
                  ))
                : RESULTADOS.map(([valor, texto]) => (
                    <PildoraRadio
                      key={valor}
                      name={`${BASE}-res`}
                      value={valor}
                      marcada={form.resultado === valor}
                      onElegir={() => cambiar({ resultado: valor })}
                    >
                      {texto}
                    </PildoraRadio>
                  ))}
            </div>
          </fieldset>

          <p
            data-testid="contacto-previa"
            aria-live="polite"
            className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Info className="mt-px h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden="true" />
            <span>{previaContacto(empresa, form)}</span>
          </p>

          <div className={ETIQUETA_CAMPO}>
            <label htmlFor={idResumen}>
              {resumen.texto}
              {resumen.opcional && <small className="font-normal text-slate-500 dark:text-slate-400"> (opcional)</small>}
            </label>
            <textarea
              id={idResumen}
              value={form.resumen}
              onChange={(ev) => cambiar({ resumen: ev.target.value })}
              placeholder="Ej. Pidió cotización de exámenes periódicos para 80 trabajadores"
              aria-invalid={fallos.resumen ? true : undefined}
              aria-describedby={fallos.resumen ? `${idResumen}-err` : undefined}
              className={`${INPUT_VALIDABLE} min-h-[72px] resize-y`}
            />
            {fallos.resumen && (
              <p id={`${idResumen}-err`} role="alert" className={ERROR_CAMPO}>
                {fallos.resumen}
              </p>
            )}
          </div>

          <ProximaAccionCampos
            base={BASE}
            requerida={requerida}
            valor={form.accion}
            onCambio={(accion) => cambiar({ accion })}
            hoy={hoy}
            marcados={marcados}
            fallos={fallos}
          />
        </div>

        <div
          data-pie-registro
          className="sticky bottom-0 mt-auto flex justify-end gap-2.5 border-t border-slate-200 bg-white px-6 pb-4 pt-3 shadow-[0_-8px_12px_-8px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-900"
        >
          <button type="button" onClick={onCerrar} className={BOTON_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
            {guardando ? 'Guardando…' : 'Guardar contacto'}
          </button>
        </div>
      </form>
    </aside>
  );
}
