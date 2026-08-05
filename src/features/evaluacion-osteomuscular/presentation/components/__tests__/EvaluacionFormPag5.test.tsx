import { describe, it, afterEach, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AtencionDetalle } from '@/types/jjc';
import {
  EvaluacionOsteomuscularProvider,
  useEvaluacionContext,
} from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { EvaluacionFormPag5 } from '../EvaluacionFormPag5';

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
  const c = state.evaluacionMotilidad.columnaCervical.presenciaDolorMovimiento;
  const dl = state.evaluacionMotilidad.columnaDorsoLumbar.presenciaDolorMovimiento;
  const l = state.maniobraLasegueRetraccionIsquioCrural;
  const w = state.maniobraWassermanRetraccionIleopsoas;
  const text = JSON.stringify({
    c,
    dl,
    ln: l.lasegueSlr.normal,
    ld: l.lasegueSlr.dx,
    li: l.lasegueSlr.ix,
    lo: l.lasegueSlr.observacion,
    lr: l.presenciaRetraccionIsquioCrural,
    wd: w.wassermanLasegueInvertido.dx,
    wi: w.wassermanLasegueInvertido.ix,
    wo: w.wassermanLasegueInvertido.observacion,
    wr: w.presenciaRetraccionIleopsoas,
    diag: state.aproximacionDiagnosticaEvaluacion,
  });
  return <output data-testid="pg5-probe">{text}</output>;
}

function renderPag5() {
  return render(
    <EvaluacionOsteomuscularProvider idAtencion={ATENCION.idAtencion} atencion={ATENCION}>
      <EvaluacionFormPag5 />
      <StateProbe />
    </EvaluacionOsteomuscularProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('EvaluacionFormPag5 — réplica de __temp__/page9.html (motilidad y maniobras especiales)', () => {
  it('renders the full page 5 printed ficha with local anatomical images only, no remote image', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderPag5();
    expect(screen.getByText(/C\) EVALUACION DE LA MOTILIDAD/i)).toBeInTheDocument();
    expect(screen.getByText('COLUMNA CERVICAL')).toBeInTheDocument();
    expect(screen.getByText('COLUMNA DORSO LUMBAR')).toBeInTheDocument();
    expect(screen.getByText(/D\) MANIOBRA DE LASEGUE/i)).toBeInTheDocument();
    expect(screen.getByText(/E\) MANIOBRA DE WASSERMAN/i)).toBeInTheDocument();
    expect(screen.getByText(/APROXIMACION DIAGNOSTICA DE LA EVALUACION/i)).toBeInTheDocument();
    expect(screen.getByText('NOMBRE Y APELLIDOS')).toBeInTheDocument();
    expect(screen.getByText('FECHA.')).toBeInTheDocument();
    expect(screen.getByText(/Fo\. JJC-SIG-13-31/i)).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(19);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getByAltText('Maniobra de Lasègue o elevación de la pierna recta')).toBeInTheDocument();
    expect(screen.getByAltText('Maniobra de Wasserman o Lasègue invertido')).toBeInTheDocument();
    expect(document.querySelector('img[src^="http"]')).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('binds motilidad checkboxes to the exact JSON paths', async () => {
    const user = userEvent.setup();
    renderPag5();
    const probe = screen.getByTestId('pg5-probe');

    await user.click(screen.getByRole('checkbox', { name: /FLEXION cervical/i }));
    await user.click(screen.getByRole('checkbox', { name: /ROT\. IX dorso lumbar/i }));
    await user.click(screen.getByRole('checkbox', { name: /EXTENSION dorso lumbar/i }));
    expect(probe).toHaveTextContent(
      '"c":{"flexion":true,"extension":false,"inclinacionDx":false,"inclinacionIx":false,"rotacionDx":false,"rotacionIx":false},"dl":{"flexion":false,"extension":true,"inclinacionDx":false,"inclinacionIx":false,"rotacionDx":false,"rotacionIx":true}',
    );
  });

  it('toggles Lasègue options as independent checkboxes bound to their paths', async () => {
    const user = userEvent.setup();
    renderPag5();
    const probe = screen.getByTestId('pg5-probe');

    await user.click(screen.getByRole('checkbox', { name: 'Lasègue normal' }));
    expect(probe).toHaveTextContent('"ln":true,"ld":false,"li":false');

    await user.click(screen.getByRole('checkbox', { name: 'Lasègue derecho' }));
    expect(probe).toHaveTextContent('"ln":true,"ld":true,"li":false');
  });

  it('toggles Wasserman options as independent checkboxes bound to their paths', async () => {
    const user = userEvent.setup();
    renderPag5();
    const probe = screen.getByTestId('pg5-probe');

    await user.click(screen.getByRole('checkbox', { name: 'Wasserman izquierdo' }));
    expect(probe).toHaveTextContent('"wd":false,"wi":true');

    await user.click(screen.getByRole('checkbox', { name: 'Wasserman derecho' }));
    expect(probe).toHaveTextContent('"wd":true,"wi":true');
  });

  it('toggles retraccion checkboxes and binds them to their paths', async () => {
    const user = userEvent.setup();
    renderPag5();
    const probe = screen.getByTestId('pg5-probe');

    await user.click(screen.getByRole('checkbox', { name: /retracción isquio crural/i }));
    await user.click(screen.getByRole('checkbox', { name: /retracción ileopsoas/i }));
    expect(probe).toHaveTextContent('"lr":true');
    expect(probe).toHaveTextContent('"wr":true');
  });

  it('types observaciones and diagnostic text into the exact string paths', async () => {
    const user = userEvent.setup();
    renderPag5();
    const probe = screen.getByTestId('pg5-probe');

    await user.type(screen.getByRole('textbox', { name: /observación lasègue/i }), 'Dolor en raíz L5');
    await user.type(screen.getByRole('textbox', { name: /observación wasserman/i }), 'Hiperextensión dolorosa');
    await user.type(screen.getByRole('textbox', { name: /aproximación diagnóstica/i }), 'Lumbalgia mecánica');

    expect(probe).toHaveTextContent('"lo":"Dolor en raíz L5"');
    expect(probe).toHaveTextContent('"wo":"Hiperextensión dolorosa"');
    expect(probe).toHaveTextContent('"diag":"Lumbalgia mecánica"');
  });
});
