import { describe, it, afterEach, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AtencionDetalle } from '@/types/jjc';
import {
  EvaluacionOsteomuscularProvider,
  useEvaluacionContext,
} from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { EvaluacionFormPag4 } from '../EvaluacionFormPag4';

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
  const col = state.evaluacionColumna;
  const text = JSON.stringify({
    cif: col.observacion.cifosisDorsal,
    lor: col.observacion.lordosisLumbar,
    esc: col.observacion.presenciaEscoliosis,
    rit: col.observacion.ritmoLumboPelvico,
    dor: col.observacion.dorsoCurvoEstructuradoCifoEscoliosis,
    cer: col.maniobraPresoPalpacion.cervical,
    ds: col.maniobraPresoPalpacion.dorsal,
    lb: col.maniobraPresoPalpacion.lumbar,
  });
  return <output data-testid="pg4-probe">{text}</output>;
}

function renderPag4() {
  return render(
    <EvaluacionOsteomuscularProvider idAtencion={ATENCION.idAtencion} atencion={ATENCION}>
      <EvaluacionFormPag4 />
      <StateProbe />
    </EvaluacionOsteomuscularProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('EvaluacionFormPag4 — réplica de __temp__/page8.html (columna)', () => {
  it('renders the printed A4 ficha with sections, five local anatomical images and local controls', () => {
    renderPag4();
    expect(screen.getByText('II.- COLUMNA')).toBeInTheDocument();
    expect(screen.getByText(/Marcar "x" en los cuadraditos según corresponda\./i)).toBeInTheDocument();
    expect(screen.getByText('A) OBSERVACION')).toBeInTheDocument();
    expect(screen.getByText(/OBSERVACION RITMO LUMBO PELVICO:/i)).toBeInTheDocument();
    expect(screen.getByText(/DORSO CURVO ESTRUCTURADO CIFO ESCOLIOSIS/i)).toBeInTheDocument();
    expect(screen.getByText(/B\) MANIOBRA DE PRESO PALPACION/i)).toBeInTheDocument();
    expect(screen.getByText(/APOFISIS Y\/O ESPACIO INTERVERTEB\./)).toBeInTheDocument();
    expect(screen.getByText(/Fo\. JJC-SIG-13-31/i)).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(29);
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(screen.getAllByRole('img')).toHaveLength(5);
    expect(screen.getByAltText('Vista posterior de la columna completa')).toBeInTheDocument();
  });

  it('binds observacion fields to their exact evaluacionColumna paths', async () => {
    const user = userEvent.setup();
    renderPag4();
    const probe = screen.getByTestId('pg4-probe');

    await user.click(screen.getByRole('checkbox', { name: 'Cifosis dorsal hipercifosis' }));
    await user.click(screen.getByRole('checkbox', { name: 'Lordosis lumbar aplanamiento' }));
    expect(probe).toHaveTextContent(
      '"cif":{"normal":false,"hipercifosis":true,"aplanamientoCifosisDorsal":false},"lor":{"normal":false,"hipercifosis":false,"aplanamientoLordosisLumbar":true}',
    );

    await user.click(screen.getByRole('checkbox', { name: 'Escoliosis lumbar Ix' }));
    expect(probe).toHaveTextContent(
      '"esc":{"ausente":false,"dorsalDx":false,"dorsalIx":false,"lumbarDx":false,"lumbarIx":true}',
    );

    await user.click(screen.getByRole('checkbox', { name: 'Ritmo lumbo pélvico dolor lumbar' }));
    await user.click(
      screen.getByRole('checkbox', { name: 'Dorso curvo presencia de dorso curvo estructurado' }),
    );
    expect(probe).toHaveTextContent(
      '"rit":{"normal":false,"lordosisLumbarInmodificada":false,"dolorLumbar":true},"dor":{"normal":false,"presenciaDorsoCurvoEstructurado":true,"dolorDorsal":false}',
    );
  });

  it('binds maniobra preso palpacion fields, including nested cervical text inputs', async () => {
    const user = userEvent.setup();
    renderPag4();
    const probe = screen.getByTestId('pg4-probe');

    await user.click(screen.getByRole('checkbox', { name: 'Cervical dolor presente' }));
    await user.click(screen.getByRole('checkbox', { name: 'Cervical apófisis o espacio aplica' }));
    await user.type(screen.getByRole('textbox', { name: 'Cervical n° apófisis o espacio' }), 'C4');
    await user.click(screen.getByRole('checkbox', { name: 'Cervical segmento muscular aplica' }));
    await user.type(screen.getByRole('textbox', { name: 'Cervical detalle segmento muscular' }), 'paraespinal');
    expect(probe).toHaveTextContent(
      '"cer":{"dolorAusente":false,"dolorPresente":{"aplica":true,"apofisisEspacioIntervertebral":{"aplica":true,"numeroApofisisEspacio":"C4"},"segmentoMuscular":{"aplica":true,"detalle":"paraespinal"}}}',
    );

    await user.click(screen.getByRole('checkbox', { name: 'Dorsal dolor presente' }));
    await user.click(screen.getByRole('checkbox', { name: 'Dorsal segmento muscular' }));
    await user.click(screen.getByRole('checkbox', { name: 'Lumbar dolor ausente' }));
    expect(probe).toHaveTextContent(
      '"ds":{"dolorAusente":false,"dolorPresente":{"aplica":true,"apofisisEspacioIntervertebral":false,"segmentoMuscular":true}},"lb":{"dolorAusente":true',
    );
  });
});
