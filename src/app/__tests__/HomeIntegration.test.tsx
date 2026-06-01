import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Home from '../page';
import { mockClients } from '../../utils/__tests__/mockData';
import { ClienteGroup } from '../../types';

// Mockear el FileUpload para simplificar el flujo binario en la prueba de integración
vi.mock('../../components/FileUpload', () => {
  return {
    default: ({ onDataLoaded }: { onDataLoaded: (data: ClienteGroup[]) => void }) => (
      <button 
        data-testid="mock-upload-button" 
        onClick={() => onDataLoaded(mockClients)}
      >
        Subir Archivo Simulado
      </button>
    )
  };
});

describe('Home Page Flow Integration', () => {
  it('debe completar el flujo desde la carga del archivo hasta el envío de correo con éxito', () => {
    vi.useFakeTimers();
    
    render(<Home />);
    
    // 1. Estado Inicial: Vista de bienvenida
    expect(screen.getByText('Plataforma de Cobranza')).toBeInTheDocument();
    expect(screen.queryByText('Panel de Control de Cobranza')).not.toBeInTheDocument();
    
    // 2. Simular carga de archivo
    const uploadBtn = screen.getByTestId('mock-upload-button');
    fireEvent.click(uploadBtn);
    
    // El título de bienvenida desaparece y entra el Dashboard
    expect(screen.queryByText('Plataforma de Cobranza')).not.toBeInTheDocument();
    expect(screen.getByText('Panel de Control de Cobranza')).toBeInTheDocument();
    
    // Las métricas se muestran en pantalla
    expect(screen.getByText('Total Clientes')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // totalClientes
    
    // 3. Seleccionar un cliente deudor en el listado para abrir su modal
    const clientRow = screen.getByText('HOLOMEDIC S.A.C.');
    fireEvent.click(clientRow);
    
    // Detalle del modal se abre
    expect(screen.getByText('Detalle del Cliente')).toBeInTheDocument();
    
    // 4. Hacer clic en Enviar Correo de Cobro
    const sendEmailButton = screen.getByText('Enviar Correo de Cobro');
    fireEvent.click(sendEmailButton);
    
    // Se abre el editor de correo
    expect(screen.getByText('Redactar Correo de Cobro')).toBeInTheDocument();
    
    // 5. Enviar el correo simulado
    const submitButton = screen.getByText('Enviar (Simulación)');
    fireEvent.click(submitButton);
    
    expect(screen.getByText('Enviando...')).toBeInTheDocument();
    
    // Avanzar temporizadores (1500ms + 1800ms)
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    
    // Los modales se cierran y aparece el Toast de notificación flotante
    expect(screen.queryByText('Detalle del Cliente')).not.toBeInTheDocument();
    expect(screen.queryByText('Redactar Correo de Cobro')).not.toBeInTheDocument();
    expect(screen.getByText('Correo de cobro enviado con éxito a HOLOMEDIC S.A.C.')).toBeInTheDocument();
    
    vi.useRealTimers();
  });
});
