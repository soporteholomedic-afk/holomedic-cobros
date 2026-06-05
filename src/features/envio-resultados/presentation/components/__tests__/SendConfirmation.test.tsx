import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SendConfirmation } from '../SendConfirmation';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn().mockResolvedValue(undefined),
  recipients: ['test@example.com', 'other@example.com'],
  isSending: false,
  result: null,
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SendConfirmation', () => {
  it('should not render when isOpen is false', () => {
    render(<SendConfirmation {...defaultProps} isOpen={false} />);

    expect(screen.queryByText(/¿Enviar resultados/i)).not.toBeInTheDocument();
  });

  it('should render confirmation message with recipient count', () => {
    render(<SendConfirmation {...defaultProps} />);

    expect(screen.getByText(/¿Enviar resultados a 2 destinatarios/i)).toBeInTheDocument();
  });

  it('should list recipients', () => {
    render(<SendConfirmation {...defaultProps} />);

    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('other@example.com')).toBeInTheDocument();
  });

  it('should call onConfirm when confirm button is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(<SendConfirmation {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText('Enviar'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it('should call onClose when cancel is clicked', () => {
    render(<SendConfirmation {...defaultProps} />);

    fireEvent.click(screen.getByText('Cancelar'));

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('should show sending state and disable buttons', () => {
    render(<SendConfirmation {...defaultProps} isSending={true} />);

    expect(screen.getByText('Enviando...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviando/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeDisabled();
  });

  it('should show success state with checkmark', () => {
    render(
      <SendConfirmation
        {...defaultProps}
        result={{ success: true, messageId: 'msg-001' }}
      />,
    );

    expect(screen.getByText('Correo enviado correctamente')).toBeInTheDocument();
  });

  it('should show error state with retry button', () => {
    render(
      <SendConfirmation
        {...defaultProps}
        result={{ success: false }}
        error="SMTP connection failed"
      />,
    );

    expect(screen.getByText('SMTP connection failed')).toBeInTheDocument();
    expect(screen.getByText('Reintentar')).toBeInTheDocument();
  });

  it('should call onConfirm again when retry is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <SendConfirmation
        {...defaultProps}
        onConfirm={onConfirm}
        result={{ success: false }}
        error="Failed"
      />,
    );

    fireEvent.click(screen.getByText('Reintentar'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it('should show singular "destinatario" for one recipient', () => {
    render(<SendConfirmation {...defaultProps} recipients={['only@test.com']} />);

    expect(screen.getByText(/¿Enviar resultados a 1 destinatario/i)).toBeInTheDocument();
  });
});
