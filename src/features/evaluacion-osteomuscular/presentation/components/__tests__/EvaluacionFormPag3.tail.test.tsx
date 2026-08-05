import { describe, it, afterEach, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AtencionDetalle } from '@/types/jjc';
import {
  EvaluacionOsteomuscularProvider,
  useEvaluacionContext,
} from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { EvaluacionFormPag3 } from '../EvaluacionFormPag3';
import { parseOptionalNumber } from '../../helpers/parseOptionalNumber';

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
  const m = state.evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano;
  const s = m.sintomatologiaParestesica;
  const e = s.examenInstrumental;
  const px = s.regionProximal;
  const dst = s.regionDistal;
  const text = JSON.stringify({
    rm: m.realizaManiobras, md: m.molestiaMunecaDxDesdeMeses, mi: m.molestiaMunecaIxDesdeMeses,
    pp: [px.dolorPresionPalpacion.apofisisEspinosa, px.dolorPresionPalpacion.mTrapecioSuperior, px.dolorPresionPalpacion.mParavertebral],
    pm: [px.dolorMovimiento.flexion, px.dolorMovimiento.extension, px.dolorMovimiento.inclinacionDerecha, px.dolorMovimiento.inclinacionIzquierda, px.dolorMovimiento.rotacionDerecha, px.dolorMovimiento.rotacionIzquierda],
    fat: px.testFatiga.parestesia, can: px.testCandelero.parestesia,
    phm: dst.testPhalen.parestesia.nervioMediano, phu: dst.testPhalen.parestesia.nervioUlnar, phn: dst.testPhalen.parestesia.noTerritorializada,
    prm: dst.testPresion.parestesia.nervioMediano, pru: dst.testPresion.parestesia.nervioUlnar, prn: dst.testPresion.parestesia.noTerritorializada,
    nr: e.noRealizado, eco: [e.ecografia, e.ecografiaAno], rx: [e.rx, e.rxAno], rmn: [e.rmn, e.rmnAno], emg: [e.emg, e.emgAno],
    g: s.gravedadPatologiaManoMuneca, diag: s.aproximacionDiagnosticaEvaluacion,
    ppOtros: px.dolorPresionPalpacion.otros,
  });
  return <output data-testid="muneca-probe">{text}</output>;
}

function renderPag3() {
  return render(
    <EvaluacionOsteomuscularProvider idAtencion={ATENCION.idAtencion} atencion={ATENCION}>
      <EvaluacionFormPag3 />
      <StateProbe />
    </EvaluacionOsteomuscularProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('EvaluacionFormPag3 — réplica de __temp__/page7.html (parestesia + instrumental + diagnóstico)', () => {
  it('renders the full printed ficha with local anatomical images, no remote image and only the hydration GET', () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: null }), { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderPag3();
    expect(screen.getByText(/d\) SINTOMATOLOGÍA PARESTESICA/i)).toBeInTheDocument();
    expect(screen.getByText('REGIÓN PROXIMAL')).toBeInTheDocument();
    expect(screen.getByText('REGION DISTAL')).toBeInTheDocument();
    expect(screen.getByText('TEST DE PHALEN')).toBeInTheDocument();
    expect(screen.getByText('TEST DE PRESION')).toBeInTheDocument();
    expect(screen.getByAltText('Test de fatiga con brazos elevados')).toBeInTheDocument();
    expect(screen.getByAltText('Test del candelero')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(6);
    expect(screen.getByText(/APROXIMACION DIAGNOSTICA DE EVALUACION/i)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(41);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(6);
    expect(screen.getByRole('textbox', { name: /aproximación diagnóstica/i })).toBeInTheDocument();
    expect(document.querySelector('img[src^="http"]')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/areas/musculoesqueletica/jjc/evaluacion'),
    );
  });

  it('binds the paresthesia maneuver and wrist-month controls to the existing single-source paths', async () => {
    const user = userEvent.setup();
    renderPag3();
    const probe = screen.getByTestId('muneca-probe');
    await user.click(screen.getByRole('checkbox', { name: 'SI' }));
    await user.type(screen.getByRole('spinbutton', { name: /molestia muñeca dx desde/i }), '12');
    expect(probe).toHaveTextContent('"rm":true,"md":12,"mi":null');
    await user.type(screen.getByRole('spinbutton', { name: /molestia muñeca ix desde/i }), '6');
    expect(probe).toHaveTextContent('"rm":true,"md":12,"mi":6');
  });

  it('updates the exact proximal and distal region paths (pressure, movement, fatiga/candelero, Phalen/pressure)', async () => {
    const user = userEvent.setup();
    renderPag3();
    const probe = screen.getByTestId('muneca-probe');
    await user.click(screen.getByRole('checkbox', { name: 'Apófisis Espinosa' }));
    await user.click(screen.getByRole('checkbox', { name: 'M. Paravertebral' }));
    await user.click(screen.getByRole('checkbox', { name: 'Extensión' }));
    await user.click(screen.getByRole('checkbox', { name: 'Rotación Derecha' }));
    expect(probe).toHaveTextContent('"pp":[true,false,true],"pm":[false,true,false,false,true,false]');
    await user.type(
      screen.getByRole('textbox', { name: 'Otros dolor presión palpación región proximal' }),
      'dolor escapular',
    );
    expect(probe).toHaveTextContent('"ppOtros":"dolor escapular"');
    await user.click(screen.getByRole('checkbox', { name: 'Test de fatiga Dx' }));
    await user.click(screen.getByRole('checkbox', { name: 'Test de candelero Ix' }));
    expect(probe).toHaveTextContent('"fat":{"dx":true,"ix":false},"can":{"dx":false,"ix":true}');
    await user.click(screen.getByRole('checkbox', { name: 'Phalen nervio mediano Dx' }));
    await user.click(screen.getByRole('checkbox', { name: 'Phalen no territorializada Ix' }));
    expect(probe).toHaveTextContent('"phm":{"dx":true,"ix":false},"phu":{"dx":false,"ix":false},"phn":{"dx":false,"ix":true}');
    await user.click(screen.getByRole('checkbox', { name: 'Presión nervio ulnar Dx' }));
    expect(probe).toHaveTextContent('"pru":{"dx":true,"ix":false},"prn":{"dx":false,"ix":false}');
  });

  it('keeps every instrumental boolean/year pair and noRealizado independent; empty input maps to null', async () => {
    const user = userEvent.setup();
    renderPag3();
    const probe = screen.getByTestId('muneca-probe');
    expect(parseOptionalNumber('')).toBeNull();
    expect(parseOptionalNumber(' 2023 ')).toBe(2023);
    expect(probe).toHaveTextContent('"nr":false,"eco":[false,null],"rx":[false,null],"rmn":[false,null],"emg":[false,null]');
    await user.click(screen.getByRole('checkbox', { name: 'Ecografía' }));
    await user.type(screen.getByRole('spinbutton', { name: /año ecografía/i }), '2024');
    expect(probe).toHaveTextContent('"eco":[true,2024],"rx":[false,null],"rmn":[false,null],"emg":[false,null]');
    await user.click(screen.getByRole('checkbox', { name: 'NO' }));
    await user.click(screen.getByRole('checkbox', { name: 'RX' }));
    await user.type(screen.getByRole('spinbutton', { name: /año rx/i }), '2023');
    expect(probe).toHaveTextContent('"nr":true,"eco":[true,2024],"rx":[true,2023],"rmn":[false,null],"emg":[false,null]');
    await user.clear(screen.getByRole('spinbutton', { name: /año rx/i }));
    expect(probe).toHaveTextContent('"rx":[true,null],"rmn":[false,null],"emg":[false,null]');
  });

  it('writes severity radio and diagnostic approximation into the exact nested sintomatologiaParestesica paths', async () => {
    const user = userEvent.setup();
    renderPag3();
    const probe = screen.getByTestId('muneca-probe');
    await user.click(screen.getByRole('radio', { name: 'LEVE' }));
    expect(probe).toHaveTextContent('"g":"LEVE"');
    await user.click(screen.getByRole('radio', { name: 'GRAVE' }));
    expect(probe).toHaveTextContent('"g":"GRAVE"');
    await user.type(screen.getByRole('textbox', { name: /aproximación diagnóstica/i }), 'Síndrome de túnel carpiano derecho');
    expect(probe).toHaveTextContent('"diag":"Síndrome de túnel carpiano derecho"');
  });
});
