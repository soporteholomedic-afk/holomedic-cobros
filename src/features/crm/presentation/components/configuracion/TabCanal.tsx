'use client';

import { useState, type FormEvent } from 'react';

import type { CambiosConfigCanalUi, ModoKapsoUi, UseConfigCanalResult } from '../../hooks/useConfigCanal';
import { AvisoClaveNoConfigurada } from './AvisoClaveNoConfigurada';
import { BotonCopiar } from './BotonCopiar';
import { BotonProbar } from './BotonProbar';
import { CampoFormulario } from './CampoFormulario';
import { CampoSecreto } from './CampoSecreto';
import { EstadoGuardado } from './EstadoGuardado';
import {
  CLASES_AVISO_ADVERTENCIA,
  CLASES_BOTON_PELIGRO,
  CLASES_BOTON_PRIMARIO,
  CLASES_BOTON_SECUNDARIO,
  CLASES_ETIQUETA,
  CLASES_INPUT,
  CLASES_TARJETA,
} from './estilos';
import { useBorradorConfig } from './useBorradorConfig';
import { errorPhoneNumberId, errorTimeoutMs, parseNumero } from './validaciones';

/**
 * TabCanal (agente-ia-crm E5·T6) — Kapso channel config. Secrets never
 * show a value (CampoSecreto); the regenerated webhook secret is shown
 * ONCE from the hook (read-only, copyable, with a warning) and
 * discarded on dismiss. Also displays the webhook URL to register in
 * Kapso and the connection probe.
 */

type CampoCanal = 'modo' | 'phoneNumberId' | 'timeoutMs';

const CAMPOS: readonly CampoCanal[] = ['modo', 'phoneNumberId', 'timeoutMs'];
const CAMPOS_SECRETOS = ['apiKey', 'webhookSecret'] as const;
const RUTA_WEBHOOK = '/api/webhooks/kapso';

interface TabCanalProps {
  canal: UseConfigCanalResult;
}

export function TabCanal({ canal }: TabCanalProps) {
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
    regenerarWebhookSecret,
    webhookSecretGenerado,
    descartarWebhookSecret,
    probar,
    probando,
    resultadoProbe,
  } = canal;
  const [intentado, setIntentado] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [confirmandoRegenerar, setConfirmandoRegenerar] = useState(false);

  const base: Record<CampoCanal, string> = {
    modo: config?.modo ?? '',
    phoneNumberId: config?.phoneNumberId ?? '',
    timeoutMs: String(config?.timeoutMs ?? ''),
  };
  const borrador = useBorradorConfig(base, CAMPOS);

  if (status === 'loading') {
    return <p className="text-sm text-slate-600 dark:text-slate-400">Cargando configuración del canal…</p>;
  }
  if (status === 'error' || !config || !fuentes) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200"
      >
        {error ?? 'No se pudo cargar la configuración del canal.'}
      </p>
    );
  }

  const urlWebhook = `${window.location.origin}${RUTA_WEBHOOK}`;

  const erroresCliente: Partial<Record<CampoCanal, string>> = {};
  if (intentado) {
    if (borrador.sucios.includes('phoneNumberId')) {
      const mensaje = errorPhoneNumberId(borrador.valor('phoneNumberId'));
      if (mensaje) erroresCliente.phoneNumberId = mensaje;
    }
    if (borrador.sucios.includes('timeoutMs')) {
      const mensaje = errorTimeoutMs(borrador.valor('timeoutMs'));
      if (mensaje) erroresCliente.timeoutMs = mensaje;
    }
  }

  function errorDe(campo: CampoCanal): string | null {
    if (erroresCliente[campo]) return erroresCliente[campo] ?? null;
    return errorGuardado?.campo === campo ? errorGuardado.mensaje : null;
  }

  function errorSecreto(campo: (typeof CAMPOS_SECRETOS)[number]): string | null {
    return errorGuardado?.campo === campo ? errorGuardado.mensaje : null;
  }

  const camposConocidos: readonly string[] = [...CAMPOS, ...CAMPOS_SECRETOS];
  const errorGeneral =
    errorGuardado && (errorGuardado.campo === null || !camposConocidos.includes(errorGuardado.campo))
      ? errorGuardado
      : null;

  function alCambiar(campo: CampoCanal, valor: string): void {
    borrador.cambiar(campo, valor);
    setGuardado(false);
    if (errorGuardado) limpiarErrorGuardado();
  }

  async function alEnviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setIntentado(true);
    setGuardado(false);
    const cambios: CambiosConfigCanalUi = {};
    for (const campo of borrador.sucios) {
      if (campo === 'modo') {
        const modo = borrador.valor('modo');
        if (modo === 'real' || modo === 'simulado') cambios.modo = modo as ModoKapsoUi;
      } else if (campo === 'phoneNumberId') {
        if (errorPhoneNumberId(borrador.valor('phoneNumberId'))) return;
        cambios.phoneNumberId = borrador.valor('phoneNumberId').trim();
      } else {
        if (errorTimeoutMs(borrador.valor('timeoutMs'))) return;
        cambios.timeoutMs = parseNumero(borrador.valor('timeoutMs'));
      }
    }
    if (Object.keys(cambios).length === 0) return;
    const ok = await guardar(cambios);
    if (ok) {
      borrador.reiniciar();
      setIntentado(false);
      setGuardado(true);
    }
  }

  async function guardarSecreto(campo: (typeof CAMPOS_SECRETOS)[number], valor: string | null): Promise<boolean> {
    setGuardado(false);
    return guardar({ [campo]: valor });
  }

  async function confirmarRegenerar(): Promise<void> {
    await regenerarWebhookSecret();
    setConfirmandoRegenerar(false);
  }

  const opcionesModo = [
    ...(config.modo === null ? [{ valor: '', etiqueta: 'Sin definir (según el entorno)' }] : []),
    { valor: 'real', etiqueta: 'Real (envía mensajes por WhatsApp)' },
    { valor: 'simulado', etiqueta: 'Simulado (no envía nada)' },
  ];

  return (
    <div className="space-y-6">
      {claveNoConfigurada && <AvisoClaveNoConfigurada />}

      <form onSubmit={(evento) => void alEnviar(evento)} noValidate className={`${CLASES_TARJETA} space-y-5`}>
        <div className="grid gap-5 sm:grid-cols-2">
          <CampoFormulario
            etiqueta="Modo"
            tipo="select"
            opciones={opcionesModo}
            valor={borrador.valor('modo')}
            onCambio={(valor) => alCambiar('modo', valor)}
            fuente={fuentes.modo}
            error={errorDe('modo')}
          />
          <CampoFormulario
            etiqueta="Phone number ID"
            valor={borrador.valor('phoneNumberId')}
            onCambio={(valor) => alCambiar('phoneNumberId', valor)}
            fuente={fuentes.phoneNumberId}
            error={errorDe('phoneNumberId')}
            ayuda="Identificador numérico del número de WhatsApp en Kapso."
          />
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

      <section aria-labelledby="canal-secretos" className={`${CLASES_TARJETA} space-y-5`}>
        <h3 id="canal-secretos" className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Credenciales
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Los secretos se guardan cifrados y nunca se muestran: solo puedes reemplazarlos o quitarlos.
        </p>
        <CampoSecreto
          id="canal-apiKey"
          etiqueta="API key"
          vista={config.apiKey}
          bloqueado={claveNoConfigurada}
          guardando={guardando}
          error={errorSecreto('apiKey')}
          onGuardar={(valor) => guardarSecreto('apiKey', valor)}
        />
        <CampoSecreto
          id="canal-webhookSecret"
          etiqueta="Secret del webhook"
          vista={config.webhookSecret}
          bloqueado={claveNoConfigurada}
          guardando={guardando}
          error={errorSecreto('webhookSecret')}
          onGuardar={(valor) => guardarSecreto('webhookSecret', valor)}
        />

        <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
          {!confirmandoRegenerar && (
            <button
              type="button"
              className={CLASES_BOTON_SECUNDARIO}
              disabled={claveNoConfigurada || guardando}
              onClick={() => setConfirmandoRegenerar(true)}
            >
              Regenerar secret del webhook
            </button>
          )}
          {confirmandoRegenerar && (
            <div
              role="group"
              aria-label="Confirmar regenerar secret del webhook"
              className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3"
            >
              <p className="text-sm text-amber-900 dark:text-amber-100">
                El secret actual dejará de ser válido: tendrás que registrar el nuevo en Kapso o los mensajes entrantes se
                rechazarán.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={CLASES_BOTON_PELIGRO}
                  disabled={guardando}
                  onClick={() => void confirmarRegenerar()}
                >
                  Sí, regenerar
                </button>
                <button type="button" className={CLASES_BOTON_SECUNDARIO} onClick={() => setConfirmandoRegenerar(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {webhookSecretGenerado !== null && (
            <div role="group" aria-label="Nuevo secret del webhook" className={`${CLASES_AVISO_ADVERTENCIA} space-y-2`}>
              <p className="font-semibold">Copia este secret ahora: no se volverá a mostrar.</p>
              <label htmlFor="canal-secret-generado" className="sr-only">
                Secret generado del webhook
              </label>
              <input
                id="canal-secret-generado"
                readOnly
                value={webhookSecretGenerado}
                onFocus={(evento) => evento.currentTarget.select()}
                className={`${CLASES_INPUT} font-mono`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <BotonCopiar valor={webhookSecretGenerado} etiqueta="Copiar secret generado" />
                <button type="button" className={CLASES_BOTON_SECUNDARIO} onClick={descartarWebhookSecret}>
                  Ya lo copié
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="canal-webhook" className={`${CLASES_TARJETA} space-y-3`}>
        <h3 id="canal-webhook" className="text-base font-semibold text-slate-900 dark:text-slate-100">
          URL del webhook
        </h3>
        <div className="space-y-1.5">
          <label htmlFor="canal-url-webhook" className={CLASES_ETIQUETA}>
            Registra esta URL en Kapso
          </label>
          <input id="canal-url-webhook" readOnly value={urlWebhook} className={`${CLASES_INPUT} font-mono`} />
        </div>
        <BotonCopiar valor={urlWebhook} etiqueta="Copiar URL del webhook" />
      </section>

      <section aria-labelledby="canal-probar" className={`${CLASES_TARJETA} space-y-3`}>
        <h3 id="canal-probar" className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Conexión
        </h3>
        <BotonProbar probando={probando} resultado={resultadoProbe} onProbar={() => void probar()} />
      </section>
    </div>
  );
}
