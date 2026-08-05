import { describe, it, afterEach, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AtencionDetalle } from '@/types/jjc';
import {
  EvaluacionOsteomuscularProvider,
  useEvaluacionContext,
} from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { EvaluacionFormPag1 } from '../EvaluacionFormPag1';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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

function StateProbe() {
  const { state } = useEvaluacionContext();
  const esc = state.evaluacionClinicaOsteomuscular.miembrosSuperiores.escapuloHumeral;
  const codo = state.evaluacionClinicaOsteomuscular.miembrosSuperiores.codo;
  const text = JSON.stringify({
    escRealiza: esc.realizaManiobras,
    escMolestiaDx: esc.molestiaHombroDxDesdeMeses,
    escPalpacion: esc.palpacionHombro,
    escMovilidad: esc.movilidadPresenciaDolor,
    escArco: esc.arcoDoloroso,
    escBiceps: esc.testTendinitisTendonLargoBiceps,
    escInstrumental: esc.examenInstrumental,
    escGravedad: esc.gravedadPatologiaHombro,
    codoRealiza: codo.realizaManiobras,
    codoMolestiaDx: codo.molestiaCodoDxDesdeMeses,
    codoSitio: codo.observacionInspeccion.sitio,
    codoEdemaLocalizado: codo.observacionInspeccion.edemaLocalizado,
    codoEpicondilo: codo.palpacion.dolorEpicondilo,
  });
  return <output data-testid="pg1-probe">{text}</output>;
}

function renderPag1() {
  return render(
    <EvaluacionOsteomuscularProvider idAtencion={ATENCION.idAtencion} atencion={ATENCION}>
      <EvaluacionFormPag1 />
      <StateProbe />
    </EvaluacionOsteomuscularProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('EvaluacionFormPag1 — réplica de __temp__/page5.html', () => {
  it('renders the printed-ficha layout with banner, sections and local anatomical images', () => {
    renderPag1();
    expect(screen.getByText(/EVALUACION CLINICA OSTEMUSCULAR/i)).toBeInTheDocument();
    expect(screen.getByText(/I\.- MIEMBROS SUPERIORES/i)).toBeInTheDocument();
    expect(screen.getByText(/a\) ESCAPULO HUMERAL/i)).toBeInTheDocument();
    expect(screen.getByText(/PALPACIÓN HOMBRO/i)).toBeInTheDocument();
    expect(screen.getByText(/EVALUACIÓN DE LA MOVILIDAD/i)).toBeInTheDocument();
    expect(screen.getByText(/ARCO DOLOROSO/i)).toBeInTheDocument();
    expect(screen.getByText(/TEST TENDINITIS TENDÓN LARGO DE BÍCEPS/i)).toBeInTheDocument();
    expect(screen.getByText(/b\) CODO/i)).toBeInTheDocument();
    expect(screen.getByText(/OBSERVACIÓN, INSPECCIÓN/i)).toBeInTheDocument();
    expect(screen.getByText(/PALPACIÓN EPICÓNDILO/i)).toBeInTheDocument();
    expect(screen.getByText(/Dx\. = Derecho/)).toBeInTheDocument();
    expect(screen.getByText(/Fo\. JJC-SIG-13-31/i)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(36);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getAllByRole('textbox')).toHaveLength(5);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(4);
    expect(screen.getAllByRole('img')).toHaveLength(7);
    expect(screen.getByAltText('Maniobra de flexión del hombro')).toBeInTheDocument();
    expect(screen.getByAltText('Palpación del codo')).toBeInTheDocument();
  });

  it('binds escapulo humeral fields to their exact state paths', async () => {
    const user = userEvent.setup();
    renderPag1();
    const probe = screen.getByTestId('pg1-probe');

    await user.click(screen.getAllByRole('checkbox', { name: 'SI' })[0]);
    expect(probe).toHaveTextContent('"escRealiza":true');

    await user.type(screen.getByRole('spinbutton', { name: 'Molestia hombro Dx desde meses' }), '6');
    expect(probe).toHaveTextContent('"escMolestiaDx":6');

    await user.click(screen.getByRole('checkbox', { name: 'PRESENTE Dx' }));
    expect(probe).toHaveTextContent('"escArco":{"presenteDx":true,"presenteIx":false,"ausente":false}');

    await user.click(screen.getByRole('checkbox', { name: 'DOLOR AUSENTE' }));
    expect(probe).toHaveTextContent('"escBiceps":{"dolorAusente":true');

    await user.click(screen.getByRole('checkbox', { name: 'NO' }));
    expect(probe).toHaveTextContent('"noRealizo":true');

    await user.click(screen.getByRole('checkbox', { name: 'ECOGRAFÍA' }));
    await user.type(screen.getByRole('textbox', { name: 'Año ecografía' }), '2024');
    expect(probe).toHaveTextContent('"ecografia":{"realiza":true,"ano":"2024"');

    await user.type(
      screen.getByRole('textbox', { name: 'Otros exámenes instrumentales' }),
      'TAC 2023',
    );
    expect(probe).toHaveTextContent('"otros":"TAC 2023"');

    await user.click(screen.getByRole('radio', { name: 'GRAVE' }));
    expect(probe).toHaveTextContent('"escGravedad":"GRAVE"');
  });

  it('binds codo fields to their exact state paths', async () => {
    const user = userEvent.setup();
    renderPag1();
    const probe = screen.getByTestId('pg1-probe');

    await user.click(screen.getAllByRole('checkbox', { name: 'SI' })[1]);
    expect(probe).toHaveTextContent('"codoRealiza":true');

    await user.type(screen.getByRole('spinbutton', { name: 'Molestia codo Dx desde meses' }), '3');
    expect(probe).toHaveTextContent('"codoMolestiaDx":3');

    await user.type(screen.getByPlaceholderText('Sitio'), 'codo derecho');
    expect(probe).toHaveTextContent('"codoSitio":"codo derecho"');

    await user.click(screen.getByRole('checkbox', { name: 'Dolor epicóndilo Dx' }));
    expect(probe).toHaveTextContent('"codoEpicondilo":{"dx":true,"ix":false}');
  });
});
