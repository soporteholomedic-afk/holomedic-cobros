'use client';

import { useState } from 'react';
import {
  BellOff,
  ChevronRight,
  Clock,
  FileText,
  MailOpen,
  RefreshCw,
  Tag,
  X,
  type LucideIcon,
} from 'lucide-react';

import type { PlantillaCrmKey } from '../../../domain/ports';
import {
  PLANTILLAS_CORREO,
  renderPlantillaCorreo,
  type DatosPlantilla,
} from '../../../domain/plantillasCorreo';

/**
 * ModalPreviewCorreo (task 9.2, spec OP-8 + EM-3, design D5) — the
 * panel's "Secuencia Completa de Correos" section plus the READ-ONLY
 * preview of one template: De (dedicated `crm` sender, env-driven with a
 * visible placeholder fallback), Para (sample contacto), Asunto and the
 * verbatim interpolated body. NO attachment box exists in v1 (decision
 * 3). Own shell — the batch-12 precedent: ModalBase is the input-modal
 * shell and the mock's previews are structurally different.
 *
 * Escape-at-interpolation: the datos are HTML-escaped BEFORE joining the
 * template body, so client data can never inject markup; the body is the
 * only dangerouslySetInnerHTML surface and its only dynamic content is
 * the escaped interpolation.
 */

/** Sample client the previews render against (mock cli-001 parity —
 * the section lives in the panel, outside any row context). */
export const DATOS_MUESTRA: DatosVistaPrevia = {
  empresa: 'Constructora Los Andes',
  contacto: 'Fernando Valdivia',
  correo: 'fvaldivia@losandes.com',
  sector: 'Construcción',
  trabajadores: 85,
};

/** Interpolation values incl. the contacto address the Para: line shows. */
export interface DatosVistaPrevia extends DatosPlantilla {
  correo: string;
}

export interface VistaPreviaCorreo {
  de: string;
  para: string;
  asunto: string;
  /** Template HTML with every dato escaped-then-interpolated. */
  cuerpoHtml: string;
}

/** Display name of the dedicated `crm` sender (decision 2 — env address,
 * no hardcoded identity; the name alone is the mock's). */
const NOMBRE_REMITENTE_CRM = 'Clínica de Salud Ocupacional';

const REMITENTE_PENDIENTE = 'remitente-no-configurado';

/** Pure — the De: address. Falls back to a VISIBLE placeholder when
 * NEXT_PUBLIC_SMTP_USER_CRM is absent so the preview never crashes and
 * the missing provisioning stays obvious (batch-13 flagged decision). */
export function correoRemitenteCrm(): string {
  const configurado = process.env.NEXT_PUBLIC_SMTP_USER_CRM?.trim();
  return configurado ? configurado : REMITENTE_PENDIENTE;
}

/** HTML-escape one interpolation value (& first, then the brackets). */
function escaparHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Pure — resolves one template against datos with escape-at-
 * interpolation: the escaped values feed the SAME pure renderer the real
 * sends use (design D5), so the preview is byte-faithful to what the
 * client would receive minus the attachment (EM-3).
 */
export function construirVistaPrevia(
  clave: PlantillaCrmKey,
  datos: DatosVistaPrevia,
): VistaPreviaCorreo {
  const render = renderPlantillaCorreo(clave, {
    empresa: escaparHtml(datos.empresa),
    contacto: escaparHtml(datos.contacto),
    sector: datos.sector === null ? null : escaparHtml(datos.sector),
    trabajadores: datos.trabajadores,
  });
  return {
    de: `${NOMBRE_REMITENTE_CRM} <${correoRemitenteCrm()}>`,
    para: `${datos.contacto} <${datos.correo}>`,
    asunto: render.asunto,
    cuerpoHtml: render.cuerpo,
  };
}

export interface TarjetaSecuencia {
  clave: PlantillaCrmKey;
  /** Mock cadence chip ("Día 1 • Inmediato", "A los 7 días", …). */
  chip: string;
  titulo: string;
  descripcion: string;
  tono: 'teal' | 'amber' | 'orange' | 'rose' | 'purple';
  Icono: LucideIcon;
}

/** The 5 mock cards verbatim — EXCEPT card 1's description, softened per
 * decision 3 (v1 sends no folleto, so the mock's "adjunta el folleto"
 * clause is dropped until the attachment ships). */
export const TARJETAS_SECUENCIA: readonly TarjetaSecuencia[] = [
  {
    clave: 'carta_presentacion',
    chip: 'Día 1 • Inmediato',
    titulo: '1. Carta de Presentación',
    descripcion: 'Presenta la clínica y los exámenes médicos que exige la ley.',
    tono: 'teal',
    Icono: FileText,
  },
  {
    clave: 'seguimiento_1',
    chip: 'A los 7 días',
    titulo: '2. Recordatorio Semana 1',
    descripcion: 'Recordatorio amable para tener los exámenes al día y prevenir multas laborales.',
    tono: 'amber',
    Icono: Clock,
  },
  {
    clave: 'seguimiento_2',
    chip: 'A los 14 días',
    titulo: '3. Recordatorio Semana 2',
    descripcion: 'Ofrece descuentos por cantidad de trabajadores y atención médica rápida.',
    tono: 'orange',
    Icono: Tag,
  },
  {
    clave: 'seguimiento_3',
    chip: 'A los 21 días (Cierre)',
    titulo: '4. Último Recordatorio',
    descripcion: 'Aviso cortés indicando pausa de contacto para no incomodar a la empresa.',
    tono: 'rose',
    Icono: BellOff,
  },
  {
    clave: 'reactivacion_3m',
    chip: 'A los 3 Meses',
    titulo: '5. Saludo tras 3 Meses',
    descripcion: 'Mensaje cercano de reactivación para consultar si este trimestre toca renovar chequeos.',
    tono: 'purple',
    Icono: RefreshCw,
  },
];

/** Mock tone language per card (border/bg, chip, icon, "Leer mensaje"). */
const TONOS: Record<
  TarjetaSecuencia['tono'],
  { tarjeta: string; chip: string; icono: string; leer: string; tituloHover: string }
> = {
  teal: {
    tarjeta: 'border-teal-200 bg-teal-50/50 hover:bg-teal-50',
    chip: 'text-teal-800 bg-teal-100/80',
    icono: 'text-teal-600',
    leer: 'text-teal-600',
    tituloHover: 'group-hover:text-teal-700',
  },
  amber: {
    tarjeta: 'border-slate-200 bg-slate-50/70 hover:bg-amber-50/50 hover:border-amber-200',
    chip: 'text-amber-800 bg-amber-100/80',
    icono: 'text-amber-600',
    leer: 'text-amber-700',
    tituloHover: 'group-hover:text-amber-800',
  },
  orange: {
    tarjeta: 'border-slate-200 bg-slate-50/70 hover:bg-orange-50/50 hover:border-orange-200',
    chip: 'text-orange-800 bg-orange-100/80',
    icono: 'text-orange-600',
    leer: 'text-orange-700',
    tituloHover: 'group-hover:text-orange-800',
  },
  rose: {
    tarjeta: 'border-slate-200 bg-slate-50/70 hover:bg-rose-50/50 hover:border-rose-200',
    chip: 'text-rose-800 bg-rose-100/80',
    icono: 'text-rose-600',
    leer: 'text-rose-700',
    tituloHover: 'group-hover:text-rose-800',
  },
  purple: {
    tarjeta: 'border-purple-200 bg-purple-50/60 hover:bg-purple-50',
    chip: 'text-purple-800 bg-purple-200/80',
    icono: 'text-purple-600',
    leer: 'text-purple-700',
    tituloHover: 'group-hover:text-purple-800',
  },
};

export interface ModalPreviewCorreoProps {
  clave: PlantillaCrmKey;
  onSalir: () => void;
}

/** The read-only preview of ONE template (mock's emailPreviewModal). */
export function ModalPreviewCorreo({ clave, onSalir }: ModalPreviewCorreoProps) {
  const plantilla = PLANTILLAS_CORREO[clave];
  const vista = construirVistaPrevia(clave, DATOS_MUESTRA);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Vista del Mensaje"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 p-4">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 font-bold text-teal-700">
              <MailOpen className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Vista del Mensaje</h3>
              <p className="text-[11px] text-slate-500">
                Momento del envío: {plantilla.fase}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSalir}
            aria-label="Cerrar vista previa"
            className="rounded-lg p-1 text-slate-400 transition hover:text-slate-600"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-1 border-b border-slate-200 bg-slate-100/70 px-6 py-3 text-xs">
          <div className="flex">
            <span className="w-16 font-semibold text-slate-500">De:</span>
            <span className="font-medium text-slate-800">{vista.de}</span>
          </div>
          <div className="flex">
            <span className="w-16 font-semibold text-slate-500">Para:</span>
            <span className="font-medium text-slate-800">{vista.para}</span>
          </div>
          <div className="flex">
            <span className="w-16 font-semibold text-slate-500">Asunto:</span>
            <span className="font-bold text-teal-700">{vista.asunto}</span>
          </div>
        </div>

        {/* Only dynamic HTML surface — every dato was escaped BEFORE
            interpolation (see construirVistaPrevia). */}
        <div
          className="space-y-4 overflow-y-auto p-6 font-sans text-xs leading-relaxed text-slate-700 sm:text-sm"
          dangerouslySetInnerHTML={{ __html: vista.cuerpoHtml }}
        />

        {/* NO attachment box in v1 — decision 3 (EM-3). */}

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 p-4">
          <span className="text-xs text-slate-500">Envío: {plantilla.fase}</span>
          <button
            type="button"
            onClick={onSalir}
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-200/70"
          >
            Entendido, cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/** The panel section: heading, badge and the 5 clickable cards. Owns the
 * open-preview state (PanelCrm mounts it with no props). */
export function SeccionSecuenciaCorreos() {
  const [claveAbierta, setClaveAbierta] = useState<PlantillaCrmKey | null>(null);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <MailOpen className="h-5 w-5 text-teal-600" aria-hidden="true" />
            Secuencia Completa de Correos (Incluye Reactivación tras 3 Meses)
          </h3>
          <p className="text-xs text-slate-500">
            Haz clic en cualquiera de las 5 tarjetas para leer el texto exacto redactado para el
            cliente.
          </p>
        </div>
        <span className="w-fit rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700">
          4 correos iniciales + 1 de reactivación
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        {TARJETAS_SECUENCIA.map((tarjeta) => {
          const tono = TONOS[tarjeta.tono];
          return (
            <button
              key={tarjeta.clave}
              type="button"
              onClick={() => setClaveAbierta(tarjeta.clave)}
              className={`group relative cursor-pointer rounded-xl border p-3.5 text-left transition ${tono.tarjeta}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${tono.chip}`}
                >
                  {tarjeta.chip}
                </span>
                <tarjeta.Icono className={`h-4 w-4 ${tono.icono}`} aria-hidden="true" />
              </div>
              <h4 className={`text-sm font-bold text-slate-800 transition ${tono.tituloHover}`}>
                {tarjeta.titulo}
              </h4>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{tarjeta.descripcion}</p>
              <div className={`mt-3 flex items-center text-xs font-semibold ${tono.leer}`}>
                <span>Leer mensaje</span>
                <ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </div>
            </button>
          );
        })}
      </div>

      {claveAbierta !== null && (
        <ModalPreviewCorreo clave={claveAbierta} onSalir={() => setClaveAbierta(null)} />
      )}
    </section>
  );
}
