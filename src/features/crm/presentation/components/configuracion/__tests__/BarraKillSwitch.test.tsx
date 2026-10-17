import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { BarraKillSwitch } from '../BarraKillSwitch';

/**
 * UI contract for the fixed kill-switch bar (agente-ia-crm E5·T6):
 * shows the SERVER state (never optimistic), turning OFF applies
 * immediately, turning ON asks an inline accessible confirmation (no
 * window.confirm) and a failure shows its text.
 */

function montar(sobre: Partial<React.ComponentProps<typeof BarraKillSwitch>> = {}) {
  const onCambiar = vi.fn().mockResolvedValue(true);
  const props = { habilitado: true, cambiando: false, error: null, onCambiar, ...sobre };
  render(<BarraKillSwitch {...props} />);
  return { onCambiar };
}

describe('BarraKillSwitch', () => {
  it('activo: texto, switch marcado', () => {
    montar();

    expect(screen.getByText('Agente activo')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('en pausa: texto de solo borradores y switch desmarcado', () => {
    montar({ habilitado: false });

    expect(screen.getByText('Agente en pausa: solo borradores')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('apagar se aplica de inmediato, sin confirmación', () => {
    const { onCambiar } = montar({ habilitado: true });

    fireEvent.click(screen.getByRole('switch'));

    expect(onCambiar).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('encender pide confirmación inline y solo entonces llama', async () => {
    const confirmar = vi.spyOn(window, 'confirm');
    const { onCambiar } = montar({ habilitado: false });

    fireEvent.click(screen.getByRole('switch'));

    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reactivar' }));

    await waitFor(() => expect(onCambiar).toHaveBeenCalledWith(true));
    expect(confirmar).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('cancelar la confirmación no llama al servidor', () => {
    const { onCambiar } = montar({ habilitado: false });

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('sin estado cargado el switch está deshabilitado; con error muestra el texto', () => {
    montar({ habilitado: null, error: 'No se pudo cambiar el estado del agente (HTTP 500)' });

    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cambiar el estado del agente (HTTP 500)');
  });

  it('mientras cambia el switch queda deshabilitado', () => {
    montar({ cambiando: true });

    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
