import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FlowExplainer } from './FlowExplainer';

/**
 * UI contract for the flow explainer (task 8.2, mock parity): the two
 * chips, the question heading, the 3 numbered mock-verbatim paragraphs
 * (strong marks kept) and the 4-step visual sequence. Static content —
 * zero mocks, zero props.
 */

describe('FlowExplainer', () => {
  it('renders the two mock-verbatim chips and the question heading', () => {
    render(<FlowExplainer />);

    expect(screen.getByText('Envío Automático y Sin Complicaciones')).toBeInTheDocument();
    expect(screen.getByText('Regla de 3 Meses')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: '¿Cómo funciona el envío de correos y la reactivación?',
      }),
    ).toBeInTheDocument();
  });

  it('renders the 3 numbered paragraphs verbatim (carta inmediata, semanal, pausa 3 meses)', () => {
    render(<FlowExplainer />);

    expect(
      screen.getByText('1. Al registrar a una empresa', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('Carta de Presentación')).toBeInTheDocument();
    expect(
      screen.getByText('2. Si no contesta, recibe un correo amable', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('una vez por semana durante 3 semanas')).toBeInTheDocument();
    expect(
      screen.getByText('3. Si dice que no tiene interés o pasan las 3 semanas', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('se pone en pausa durante 3 meses')).toBeInTheDocument();
    expect(
      screen.getByText('Cumplido ese tiempo, el sistema te avisa para volver a contactarla.', {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it('renders the 4-step visual sequence in order', () => {
    render(<FlowExplainer />);

    const pasos = ['Carta Inicial', '3 Semanas', 'Pausa 3 Meses', 'Reactivación'];
    pasos.forEach((paso) => expect(screen.getByText(paso)).toBeInTheDocument());
    const posiciones = pasos.map((paso) => screen.getByText(paso));
    for (let i = 1; i < posiciones.length; i += 1) {
      // DOCUMENT_POSITION_PRECEDING: the previous step precedes this one.
      expect(
        posiciones[i].compareDocumentPosition(posiciones[i - 1]) &
          Node.DOCUMENT_POSITION_PRECEDING,
      ).toBeTruthy();
    }
  });
});
