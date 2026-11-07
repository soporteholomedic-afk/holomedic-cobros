'use client';

import { useId } from 'react';

import { CampoSecreto } from './CampoSecreto';
import {
  CLASES_AYUDA,
  CLASES_AVISO_ADVERTENCIA,
  CLASES_AVISO_ERROR,
  CLASES_AVISO_OK,
  CLASES_BOTON_PRIMARIO,
  CLASES_ERROR_CAMPO,
  CLASES_ETIQUETA,
  CLASES_INPUT,
  CLASES_TARJETA,
} from './estilos';
import { useConfigApifacturacion } from './useConfigApifacturacion';

/**
 * PanelApifacturacion (crm-consulta-sunat T2, specs S2/S5): administers
 * the apifacturacion.com (SUNAT) credentials — since T8 inside the
 * /configuracion view as the LAST tab (/configuracion/consulta-sunat).
 * The token is masked (CampoSecreto, never rendered in clear), the URL
 * is a plain field with a default, and "Probar conexión" runs ONE real
 * lookup — a paid query, so the panel says so up front. All server
 * interaction lives in useConfigApifacturacion.
 */

function insigniaEstado(configurado: boolean): { texto: string; clase: string } {
  return configurado
    ? {
        texto: 'Configurado',
        clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
      }
    : {
        texto: 'Sin configurar',
        clase: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
      };
}

function fuenteLegible(fuente: 'db' | 'env' | 'ninguna'): string {
  if (fuente === 'db') return 'db (guardado en la base de datos)';
  if (fuente === 'env') return 'env (variable APIFACTURACION_TOKEN)';
  return 'ninguna';
}

export function PanelApifacturacion() {
  const {
    vista,
    vistaSecreto,
    cargando,
    errorCarga,
    urlBorrador,
    setUrlBorrador,
    guardandoUrl,
    avisoUrl,
    errorUrl,
    guardarUrl,
    guardandoToken,
    errorToken,
    guardarToken,
    probando,
    prueba,
    errorPrueba,
    probar,
  } = useConfigApifacturacion();
  const idUrl = useId();
  const insignia = insigniaEstado(vista?.configurado ?? false);
  const ocupado = guardandoUrl || guardandoToken;

  return (
    <section className={CLASES_TARJETA} aria-labelledby="titulo-apifacturacion">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="titulo-apifacturacion" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          API apifacturacion (SUNAT)
        </h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${insignia.clase}`}>
          {insignia.texto}
        </span>
      </div>
      <p className={`mt-1 ${CLASES_AYUDA}`}>
        Token y URL para consultar datos de empresas (RUC) vía apifacturacion.com. El token se
        guarda cifrado en la base de datos; como respaldo se usa la variable de entorno
        APIFACTURACION_TOKEN.
        {vista !== null && ` Fuente del token: ${fuenteLegible(vista.fuente)}.`}
      </p>

      {errorCarga !== null && (
        <p role="alert" className={`mt-3 ${CLASES_AVISO_ERROR}`}>
          {errorCarga}
        </p>
      )}

      <div className="mt-4 space-y-6">
        <div className="space-y-2">
          <label htmlFor={idUrl} className={CLASES_ETIQUETA}>
            URL de la API
          </label>
          <input
            id={idUrl}
            type="text"
            inputMode="url"
            value={urlBorrador}
            onChange={(evento) => setUrlBorrador(evento.target.value)}
            aria-invalid={errorUrl ? true : undefined}
            disabled={cargando || ocupado}
            className={CLASES_INPUT}
            placeholder="https://api.apifacturacion.com"
          />
          <p className={CLASES_AYUDA}>Por defecto: https://api.apifacturacion.com</p>
          {errorUrl !== null && (
            <p role="alert" className={CLASES_ERROR_CAMPO}>
              {errorUrl}
            </p>
          )}
          {avisoUrl !== null && (
            <p className={CLASES_AVISO_OK}>{avisoUrl}</p>
          )}
          <button
            type="button"
            className={CLASES_BOTON_PRIMARIO}
            disabled={cargando || ocupado}
            onClick={() => void guardarUrl()}
          >
            Guardar
          </button>
        </div>

        <CampoSecreto
          id="campo-token-apifacturacion"
          etiqueta="Token de apifacturacion"
          vista={vistaSecreto}
          guardando={guardandoToken}
          error={errorToken}
          onGuardar={guardarToken}
        />

        <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className={CLASES_ETIQUETA}>Probar conexión</p>
          <p className={CLASES_AVISO_ADVERTENCIA}>
            Probar conexión ejecuta UNA consulta real contra apifacturacion y consume una consulta
            del servicio (de pago).
          </p>
          {errorPrueba !== null && (
            <p role="alert" className={CLASES_AVISO_ERROR}>
              {errorPrueba}
            </p>
          )}
          {prueba !== null && (
            <p className={prueba.ok ? CLASES_AVISO_OK : CLASES_AVISO_ERROR} role="status">
              {prueba.mensaje}
            </p>
          )}
          <button
            type="button"
            className={CLASES_BOTON_PRIMARIO}
            disabled={cargando || ocupado || probando || vistaSecreto.configurado === false}
            onClick={() => void probar()}
          >
            Probar conexión
          </button>
        </div>
      </div>
    </section>
  );
}
