import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DashboardStats from '../DashboardStats';
import { mockClients } from '../../utils/__tests__/mockData';

describe('DashboardStats Component', () => {
  it('debe renderizar correctamente las tarjetas con las métricas calculadas', () => {
    render(<DashboardStats data={mockClients} />);
    
    // Verificar que renderice los títulos de las tarjetas
    expect(screen.getByText('Total Clientes')).toBeInTheDocument();
    expect(screen.getByText('Clientes con Deuda')).toBeInTheDocument();
    expect(screen.getByText('Saldo a Favor')).toBeInTheDocument();
    expect(screen.getByText('Clientes Al Día')).toBeInTheDocument();
    
    // Verificar los números esperados
    // Total Clientes: 3
    expect(screen.getByText('3')).toBeInTheDocument();
    
    // Clientes deudores: 1
    // Clientes saldo favor: 1
    // Clientes al día: 1
    // Habrá varios "1" renderizados (por las tarjetas correspondientes)
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(3); 
    
    // Verificar los montos consolidados
    // Deuda soles de HOLOMEDIC (1,000.00)
    expect(screen.queryByText(/S\/ 1,000.00/)).toBeInTheDocument();
    // Saldo favor dólares de JUAN PEREZ (200.00)
    expect(screen.queryByText(/\$ 200.00/)).toBeInTheDocument();
  });
});
