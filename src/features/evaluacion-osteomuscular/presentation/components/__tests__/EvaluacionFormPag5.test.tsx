import { describe, it, afterEach, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

describe('EvaluacionFormPag5 — motilidad y maniobras especiales', () => {
  it('renders the full page 5 with local placeholders only, no remote image', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderPag5();
    expect(screen.getAllByRole('checkbox')).toHaveLength(14);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: /aproximación diagnóstica/i })).toBeInTheDocument();
    expect(document.querySelector('img[src^="http"]')).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('binds motilidad checkboxes to the exact JSON paths', async () => {
    const user = userEvent.setup();
    renderPag5();
    const probe = screen.getByTestId('pg5-probe');
    const cervical = within(screen.getByRole('group', { name: /columna cervical/i }));
    const dorso = within(screen.getByRole('group', { name: /dorso lumbar/i }));

    await user.click(cervical.getByRole('checkbox', { name: 'Flexión' }));
    expect(probe).toHaveTextContent(
      '"c":{"flexion":true,"extension":false,"inclinacionDx":false,"inclinacionIx":false,"rotacionDx":false,"rotacionIx":false},"dl":{"flexion":false,"extension":false,"inclinacionDx":false,"inclinacionIx":false,"rotacionDx":false,"rotacionIx":false}',
    );

    await user.click(dorso.getByRole('checkbox', { name: 'Rotación Ix' }));
    await user.click(dorso.getByRole('checkbox', { name: 'Extensión' }));
    expect(probe).toHaveTextContent(
      '"c":{"flexion":true,"extension":false,"inclinacionDx":false,"inclinacionIx":false,"rotacionDx":false,"rotacionIx":false},"dl":{"flexion":false,"extension":true,"inclinacionDx":false,"inclinacionIx":false,"rotacionDx":false,"rotacionIx":true}',
    );
  });

  it('selecting a Lasègue radio marks that option and clears the others', async () => {
    const user = userEvent.setup();
    renderPag5();
    const probe = screen.getByTestId('pg5-probe');

    await user.click(screen.getByRole('radio', { name: 'Lasègue Derecho Dx' }));
    expect(probe).toHaveTextContent('"ln":false,"ld":true,"li":false');

    await user.click(screen.getByRole('radio', { name: 'Lasègue Normal' }));
    expect(probe).toHaveTextContent('"ln":true,"ld":false,"li":false');
  });

  it('selecting a Wasserman radio marks that option and clears the other', async () => {
    const user = userEvent.setup();
    renderPag5();
    const probe = screen.getByTestId('pg5-probe');

    await user.click(screen.getByRole('radio', { name: 'Wasserman Izquierdo Ix' }));
    expect(probe).toHaveTextContent('"wd":false,"wi":true');

    await user.click(screen.getByRole('radio', { name: 'Wasserman Derecho Dx' }));
    expect(probe).toHaveTextContent('"wd":true,"wi":false');
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
    const lasegueGroup = within(screen.getByRole('group', { name: /lasègue/i }));
    const wassermanGroup = within(screen.getByRole('group', { name: /wasserman/i }));

    await user.type(lasegueGroup.getByRole('textbox', { name: /observación lasègue/i }), 'Dolor en raíz L5');
    await user.type(wassermanGroup.getByRole('textbox', { name: /observación wasserman/i }), 'Hiperextensión dolorosa');
    await user.type(screen.getByRole('textbox', { name: /aproximación diagnóstica/i }), 'Lumbalgia mecánica');

    expect(probe).toHaveTextContent('"lo":"Dolor en raíz L5"');
    expect(probe).toHaveTextContent('"wo":"Hiperextensión dolorosa"');
    expect(probe).toHaveTextContent('"diag":"Lumbalgia mecánica"');
  });
});
