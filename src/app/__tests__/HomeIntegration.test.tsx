import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Home from '../page';

// The landing page in PR 1 is a static hero + feature cards, no dashboard state
describe('Landing Page — Home', () => {
  it('debe mostrar el título "Plataforma de Facturación" en el hero', () => {
    render(<Home />);
    expect(screen.getByText('Plataforma de Facturación')).toBeInTheDocument();
  });

  it('debe mostrar "Holomedic Facturación" como marca principal', () => {
    render(<Home />);
    expect(screen.getByText('Holomedic Facturación')).toBeInTheDocument();
  });

  it('debe mostrar las 3 tarjetas de características', () => {
    render(<Home />);
    expect(screen.getByText('Sube tu Reporte')).toBeInTheDocument();
    expect(screen.getByText('Filtra y Audita')).toBeInTheDocument();
    expect(screen.getByText('Genera Valoraciones')).toBeInTheDocument();
  });

  it('debe mostrar el badge "Gestión Financiera Inteligente"', () => {
    render(<Home />);
    expect(screen.getByText('Gestión Financiera Inteligente')).toBeInTheDocument();
  });

  it('no debe mostrar contenido del dashboard (Panel de Control)', () => {
    render(<Home />);
    expect(screen.queryByText('Panel de Control de Cobranza')).not.toBeInTheDocument();
  });
});
