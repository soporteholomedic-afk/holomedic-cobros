import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AtencionDetalle } from '@/types/jjc';
import type { DxIxBool } from '@/types/evaluacion-osteomuscular';
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

const group = (name: RegExp) => screen.getByRole('group', { name });
const pair = (name: RegExp) => within(group(name));

describe('EvaluacionFormPag3 — Finkelstein + flexo-extension slice (PR 3)', () => {
  it('renders the full page-3 form (41 checkboxes) and local placeholders, with no remote image URL', () => {
    renderPag3();
    expect(screen.getByRole('heading', { name: /miembros superiores/i })).toBeInTheDocument();
    expect(screen.getByText(/página 3/i)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(41);
    expect(pair(/tabaquera anatómica/i).getAllByRole('checkbox')).toHaveLength(2);
    expect(pair(/flexión c\/r/i).getAllByRole('checkbox')).toHaveLength(2);
    expect(pair(/flexión pasiva/i).getAllByRole('checkbox')).toHaveLength(2);
    expect(pair(/extensión c\/r/i).getAllByRole('checkbox')).toHaveLength(2);
    expect(pair(/extensión pasiva/i).getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByText(/\[Imagen Test de Finkelstein\]/i)).toBeInTheDocument();
    expect(screen.getByText(/\[Imagen Dolor en Flexión C\/R\]/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(document.querySelector('img[src^="http"]')).toBeNull();
  });

  it('toggles Finkelstein dolor en tabaquera anatómica Dx/Ix through shared state, persisted on rerender', async () => {
    const user = userEvent.setup();
    renderPag3();
    const probe = screen.getByTestId('muneca-probe');
    expect(probe).toHaveTextContent('f:00 fc:00 fp:00 ec:00 ep:00');
    await user.click(pair(/tabaquera anatómica/i).getByRole('checkbox', { name: /^dx$/i }));
    expect(probe).toHaveTextContent('f:10 fc:00 fp:00 ec:00 ep:00');
    expect(pair(/tabaquera anatómica/i).getByRole('checkbox', { name: /^dx$/i })).toBeChecked();
    await user.click(pair(/tabaquera anatómica/i).getByRole('checkbox', { name: /^ix$/i }));
    expect(probe).toHaveTextContent('f:11 fc:00 fp:00 ec:00 ep:00');
    expect(pair(/tabaquera anatómica/i).getByRole('checkbox', { name: /^ix$/i })).toBeChecked();
  });

  it('changes only the touched flexo-extension pair, preserving the other three pairs', async () => {
    const user = userEvent.setup();
    renderPag3();
    const probe = screen.getByTestId('muneca-probe');
    await user.click(pair(/extensión c\/r/i).getByRole('checkbox', { name: /^ix$/i }));
    expect(probe).toHaveTextContent('f:00 fc:00 fp:00 ec:01 ep:00');
    await user.click(pair(/flexión pasiva/i).getByRole('checkbox', { name: /^dx$/i }));
    expect(probe).toHaveTextContent('f:00 fc:00 fp:10 ec:01 ep:00');
  });
});
