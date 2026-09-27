'use client';

import { useState, type FormEvent } from 'react';
import { Building, X } from 'lucide-react';

import { SECTORES_CRM, type Empresa, type SectorCrm } from '../../../domain/entities';
import {
  buildAltaEmpresaInput,
  useCrearEmpresa,
  type TipoRegistroAlta,
} from '../../hooks/useCrearEmpresa';

/**
 * ModalAltaEmpresa (task 10.2, spec OP-5, design D5) — the mock's
 * "Anotar Nueva Empresa" form, verbatim: the radio maps BOTH domain
 * doors (Cliente Nuevo → Cliente/Inbound, Posible Cliente →
 * Prospecto/Outbound via mapearTipoRegistro), defaults follow decision
 * 5 (cargo "Recursos Humanos / Seguridad", 30 trabajadores,
 * Construcción preselected) and the presentation-letter checkbox is ON.
 *
 * Submit rides `crearEnPanel` — the empresa persists FIRST; the carta
 * then dispatches through the SAME envios seam the row buttons use, so
 * an SMTP failure never rolls the alta back: the parent receives
 * (empresa, advertenciaCarta) and the row's "Enviar carta" button is
 * the retry (spec crm-email-sequencing, persist-before-dispatch). A
 * persist failure keeps the form open with the API's Spanish error
 * (ModalRespuesta precedent).
 *
 * Own shell — the batch-12/13 precedent: the mock's header (icon +
 * slate-50 band) and 2-column grid are reproduced verbatim instead of
 * forcing ModalBase.
 */

/** Decision-5 default for the contacto's operational role. */
export const DEFAULT_CARGO_ALTA = 'Recursos Humanos / Seguridad';

export interface ModalAltaEmpresaProps {
  onSalir: () => void;
  /** Called once the empresa PERSISTS — advertenciaCarta carries the
   * send failure (null = carta sent or not requested). */
  onExito: (empresa: Empresa, advertenciaCarta: string | null) => void;
}

const claseCampo =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-teal-500';
const claseEtiqueta = 'mb-1 block text-xs font-medium text-slate-700';

function CampoTexto({
  id,
  etiqueta,
  valor,
  onCambiar,
  requerido = false,
  placeholder,
  tipo = 'text',
  maxLength,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambiar: (valor: string) => void;
  requerido?: boolean;
  placeholder?: string;
  tipo?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className={claseEtiqueta}>
        {etiqueta}
      </label>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        required={requerido}
        placeholder={placeholder}
        maxLength={maxLength}
        className={claseCampo}
      />
    </div>
  );
}

export function ModalAltaEmpresa({ onSalir, onExito }: ModalAltaEmpresaProps) {
  const { crearEnPanel, enCurso } = useCrearEmpresa();
  const [tipoRegistro, setTipoRegistro] = useState<TipoRegistroAlta>('Cliente Nuevo');
  const [razonSocial, setRazonSocial] = useState('');
  const [ruc, setRuc] = useState('');
  const [contacto, setContacto] = useState('');
  const [cargo, setCargo] = useState(DEFAULT_CARGO_ALTA);
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [sector, setSector] = useState<SectorCrm>(SECTORES_CRM[0]);
  const [trabajadoresTexto, setTrabajadoresTexto] = useState('30');
  const [enviarCarta, setEnviarCarta] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    const trabajadores = Number.parseInt(trabajadoresTexto, 10);
    try {
      const resultado = await crearEnPanel(
        buildAltaEmpresaInput({
          tipoRegistro,
          razonSocial,
          ruc,
          contacto,
          cargo,
          correo,
          telefono,
          sector,
          cantidadTrabajadores: Number.isNaN(trabajadores) ? null : trabajadores,
        }),
        { enviarCarta },
      );
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      onExito(resultado.empresa, resultado.advertenciaCarta);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la empresa.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Anotar Nueva Empresa"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 p-5">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 font-bold text-teal-700">
              <Building className="h-4 w-4" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Anotar Nueva Empresa</h3>
          </div>
          <button
            type="button"
            onClick={onSalir}
            aria-label="Cerrar alta"
            className="rounded-lg p-1 text-slate-400 transition hover:text-slate-600"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={enviar} className="space-y-4 p-5">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase text-slate-500">
              ¿Qué tipo de contacto es?
            </span>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex cursor-pointer items-center rounded-xl border border-slate-200 p-3 transition hover:bg-slate-50 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50/40">
                <input
                  type="radio"
                  name="tipo-registro"
                  value="Cliente Nuevo"
                  checked={tipoRegistro === 'Cliente Nuevo'}
                  onChange={() => setTipoRegistro('Cliente Nuevo')}
                  className="mr-2.5 text-teal-600 focus:ring-teal-500"
                />
                <span>
                  <span className="block text-xs font-bold text-slate-800">Cliente Nuevo</span>
                  <span className="block text-[11px] text-slate-500">
                    Ya pidió informes o cotización
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center rounded-xl border border-slate-200 p-3 transition hover:bg-slate-50 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50/40">
                <input
                  type="radio"
                  name="tipo-registro"
                  value="Posible Cliente"
                  checked={tipoRegistro === 'Posible Cliente'}
                  onChange={() => setTipoRegistro('Posible Cliente')}
                  className="mr-2.5 text-teal-600 focus:ring-teal-500"
                />
                <span>
                  <span className="block text-xs font-bold text-slate-800">Posible Cliente</span>
                  <span className="block text-[11px] text-slate-500">
                    Empresa que queremos contactar
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoTexto
              id="alta-empresa"
              etiqueta="Nombre de la Empresa *"
              valor={razonSocial}
              onCambiar={setRazonSocial}
              requerido
              placeholder="Ej. Constructora Los Andes S.A.C."
            />
            <CampoTexto
              id="alta-ruc"
              etiqueta="RUC o Identificación *"
              valor={ruc}
              onCambiar={setRuc}
              requerido
              placeholder="Ej. 20489561234"
              maxLength={11}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoTexto
              id="alta-contacto"
              etiqueta="Persona de Contacto *"
              valor={contacto}
              onCambiar={setContacto}
              requerido
              placeholder="Ej. Carlos Mendoza"
            />
            <CampoTexto
              id="alta-cargo"
              etiqueta="Puesto o Cargo"
              valor={cargo}
              onCambiar={setCargo}
              placeholder="Ej. Encargado de Personal"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoTexto
              id="alta-correo"
              etiqueta="Correo Electrónico *"
              valor={correo}
              onCambiar={setCorreo}
              requerido
              placeholder="contacto@empresa.com"
              tipo="email"
            />
            <CampoTexto
              id="alta-telefono"
              etiqueta="Teléfono o WhatsApp"
              valor={telefono}
              onCambiar={setTelefono}
              placeholder="987 654 321"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="alta-sector" className={claseEtiqueta}>
                Rubro de la Empresa
              </label>
              <select
                id="alta-sector"
                value={sector}
                onChange={(e) => setSector(e.target.value as SectorCrm)}
                className={`${claseCampo} bg-white`}
              >
                {SECTORES_CRM.map((opcion) => (
                  <option key={opcion} value={opcion}>
                    {opcion}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="alta-trabajadores" className={claseEtiqueta}>
                Cantidad aprox. de trabajadores
              </label>
              <input
                id="alta-trabajadores"
                type="number"
                min={1}
                value={trabajadoresTexto}
                onChange={(e) => setTrabajadoresTexto(e.target.value)}
                className={claseCampo}
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-2">
            <label className="flex cursor-pointer items-center text-xs text-slate-600">
              <input
                type="checkbox"
                checked={enviarCarta}
                onChange={(e) => setEnviarCarta(e.target.checked)}
                className="mr-2 rounded text-teal-600 focus:ring-teal-500"
              />
              <span>Enviar la Carta de Presentación de inmediato</span>
            </label>
          </div>

          {error !== null && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end space-x-2 pt-3">
            <button
              type="button"
              onClick={onSalir}
              className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enCurso}
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Guardar y Empezar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
