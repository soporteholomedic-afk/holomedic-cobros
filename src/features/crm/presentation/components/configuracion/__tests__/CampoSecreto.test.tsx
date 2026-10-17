import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CampoSecreto } from '../CampoSecreto';

/**
 * UI contract for the secret field (agente-ia-crm E5·T6): it NEVER
 * renders a value — only the mask and a configurada / sin configurar /
 * ilegible badge; "Reemplazar" reveals a password input; "Quitar"
 * asks an inline confirmation and sends null.
 */

function montar(sobre: Partial<React.ComponentProps<typeof CampoSecreto>> = {}) {
  const onGuardar = vi.fn().mockResolvedValue(true);
  render(
    <CampoSecreto
      id="apiKey"
      etiqueta="API key"
      vista={{ configurado: true, mascara: '••••9999' }}
      bloqueado={false}
      guardando={false}
      onGuardar={onGuardar}
      {...sobre}
    />,
  );
  return { onGuardar };
}

describe('CampoSecreto', () => {
  it('configurada: muestra la máscara y el badge, y ningún input', () => {
    montar();

    expect(screen.getByText('••••9999')).toBeInTheDocument();
    expect(screen.getByText('Configurada')).toBeInTheDocument();
    expect(document.querySelector('input')).toBeNull();
  });

  it('sin configurar y quitar deshabilitado', () => {
    montar({ vista: { configurado: false, mascara: '' } });

    expect(screen.getByText('Sin configurar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar API key' })).not.toBeInTheDocument();
  });

  it('ilegible: badge propio y sin máscara', () => {
    montar({ vista: { configurado: true, mascara: '', ilegible: true } });

    expect(screen.getByText('Ilegible')).toBeInTheDocument();
  });

  it('Reemplazar revela un input password vacío y guarda el valor, luego lo borra', async () => {
    const { onGuardar } = montar();

    fireEvent.click(screen.getByRole('button', { name: 'Reemplazar API key' }));
    const input = screen.getByLabelText('Nuevo valor de API key') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.value).toBe('');

    fireEvent.change(input, { target: { value: 'sk-nuevo-valor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar API key' }));

    await waitFor(() => expect(onGuardar).toHaveBeenCalledWith('sk-nuevo-valor'));
    await waitFor(() => expect(screen.queryByLabelText('Nuevo valor de API key')).not.toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain('sk-nuevo-valor');
  });

  it('guardar con el input vacío no llama al servidor', () => {
    const { onGuardar } = montar();

    fireEvent.click(screen.getByRole('button', { name: 'Reemplazar API key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar API key' }));

    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('Quitar pide confirmación inline y envía null', async () => {
    const { onGuardar } = montar();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar API key' }));
    expect(onGuardar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar quitar API key' }));

    await waitFor(() => expect(onGuardar).toHaveBeenCalledWith(null));
  });

  it('bloqueado: no se puede reemplazar ni quitar', () => {
    montar({ bloqueado: true });

    expect(screen.getByRole('button', { name: 'Reemplazar API key' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quitar API key' })).toBeDisabled();
  });
});
