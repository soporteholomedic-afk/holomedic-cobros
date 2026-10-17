import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EnviadorKapsoWhatsapp } from '../enviadorKapsoWhatsapp';
import { EnviadorSimuladoWhatsapp } from '../enviadorSimuladoWhatsapp';
import {
  __resetAvisosModoForTests,
  crearEnviadorWhatsapp,
  crearEnviadorWhatsappConfigurable,
  esModoSimulado,
  esModoSimuladoConfigurable,
} from '../crearEnviadorWhatsapp';
import type { EntradaConfigCrm } from '../../../domain/entities';

/**
 * Factory contract (agente-ia-crm E1, remediation R1-simulador-default-prod
 * + R4-default-simulado-silent): the SILENT default-to-simulator is gone.
 * Pinned matrix:
 * - KAPSO_MODO=real → Kapso adapter, esModoSimulado() false
 * - KAPSO_MODO=simulado (explicit) → simulator, ALSO in production
 *   (conscious opt-in, no warning)
 * - no KAPSO_MODO + development → simulator + console.warn ONCE per
 *   process ("seteá KAPSO_MODO=real al conectar Kapso")
 * - no KAPSO_MODO + production → FAIL CLOSED: an adapter that always
 *   returns KAPSO_NO_CONFIGURADO + console.error ONCE per process
 *   explaining how to configure; esModoSimulado() false (the UI hides
 *   the simulator — sending fails with a clear error, never a fake send)
 * Plus the R2-misleading-pii contract: the simulator's log line masks
 * the phone to its last 4 digits and NEVER logs the body.
 */

const ENVIO = { telefonoE164: '+595981234567', cuerpo: 'Mensaje con datos sensibles 123' };

beforeEach(() => {
  __resetAvisosModoForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('crearEnviadorWhatsapp — selección de adapter (E1)', () => {
  it('KAPSO_MODO=real → adapter Kapso, esModoSimulado() false, sin avisos', () => {
    vi.stubEnv('KAPSO_MODO', 'real');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('KAPSO_API_KEY', 'k');

    const enviador = crearEnviadorWhatsapp();

    expect(enviador).toBeInstanceOf(EnviadorKapsoWhatsapp);
    expect(esModoSimulado()).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('KAPSO_MODO=simulado explícito → simulador también en prod (opt-in), sin avisos', () => {
    vi.stubEnv('KAPSO_MODO', 'simulado');
    vi.stubEnv('NODE_ENV', 'production');

    const enviador = crearEnviadorWhatsapp();

    expect(enviador).toBeInstanceOf(EnviadorSimuladoWhatsapp);
    expect(esModoSimulado()).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('sin KAPSO_MODO en development → simulado + console.warn UNA vez por proceso', () => {
    vi.stubEnv('KAPSO_MODO', '');
    vi.stubEnv('NODE_ENV', 'development');

    const enviador = crearEnviadorWhatsapp();

    expect(enviador).toBeInstanceOf(EnviadorSimuladoWhatsapp);
    expect(esModoSimulado()).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/KAPSO_MODO=real/));
    expect(console.error).not.toHaveBeenCalled();

    // Una segunda construcción NO repite el aviso (spam-free).
    crearEnviadorWhatsapp();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('sin KAPSO_MODO en production → FAIL CLOSED: siempre KAPSO_NO_CONFIGURADO + console.error una vez', async () => {
    vi.stubEnv('KAPSO_MODO', '');
    vi.stubEnv('NODE_ENV', 'production');

    const enviador = crearEnviadorWhatsapp();

    expect(enviador).not.toBeInstanceOf(EnviadorSimuladoWhatsapp);
    expect(esModoSimulado()).toBe(false);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/KAPSO_MODO/));
    expect(console.warn).not.toHaveBeenCalled();

    const primera = await enviador.enviar(ENVIO);
    const segunda = await enviador.enviar(ENVIO);
    expect(primera).toMatchObject({ ok: false, error: 'KAPSO_NO_CONFIGURADO' });
    expect(segunda).toMatchObject({ ok: false, error: 'KAPSO_NO_CONFIGURADO' });

    // Una segunda construcción NO repite el error.
    crearEnviadorWhatsapp();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('el simulador loguea el teléfono enmascarado (últimos 4) y NUNCA el cuerpo', async () => {
    vi.stubEnv('KAPSO_MODO', 'simulado');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const resultado = await crearEnviadorWhatsapp().enviar(ENVIO);

    expect(resultado.ok).toBe(true);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const linea = String(logSpy.mock.calls[0]?.[0]);
    expect(linea).toContain('****4567');
    expect(linea).not.toContain('+595981234567');
    expect(linea).not.toContain('5959812345');
    expect(linea).not.toContain(ENVIO.cuerpo);
    expect(linea).toContain(`${ENVIO.cuerpo.length}`);
  });
});

function fila(clave: string, valor: string): EntradaConfigCrm {
  return { clave, valor, esSecreto: false, actualizadoPor: 'admin', actualizadoEn: new Date() };
}

function repoCon(filas: EntradaConfigCrm[]): { listar: () => Promise<EntradaConfigCrm[]> } {
  return { listar: async () => filas };
}

type NombreAdapter = 'kapso' | 'simulado' | 'failClosed';

async function nombreDeAdapter(enviador: Awaited<ReturnType<typeof crearEnviadorWhatsapp>>): Promise<NombreAdapter> {
  if (enviador instanceof EnviadorKapsoWhatsapp) return 'kapso';
  if (enviador instanceof EnviadorSimuladoWhatsapp) return 'simulado';
  return 'failClosed';
}

describe('crearEnviadorWhatsappConfigurable / esModoSimuladoConfigurable (E5·T5b)', () => {
  const modos: Array<string> = ['real', 'simulado', ''];
  const entornos: Array<string> = ['development', 'production'];

  for (const modo of modos) {
    for (const nodeEnv of entornos) {
      it(`mismo adapter que el de entorno: KAPSO_MODO='${modo}' NODE_ENV=${nodeEnv}`, async () => {
        vi.stubEnv('KAPSO_MODO', modo);
        vi.stubEnv('NODE_ENV', nodeEnv);
        const esperado = await nombreDeAdapter(crearEnviadorWhatsapp());
        const esperadoSimulado = esModoSimulado();

        // Same effective values coming from the DB, env cleared.
        vi.stubEnv('KAPSO_MODO', '');
        const filas = modo === '' ? [] : [fila('canal.kapso.modo', modo)];
        const deps = { config: repoCon(filas) };

        expect(await nombreDeAdapter(await crearEnviadorWhatsappConfigurable(deps))).toBe(esperado);
        expect(await esModoSimuladoConfigurable(deps)).toBe(esperadoSimulado);
      });
    }
  }

  it('sin config delega al comportamiento de entorno', async () => {
    vi.stubEnv('KAPSO_MODO', 'simulado');
    expect(await crearEnviadorWhatsappConfigurable({})).toBeInstanceOf(EnviadorSimuladoWhatsapp);
    expect(await esModoSimuladoConfigurable({})).toBe(true);
  });

  it('el valor de la DB gana sobre el entorno', async () => {
    vi.stubEnv('KAPSO_MODO', 'simulado');
    vi.stubEnv('NODE_ENV', 'production');
    const deps = { config: repoCon([fila('canal.kapso.modo', 'real')]) };

    expect(await crearEnviadorWhatsappConfigurable(deps)).toBeInstanceOf(EnviadorKapsoWhatsapp);
    expect(await esModoSimuladoConfigurable(deps)).toBe(false);
  });

  it('sin caché: un cambio de config entre llamadas se ve en la siguiente', async () => {
    vi.stubEnv('KAPSO_MODO', '');
    let filas: EntradaConfigCrm[] = [fila('canal.kapso.modo', 'simulado')];
    const deps = { config: { listar: async () => filas } };

    expect(await crearEnviadorWhatsappConfigurable(deps)).toBeInstanceOf(EnviadorSimuladoWhatsapp);
    filas = [fila('canal.kapso.modo', 'real')];
    expect(await crearEnviadorWhatsappConfigurable(deps)).toBeInstanceOf(EnviadorKapsoWhatsapp);
    expect(await esModoSimuladoConfigurable(deps)).toBe(false);
  });

  it('producción sin modo en ninguna fuente → fail closed con KAPSO_NO_CONFIGURADO', async () => {
    vi.stubEnv('KAPSO_MODO', '');
    vi.stubEnv('NODE_ENV', 'production');

    const enviador = await crearEnviadorWhatsappConfigurable({ config: repoCon([]) });

    expect(await enviador.enviar(ENVIO)).toMatchObject({ ok: false, error: 'KAPSO_NO_CONFIGURADO' });
    expect(await esModoSimuladoConfigurable({ config: repoCon([]) })).toBe(false);
  });
});
