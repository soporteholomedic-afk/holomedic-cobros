import { describe, expect, it } from 'vitest';

import type { ConversacionCrm } from '../../domain/entities';
import { ConversacionNoEncontradaError } from '../obtenerHiloConversacion';
import { ObtenerFichaConversacionUseCase } from '../obtenerFichaConversacion';
import {
  conversacionFicha,
  empresaFicha,
  FakeConversacionesFicha,
  FakeEmpresasFicha,
} from './fakesFicha';

/**
 * Use-case contract for the ficha viva (agente-ia-crm E3·T4):
 * - OBTENER: merged view — the canonical column wins for cargo /
 *   trabajadores when set (origen 'canonico'), otherwise the LATEST
 *   extraction (max id per campo) over listarExtraccionesFicha
 *   (contactoId OR empresaId columns); sedes is ALWAYS extraction-only
 *   (ficha-only by locked design). Missing conversación → typed 404.
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
  return { conversaciones, empresas, obtenerFicha };
}

const DATO_VACIO = { valor: null, origen: 'IA', confirmado: false };

describe('ObtenerFichaConversacionUseCase (E3·T4)', () => {
  it('conversación faltante → ConversacionNoEncontradaError (404 tipado)', async () => {
    const { obtenerFicha } = montar({ conversacion: null });

    await expect(obtenerFicha.ejecutar(99)).rejects.toBeInstanceOf(ConversacionNoEncontradaError);
  });

  it('canónico gana para cargo/trabajadores; sedes SIEMPRE de extracciones', async () => {
    const { conversaciones, obtenerFicha } = montar({
      contactoCargo: 'Gerente de Compras',
      cantidadTrabajadores: 80,
    });
    conversaciones.sembrarExtraccion({ contactoId: 42, empresaId: null, campo: 'cargo', valor: 'Jefe' });
    conversaciones.sembrarExtraccion({ contactoId: null, empresaId: 7, campo: 'trabajadores', valor: '50' });
    conversaciones.sembrarExtraccion({ contactoId: null, empresaId: 7, campo: 'sedes', valor: '3' });

    const ficha = await obtenerFicha.ejecutar(1);

    expect(ficha.conversacionId).toBe(1);
    expect(ficha.contacto).toEqual({
      id: 42,
      nombre: 'Ana Giménez',
      telefono: '+595981234567',
      cargo: 'Gerente de Compras',
    });
    expect(ficha.empresa).toEqual({
      id: 7,
      razonSocial: 'Constructora X S.A.',
      cantidadTrabajadores: 80,
    });
    expect(ficha.datos.cargo).toEqual({ valor: 'Gerente de Compras', origen: 'canonico', confirmado: true });
    expect(ficha.datos.trabajadores).toEqual({ valor: '80', origen: 'canonico', confirmado: true });
    expect(ficha.datos.sedes).toEqual({ valor: '3', origen: 'IA', confirmado: false });
  });

  it('sin canónico → la ÚLTIMA extracción por campo gana (id máximo)', async () => {
    const { conversaciones, obtenerFicha } = montar();
    conversaciones.sembrarExtraccion({ contactoId: 42, empresaId: null, campo: 'cargo', valor: 'Jefe' });
    conversaciones.sembrarExtraccion({ contactoId: 42, empresaId: null, campo: 'cargo', valor: 'Encargado' });
    conversaciones.sembrarExtraccion({ contactoId: null, empresaId: 7, campo: 'trabajadores', valor: '50', origen: 'HUMANO', confirmado: true });

    const ficha = await obtenerFicha.ejecutar(1);

    expect(ficha.contacto?.cargo).toBeNull();
    expect(ficha.datos.cargo).toEqual({ valor: 'Encargado', origen: 'IA', confirmado: false });
    expect(ficha.datos.trabajadores).toEqual({ valor: '50', origen: 'HUMANO', confirmado: true });
  });

  it('listar consulta por contactoId O empresaId (unión por columna)', async () => {
    const { conversaciones, obtenerFicha } = montar();
    conversaciones.sembrarExtraccion({ contactoId: 42, empresaId: null, campo: 'cargo', valor: 'Jefe' });
    conversaciones.sembrarExtraccion({ contactoId: null, empresaId: 7, campo: 'sedes', valor: '2' });
    const listarSpy = conversaciones.listarExtraccionesFicha;
    conversaciones.listarExtraccionesFicha = async (contactoId, empresaId) => {
      expect([contactoId, empresaId]).toEqual([42, 7]);
      return listarSpy.call(conversaciones, contactoId, empresaId);
    };

    const ficha = await obtenerFicha.ejecutar(1);

    expect(ficha.datos.cargo?.valor).toBe('Jefe');
    expect(ficha.datos.sedes?.valor).toBe('2');
  });

  it('desvinculada (sin contacto ni empresa) → nulls y datos vacíos', async () => {
    const { obtenerFicha } = montar({ conversacion: conversacionFicha({ empresaId: null, contactoId: null }) });

    const ficha = await obtenerFicha.ejecutar(1);

    expect(ficha.contacto).toBeNull();
    expect(ficha.empresa).toBeNull();
    expect(ficha.datos).toEqual({
      cargo: DATO_VACIO,
      trabajadores: DATO_VACIO,
      sedes: DATO_VACIO,
    });
  });

  it('capacidad listarExtraccionesFicha ausente (fake pre-E3) → ficha sin datos de extracción', async () => {
    const { conversaciones, obtenerFicha } = montar();
    (conversaciones as { listarExtraccionesFicha?: unknown }).listarExtraccionesFicha = undefined;

    const ficha = await obtenerFicha.ejecutar(1);

    expect(ficha.datos.sedes).toEqual(DATO_VACIO);
  });
});
