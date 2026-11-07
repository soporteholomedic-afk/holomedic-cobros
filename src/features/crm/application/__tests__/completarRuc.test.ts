import { describe, expect, it } from 'vitest';

import { MAX_CONTACTOS, type Contacto, type DatosEmpresa, type Empresa } from '../../domain/entities';
import {
  DatosEmpresaInvalidosError,
  EmpresaNotFoundError,
  RucDeOtraEmpresaError,
} from '../../domain/errors';
import { CompletarRucUseCase } from '../completarRuc';
import { NOW, empresa, foto, makeFakeRepo } from './fakeRepo';

const ACCION = { tipo: 'cotizar' as const, detalle: null, fecha: '2026-11-10' };
const SIN_RUC = empresa({ idEmpresa: 'e-sin', razonSocial: 'Gráfica Sur', ruc: null, etapa: 'contactado', medio: 'correo' });
const OTRA = empresa({ idEmpresa: 'e-otra', razonSocial: 'Gráfica Sur S.A.C.', ruc: '20601234567', etapa: 'en_seguimiento', medio: 'llamada' });

const completar = (repo: ReturnType<typeof makeFakeRepo>, ruc: string, unir = false, id = 'e-sin') =>
  new CompletarRucUseCase(repo).execute(id, ruc, { unir });

describe('CompletarRucUseCase — free RUC (S6)', () => {
  it('saves a free RUC and keeps everything else', async () => {
    const repo = makeFakeRepo([empresa({ ...SIN_RUC, notas: 'nota', contactos: [{ nombre: 'Ana', telefono: null, correo: 'a@b.pe' }] })]);
    const e = await completar(repo, ' 20601234567 ');
    expect(e.ruc).toBe('20601234567');
    expect(repo.rows[0]).toMatchObject({ ruc: '20601234567', razonSocial: 'Gráfica Sur', notas: 'nota', etapa: 'contactado' });
    expect(repo.rows[0]?.contactos).toEqual([{ nombre: 'Ana', telefono: null, correo: 'a@b.pe' }]);
    expect(repo.rows).toHaveLength(1);
  });

  it('requires 11 digits and stores nothing otherwise', async () => {
    for (const ruc of ['', '2060', '2060123456A', '206012345678']) {
      const repo = makeFakeRepo([SIN_RUC]);
      const antes = foto(repo);
      const error = await completar(repo, ruc).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DatosEmpresaInvalidosError);
      expect((error as Error).message).toBe('El RUC debe tener 11 dígitos.');
      expect(foto(repo)).toEqual(antes);
    }
  });

  it('throws not found for an unknown empresa', async () => {
    const repo = makeFakeRepo();
    await expect(completar(repo, '20601234567', false, 'nope')).rejects.toBeInstanceOf(EmpresaNotFoundError);
    expect(repo.escrituras).toBe(0);
  });

  it('saving the RUC it already has is not a conflict with itself', async () => {
    const repo = makeFakeRepo([empresa({ idEmpresa: 'e-1', ruc: '20512345678' })]);
    const e = await completar(repo, '20512345678', false, 'e-1');
    expect(e.ruc).toBe('20512345678');
  });

  it('forwards the stored direccion to update, so completing the RUC never wipes the fiscal address', async () => {
    const repo = makeFakeRepo([empresa({ ...SIN_RUC, direccion: 'Av. Los Próceres 210, San Isidro' })]);
    let recibida: string | null | undefined;
    const original = repo.update.bind(repo);
    repo.update = async (id: string, datos: DatosEmpresa) => {
      recibida = datos.direccion;
      return original(id, datos);
    };
    await completar(repo, '20601234567');
    expect(recibida).toBe('Av. Los Próceres 210, San Isidro');
  });
});

describe('CompletarRucUseCase — RUC of another empresa (S6)', () => {
  it('without confirmation it throws RucDeOtraEmpresaError with the other empresa and stores nothing', async () => {
    const repo = makeFakeRepo([SIN_RUC, OTRA]);
    const antes = foto(repo);
    const error = await completar(repo, '20601234567', false).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RucDeOtraEmpresaError);
    expect(error).toMatchObject({
      name: 'RucDeOtraEmpresaError',
      otra: { idEmpresa: 'e-otra', razonSocial: 'Gráfica Sur S.A.C.', etapa: 'en_seguimiento' },
    });
    expect((error as Error).message).toBe('Este RUC ya es de Gráfica Sur S.A.C. («En seguimiento»). ¿Unir las dos tarjetas?');
    expect(foto(repo)).toEqual(antes);
  });

  it('with unir it merges into the other empresa: history and contacts pass over, this card disappears', async () => {
    const contacto: Contacto = { nombre: 'Ana', telefono: null, correo: 'a@b.pe' };
    const repo = makeFakeRepo(
      [empresa({ ...SIN_RUC, contactos: [contacto] }), { ...OTRA, contactos: [{ nombre: 'Luis', telefono: '987 654 321', correo: null }] }],
      [{ idInteraccion: 1, idEmpresa: 'e-sin', fecha: NOW, idUsuario: 'u-1', nombreUsuario: 'S', direccion: 'entrante', medio: 'correo', medioOtro: null, resultado: 'pendiente', resumen: null }],
    );
    const e = await completar(repo, '20601234567', true);
    expect(e.idEmpresa).toBe('e-otra');
    expect(repo.rows.map((r) => r.idEmpresa)).toEqual(['e-otra']);
    expect(repo.interacciones.every((i) => i.idEmpresa === 'e-otra')).toBe(true);
    expect(repo.rows[0]?.contactos.map((c) => c.nombre)).toEqual(['Luis', 'Ana']);
  });

  it('the destination keeps its own RUC, sector, stage and attempt counter', async () => {
    const repo = makeFakeRepo([
      empresa({ ...SIN_RUC, sector: 'Construcción', intentosSinRespuesta: 4 }),
      { ...OTRA, sector: 'Comercio y Tiendas', intentosSinRespuesta: 1 },
    ]);
    const e = await completar(repo, '20601234567', true);
    expect(e).toMatchObject({ ruc: '20601234567', sector: 'Comercio y Tiendas', etapa: 'en_seguimiento', intentosSinRespuesta: 1 });
  });

  it('inherits the pending reply and the next action only when the origin had a pending reply', async () => {
    const conPendiente = makeFakeRepo([
      empresa({ ...SIN_RUC, faltaResponderDesde: NOW, proximaAccion: ACCION }),
      { ...OTRA, proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-12-01' } },
    ]);
    const e = await completar(conPendiente, '20601234567', true);
    expect(e).toMatchObject({ faltaResponderDesde: NOW, proximaAccion: ACCION });

    const sinPendiente = makeFakeRepo([
      empresa({ ...SIN_RUC, faltaResponderDesde: null, proximaAccion: ACCION }),
      { ...OTRA, proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-12-01' } },
    ]);
    const e2 = await completar(sinPendiente, '20601234567', true);
    expect(e2).toMatchObject({ faltaResponderDesde: null, proximaAccion: { tipo: 'llamar', fecha: '2026-12-01' } });
  });

  it('keeps the older pending reply of the destination when both wait for an answer', async () => {
    const antes = '2026-10-01T10:00:00.000Z';
    const repo = makeFakeRepo([
      empresa({ ...SIN_RUC, faltaResponderDesde: NOW, proximaAccion: ACCION }),
      { ...OTRA, faltaResponderDesde: antes },
    ]);
    const e = await completar(repo, '20601234567', true);
    expect(e.faltaResponderDesde).toBe(antes);
    expect(e.proximaAccion).toEqual(ACCION);
  });

  it('appends the origin notes to the destination notes, never dropping them', async () => {
    const ambas = makeFakeRepo([empresa({ ...SIN_RUC, notas: 'del origen' }), { ...OTRA, notas: 'del destino' }]);
    expect((await completar(ambas, '20601234567', true)).notas).toBe('del destino\n\ndel origen');
    const soloOrigen = makeFakeRepo([empresa({ ...SIN_RUC, notas: 'del origen' }), { ...OTRA, notas: null }]);
    expect((await completar(soloOrigen, '20601234567', true)).notas).toBe('del origen');
    const soloDestino = makeFakeRepo([empresa({ ...SIN_RUC, notas: null }), { ...OTRA, notas: 'del destino' }]);
    expect((await completar(soloDestino, '20601234567', true)).notas).toBe('del destino');
  });

  it('rejects the merge before writing when the contacts would exceed the maximum', async () => {
    const lote = (n: number, p: string): Contacto[] =>
      Array.from({ length: n }, (_, i) => ({ nombre: `${p}${i}`, telefono: null, correo: `${p}${i}@x.pe` }));
    const repo = makeFakeRepo([
      empresa({ ...SIN_RUC, contactos: lote(3, 'o') }),
      { ...OTRA, contactos: lote(MAX_CONTACTOS - 2, 'd') },
    ]);
    const antes = foto(repo);
    const error = await completar(repo, '20601234567', true).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatosEmpresaInvalidosError);
    expect((error as Error).message).toBe(
      `Al unir, la tarjeta tendría más de ${MAX_CONTACTOS} contactos. Quita alguno antes de unirlas.`,
    );
    expect(foto(repo)).toEqual(antes);
  });

  it('exact duplicates do not count towards the maximum', async () => {
    const lote = (n: number): Contacto[] =>
      Array.from({ length: n }, (_, i) => ({ nombre: `c${i}`, telefono: null, correo: `c${i}@x.pe` }));
    const repo = makeFakeRepo([
      empresa({ ...SIN_RUC, contactos: lote(MAX_CONTACTOS) }),
      { ...OTRA, contactos: lote(MAX_CONTACTOS) },
    ]);
    const e: Empresa = await completar(repo, '20601234567', true);
    expect(e.contactos).toHaveLength(MAX_CONTACTOS);
  });

  it('unir:true with a free RUC just saves it (nothing to merge)', async () => {
    const repo = makeFakeRepo([SIN_RUC]);
    const e = await completar(repo, '20601234567', true);
    expect(e).toMatchObject({ idEmpresa: 'e-sin', ruc: '20601234567' });
  });
});
