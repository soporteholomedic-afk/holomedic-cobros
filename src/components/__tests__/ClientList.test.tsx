import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ClientList from '../ClientList';
import { mockClients } from '../../utils/__tests__/mockData';

describe('ClientList Component', () => {
  it('debe renderizar el listado inicial de clientes', () => {
    const onSelectClient = vi.fn();
    render(<ClientList clients={mockClients} onSelectClient={onSelectClient} />);
    
    expect(screen.getByText('HOLOMEDIC S.A.C.')).toBeInTheDocument();
    expect(screen.getByText('JUAN PEREZ S.A.')).toBeInTheDocument();
    expect(screen.getByText('CLINICA SANTA MARIA S.A.')).toBeInTheDocument();
  });

  it('debe filtrar clientes por Razón Social o RUC usando el campo de búsqueda', () => {
    const onSelectClient = vi.fn();
    render(<ClientList clients={mockClients} onSelectClient={onSelectClient} />);
    
    const searchInput = screen.getByPlaceholderText(/Buscar por RUC\/DNI/);
    fireEvent.change(searchInput, { target: { value: 'Perez' } });
    
    expect(screen.queryByText('HOLOMEDIC S.A.C.')).not.toBeInTheDocument();
    expect(screen.getByText('JUAN PEREZ S.A.')).toBeInTheDocument();
    expect(screen.queryByText('CLINICA SANTA MARIA S.A.')).not.toBeInTheDocument();

    // Buscar por RUC
    fireEvent.change(searchInput, { target: { value: '20601234567' } });
    expect(screen.getByText('HOLOMEDIC S.A.C.')).toBeInTheDocument();
    expect(screen.queryByText('JUAN PEREZ S.A.')).not.toBeInTheDocument();
  });

  it('debe filtrar clientes usando los botones de pestañas de estado', () => {
    const onSelectClient = vi.fn();
    render(<ClientList clients={mockClients} onSelectClient={onSelectClient} />);
    
    // Filtro Deudores
    const debtorsTab = screen.getByText(/Deudores/);
    fireEvent.click(debtorsTab);
    
    expect(screen.getByText('HOLOMEDIC S.A.C.')).toBeInTheDocument();
    expect(screen.queryByText('JUAN PEREZ S.A.')).not.toBeInTheDocument();
    expect(screen.queryByText('CLINICA SANTA MARIA S.A.')).not.toBeInTheDocument();
    
    // Filtro Saldo a Favor
    const creditsTab = screen.getByText(/Con Saldo a Favor/);
    fireEvent.click(creditsTab);
    
    expect(screen.queryByText('HOLOMEDIC S.A.C.')).not.toBeInTheDocument();
    expect(screen.getByText('JUAN PEREZ S.A.')).toBeInTheDocument();
    expect(screen.queryByText('CLINICA SANTA MARIA S.A.')).not.toBeInTheDocument();
    
    // Filtro Al Día
    const cleanTab = screen.getByText(/Al Día/);
    fireEvent.click(cleanTab);
    
    expect(screen.queryByText('HOLOMEDIC S.A.C.')).not.toBeInTheDocument();
    expect(screen.queryByText('JUAN PEREZ S.A.')).not.toBeInTheDocument();
    expect(screen.getByText('CLINICA SANTA MARIA S.A.')).toBeInTheDocument();
  });

  it('debe llamar a onSelectClient al hacer clic en un cliente o su botón Ver Detalle', () => {
    const onSelectClient = vi.fn();
    render(<ClientList clients={mockClients} onSelectClient={onSelectClient} />);
    
    // Hacer clic en la fila de JUAN PEREZ S.A.
    const clientRow = screen.getByText('JUAN PEREZ S.A.');
    fireEvent.click(clientRow);
    
    expect(onSelectClient).toHaveBeenCalledTimes(1);
    expect(onSelectClient).toHaveBeenCalledWith(mockClients[1]);
  });
});
