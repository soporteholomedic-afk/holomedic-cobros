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

describe('useEntrevistaOsteomuscular — marcas de área de distribución (5 colecciones)', () => {
  const FIVE_PATHS = [
    'miembrosSuperiores.manoMuneca.areaDistribucionAnotaciones',
    'parestesiaNocturna.areaDistribucionAnotaciones',
    'parestesiaDiurna.areaDistribucionAnotaciones',
    'columna.areaDistribucionAnotaciones.cervical',
    'columna.areaDistribucionAnotaciones.dorsalLumboSacra',
  ] as const;

  it('inicializa las cinco colecciones de marcas como vacías', () => {
    const { result } = renderHook(() => useEntrevistaOsteomuscular(ATENCION));

    expect(result.current.state.miembrosSuperiores.manoMuneca.areaDistribucionAnotaciones).toEqual([]);
    expect(result.current.state.parestesiaNocturna.areaDistribucionAnotaciones).toEqual([]);
    expect(result.current.state.parestesiaDiurna.areaDistribucionAnotaciones).toEqual([]);
    expect(result.current.state.columna.areaDistribucionAnotaciones.cervical).toEqual([]);
    expect(result.current.state.columna.areaDistribucionAnotaciones.dorsalLumboSacra).toEqual([]);
  });

  it('almacena marcas normalizadas a través de los cinco paths profundos', () => {
    const { result } = renderHook(() => useEntrevistaOsteomuscular(ATENCION));

    act(() => {
      result.current.setField(FIVE_PATHS[0], [{ id: 'mano-1', x: 0.25, y: 0.5 }]);
      result.current.setField(FIVE_PATHS[1], [{ id: 'noct-1', x: 0.1, y: 0.9 }]);
      result.current.setField(FIVE_PATHS[2], [{ id: 'diur-1', x: 0.4, y: 0.6 }]);
      result.current.setField(FIVE_PATHS[3], [{ id: 'cerv-1', x: 0.2, y: 0.3 }]);
      result.current.setField(FIVE_PATHS[4], [{ id: 'dl-1', x: 0.7, y: 0.8 }]);
    });

    expect(result.current.state.miembrosSuperiores.manoMuneca.areaDistribucionAnotaciones).toEqual([
      { id: 'mano-1', x: 0.25, y: 0.5 },
    ]);
    expect(result.current.state.parestesiaNocturna.areaDistribucionAnotaciones).toEqual([
      { id: 'noct-1', x: 0.1, y: 0.9 },
    ]);
    expect(result.current.state.parestesiaDiurna.areaDistribucionAnotaciones).toEqual([
      { id: 'diur-1', x: 0.4, y: 0.6 },
    ]);
    expect(result.current.state.columna.areaDistribucionAnotaciones.cervical).toEqual([
      { id: 'cerv-1', x: 0.2, y: 0.3 },
    ]);
    expect(result.current.state.columna.areaDistribucionAnotaciones.dorsalLumboSacra).toEqual([
      { id: 'dl-1', x: 0.7, y: 0.8 },
    ]);
  });

  it('restaura las cinco colecciones al hidratar una entrevista guardada', () => {
    const { result } = renderHook(() => useEntrevistaOsteomuscular(ATENCION));

    act(() => {
      result.current.hydrate({
        miembrosSuperiores: {
          manoMuneca: { areaDistribucionAnotaciones: [{ id: 'mano-1', x: 0.25, y: 0.5 }] },
        },
        parestesiaNocturna: { areaDistribucionAnotaciones: [{ id: 'noct-1', x: 0.1, y: 0.9 }] },
        parestesiaDiurna: { areaDistribucionAnotaciones: [] },
        columna: {
          areaDistribucionAnotaciones: {
            cervical: [{ id: 'cerv-1', x: 0.2, y: 0.3 }],
            dorsalLumboSacra: [{ id: 'dl-1', x: 0.7, y: 0.8 }],
          },
        },
      });
    });

    expect(result.current.state.miembrosSuperiores.manoMuneca.areaDistribucionAnotaciones).toEqual([
      { id: 'mano-1', x: 0.25, y: 0.5 },
    ]);
    expect(result.current.state.parestesiaNocturna.areaDistribucionAnotaciones).toEqual([
      { id: 'noct-1', x: 0.1, y: 0.9 },
    ]);
    expect(result.current.state.parestesiaDiurna.areaDistribucionAnotaciones).toEqual([]);
    expect(result.current.state.columna.areaDistribucionAnotaciones.cervical).toEqual([
      { id: 'cerv-1', x: 0.2, y: 0.3 },
    ]);
    expect(result.current.state.columna.areaDistribucionAnotaciones.dorsalLumboSacra).toEqual([
      { id: 'dl-1', x: 0.7, y: 0.8 },
    ]);
  });

  it('preserva valores existentes y deja vacías las colecciones faltantes en payloads legacy', () => {
    const { result } = renderHook(() => useEntrevistaOsteomuscular(ATENCION));

    act(() => {
      result.current.hydrate({
        datosGenerales: { empresa: 'Empresa Legacy', area: 'Planta 1' },
        columna: {
          cervical: { presentaDisturbio: true },
        },
      });
    });

    // Los valores previos de la entrevista se conservan intactos
    expect(result.current.state.datosGenerales.empresa).toBe('Empresa Legacy');
    expect(result.current.state.datosGenerales.area).toBe('Planta 1');
    expect(result.current.state.columna.cervical.presentaDisturbio).toBe(true);

    // Las cinco colecciones sin datos arrancan vacías
    expect(result.current.state.miembrosSuperiores.manoMuneca.areaDistribucionAnotaciones).toEqual([]);
    expect(result.current.state.parestesiaNocturna.areaDistribucionAnotaciones).toEqual([]);
    expect(result.current.state.parestesiaDiurna.areaDistribucionAnotaciones).toEqual([]);
    expect(result.current.state.columna.areaDistribucionAnotaciones.cervical).toEqual([]);
    expect(result.current.state.columna.areaDistribucionAnotaciones.dorsalLumboSacra).toEqual([]);
  });
});
