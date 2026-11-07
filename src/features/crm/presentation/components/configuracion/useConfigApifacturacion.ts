'use client';

import { useCallback, useEffect, useState } from 'react';

import type { VistaSecreto } from './CampoSecreto';

/**
 * useConfigApifacturacion (crm-consulta-sunat T2): all browser/server
 * interaction of /admin/crm/configuracion — load the state on mount and
 * after every change (`recargaKey` bump, useAlertasDia pattern), save
 * the URL, replace/remove the token, run the paid probe. The panel
 * stays presentation-only (no raw fetch in components).
 */

export interface VistaApifacturacionUi {
  configurado: boolean;
  tokenMascarado: string | null;
  url: string;
  fuente: 'db' | 'env' | 'ninguna';
}

export interface ResultadoPruebaUi {
  ok: boolean;
  mensaje: string;
}

const RUTA = '/api/crm/configuracion/apifacturacion';

function esVista(v: unknown): v is VistaApifacturacionUi {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as VistaApifacturacionUi).configurado === 'boolean' &&
    typeof (v as VistaApifacturacionUi).url === 'string' &&
    ((v as VistaApifacturacionUi).tokenMascarado === null ||
      typeof (v as VistaApifacturacionUi).tokenMascarado === 'string') &&
    ['db', 'env', 'ninguna'].includes((v as VistaApifacturacionUi).fuente)
  );
}

async function leerError(res: Response, alternativa: string): Promise<string> {
  try {
    const cuerpo: unknown = await res.json();
    const error =
      typeof cuerpo === 'object' && cuerpo !== null && 'error' in cuerpo
        ? (cuerpo as { error?: unknown }).error
        : undefined;
    return typeof error === 'string' && error !== '' ? error : alternativa;
  } catch {
    return alternativa;
  }
}

export function useConfigApifacturacion() {
  const [vista, setVista] = useState<VistaApifacturacionUi | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [urlBorrador, setUrlBorrador] = useState('');
  const [recargaKey, setRecargaKey] = useState(0);
  const [guardandoUrl, setGuardandoUrl] = useState(false);
  const [avisoUrl, setAvisoUrl] = useState<string | null>(null);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const [guardandoToken, setGuardandoToken] = useState(false);
  const [errorToken, setErrorToken] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<ResultadoPruebaUi | null>(null);
  const [errorPrueba, setErrorPrueba] = useState<string | null>(null);

  useEffect(() => {
    let viva = true;
    (async (): Promise<void> => {
      try {
        const res = await fetch(RUTA, { cache: 'no-store' });
        const cuerpo: unknown = await res.json();
        const configuracion =
          typeof cuerpo === 'object' && cuerpo !== null && 'configuracion' in cuerpo
            ? (cuerpo as { configuracion?: unknown }).configuracion
            : undefined;
        if (!res.ok || !esVista(configuracion)) {
          throw new Error(await leerError(res, 'No se pudo leer la configuración'));
        }
        if (viva && configuracion) {
          setVista(configuracion);
          setUrlBorrador(configuracion.url);
          setErrorCarga(null);
          setCargando(false);
        }
      } catch (error) {
        if (viva) {
          setErrorCarga(error instanceof Error ? error.message : 'No se pudo leer la configuración');
          setCargando(false);
        }
      }
    })();
    return () => {
      viva = false;
    };
  }, [recargaKey]);

  const guardarUrl = useCallback(async (): Promise<void> => {
    setGuardandoUrl(true);
    setAvisoUrl(null);
    setErrorUrl(null);
    try {
      const res = await fetch(RUTA, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlBorrador.trim() }),
      });
      if (!res.ok) throw new Error(await leerError(res, 'No se pudo guardar la configuración'));
      setAvisoUrl('Configuración guardada');
      setRecargaKey((k) => k + 1);
    } catch (error) {
      setErrorUrl(error instanceof Error ? error.message : 'No se pudo guardar la configuración');
    } finally {
      setGuardandoUrl(false);
    }
  }, [urlBorrador]);

  /** string = replace, null = remove. Resolves true on success. */
  const guardarToken = useCallback(async (valor: string | null): Promise<boolean> => {
    setGuardandoToken(true);
    setErrorToken(null);
    try {
      const res = await fetch(RUTA, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: valor }),
      });
      if (!res.ok) throw new Error(await leerError(res, 'No se pudo guardar el token'));
      setRecargaKey((k) => k + 1);
      return true;
    } catch (error) {
      setErrorToken(error instanceof Error ? error.message : 'No se pudo guardar el token');
      return false;
    } finally {
      setGuardandoToken(false);
    }
  }, []);

  const probar = useCallback(async (): Promise<void> => {
    setProbando(true);
    setErrorPrueba(null);
    try {
      const res = await fetch(`${RUTA}/probar`, { method: 'POST' });
      const cuerpo: unknown = await res.json();
      const ok =
        typeof cuerpo === 'object' && cuerpo !== null && 'ok' in cuerpo
          ? (cuerpo as { ok?: unknown }).ok === true
          : false;
      const mensaje =
        typeof cuerpo === 'object' && cuerpo !== null && 'mensaje' in cuerpo
          ? (cuerpo as { mensaje?: unknown }).mensaje
          : undefined;
      if (!res.ok) throw new Error(await leerError(res, 'No se pudo probar la conexión'));
      setPrueba({ ok, mensaje: typeof mensaje === 'string' ? mensaje : '' });
    } catch (error) {
      setErrorPrueba(error instanceof Error ? error.message : 'No se pudo probar la conexión');
    } finally {
      setProbando(false);
    }
  }, []);

  const vistaSecreto: VistaSecreto = {
    configurado: vista?.configurado ?? false,
    mascara: vista?.tokenMascarado ?? '',
  };

  return {
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
  };
}
