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
    expect(screen.getByText('Deuda Crédito / Contado')).toBeInTheDocument();
    expect(screen.queryByText('Clientes Al Día')).not.toBeInTheDocument();

    // Verificar los números esperados
    // Total Clientes: 4 (HOLOMEDIC, JUAN PEREZ, SANTA MARIA, FARMACIA SAN JOSE)
    expect(screen.getByText('4')).toBeInTheDocument();
    // Clientes deudores: 2 (HOLOMEDIC y FARMACIA SAN JOSE)
    expect(screen.getByText('2')).toBeInTheDocument();
    // Clientes saldo favor: 1 (el conteo clientes al día ya no se muestra en la 4ta tarjeta)
    expect(screen.getAllByText('1')).toHaveLength(1);

    // Verificar los montos consolidados de las tarjetas existentes
    // Deuda: HOLOMEDIC S/ 1,000.00 + FARMACIA SAN JOSE S/ 525.28 y $ 50.00
    expect(screen.getByText(/S\/ 1,525.28 \/ \$ 50.00/)).toBeInTheDocument();
    // Saldo favor dólares de JUAN PEREZ (200.00)
    expect(screen.getByText(/\$ 200.00/)).toBeInTheDocument();

    // Nueva tarjeta: Crédito (fecha de vencimiento distinta o ausente) y Contado (mismo día)
    // Crédito: S/ 1,000.00 (HOLOMEDIC F001-101) + S/ 400.00 (FARMACIA F003-202) + $ 50.00 (FARMACIA B002-55)
    expect(screen.getByText(/S\/ 1,400.00 \/ \$ 50.00/)).toBeInTheDocument();
    // Contado: S/ 125.28 (FARMACIA F003-201)
    expect(screen.getByText(/S\/ 125.28/)).toBeInTheDocument();
  });

  it('debe renderizar la tarjeta de deuda con ceros sin errores cuando no hay datos', () => {
    render(<DashboardStats data={[]} />);

    expect(screen.getByText('Deuda Crédito / Contado')).toBeInTheDocument();
    expect(screen.getByText(/Crédito: Crédito 0.00/)).toBeInTheDocument();
    expect(screen.getByText(/Contado: Contado 0.00/)).toBeInTheDocument();
  });
});
