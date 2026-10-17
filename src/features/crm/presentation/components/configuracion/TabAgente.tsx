'use client';

import { useState, type FormEvent } from 'react';

import type { UseConfigAgenteResult } from '../../hooks/useConfigAgente';
import { CampoFormulario } from './CampoFormulario';
import { EstadoGuardado } from './EstadoGuardado';
import { CLASES_BOTON_PRIMARIO, CLASES_TARJETA } from './estilos';
import { useBorradorConfig } from './useBorradorConfig';
import {
  errorHora,
  errorMaxIntercambios,
  errorTextoEscalado,
  errorUmbral,
  LARGO_MAXIMO_TEXTO_ESCALADO,
  parseNumero,
} from './validaciones';

/**
 * TabAgente (agente-ia-crm E5·T6) — guardrail form of the agent:
 * confidence threshold, max exchanges, answer window and escalation
 * text, each with its origin chip. Client validation mirrors the
 * server rules; the server's `campo` error is rendered next to its
 * field. The kill switch lives in the fixed bar, not here.
 */

type CampoAgente = 'umbralConfianza' | 'maxIntercambios' | 'horarioDesde' | 'horarioHasta' | 'textoEscalado';

const CAMPOS: readonly CampoAgente[] = [
  'umbralConfianza',
  'maxIntercambios',
  'horarioDesde',
  'horarioHasta',
  'textoEscalado',
];

const VALIDADORES: Record<CampoAgente, (texto: string) => string | null> = {
  umbralConfianza: errorUmbral,
  maxIntercambios: errorMaxIntercambios,
  horarioDesde: errorHora,
  horarioHasta: errorHora,
  textoEscalado: errorTextoEscalado,
};

interface TabAgenteProps {
  agente: UseConfigAgenteResult;
}

export function TabAgente({ agente }: TabAgenteProps) {
  const { config, fuentes, status, error, guardar, guardando, errorGuardado, limpiarErrorGuardado } = agente;
  const [intentado, setIntentado] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const base: Record<CampoAgente, string> = {
    umbralConfianza: String(config?.umbralConfianza ?? ''),
    maxIntercambios: String(config?.maxIntercambios ?? ''),
    horarioDesde: String(config?.horarioDesde ?? ''),
    horarioHasta: String(config?.horarioHasta ?? ''),
    textoEscalado: config?.textoEscalado ?? '',
  };
  const borrador = useBorradorConfig(base, CAMPOS);

  if (status === 'loading') {
    return <p className="text-sm text-slate-600 dark:text-slate-400">Cargando configuración del agente…</p>;
  }
  if (status === 'error' || !config || !fuentes) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200"
      >
        {error ?? 'No se pudo cargar la configuración del agente.'}
      </p>
    );
  }

  const erroresCliente: Partial<Record<CampoAgente, string>> = {};
  if (intentado) {
    for (const campo of borrador.sucios) {
      const mensaje = VALIDADORES[campo](borrador.valor(campo));
      if (mensaje) erroresCliente[campo] = mensaje;
    }
  }

  function errorDe(campo: CampoAgente): string | null {
    if (erroresCliente[campo]) return erroresCliente[campo] ?? null;
    return errorGuardado?.campo === campo ? errorGuardado.mensaje : null;
  }

  const errorGeneral =
    errorGuardado && !CAMPOS.includes(errorGuardado.campo as CampoAgente) ? errorGuardado : null;

  function alCambiar(campo: CampoAgente, valor: string): void {
    borrador.cambiar(campo, valor);
    setGuardado(false);
    if (errorGuardado) limpiarErrorGuardado();
  }

  async function alEnviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setIntentado(true);
    setGuardado(false);
    const cambios: Record<string, number | string> = {};
    for (const campo of borrador.sucios) {
      if (VALIDADORES[campo](borrador.valor(campo))) return;
      cambios[campo] = campo === 'textoEscalado' ? borrador.valor(campo).trim() : parseNumero(borrador.valor(campo));
    }
    if (Object.keys(cambios).length === 0) return;
    const ok = await guardar(cambios);
    if (ok) {
      borrador.reiniciar();
      setIntentado(false);
      setGuardado(true);
    }
  }

  return (
    <form onSubmit={(evento) => void alEnviar(evento)} noValidate className={`${CLASES_TARJETA} space-y-5`}>
      <div className="grid gap-5 sm:grid-cols-2">
        <CampoFormulario
          etiqueta="Umbral de confianza"
          tipo="number"
          min={0}
          max={1}
          step="any"
          valor={borrador.valor('umbralConfianza')}
          onCambio={(valor) => alCambiar('umbralConfianza', valor)}
          fuente={fuentes.umbralConfianza}
          error={errorDe('umbralConfianza')}
          ayuda="Entre 0 y 1: confianza mínima para que el agente responda."
        />
        <CampoFormulario
          etiqueta="Máximo de intercambios"
          tipo="number"
          min={1}
          step={1}
          valor={borrador.valor('maxIntercambios')}
          onCambio={(valor) => alCambiar('maxIntercambios', valor)}
          fuente={fuentes.maxIntercambios}
          error={errorDe('maxIntercambios')}
          ayuda="Respuestas del agente por conversación antes de escalar a una persona."
        />
        <CampoFormulario
          etiqueta="Horario desde (hora)"
          tipo="number"
          min={0}
          max={23}
          step={1}
          valor={borrador.valor('horarioDesde')}
          onCambio={(valor) => alCambiar('horarioDesde', valor)}
          fuente={fuentes.horarioDesde}
          error={errorDe('horarioDesde')}
          ayuda="Hora local (0-23) en que abre la ventana de respuesta."
        />
        <CampoFormulario
          etiqueta="Horario hasta (hora)"
          tipo="number"
          min={0}
          max={23}
          step={1}
          valor={borrador.valor('horarioHasta')}
          onCambio={(valor) => alCambiar('horarioHasta', valor)}
          fuente={fuentes.horarioHasta}
          error={errorDe('horarioHasta')}
          ayuda="Hora local (0-23) en que cierra. Si es menor que «desde», la ventana cruza la medianoche."
        />
      </div>
      <CampoFormulario
        etiqueta="Texto de escalado"
        tipo="textarea"
        maxLength={LARGO_MAXIMO_TEXTO_ESCALADO}
        valor={borrador.valor('textoEscalado')}
        onCambio={(valor) => alCambiar('textoEscalado', valor)}
        fuente={fuentes.textoEscalado}
        error={errorDe('textoEscalado')}
        ayuda="Mensaje que recibe el cliente cuando el agente deriva la conversación."
      />

      <div className="flex flex-wrap items-start gap-4">
        <button
          type="submit"
          className={CLASES_BOTON_PRIMARIO}
          disabled={guardando || borrador.sucios.length === 0}
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <EstadoGuardado exito={guardado} errorGeneral={errorGeneral} />
      </div>
    </form>
  );
}
