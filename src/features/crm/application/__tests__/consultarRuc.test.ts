import { describe, expect, it } from 'vitest';

import type { DatosSunat } from '../../domain/entities';
import { DatosEmpresaInvalidosError, RucNoEncontradoError, ServicioConsultaError } from '../../domain/errors';
import type { IConsultaRucServicio } from '../../domain/ports';
import { ConsultarRucUseCase } from '../consultarRuc';

const DATOS: DatosSunat = {
  razonSocial: 'CORPORACIÓN DHMONT S.A.',
  direccion: 'Av. Arequipa 1234',
  estado: 'ACTIVO',
  condicion: 'HABIDO',
};

function fakeServicio(impl: (ruc: string) => Promise<DatosSunat>): IConsultaRucServicio & { rucs: string[] } {
  const rucs: string[] = [];
  return {
    rucs,
    async consultar(ruc) {
      rucs.push(ruc);
      return impl(ruc);
    },
  };
}

describe('ConsultarRucUseCase', () => {
  it('valida el RUC ANTES de tocar el servicio: inválido → DatosEmpresaInvalidosError y cero llamadas', async () => {
    for (const ruc of ['', '   ', '123', '2060123456A', '206012345678']) {
      const servicio = fakeServicio(async () => DATOS);
      const error = await new ConsultarRucUseCase(servicio).execute(ruc).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DatosEmpresaInvalidosError);
      expect((error as Error).message).toBe('El RUC debe tener 11 dígitos.');
      expect(servicio.rucs).toEqual([]);
    }
  });

  it('delega el RUC validado y recortado al servicio y devuelve sus datos', async () => {
    const servicio = fakeServicio(async () => DATOS);
    const datos = await new ConsultarRucUseCase(servicio).execute(' 20525426778 ');
    expect(servicio.rucs).toEqual(['20525426778']);
    expect(datos).toEqual(DATOS);
  });

  it('propaga los errores del servicio sin envolverlos', async () => {
    const noEncontrado = new RucNoEncontradoError('20525426778');
    const servicio404 = fakeServicio(async () => {
      throw noEncontrado;
    });
    await expect(new ConsultarRucUseCase(servicio404).execute('20525426778')).rejects.toBe(noEncontrado);

    const caido = new ServicioConsultaError('No se pudo conectar con apifacturacion');
    const servicio502 = fakeServicio(async () => {
      throw caido;
    });
    await expect(new ConsultarRucUseCase(servicio502).execute('20525426778')).rejects.toBe(caido);
  });
});
