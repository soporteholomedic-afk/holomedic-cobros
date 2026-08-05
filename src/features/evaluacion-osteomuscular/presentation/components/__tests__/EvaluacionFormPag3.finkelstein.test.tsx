import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AtencionDetalle } from '@/types/jjc';
import type { DxIxBool } from '@/types/evaluacion-osteomuscular';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
import {
  EvaluacionOsteomuscularProvider,
  useEvaluacionContext,
} from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';
import { EvaluacionFormPag3 } from '../EvaluacionFormPag3';

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

const bit = (d: DxIxBool) => (d.dx ? '1' : '0') + (d.ix ? '1' : '0');

function StateProbe() {
  const { state } = useEvaluacionContext();
  const m = state.evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano;
  const text = [
    `f:${bit(m.finkelstein.dolorTabaqueraAnatomica)}`,
    `fc:${bit(m.flexoExtensionMuneca.dolorFlexionContraResistencia)}`,
    `fp:${bit(m.flexoExtensionMuneca.dolorFlexionPasiva)}`,
    `ec:${bit(m.flexoExtensionMuneca.dolorExtensionContraResistencia)}`,
    `ep:${bit(m.flexoExtensionMuneca.dolorExtensionPasiva)}`,
    `eo:${m.flexoExtensionMuneca.otros}`,
  ].join(' ');
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

describe('EvaluacionFormPag3 — réplica de __temp__/page7.html (Finkelstein + flexo-extensión)', () => {
  it('renders the printed-ficha layout (41 checkboxes) with local anatomical images and no remote image URL', () => {
    renderPag3();
    expect(screen.getByText(/^FINKELSTEIN/)).toBeInTheDocument();
    expect(screen.getByText(/^FLEXO-EXTENSIÓN DE LA MUÑECA/)).toBeInTheDocument();
    expect(screen.getByAltText('Test de Finkelstein')).toBeInTheDocument();
    expect(screen.getByAltText('Flexo-extensión pasiva y contra resistencia de la muñeca')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(6);
    expect(screen.getAllByRole('checkbox')).toHaveLength(41);
    expect(document.querySelector('img[src^="http"]')).toBeNull();
  });

  it('toggles Finkelstein dolor en tabaquera anatómica Dx/Ix through shared state, persisted on rerender', async () => {
    const user = userEvent.setup();
    renderPag3();
    const probe = screen.getByTestId('muneca-probe');
    expect(probe).toHaveTextContent('f:00 fc:00 fp:00 ec:00 ep:00');
    await user.click(screen.getByRole('checkbox', { name: 'Tabaquera anatómica Dx' }));
    expect(probe).toHaveTextContent('f:10 fc:00 fp:00 ec:00 ep:00');
    expect(screen.getByRole('checkbox', { name: 'Tabaquera anatómica Dx' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Tabaquera anatómica Ix' }));
    expect(probe).toHaveTextContent('f:11 fc:00 fp:00 ec:00 ep:00');
    expect(screen.getByRole('checkbox', { name: 'Tabaquera anatómica Ix' })).toBeChecked();
  });

  it('changes only the touched flexo-extension pair, preserving the other three pairs', async () => {
    const user = userEvent.setup();
    renderPag3();
    const probe = screen.getByTestId('muneca-probe');
    await user.click(screen.getByRole('checkbox', { name: 'Dolor en extensión c/r Ix' }));
    expect(probe).toHaveTextContent('f:00 fc:00 fp:00 ec:01 ep:00');
    await user.click(screen.getByRole('checkbox', { name: 'Dolor en flexión pasiva Dx' }));
    expect(probe).toHaveTextContent('f:00 fc:00 fp:10 ec:01 ep:00');

    await user.type(
      screen.getByRole('textbox', { name: 'Otros flexo-extensión muñeca' }),
      'dolor al supinar',
    );
    expect(probe).toHaveTextContent('eo:dolor al supinar');
  });
});
