import { Suspense } from 'react';

import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { DIAS_VENTANA_CALIDAD, type ResumenCalidad } from '@/features/crm/domain/entities';

/**
 * `/crm/calidad` — panel mínimo de métricas de calidad (agente-ia-crm
 * E4·T6, permiso `crm_conversaciones` via RUTAS_PROTEGIDAS). Server
 * Component that renders the header + window caption and wraps the
 * async `TarjetasCalidad` data component in Suspense (productividad
 * page precedent; the page owns NO session read — the proxy gates the
 * route, conversaciones page precedent). Deliberately MINIMAL: no
 * filters, no tables, no client JS — the fetch happens server-side
 * through the SAME repo the API route uses, and every metric renders
 * AS-IS from the ONE `ResumenCalidad` aggregate.
 */

/** Productividad page spinner, reused verbatim (same Suspense idiom). */
const SPINNER = (
  <div className="flex items-center justify-center py-16">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
  </div>
);

export default function CalidadPage() {
  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Calidad</h1>
        <p className="text-sm text-muted-foreground">
          Métricas de las respuestas de la Guía — últimos {DIAS_VENTANA_CALIDAD} días.
        </p>
      </header>

      <Suspense fallback={SPINNER}>
        <TarjetasCalidad />
      </Suspense>
    </main>
  );
}

interface TarjetaCalidad {
  etiqueta: string;
  valor: string;
  subtitulo: string;
}

function entero(valor: number): string {
  return String(valor);
}

function decimal2(valor: number): string {
  return valor.toFixed(2);
}

/** Percent rounded to the nearest integer — panel is "cifras en palabras sencillas". */
function porcentaje(valor: number): string {
  return `${Math.round(valor)}%`;
}

function valorTarjeta(valor: number | null, formatear: (v: number) => string): string {
  return valor === null ? '—' : formatear(valor);
}

/**
 * The ONE aggregate fetch + card grid. Async Server Component: the
 * Suspense boundary above it is what makes the fetch streamable.
 * NULL metrics render '—' (sin dato) — never 0, the domain's contract.
 */
export async function TarjetasCalidad() {
  const { calidad } = await getCrmDb();
  if (!calidad) throw new Error('CRM no configurado');

  // new Date() (no Date.now()): el reloj solo se lee UNA vez por request
  // en este Server Component — la purity rule de react-hooks lo exige y
  // el productividad page usa el mismo idiom (periodoPorDefecto(new Date())).
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - DIAS_VENTANA_CALIDAD * 24 * 60 * 60 * 1000);
  const resumen: ResumenCalidad = await calidad.obtenerResumen(desde);

  const tarjetas: TarjetaCalidad[] = [
    {
      etiqueta: 'Respuestas de la Guía',
      valor: entero(resumen.respuestasIa),
      subtitulo: 'Generadas con score registrado',
    },
    {
      etiqueta: 'Score promedio',
      valor: valorTarjeta(resumen.scorePromedio, decimal2),
      subtitulo: 'Confianza RAG (0–1)',
    },
    {
      etiqueta: 'Fidelidad promedio',
      valor: valorTarjeta(resumen.fidelidadPromedio, decimal2),
      subtitulo: 'Autoevaluada (0–1)',
    },
    {
      etiqueta: '% con fuentes',
      valor: valorTarjeta(resumen.porcentajeConFuentes, porcentaje),
      subtitulo: 'Respuestas que citan fuentes',
    },
    {
      etiqueta: 'Marcadas deficiente',
      valor: entero(resumen.marcadasDeficiente),
      subtitulo: 'Por operadores',
    },
    {
      etiqueta: 'Solicitudes de ayuda',
      valor: entero(resumen.solicitudesAyuda),
      subtitulo: 'Escaladas a un humano',
    },
    {
      etiqueta: 'Huecos abiertos',
      valor: entero(resumen.huecosAbiertos),
      subtitulo: 'Total acumulado, sin ventana',
    },
    {
      etiqueta: 'Intervenciones humanas',
      valor: entero(resumen.intervencionesHumanas),
      subtitulo: 'Mensajes de operadores',
    },
  ];

  return (
    <section aria-label="Métricas de calidad" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tarjetas.map((tarjeta) => (
          <div
            key={tarjeta.etiqueta}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">{tarjeta.etiqueta}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
              {tarjeta.valor}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{tarjeta.subtitulo}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Ventana analizada: últimos {DIAS_VENTANA_CALIDAD} días. «—» significa sin dato para el
        período.
      </p>
    </section>
  );
}
