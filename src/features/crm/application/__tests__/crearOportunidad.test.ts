import { describe, expect, it } from 'vitest';

import { DatosEmpresaInvalidosError, EmpresaNotFoundError, EtapaInvalidaError } from '../../domain/errors';
import type { Oportunidad } from '../../domain/entities';
import { CrearOportunidadUseCase, type CrearOportunidadDatos } from '../crearOportunidad';
import { ListarOportunidadesUseCase } from '../listarOportunidades';
import { HOY, empresa, foto, makeFakeRepo, oportunidad } from './fakeRepo';

const DATOS: CrearOportunidadDatos = {
  nombre: '  Exámenes ocupacionales 2026  ',
  servicio: ' Exámenes de ingreso ',
  responsableId: 'u-2',
  responsableNombre: 'Ana Torres',
  origen: 'referido',
  montoEstimado: 15_000,
};

const crear = (repo: ReturnType<typeof makeFakeRepo>, idEmpresa = 'e-1', datos: CrearOportunidadDatos = DATOS) =>
  new CrearOportunidadUseCase(repo.empresaRepo, repo.oportunidadRepo).execute(idEmpresa, datos);

describe('CrearOportunidadUseCase — dos oportunidades por empresa (S7.2)', () => {
  it('creates the deal on an existing empresa with the default stage Por contactar', async () => {
    const repo = makeFakeRepo([empresa()]);
    const o = await crear(repo);
    expect(o).toMatchObject({
      idEmpresa: 'e-1',
      nombre: 'Exámenes ocupacionales 2026',
      servicio: 'Exámenes de ingreso',
      responsableId: 'u-2',
      responsableNombre: 'Ana Torres',
      origen: 'referido',
      montoEstimado: 15_000,
      etapa: 'por_contactar',
      medio: null,
      medioOtro: null,
      motivo: null,
      intentosSinRespuesta: 0,
      faltaResponderDesde: null,
      proximaAccion: null,
      sugerenciaDescartadaEn: null,
      migrada: false,
    });
    expect(repo.oportunidades).toHaveLength(1);
  });

  it('two different oportunidades for the same empresa coexist and both are listed (S7.2)', async () => {
    const repo = makeFakeRepo([empresa()]);
    const primera = await crear(repo);
    const segunda = await crear(repo, 'e-1', { ...DATOS, nombre: 'Ocupacional en planta', etapa: 'contactado', medio: 'llamada' });
    expect(primera.idOportunidad).not.toBe(segunda.idOportunidad);
    expect(repo.oportunidades).toHaveLength(2);
    const lista = await new ListarOportunidadesUseCase(repo.oportunidadRepo).execute();
    expect(lista.map((o) => o.nombre).sort()).toEqual(['Exámenes ocupacionales 2026', 'Ocupacional en planta'].sort());
    // The ficha is never duplicated nor modified by creating a deal.
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toEqual(empresa());
  });

  it('throws EmpresaNotFoundError for an unknown empresa and stores nothing', async () => {
    const repo = makeFakeRepo();
    await expect(crear(repo, 'nope')).rejects.toBeInstanceOf(EmpresaNotFoundError);
    expect(repo.oportunidades).toHaveLength(0);
    expect(repo.escrituras).toBe(0);
  });

  it('rejects an unknown stage with EtapaInvalidaError', async () => {
    const repo = makeFakeRepo([empresa()]);
    await expect(crear(repo, 'e-1', { ...DATOS, etapa: 'archivado' })).rejects.toBeInstanceOf(EtapaInvalidaError);
    expect(repo.escrituras).toBe(0);
  });

  it('a stage outside Por contactar needs the medium of the first contact; Por contactar ignores it', async () => {
    const repo = makeFakeRepo([empresa()]);
    const contactada = await crear(repo, 'e-1', { ...DATOS, etapa: 'contactado', medio: 'whatsapp' });
    expect(contactada).toMatchObject({ etapa: 'contactado', medio: 'whatsapp', medioOtro: null });
    const repo2 = makeFakeRepo([empresa()]);
    await expect(crear(repo2, 'e-1', { ...DATOS, etapa: 'contactado' })).rejects.toThrow(
      'Elige el medio de contacto: llamada, correo o WhatsApp',
    );
    const repo3 = makeFakeRepo([empresa()]);
    const porContactar = await crear(repo3, 'e-1', { ...DATOS, etapa: 'por_contactar', medio: 'whatsapp' });
    expect(porContactar).toMatchObject({ etapa: 'por_contactar', medio: null, medioOtro: null });
    expect(repo2.escrituras).toBe(0);
  });

  it('the free-text medium is stored only for Otro', async () => {
    const repo = makeFakeRepo([empresa()]);
    const otro = await crear(repo, 'e-1', { ...DATOS, etapa: 'contactado', medio: 'otro', medioOtro: ' Feria ' });
    expect(otro).toMatchObject({ medio: 'otro', medioOtro: 'Feria' });
    const repo2 = makeFakeRepo([empresa()]);
    await expect(crear(repo2, 'e-1', { ...DATOS, etapa: 'contactado', medio: 'otro' })).rejects.toThrow(
      'Escribe cuál fue el medio.',
    );
    expect(repo2.escrituras).toBe(0);
  });
});

describe('CrearOportunidadUseCase — validations (S1)', () => {
  async function rechaza(datos: CrearOportunidadDatos, mensaje: string): Promise<void> {
    const repo = makeFakeRepo([empresa()]);
    const antes = foto(repo);
    const error = await crear(repo, 'e-1', datos).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatosEmpresaInvalidosError);
    expect((error as Error).message).toBe(mensaje);
    expect(foto(repo)).toEqual(antes);
    expect(repo.oportunidades).toHaveLength(0);
  }

  it('the nombre is required, trimmed, and at most 120 characters', async () => {
    await rechaza({ ...DATOS, nombre: '   ' }, 'El nombre de la oportunidad es obligatorio');
    await rechaza({ ...DATOS, nombre: 'x'.repeat(121) }, 'El nombre admite hasta 120 caracteres.');
    const repo = makeFakeRepo([empresa()]);
    const o = await crear(repo, 'e-1', { ...DATOS, nombre: ` ${'x'.repeat(120)} ` });
    expect(o.nombre).toHaveLength(120);
  });

  it('the servicio is optional and at most 120 characters', async () => {
    await rechaza({ ...DATOS, servicio: 'x'.repeat(121) }, 'El servicio admite hasta 120 caracteres.');
    const repo = makeFakeRepo([empresa()]);
    const sinServicio = await crear(repo, 'e-1', { ...DATOS, servicio: '  ' });
    expect(sinServicio.servicio).toBeNull();
  });

  it('the monto is null or a positive number up to 99999999', async () => {
    await rechaza({ ...DATOS, montoEstimado: 0 }, 'El monto estimado debe ser un número mayor a 0.');
    await rechaza({ ...DATOS, montoEstimado: -5 }, 'El monto estimado debe ser un número mayor a 0.');
    await rechaza({ ...DATOS, montoEstimado: Number.NaN }, 'El monto estimado debe ser un número mayor a 0.');
    await rechaza({ ...DATOS, montoEstimado: '15000' }, 'El monto estimado debe ser un número mayor a 0.');
    await rechaza({ ...DATOS, montoEstimado: 100_000_000 }, 'El monto estimado admite hasta 99999999.');
    const repo = makeFakeRepo([empresa()]);
    const limite = await crear(repo, 'e-1', { ...DATOS, montoEstimado: 99_999_999 });
    expect(limite.montoEstimado).toBe(99_999_999);
    for (const vacio of [null, undefined, '']) {
      const repo2 = makeFakeRepo([empresa()]);
      const sinMonto = await crear(repo2, 'e-1', { ...DATOS, montoEstimado: vacio });
      expect(sinMonto.montoEstimado).toBeNull();
    }
  });

  it('the origen is one of the catalog or nothing', async () => {
    await rechaza({ ...DATOS, origen: 'zzz' }, 'Elige cómo nos conoció.');
    const repo = makeFakeRepo([empresa()]);
    const sinOrigen = await crear(repo, 'e-1', { ...DATOS, origen: null });
    expect(sinOrigen.origen).toBeNull();
  });

  it('the responsable needs id and nombre together, or neither', async () => {
    await rechaza({ ...DATOS, responsableNombre: undefined }, 'El responsable necesita id y nombre.');
    await rechaza({ ...DATOS, responsableId: undefined }, 'El responsable necesita id y nombre.');
    const repo = makeFakeRepo([empresa()]);
    const sinResponsable = await crear(repo, 'e-1', { ...DATOS, responsableId: null, responsableNombre: null });
    expect(sinResponsable).toMatchObject({ responsableId: null, responsableNombre: null });
  });

  it('a rejected input never stores a partial deal, whatever the invalid field', async () => {
    const repo = makeFakeRepo([empresa()]);
    const antes = foto(repo);
    await expect(crear(repo, 'e-1', { ...DATOS, nombre: '' })).rejects.toBeInstanceOf(DatosEmpresaInvalidosError);
    expect(foto(repo)).toEqual(antes);
  });
});

describe('ListarOportunidadesUseCase', () => {
  it('returns the oportunidades of all empresas, without touching storage', async () => {
    const otras: Oportunidad = oportunidad({ idOportunidad: 'o-2', idEmpresa: 'e-2', nombre: 'Otro negocio' });
    const repo = makeFakeRepo([empresa(), empresa({ idEmpresa: 'e-2' })], [], [oportunidad(), otras]);
    const lista = await new ListarOportunidadesUseCase(repo.oportunidadRepo).execute();
    expect(lista.map((o) => o.idOportunidad)).toEqual(['o-2', 'o-1']);
    expect(await new ListarOportunidadesUseCase(repo.oportunidadRepo).execute()).toHaveLength(2);
    expect(HOY).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
