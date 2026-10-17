'use client';

import { useState, type FormEvent } from 'react';

import type { CambiosConfigMemoriaUi, UseConfigMemoriaResult } from '../../hooks/useConfigMemoria';
import { AvisoClaveNoConfigurada } from './AvisoClaveNoConfigurada';
import { BotonProbar } from './BotonProbar';
import { CampoFormulario } from './CampoFormulario';
import { CampoSecreto } from './CampoSecreto';
import { EstadoGuardado } from './EstadoGuardado';
import { CLASES_BOTON_PRIMARIO, CLASES_TARJETA } from './estilos';
import { useBorradorConfig } from './useBorradorConfig';
import { errorRetencionMeses, errorTimeoutMs, errorUrl, parseNumero } from './validaciones';

/**
 * TabMemoria (agente-ia-crm E5·T6) — Engram memory config: url, token
 * (secret UX of CampoSecreto), timeout and retention in months, plus
 * the connection probe.
 */

type CampoMemoria = 'url' | 'timeoutMs' | 'retencionMeses';

const CAMPOS: readonly CampoMemoria[] = ['url', 'timeoutMs', 'retencionMeses'];

const VALIDADORES: Record<CampoMemoria, (texto: string) => string | null> = {
  url: errorUrl,
  timeoutMs: errorTimeoutMs,
  retencionMeses: errorRetencionMeses,
};

interface TabMemoriaProps {
  memoria: UseConfigMemoriaResult;
}

export function TabMemoria({ memoria }: TabMemoriaProps) {
  const {
    config,
    fuentes,
    status,
    error,
    guardar,
    guardando,
    errorGuardado,
    limpiarErrorGuardado,
    claveNoConfigurada,
    probar,
    probando,
    resultadoProbe,
  } = memoria;
  const [intentado, setIntentado] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const base: Record<CampoMemoria, string> = {
    url: config?.url ?? '',
    timeoutMs: String(config?.timeoutMs ?? ''),
    retencionMeses: String(config?.retencionMeses ?? ''),
  };
  const borrador = useBorradorConfig(base, CAMPOS);

  if (status === 'loading') {
    return <p className="text-sm text-slate-600 dark:text-slate-400">Cargando configuración de memoria…</p>;
  }
  if (status === 'error' || !config || !fuentes) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200"
      >
        {error ?? 'No se pudo cargar la configuración de memoria.'}
      </p>
    );
  }

  const erroresCliente: Partial<Record<CampoMemoria, string>> = {};
  if (intentado) {
    for (const campo of borrador.sucios) {
      const mensaje = VALIDADORES[campo](borrador.valor(campo));
      if (mensaje) erroresCliente[campo] = mensaje;
    }
  }

  function errorDe(campo: CampoMemoria): string | null {
    if (erroresCliente[campo]) return erroresCliente[campo] ?? null;
    return errorGuardado?.campo === campo ? errorGuardado.mensaje : null;
  }

  const errorToken = errorGuardado?.campo === 'token' ? errorGuardado.mensaje : null;
  const errorGeneral =
    errorGuardado && errorGuardado.campo !== 'token' && !CAMPOS.includes(errorGuardado.campo as CampoMemoria)
      ? errorGuardado
      : null;

  function alCambiar(campo: CampoMemoria, valor: string): void {
    borrador.cambiar(campo, valor);
    setGuardado(false);
    if (errorGuardado) limpiarErrorGuardado();
  }

  async function alEnviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setIntentado(true);
    setGuardado(false);
    const cambios: CambiosConfigMemoriaUi = {};
    for (const campo of borrador.sucios) {
      if (VALIDADORES[campo](borrador.valor(campo))) return;
      if (campo === 'url') cambios.url = borrador.valor('url').trim();
      else cambios[campo] = parseNumero(borrador.valor(campo));
    }
    if (Object.keys(cambios).length === 0) return;
    const ok = await guardar(cambios);
    if (ok) {
      borrador.reiniciar();
      setIntentado(false);
      setGuardado(true);
    }
  }

  async function guardarToken(valor: string | null): Promise<boolean> {
    setGuardado(false);
    return guardar({ token: valor });
  }

  return (
    <div className="space-y-6">
      {claveNoConfigurada && <AvisoClaveNoConfigurada />}

      <form onSubmit={(evento) => void alEnviar(evento)} noValidate className={`${CLASES_TARJETA} space-y-5`}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <CampoFormulario
              etiqueta="URL de Engram"
              valor={borrador.valor('url')}
              onCambio={(valor) => alCambiar('url', valor)}
              fuente={fuentes.url}
              error={errorDe('url')}
              ayuda="Dirección http(s) del servicio de memoria, sin credenciales."
            />
          </div>
          <CampoFormulario
            etiqueta="Timeout (ms)"
            tipo="number"
            min={1000}
            max={60000}
            step={1}
            valor={borrador.valor('timeoutMs')}
            onCambio={(valor) => alCambiar('timeoutMs', valor)}
            fuente={fuentes.timeoutMs}
            error={errorDe('timeoutMs')}
            ayuda="Entre 1000 y 60000 ms."
          />
          <CampoFormulario
            etiqueta="Retención (meses)"
            tipo="number"
            min={1}
            max={120}
            step={1}
            valor={borrador.valor('retencionMeses')}
            onCambio={(valor) => alCambiar('retencionMeses', valor)}
            fuente={fuentes.retencionMeses}
            error={errorDe('retencionMeses')}
            ayuda="Entre 1 y 120 meses."
          />
        </div>
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

      <section aria-labelledby="memoria-token" className={`${CLASES_TARJETA} space-y-4`}>
        <h3 id="memoria-token" className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Credencial
        </h3>
        <CampoSecreto
          id="memoria-token-input"
          etiqueta="Token"
          vista={config.token}
          bloqueado={claveNoConfigurada}
          guardando={guardando}
          error={errorToken}
          onGuardar={guardarToken}
        />
      </section>

      <section aria-labelledby="memoria-probar" className={`${CLASES_TARJETA} space-y-3`}>
        <h3 id="memoria-probar" className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Conexión
        </h3>
        <BotonProbar probando={probando} resultado={resultadoProbe} onProbar={() => void probar()} />
      </section>
    </div>
  );
}
