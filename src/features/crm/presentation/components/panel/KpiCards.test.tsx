import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import type { ConteosPanel } from '../../panelDerivado';
import { KpiCards } from './KpiCards';

/**
 * UI contract for the 6 KPI cards (task 8.2, spec OP-2): mock-verbatim
 * labels and subtitles, every number rendered AS-IS from `conteos`
 * (the single source tallied by derivarPanel — the component never
 * recounts), and the "N clientes / M posibles" split on the first
 * card. Zero-mocks: pure-props render.
 */

const HOY_CONTEOS: ConteosPanel = {
  todas: 8,
  enEspera: 3,
  positivos: 2,
  pausa3m: 1,
  reactivados: 1,
  sinInteres: 2,
  faltaCarta: 1,
  clientes: 5,
  posibles: 3,
};

/** The card that owns `label` — its inner text wrapper (label, number
 * and subtitle share one div, closest('div') from the label). */
function tarjeta(label: string): HTMLElement {
  const contenedor = screen.getByText(label).closest('div');
  if (contenedor === null) throw new Error(`La tarjeta ${label} no tiene contenedor`);
  return contenedor;
}

describe('KpiCards', () => {
  it('renders the 6 mock-verbatim cards from the tallied counts', () => {
    render(<KpiCards conteos={HOY_CONTEOS} />);

    expect(within(tarjeta('Empresas')).getByText('8')).toBeInTheDocument();
    expect(within(tarjeta('En espera')).getByText('3')).toBeInTheDocument();
    expect(within(tarjeta('Positivos')).getByText('2')).toBeInTheDocument();
    expect(within(tarjeta('Sin interés')).getByText('2')).toBeInTheDocument();
    expect(within(tarjeta('Pausa 3 meses')).getByText('1')).toBeInTheDocument();
    expect(within(tarjeta('Falta carta')).getByText('1')).toBeInTheDocument();
  });

  it('renders the "N clientes / M posibles" split from conteos on the Empresas card', () => {
    render(<KpiCards conteos={HOY_CONTEOS} />);

    expect(within(tarjeta('Empresas')).getByText('5 clientes / 3 posibles')).toBeInTheDocument();
  });

  it('renders the 5 mock-verbatim subtitles', () => {
    render(<KpiCards conteos={HOY_CONTEOS} />);

    expect(screen.getByText('1 correo por semana')).toBeInTheDocument();
    expect(screen.getByText('Tienen interés / Cotizan')).toBeInTheDocument();
    expect(screen.getByText('No desean por ahora')).toBeInTheDocument();
    expect(screen.getByText('Vuelven el próx. trimestre')).toBeInTheDocument();
    expect(screen.getByText('Recién anotados')).toBeInTheDocument();
  });

  it('re-renders different counts verbatim — the zero panel shows 0 everywhere', () => {
    render(
      <KpiCards
        conteos={{
          todas: 0,
          enEspera: 0,
          positivos: 0,
          pausa3m: 0,
          reactivados: 0,
          sinInteres: 0,
          faltaCarta: 0,
          clientes: 0,
          posibles: 0,
        }}
      />,
    );

    expect(within(tarjeta('Empresas')).getByText('0')).toBeInTheDocument();
    expect(within(tarjeta('En espera')).getByText('0')).toBeInTheDocument();
    expect(within(tarjeta('Sin interés')).getByText('0')).toBeInTheDocument();
    expect(within(tarjeta('Empresas')).getByText('0 clientes / 0 posibles')).toBeInTheDocument();
  });
});
