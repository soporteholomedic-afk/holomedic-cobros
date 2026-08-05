import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AtencionDetalle } from '@/types/jjc';
import { useEntrevistaOsteomuscular } from '../useEntrevistaOsteomuscular';

const ATENCION: AtencionDetalle = {
  idAtencion: 'AT-1001',
  dni: '11223344',
  paciente: 'Paciente Prueba',
  sexo: 'M',
  fechaNac: '01/01/1990',
  edad: 36,
  fechaAtencion: '01/08/2026',
  empresa: 'Empresa X',
  tipoExamen: 'PERIODICO',
  puesto: 'Operario',
  area: 'Producción',
  rutaFirma: null,
  rutaHuella: null,
};

describe('useEntrevistaOsteomuscular', () => {
  it('tracks changes and marks the current state as saved', () => {
    const { result } = renderHook(() => useEntrevistaOsteomuscular(ATENCION));

    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.setField('datosGenerales.antiguedadEmpresa', '2 años');
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.markSaved();
    });
    expect(result.current.isDirty).toBe(false);
  });

  it('marks the reset state as clean', () => {
    const { result } = renderHook(() => useEntrevistaOsteomuscular(ATENCION));

    act(() => {
      result.current.setField('datosGenerales.antiguedadEmpresa', '2 años');
      result.current.reset(ATENCION);
    });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.state.datosGenerales.antiguedadEmpresa).toBe('');
  });

  it('initializes and updates the upper-limb free-text fields', () => {
    const { result } = renderHook(() => useEntrevistaOsteomuscular(ATENCION));

    expect(result.current.state.miembrosSuperiores.hombro.infoReportada).toHaveProperty(
      'visitaTraumatologiaMedicinaGeneral',
      false,
    );
    expect(
      result.current.state.miembrosSuperiores.hombro.sintomas.umbralPositivo.unaSemanaDolor3Meses,
    ).toEqual({ dx: false, ix: false });
    expect(result.current.state.miembrosSuperiores.hombro.sintomas.umbralPositivo.otrasVeces).toBe('');
    expect(result.current.state.miembrosSuperiores.hombro.sintomas.molestiasLeves.detalle).toBe('');

    act(() => {
      result.current.setField(
        'miembrosSuperiores.hombro.sintomas.umbralPositivo.unaSemanaDolor3Meses.dx',
        true,
      );
      result.current.setField(
        'miembrosSuperiores.hombro.sintomas.umbralPositivo.otrasVeces',
        'cada dos semanas',
      );
      result.current.setField(
        'miembrosSuperiores.hombro.sintomas.molestiasLeves.detalle',
        'rigidez leve',
      );
    });

    expect(result.current.state.miembrosSuperiores.hombro.sintomas.umbralPositivo.otrasVeces).toBe(
      'cada dos semanas',
    );
    expect(
      result.current.state.miembrosSuperiores.hombro.sintomas.umbralPositivo.unaSemanaDolor3Meses.dx,
    ).toBe(true);
    expect(result.current.state.miembrosSuperiores.hombro.sintomas.molestiasLeves.detalle).toBe(
      'rigidez leve',
    );
  });

  it('initializes and updates the page-two threshold and detail fields', () => {
    const { result } = renderHook(() => useEntrevistaOsteomuscular(ATENCION));

    expect(
      result.current.state.parestesiaNocturna.sintomas.umbralPositivo.ocurrenciaUnaSemana3Meses,
    ).toEqual({ dx: false, ix: false });
    expect(result.current.state.parestesiaNocturna.sintomas.umbralPositivo.otrasVeces).toBe('');
    expect(
      result.current.state.parestesiaNocturna.sintomas.molestiasLeves.detalle,
    ).toBe('');
    expect(
      result.current.state.parestesiaDiurna.sintomas.umbralPositivo.ocurrenciaUnaSemana3Meses,
    ).toEqual({ dx: false, ix: false });
    expect(result.current.state.parestesiaDiurna.sintomas.umbralPositivo.otrasVeces).toBe('');
    expect(result.current.state.parestesiaDiurna.sintomas.molestiasLeves.detalle).toBe('');
    expect(result.current.state.molestiaCervicalIrradiada.otrosMomentos).toBe('');

    act(() => {
      result.current.setField(
        'parestesiaNocturna.sintomas.umbralPositivo.ocurrenciaUnaSemana3Meses.dx',
        true,
      );
      result.current.setField(
        'parestesiaNocturna.sintomas.umbralPositivo.otrasVeces',
        'cada dos semanas',
      );
      result.current.setField(
        'parestesiaNocturna.sintomas.molestiasLeves.detalle',
        'hormigueo leve',
      );
      result.current.setField(
        'parestesiaDiurna.sintomas.umbralPositivo.ocurrenciaUnaVezMes.ix',
        true,
      );
      result.current.setField(
        'parestesiaDiurna.sintomas.umbralPositivo.otrasVeces',
        'al conducir',
      );
      result.current.setField(
        'parestesiaDiurna.sintomas.molestiasLeves.detalle',
        'adormecimiento leve',
      );
      result.current.setField(
        'molestiaCervicalIrradiada.otrosMomentos',
        'al levantar peso',
      );
    });

    expect(
      result.current.state.parestesiaNocturna.sintomas.umbralPositivo.ocurrenciaUnaSemana3Meses.dx,
    ).toBe(true);
    expect(result.current.state.parestesiaNocturna.sintomas.umbralPositivo.otrasVeces).toBe(
      'cada dos semanas',
    );
    expect(result.current.state.parestesiaNocturna.sintomas.molestiasLeves.detalle).toBe(
      'hormigueo leve',
    );
    expect(
      result.current.state.parestesiaDiurna.sintomas.umbralPositivo.ocurrenciaUnaVezMes.ix,
    ).toBe(true);
    expect(result.current.state.parestesiaDiurna.sintomas.umbralPositivo.otrasVeces).toBe(
      'al conducir',
    );
    expect(result.current.state.parestesiaDiurna.sintomas.molestiasLeves.detalle).toBe(
      'adormecimiento leve',
    );
    expect(result.current.state.molestiaCervicalIrradiada.otrosMomentos).toBe('al levantar peso');
  });
});
