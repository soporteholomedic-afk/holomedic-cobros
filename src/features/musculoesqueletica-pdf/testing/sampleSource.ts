import type { AtencionDetalle } from '@/types/jjc';
import type { EntrevistaOsteomuscular } from '@/types/entrevista-osteomuscular';
import type { EvaluacionOsteomuscular } from '@/types/evaluacion-osteomuscular';
import { initialEvaluacionState } from '@/features/evaluacion-osteomuscular/presentation/hooks/useEvaluacionOsteomuscular';
import type { PdfSourceData } from '../domain/entities';

/** Shared sample data used by renderer and page-manifest tests. */
export const sampleAtencion: AtencionDetalle = {
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

export const sampleEntrevista: EntrevistaOsteomuscular = {
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
      areaDistribucionAnotaciones: [
        { id: 'm1', x: 0.25, y: 0.5 },
        { id: 'm2', x: 0.75, y: 0.3 },
      ],
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
    areaDistribucionAnotaciones: [
      { id: 'pn1', x: 0.2, y: 0.4 },
      { id: 'pn2', x: 0.8, y: 0.6 },
    ],
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
    areaDistribucionAnotaciones: [
      { id: 'pd1', x: 0.5, y: 0.3 },
    ],
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
    areaDistribucionAnotaciones: {
      cervical: [{ id: 'cc1', x: 0.5, y: 0.5 }],
      dorsalLumboSacra: [{ id: 'cd1', x: 0.3, y: 0.7 }, { id: 'cd2', x: 0.6, y: 0.2 }],
    },
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

export const sampleEvaluacion: EvaluacionOsteomuscular | null = null;

/** A fully populated evaluation for pipeline tests that require the dataset. */
export const sampleEvaluacionFull: EvaluacionOsteomuscular =
  initialEvaluacionState(sampleAtencion);

export const sampleSource: PdfSourceData = {
  atencion: sampleAtencion,
  entrevista: sampleEntrevista,
  evaluacion: sampleEvaluacion,
};

/**
 * Resolver that serves a fake data URI for assets under the allowed roots:
 * the canonical repo figures (`assets/images/musculo/...`) and the feature's
 * own offline root (`musculoesqueletica-pdf/assets/...`).
 */
export function sampleImageResolver(assetPath: string): string | null {
  const underCanonical = assetPath.startsWith('assets/images/');
  const underFeatureRoot = assetPath.startsWith('musculoesqueletica-pdf/assets/');
  if (!underCanonical && !underFeatureRoot) return null;
  const mime = assetPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  return `data:${mime};base64,${Buffer.from(assetPath).toString('base64')}`;
}