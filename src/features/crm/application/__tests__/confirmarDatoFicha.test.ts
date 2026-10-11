import { describe, expect, it } from 'vitest';

import type { ConfirmarDatoFichaEntrada } from '../confirmarDatoFicha';
import { ConfirmarDatoFichaUseCase } from '../confirmarDatoFicha';
import { ConversacionNoEncontradaError } from '../obtenerHiloConversacion';
import { ObtenerFichaConversacionUseCase } from '../obtenerFichaConversacion';
import type { ConversacionCrm, FichaConversacion } from '../../domain/entities';
import { ConflictError } from '../../domain/errors';
import {
  conversacionFicha,
  empresaFicha,
  FakeConversacionesFicha,
  FakeEmpresasFicha,
} from './fakesFicha';

/**
 * Use-case contract for confirmarDatoFicha (agente-ia-crm E3·T4 —
 * the operator confirm that promotes a ficha datum to canonical):
 * - valor trim 1..500; per-campo keying mirrors the motor (cargo →
 *   contacto, trabajadores/sedes → empresa); upsert HUMANO confirmado
 *   THEN promote (cargo → actualizarCargoContacto, trabajadores →
 *   actualizarCantidadTrabajadores parsed int, sedes → none); returns
 *   the refreshed ficha (obtenerFichaConversacion reuse).
 * - Typed errors: ConflictError (409) for a campo without its key,
 *   ValidationError (400) for unparseable trabajadores / bad valor,
 *   ConversacionNoEncontradaError (404) for a missing row.
 * - T1 pin at use-case level: after a HUMANO confirm, a later IA
 *   re-extraction never changes the datum (human-confirmed wins).
 */

function montar(
  sobres: { conversacion?: ConversacionCrm | null; contactoCargo?: string | null; cantidadTrabajadores?: number | null } = {},
) {
  const conversaciones = new FakeConversacionesFicha();
  if (sobres.conversacion !== null) {
    conversaciones.sembrar(sobres.conversacion ?? conversacionFicha());
  }
  conversaciones.sembrarContacto({
    contactoId: 42,
    empresaId: 7,
    nombreContacto: 'Ana Giménez',
    razonSocial: 'Constructora X S.A.',
    telefono: '+595981234567',
    cargo: sobres.contactoCargo ?? null,
  });
  const empresas = new FakeEmpresasFicha();
  empresas.filas.push(empresaFicha({ cantidadTrabajadores: sobres.cantidadTrabajadores ?? null }));
  const obtenerFicha = new ObtenerFichaConversacionUseCase({ conversaciones, empresas });
  const confirmar = new ConfirmarDatoFichaUseCase({ conversaciones, empresas, obtenerFicha });
  return { conversaciones, empresas, obtenerFicha, confirmar };
}

describe('ConfirmarDatoFichaUseCase (E3·T4)', () => {
  function entrada(sobres: Partial<ConfirmarDatoFichaEntrada> = {}): ConfirmarDatoFichaEntrada {
    return { conversacionId: 1, campo: 'cargo', valor: 'Jefe de Compras', usuario: 'op-1', ...sobres };
  }

  it('cargo → upsert HUMANO confirmado keyed por contacto + promoción actualizarCargoContacto; ficha refrescada', async () => {
    const { conversaciones, empresas, confirmar } = montar();

    const ficha = await confirmar.ejecutar(entrada({ valor: '  Jefe de Compras  ' }));

    expect(conversaciones.upserts).toEqual([
      { contactoId: 42, empresaId: null, campo: 'cargo', valor: 'Jefe de Compras', origen: 'HUMANO', confirmado: true },
    ]);
    expect(conversaciones.cargosActualizados).toEqual([{ contactoId: 42, cargo: 'Jefe de Compras' }]);
    expect(empresas.cantidadActualizada).toEqual([]);
    // La ficha refrescada refleja la promoción: canónico ya seteado.
    expect(ficha.datos.cargo).toEqual({ valor: 'Jefe de Compras', origen: 'canonico', confirmado: true });
    expect(ficha.contacto?.cargo).toBe('Jefe de Compras');
  });

  it('trabajadores → upsert keyed por empresa + promoción actualizarCantidadTrabajadores con INT', async () => {
    const { conversaciones, empresas, confirmar } = montar();

    const ficha = await confirmar.ejecutar(entrada({ campo: 'trabajadores', valor: '120' }));

    expect(conversaciones.upserts).toEqual([
      { contactoId: null, empresaId: 7, campo: 'trabajadores', valor: '120', origen: 'HUMANO', confirmado: true },
    ]);
    expect(empresas.cantidadActualizada).toEqual([{ empresaId: 7, cantidad: 120 }]);
    expect(conversaciones.cargosActualizados).toEqual([]);
    expect(ficha.datos.trabajadores).toEqual({ valor: '120', origen: 'canonico', confirmado: true });
  });

  it('sedes → SOLO upsert, sin promoción alguna (ficha-only por diseño)', async () => {
    const { conversaciones, empresas, confirmar } = montar();

    const ficha = await confirmar.ejecutar(entrada({ campo: 'sedes', valor: '3' }));

    expect(conversaciones.upserts).toEqual([
      { contactoId: null, empresaId: 7, campo: 'sedes', valor: '3', origen: 'HUMANO', confirmado: true },
    ]);
    expect(conversaciones.cargosActualizados).toEqual([]);
    expect(empresas.cantidadActualizada).toEqual([]);
    expect(ficha.datos.sedes).toEqual({ valor: '3', origen: 'HUMANO', confirmado: true });
  });

  it('validación de entrada: campo fuera del union / valor vacío / valor > 500 → ValidationError SIN upsert', async () => {
    const { conversaciones, confirmar } = montar();

    await expect(
      confirmar.ejecutar(entrada({ campo: 'patente' as ConfirmarDatoFichaEntrada['campo'], valor: 'x' })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(confirmar.ejecutar(entrada({ valor: '   ' }))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(confirmar.ejecutar(entrada({ valor: 'x'.repeat(501) }))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(conversaciones.upserts).toEqual([]);
  });

  it('trabajadores debe ser entero ≥ 1: "12.5" / "abc" / "0" → ValidationError sin upsert ni promoción', async () => {
    const { conversaciones, empresas, confirmar } = montar();

    for (const valor of ['12.5', 'abc', '0']) {
      await expect(
        confirmar.ejecutar(entrada({ campo: 'trabajadores', valor })),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect(conversaciones.upserts).toEqual([]);
    expect(empresas.cantidadActualizada).toEqual([]);
  });

  it('campo sin su llave → ConflictError tipado: cargo sin contacto; trabajadores sin empresa', async () => {
    const sinContacto = montar({ conversacion: conversacionFicha({ contactoId: null }) });
    await expect(
      sinContacto.confirmar.ejecutar(entrada({ campo: 'cargo' })),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(sinContacto.conversaciones.upserts).toEqual([]);

    const sinEmpresa = montar({ conversacion: conversacionFicha({ empresaId: null }) });
    await expect(
      sinEmpresa.confirmar.ejecutar(entrada({ campo: 'trabajadores', valor: '10' })),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(sinEmpresa.conversaciones.upserts).toEqual([]);
  });

  it('sedes con solo contacto (sin empresa) → PERMITIDA: keyed por el contacto, sin promoción', async () => {
    const { conversaciones, confirmar } = montar({ conversacion: conversacionFicha({ empresaId: null }) });

    const ficha = await confirmar.ejecutar(entrada({ campo: 'sedes', valor: '2' }));

    expect(conversaciones.upserts).toEqual([
      { contactoId: 42, empresaId: null, campo: 'sedes', valor: '2', origen: 'HUMANO', confirmado: true },
    ]);
    expect(ficha.datos.sedes).toEqual({ valor: '2', origen: 'HUMANO', confirmado: true });
  });

  it('sedes sin contacto NI empresa (desvinculada) → ConflictError', async () => {
    const { confirmar, conversaciones } = montar({
      conversacion: conversacionFicha({ empresaId: null, contactoId: null }),
    });

    await expect(confirmar.ejecutar(entrada({ campo: 'sedes', valor: '2' }))).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(conversaciones.upserts).toEqual([]);
  });

  it('conversación faltante → ConversacionNoEncontradaError', async () => {
    const { confirmar } = montar({ conversacion: null });

    await expect(confirmar.ejecutar(entrada())).rejects.toBeInstanceOf(ConversacionNoEncontradaError);
  });

  it('pin T1 a nivel use-case: tras confirmar HUMANO, la re-extracción IA NO cambia el dato', async () => {
    const { conversaciones, confirmar, obtenerFicha } = montar();

    await confirmar.ejecutar(entrada({ campo: 'trabajadores', valor: '120' }));
    // El motor re-extrae otro valor (upsert IA, motor keying).
    await conversaciones.upsertExtraccionFicha({
      contactoId: null,
      empresaId: 7,
      campo: 'trabajadores',
      valor: '200',
      origen: 'IA',
      confirmado: false,
    });

    const fila = conversaciones.extracciones.find((fila) => fila.campo === 'trabajadores');
    expect(fila).toMatchObject({ valor: '120', origen: 'HUMANO', confirmado: true });

    const ficha: FichaConversacion = await obtenerFicha.ejecutar(1);
    expect(ficha.datos.trabajadores?.valor).toBe('120');
  });

  it('capacidades de promoción ausentes → el confirm AÚN funciona (upsert hecho, promoción saltada)', async () => {
    const montaje = montar();
    (montaje.conversaciones as { actualizarCargoContacto?: unknown }).actualizarCargoContacto = undefined;
    (montaje.empresas as { actualizarCantidadTrabajadores?: unknown }).actualizarCantidadTrabajadores =
      undefined;

    const fichaCargo = await montaje.confirmar.ejecutar(entrada({ campo: 'cargo' }));
    expect(montaje.conversaciones.upserts).toHaveLength(1);
    // Sin promoción: el dato se muestra desde la fila HUMANO, no canónico.
    expect(fichaCargo.datos.cargo).toEqual({ valor: 'Jefe de Compras', origen: 'HUMANO', confirmado: true });

    const fichaTrabajadores = await montaje.confirmar.ejecutar(
      entrada({ campo: 'trabajadores', valor: '90' }),
    );
    expect(fichaTrabajadores.datos.trabajadores).toEqual({ valor: '90', origen: 'HUMANO', confirmado: true });
  });

  it('capacidad upsertExtraccionFicha ausente → error explícito (escritura sin repo E3·T1)', async () => {
    const montaje = montar();
    (montaje.conversaciones as { upsertExtraccionFicha?: unknown }).upsertExtraccionFicha = undefined;

    await expect(montaje.confirmar.ejecutar(entrada())).rejects.toThrow(/upsertExtraccionFicha/);
  });
});
