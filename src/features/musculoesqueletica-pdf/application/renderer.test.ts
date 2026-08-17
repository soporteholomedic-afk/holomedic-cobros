import { describe, it, expect } from 'vitest';
import { renderTemplate, escapeHtml, resolvePath } from './renderer';
import { TemplateError } from '../domain/errors';
import type { PdfSourceData } from '../domain/entities';
import type { AtencionDetalle } from '@/types/jjc';
import type { EntrevistaOsteomuscular } from '@/types/entrevista-osteomuscular';

const atencion: AtencionDetalle = {
  idAtencion: '2024-MS-089',
  dni: '30123456',
  paciente: 'Juan Pérez',
  sexo: 'M',
  fechaNac: '15/03/1990',
  edad: 35,
  fechaAtencion: '17/08/2026',
  empresa: 'JJC CONTRATISTAS GENERALES S.A.',
  tipoExamen: 'Periodico',
  puesto: 'Operario',
  area: 'Musculoesqueletica',
  rutaFirma: null,
  rutaHuella: null,
};

const entrevista: EntrevistaOsteomuscular = {
  idAtencion: '2024-MS-089',
  datosGenerales: {
    fechaEntrevista: '17/08/2026',
    empresa: 'ACME & Sons <CIA>',
    area: 'Producción',
    nombreApellidos: 'Juan "El" Pérez',
    fechaNacimiento: '15/03/1990',
    edad: 35,
    sexo: 'M',
    antiguedadEmpresa: '24',
    antiguedadPuesto: '12',
    miembroDominante: { dx: true, ix: false },
    tipoExamen: { ingreso: false, periodico: true, retiro: false, otro: false },
  },
  miembrosSuperiores: {
    hombro: {
      tieneDolor: true,
      inicioMolestia: 'Hace 2 semanas',
      infoReportada: {
        haTomadoMedicamentos: true,
        fisioterapia: false,
        visitaTraumatologiaMedicinaGeneral: false,
        rx: false,
        ecografiaResonancia: false,
      },
      sintomas: {
        dolorMovimiento: { dx: true, ix: false },
        dolorReposo: { dx: false, ix: false },
        umbralPositivo: {
          dolorContinuo: { dx: true, ix: false },
          unaSemanaDolor3Meses: { dx: false, ix: true },
          unaVezMes12Meses: { dx: false, ix: false },
          otrasVeces: '',
        },
        molestiasLeves: { dx: false, ix: false, detalle: '' },
      },
      observaciones: 'Dolor al levantar el brazo.',
    },
    codo: {
      tieneDolor: false,
      inicioMolestia: '',
      infoReportada: {
        haTomadoMedicamentos: false,
        fisioterapia: false,
        visitaTraumatologiaMedicinaGeneral: false,
        rx: false,
        ecografiaResonancia: false,
        emg: false,
      },
      sintomas: {
        dolorAgarrarSoportarPeso: { dx: false, ix: false },
        dolorReposo: { dx: false, ix: false },
        umbralPositivo: {
          dolorContinuo: { dx: false, ix: false },
          unaSemanaDolor3Meses: { dx: false, ix: false },
          unaVezMes12Meses: { dx: false, ix: false },
          otrasVeces: '',
        },
        molestiasLeves: { dx: false, ix: false, detalle: '' },
      },
      observaciones: '',
    },
    manoMuneca: {
      tieneDolor: false,
      inicioMolestia: '',
      infoReportada: {
        haTomadoMedicamentos: false,
        fisioterapia: false,
        visitaTraumatologiaMedicinaGeneral: false,
        rx: false,
        ecografiaResonancia: false,
        emg: false,
      },
      sintomas: {
        dolorAgarrarPresionar: { dx: false, ix: false },
        dolorMovimiento: { dx: false, ix: false },
        dolorReposo: { dx: false, ix: false },
        dolorUnDedo: { dx: false, ix: false },
        dolorTresDedos: { dx: false, ix: false },
        dolorPalma: { dx: false, ix: false },
        dolorDorso: { dx: false, ix: false },
        umbralPositivo: {
          dolorContinuo: { dx: false, ix: false },
          unaSemanaDolor3Meses: { dx: false, ix: false },
          unaVezMes12Meses: { dx: false, ix: false },
          otrasVeces: '',
        },
        molestiasLeves: { dx: false, ix: false, detalle: '' },
      },
      observaciones: '',
      areaDistribucionAnotaciones: [],
    },
  },
  parestesiaNocturna: {
    tieneParestesia: false,
    inicioMolestia: '',
    infoReportada: {
      haTomadoMedicamentos: false,
      fisioterapia: false,
      visitaTraumatologiaMedicinaGeneral: false,
      rx: false,
      ecografiaRmn: false,
      emg: false,
    },
    sintomas: {
      brazo: { dx: false, ix: false },
      antebrazo: { dx: false, ix: false },
      mano: { dx: false, ix: false },
      duracionMenor10Min: { dx: false, ix: false },
      duracionMayor10Min: { dx: false, ix: false },
      presenciaDuranteSueno: { dx: false, ix: false },
      aparicionAlDespertar: { dx: false, ix: false },
      umbralPositivo: {
        dx: false,
        ix: false,
        molestiaSuenoCasiTodaNoche: { dx: false, ix: false },
        ocurrenciaUnaSemana3Meses: { dx: false, ix: false },
        ocurrenciaUnaVezMes: { dx: false, ix: false },
        otrasVeces: '',
      },
      molestiasLeves: { dx: false, ix: false, detalle: '' },
    },
    areaDistribucionAnotaciones: [],
  },
  parestesiaDiurna: {
    tieneParestesia: false,
    inicioMolestia: '',
    infoReportada: {
      haTomadoMedicamentos: false,
      fisioterapia: false,
      visitaTraumatologiaMedicinaGeneral: false,
      rx: false,
      ecografiaRmn: false,
      emg: false,
    },
    sintomas: {
      brazo: { dx: false, ix: false },
      antebrazo: { dx: false, ix: false },
      mano: { dx: false, ix: false },
      duracionMenor10Min: { dx: false, ix: false },
      duracionMayor10Min: { dx: false, ix: false },
      aparecenBrazosLevantados: { dx: false, ix: false },
      aparecenApoyaCodo: { dx: false, ix: false },
      aparicionFuerzaEjecucionTrabajo: { dx: false, ix: false },
      umbralPositivo: {
        dx: false,
        ix: false,
        molestiaSuenoCasiTodaNoche: { dx: false, ix: false },
        ocurrenciaUnaSemana3Meses: { dx: false, ix: false },
        ocurrenciaUnaVezMes: { dx: false, ix: false },
        otrasVeces: '',
      },
      molestiasLeves: { dx: false, ix: false, detalle: '' },
    },
    areaDistribucionAnotaciones: [],
  },
  molestiaCervicalIrradiada: {
    tieneMolestia: false,
    inicioMolestia: '',
    extremidadAfectada: { dx: false, ix: false },
    inicianOEmpeoranElevandoExtremidades: false,
    frecuencia: {
      presentandoCasiTodoDia: false,
      presenciaUnaSemana12Meses: false,
      presenciaUnDiaMes: false,
    },
    otrosMomentos: '',
  },
  ausenciaYTrastornos: {
    diasAusenciaExtremidadSuperior: null,
    tieneTrastornoDiagnosticado: false,
    diagnosticos: {
      hombro: { tiene: false, cuando: '' },
      codo: { tiene: false, cuando: '' },
      manoMunecaTendinitis: { tiene: false, cuando: '' },
      manoMunecaTunelCarpiano: { tiene: false, cuando: '' },
    },
    totalDiasEnfermedad12Meses: null,
  },
  columna: {
    cervical: {
      presentaDisturbio: false,
      frecuenciaMolestia: { raramente: false, episodios2a3Dias: false, episodiosConMedicamentos: false, presenteTodoElDia: false },
      frecuenciaDolor: { raramente: false, episodios2a3Dias: false, episodiosConMedicamentos: false, presenteTodoElDia: false },
      diasAusenciaTrabajo: null,
      irradiacion: { tieneIrradiacion: false, miembroSuperior: { dx: false, ix: false }, detalleIrradiacion: '' },
    },
    dorsal: {
      presentaDisturbio: false,
      frecuenciaMolestia: { raramente: false, episodios2a3Dias: false, episodiosConMedicamentos: false, presenteTodoElDia: false },
      frecuenciaDolor: { raramente: false, episodios2a3Dias: false, episodiosConMedicamentos: false, presenteTodoElDia: false },
      diasAusenciaTrabajo: null,
      irradiacion: { tieneIrradiacion: false, emitorax: false, dx: false, ix: false, detalleIrradiacion: '' },
    },
    lumboSacra: {
      presentaDisturbio: false,
      frecuenciaMolestia: { raramente: false, episodios2a3Dias: false, episodiosConMedicamentos: false, presenteTodoElDia: false },
      frecuenciaDolor: { raramente: false, episodios2a3Dias: false, episodiosConMedicamentos: false, presenteTodoElDia: false },
      diasAusenciaTrabajo: null,
      irradiacion: { tieneIrradiacion: false, miembrosInferiores: false, dx: false, ix: false, detalleIrradiacion: '' },
    },
    areaDistribucionAnotaciones: { cervical: [], dorsalLumboSacra: [] },
  },
  lumbalgiaAguda: {
    tieneLumbalgiaAguda: false,
    totalEpisodiosAgudos: null,
    episodiosUltimoAno: {
      lumbalgia: { aplica: false, cantidad: null },
      lumbociatalgia: { aplica: false, cantidad: null },
    },
    anoPrimerEpisodio: '',
    diasAusenciaTrabajo: null,
  },
  diagnosticoPatologiaColumna: {
    tieneDiagnosticoConocido: false,
    herniaDiscoLumboSacra: { diagnosticada: false, tratadaQuirurgicamente: false, cuando: '', fechaIntervencion: '' },
    patologiaTraumaCervical: '',
    patologiaTraumaDorsal: '',
    patologiaTraumaLumbosacra: '',
  },
  medicoEvaluador: { nombreYApellidos: '', fechaEvaluacion: '' },
};

const source: PdfSourceData = { atencion, entrevista, evaluacion: null };

const noImages = () => null;

describe('escapeHtml', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Juan Pérez 123')).toBe('Juan Pérez 123');
  });
});

describe('resolvePath', () => {
  it('resolves nested own-property paths', () => {
    expect(resolvePath(source, 'entrevista.datosGenerales.empresa')).toBe(
      'ACME & Sons <CIA>',
    );
  });

  it('returns undefined for prototype members (own-property only)', () => {
    expect(resolvePath(source, 'entrevista.toString')).toBeUndefined();
    expect(resolvePath(source, 'constructor')).toBeUndefined();
    expect(resolvePath(source, 'hasOwnProperty')).toBeUndefined();
  });

  it('returns undefined for missing or null intermediate segments', () => {
    expect(resolvePath(source, 'entrevista.datosGenerales.noExiste')).toBeUndefined();
    expect(resolvePath(source, 'evaluacion.fechaEvaluacion')).toBeUndefined();
  });

  it('returns undefined when a segment value is a primitive', () => {
    expect(resolvePath(source, 'atencion.edad.anything')).toBeUndefined();
  });
});

describe('renderTemplate', () => {
  it('renders text tokens with HTML escaping', () => {
    const html = '<p>{{text:empresa}}</p>';
    const manifest = {
      empresa: { kind: 'text', path: 'entrevista.datosGenerales.empresa' },
    };
    expect(renderTemplate(html, manifest, source, noImages)).toBe(
      '<p>ACME &amp; Sons &lt;CIA&gt;</p>',
    );
  });

  it('renders null/undefined paths as empty text', () => {
    const html = '[{{text:vacio}}]';
    const manifest = {
      vacio: { kind: 'text', path: 'entrevista.datosGenerales.area' },
    };
    const sourceSinArea = {
      ...source,
      entrevista: { ...entrevista, datosGenerales: { ...entrevista.datosGenerales, area: null as unknown as string } },
    };
    expect(renderTemplate(html, manifest, sourceSinArea, noImages)).toBe('[]');
    expect(
      renderTemplate(html, { vacio: { kind: 'text', path: 'evaluacion.fechaEvaluacion' } }, source, noImages),
    ).toBe('[]');
  });

  it('renders numeric values as strings', () => {
    const html = '{{text:edad}}';
    const manifest = { edad: { kind: 'text', path: 'entrevista.datosGenerales.edad' } };
    expect(renderTemplate(html, manifest, source, noImages)).toBe('35');
  });

  it('renders deterministic checks from boolean values', () => {
    const html = '<input type="checkbox" {{check:hombro_dolor_movimiento_dx}}>|<input type="checkbox" {{check:hombro_dolor_movimiento_ix}}>';
    const manifest = {
      hombro_dolor_movimiento_dx: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.dolorMovimiento.dx' },
      hombro_dolor_movimiento_ix: { kind: 'check', path: 'entrevista.miembrosSuperiores.hombro.sintomas.dolorMovimiento.ix' },
    };
    expect(renderTemplate(html, manifest, source, noImages)).toBe(
      '<input type="checkbox" checked>|<input type="checkbox" >',
    );
  });

  it('renders checks with an explicit match value (radio semantics)', () => {
    const html = '<input name="sexo" value="M" {{check:sexo_m}}><input name="sexo" value="F" {{check:sexo_f}}>';
    const manifest = {
      sexo_m: { kind: 'check', path: 'entrevista.datosGenerales.sexo', match: 'M' },
      sexo_f: { kind: 'check', path: 'entrevista.datosGenerales.sexo', match: 'F' },
    };
    expect(renderTemplate(html, manifest, source, noImages)).toBe(
      '<input name="sexo" value="M" checked><input name="sexo" value="F" >',
    );
  });

  it('renders figure tokens as data-URI images when resolvable', () => {
    const html = '{{figure:hombro}}';
    const manifest = { hombro: { kind: 'figure', path: 'musculoesqueletica-pdf/assets/hombro.png' } };
    const images = (p: string) => (p === 'musculoesqueletica-pdf/assets/hombro.png' ? 'data:image/png;base64,QUFB' : null);
    expect(renderTemplate(html, manifest, source, images)).toBe(
      '<img src="data:image/png;base64,QUFB" alt="" data-figure>',
    );
  });

  it('renders image tokens as plain data-URI images', () => {
    const html = '{{image:firma}}';
    const manifest = { firma: { kind: 'image', path: 'musculoesqueletica-pdf/assets/firma.png' } };
    const images = (p: string) => (p === 'musculoesqueletica-pdf/assets/firma.png' ? 'data:image/png;base64,QkI=' : null);
    expect(renderTemplate(html, manifest, source, images)).toBe(
      '<img src="data:image/png;base64,QkI=" alt="">',
    );
  });

  it('renders figure/image tokens blank when the image cannot be resolved', () => {
    const html = '[{{figure:hombro}}][{{image:firma}}]';
    const manifest = {
      hombro: { kind: 'figure', path: 'musculoesqueletica-pdf/assets/hombro.png' },
      firma: { kind: 'image', path: 'musculoesqueletica-pdf/assets/firma.png' },
    };
    expect(renderTemplate(html, manifest, source, noImages)).toBe('[][]');
  });

  it('throws TemplateError for unknown token kinds', () => {
    const html = '{{wat:entrevista.datosGenerales.empresa}}';
    expect(() => renderTemplate(html, {}, source, noImages)).toThrow(TemplateError);
  });

  it('throws TemplateError for tokens missing from the manifest', () => {
    const html = '{{text:no_mappeado}}';
    expect(() => renderTemplate(html, {}, source, noImages)).toThrow(TemplateError);
  });

  it('leaves HTML without tokens unchanged', () => {
    const html = '<h1>Evaluación de Miembros Superiores</h1>';
    expect(renderTemplate(html, {}, source, noImages)).toBe(html);
  });
});