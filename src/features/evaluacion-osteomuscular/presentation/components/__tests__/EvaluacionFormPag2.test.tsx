import { describe, it, afterEach, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AtencionDetalle } from '@/types/jjc';
import {
  EvaluacionOsteomuscularProvider,
  useEvaluacionContext,
} from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { EvaluacionFormPag2 } from '../EvaluacionFormPag2';

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
  const codo = state.evaluacionClinicaOsteomuscular.miembrosSuperiores.codo;
  const muneca = state.evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano;
  const text = JSON.stringify({
    codoEpi: codo.palpacionEpicondileoEpitroclear,
    codoEpicondilitis: codo.testEpicondilitis,
    codoInstrumental: codo.examenInstrumental,
    codoGravedad: codo.gravedadPatologiaCodo,
    munecaRealiza: muneca.realizaManiobras,
    munecaMolestiaDx: muneca.molestiaMunecaDxDesdeMeses,
    munecaQuiste: muneca.observacionManoMuneca.quisteDorsal,
    munecaEdema: muneca.observacionManoMuneca.edemaVentralEstiloideRadial,
    munecaHipotrofia: muneca.observacionManoMuneca.hipotrofiaPosterior,
    munecaTrapecio: muneca.palpacion.dolorArticulacionTrapecioMetacarpal,
    munecaClicDx: muneca.maniobraClicDedosGatillo.clicExtensionDedos.dx,
  });
  return <output data-testid="pg2-probe">{text}</output>;
}

function renderPag2() {
  return render(
    <EvaluacionOsteomuscularProvider idAtencion={ATENCION.idAtencion} atencion={ATENCION}>
      <EvaluacionFormPag2 />
      <StateProbe />
    </EvaluacionOsteomuscularProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('EvaluacionFormPag2 — réplica de __temp__/page6.html', () => {
  it('renders the printed-ficha layout with sections and visual placeholders', () => {
    renderPag2();
    expect(screen.getByText(/PALPACION MUSCULO EPICÓNDILEO - EPITRÓCLEAR/i)).toBeInTheDocument();
    expect(screen.getByText(/SE EFECTÚA A 2 CM DEL EPICÓNDILO/i)).toBeInTheDocument();
    expect(screen.getByText(/TEST PARA EPICONDILITIS/i)).toBeInTheDocument();
    expect(screen.getByText(/TEST PARA ATRAPAMIENTO N\. ULNAR EN EL CODO/i)).toBeInTheDocument();
    expect(screen.getByText(/Examen instrumental:/i)).toBeInTheDocument();
    expect(screen.getByText(/GRAVEDAD PATOLOGÍA DEL CODO/i)).toBeInTheDocument();
    expect(screen.getByText(/c\) MUÑECA - MANO/i)).toBeInTheDocument();
    expect(screen.getByText(/OBSERVACIÓN MANO\/MUÑECA/i)).toBeInTheDocument();
    expect(screen.getByText('PALPACIÓN')).toBeInTheDocument();
    expect(screen.getByText(/MANIOBRA PARA CLIC/i)).toBeInTheDocument();
    expect(screen.getByText('[Gráfico Palpación]')).toBeInTheDocument();
    expect(screen.getByText('[Gráfico Extensión Codo]')).toBeInTheDocument();
    expect(screen.getByText('[Gráfico Nervio Ulnar]')).toBeInTheDocument();
    expect(screen.getByText(/Esquema Mano/)).toBeInTheDocument();
    expect(screen.getByText('[Gráfico Dedo]')).toBeInTheDocument();
    expect(screen.getByText(/Dx\.= Derecho/)).toBeInTheDocument();
    expect(screen.getByText(/Fo\. JJC-SIGLA-13-31/i)).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(41);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(5);
  });

  it('binds codo continuation fields to their exact state paths', async () => {
    const user = userEvent.setup();
    renderPag2();
    const probe = screen.getByTestId('pg2-probe');

    await user.click(screen.getByRole('checkbox', { name: 'Dolor músculo epicóndilo Dx' }));
    expect(probe).toHaveTextContent(
      '"codoEpi":{"dolorMusculoEpicondileo":{"dx":true,"ix":false},"dolorMusculoEpitroclear":{"dx":false,"ix":false}}',
    );

    await user.click(
      screen.getByRole('checkbox', { name: 'Presencia de dolor lateral en el codo Ix' }),
    );
    expect(probe).toHaveTextContent('"codoEpicondilitis":{"presenciaDolorLateralCodo":{"dx":false,"ix":true}}');

    await user.click(screen.getByRole('checkbox', { name: 'NO' }));
    expect(probe).toHaveTextContent('"noRealizado":true');

    await user.type(screen.getByRole('spinbutton', { name: 'Año ecografía codo' }), '2023');
    expect(probe).toHaveTextContent('"ecografiaAno":2023');

    await user.click(screen.getByRole('radio', { name: 'GRAVE' }));
    expect(probe).toHaveTextContent('"codoGravedad":"GRAVE"');
  });

  it('binds muneca/mano fields to their exact state paths', async () => {
    const user = userEvent.setup();
    renderPag2();
    const probe = screen.getByTestId('pg2-probe');

    await user.click(screen.getByRole('checkbox', { name: 'SI' }));
    expect(probe).toHaveTextContent('"munecaRealiza":true');

    await user.type(screen.getByRole('spinbutton', { name: 'Molestia muñeca Dx desde meses' }), '9');
    expect(probe).toHaveTextContent('"munecaMolestiaDx":9');

    await user.click(screen.getByRole('checkbox', { name: 'Quiste dorsal Ix' }));
    expect(probe).toHaveTextContent('"munecaQuiste":{"dx":false,"ix":true}');

    await user.click(screen.getByRole('checkbox', { name: 'Hipotrofia posterior Dx' }));
    expect(probe).toHaveTextContent('"munecaHipotrofia":{"dx":true,"ix":false}');

    await user.click(
      screen.getByRole('checkbox', { name: /trapecio.*Dx\./i }),
    );
    expect(probe).toHaveTextContent('"munecaTrapecio":{"dx":true,"ix":false}');

    await user.click(screen.getAllByRole('checkbox', { name: '3°' })[0]);
    expect(probe).toHaveTextContent('"munecaClicDx":{"dedo1":false,"dedo2":false,"dedo3":true,"dedo4":false,"dedo5":false}');
  });
});
