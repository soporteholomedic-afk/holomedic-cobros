'use client';

import { ACCIONES, ACCION_LABELS, type AccionTipo } from '../../domain/entities';
import { CrmCalendario } from './CrmCalendario';
import { CrmSelect, type OpcionSelect } from './CrmSelect';
import type { AccionForm, EntradaAgenda, Fallos } from './contactoForm';
import { ACCION_ESTILO, ERROR_CAMPO, ETIQUETA_CAMPO, INPUT_VALIDABLE, LEYENDA } from './crmUi';

type Tipo = AccionTipo | 'ninguna';

const OPCIONES: OpcionSelect<Tipo>[] = ACCIONES.map((a) => ({
  value: a,
  label: ACCION_LABELS[a],
  icon: ACCION_ESTILO[a].icono,
  description: ACCION_ESTILO[a].descripcion,
  separada: a === 'otro',
}));

const SIN_ACCION: OpcionSelect<Tipo> = {
  value: 'ninguna',
  label: 'Sin próxima acción',
  icon: ACCION_ESTILO.ninguna.icono,
  description: ACCION_ESTILO.ninguna.descripcion,
};

interface Props {
  /** Prefix of the DOM ids: `<base>-acc`, `<base>-acc-det` and `<base>-fec`. */
  base: string;
  /** False in Cliente, where "Sin próxima acción" is offered first. */
  requerida: boolean;
  valor: AccionForm;
  onCambio: (valor: AccionForm) => void;
  hoy: string;
  /** Scheduled actions per day, each naming its deal and empresa, for the dots of the calendar. */
  marcados: Record<string, EntradaAgenda[]>;
  fallos: Fallos;
}

/** Next action: custom menu, optional detail and custom calendar (spec S8). */
export function ProximaAccionCampos({ base, requerida, valor, onCambio, hoy, marcados, fallos }: Props) {
  const idAccion = `${base}-acc`;
  const idDetalle = `${base}-acc-det`;
  const idFecha = `${base}-fec`;
  const otro = valor.tipo === 'otro';
  return (
    <fieldset className="grid gap-3.5">
      <legend className={LEYENDA}>
        Próxima acción
        {!requerida && (
          <>
            {' '}
            <span className="font-normal normal-case tracking-normal text-slate-500 dark:text-slate-400">(opcional)</span>
          </>
        )}
      </legend>
      <div className="grid gap-1.5">
        <CrmSelect<Tipo>
          id={idAccion}
          label="Qué hacer"
          value={valor.tipo}
          options={requerida ? OPCIONES : [SIN_ACCION, ...OPCIONES]}
          placeholder="Elige una acción"
          onChange={(tipo) => onCambio({ ...valor, tipo })}
          invalid={!!fallos.accion}
          describedBy={fallos.accion ? `${idAccion}-err` : undefined}
        />
        {fallos.accion && (
          <p id={`${idAccion}-err`} role="alert" className={ERROR_CAMPO}>
            {fallos.accion}
          </p>
        )}
      </div>
      {valor.tipo !== 'ninguna' && (
        <>
          <div className={ETIQUETA_CAMPO}>
            <label htmlFor={idDetalle}>
              {otro ? '¿Cuál?' : <>Detalle <small className="font-normal text-slate-500 dark:text-slate-400">(opcional)</small></>}
            </label>
            <input
              id={idDetalle}
              value={valor.detalle}
              maxLength={80}
              onChange={(ev) => onCambio({ ...valor, detalle: ev.target.value })}
              placeholder={otro ? 'Ej. Enviar el contrato para firma' : 'Ej. cerrar la propuesta'}
              aria-invalid={fallos.accionDetalle ? true : undefined}
              aria-describedby={fallos.accionDetalle ? `${idDetalle}-err` : undefined}
              className={INPUT_VALIDABLE}
            />
            {fallos.accionDetalle && (
              <p id={`${idDetalle}-err`} role="alert" className={ERROR_CAMPO}>
                {fallos.accionDetalle}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <CrmCalendario
              id={idFecha}
              label="Cuándo"
              value={valor.fecha}
              hoy={hoy}
              marcados={marcados}
              onChange={(fecha) => onCambio({ ...valor, fecha })}
              invalid={!!fallos.fecha}
              describedBy={fallos.fecha ? `${idFecha}-err` : undefined}
            />
            {fallos.fecha && (
              <p id={`${idFecha}-err`} role="alert" className={ERROR_CAMPO}>
                {fallos.fecha}
              </p>
            )}
          </div>
        </>
      )}
    </fieldset>
  );
}
