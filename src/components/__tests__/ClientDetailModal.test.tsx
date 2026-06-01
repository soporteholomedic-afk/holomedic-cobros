import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ClientDetailModal from '../ClientDetailModal';
import { mockClients } from '../../utils/__tests__/mockData';

describe('ClientDetailModal Component', () => {
  it('debe renderizar el detalle del cliente, RUC, estado consolidado y lista de documentos', () => {
    const onClose = vi.fn();
    const onOpenEmailComposer = vi.fn();
    
    render(
      <ClientDetailModal
        client={mockClients[0]} // HOLOMEDIC S.A.C. (deudor de S/ 1000.00)
        onClose={onClose}
        onOpenEmailComposer={onOpenEmailComposer}
      />
    );
    
    expect(screen.getByText('HOLOMEDIC S.A.C.')).toBeInTheDocument();
    expect(screen.getByText('20601234567')).toBeInTheDocument();
    
    // Verificar que renderice los saldos consolidados
    expect(screen.getByText('S/')).toBeInTheDocument();
    expect(screen.getByText('1,000.00')).toBeInTheDocument();
    expect(screen.getByText('Cliente deudor')).toBeInTheDocument();

    // Verificar documentos en tabla
    expect(screen.getByText('F001-101')).toBeInTheDocument();
    expect(screen.getByText('F001-102')).toBeInTheDocument();

    // Documento F001-101 (Vence 20/05/2026) debe figurar como VENCIDO
    // (Dado que la fecha del sistema actual es posterior a mayo de 2026)
    expect(screen.getByText('VENCIDO')).toBeInTheDocument();
  });

  it('debe llamar a onClose cuando se presiona el botón de cerrar', () => {
    const onClose = vi.fn();
    const onOpenEmailComposer = vi.fn();
    
    render(
      <ClientDetailModal
        client={mockClients[0]}
        onClose={onClose}
        onOpenEmailComposer={onOpenEmailComposer}
      />
    );

    const closeButton = screen.getByText('Cerrar');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('debe llamar a onOpenEmailComposer cuando se presiona "Enviar Correo de Cobro"', () => {
    const onClose = vi.fn();
    const onOpenEmailComposer = vi.fn();
    
    render(
      <ClientDetailModal
        client={mockClients[0]} // HOLOMEDIC S.A.C (tieneDeuda = true)
        onClose={onClose}
        onOpenEmailComposer={onOpenEmailComposer}
      />
    );

    const sendEmailButton = screen.getByText('Enviar Correo de Cobro');
    fireEvent.click(sendEmailButton);
    expect(onOpenEmailComposer).toHaveBeenCalledTimes(1);
    expect(onOpenEmailComposer).toHaveBeenCalledWith(mockClients[0]);
  });
});
