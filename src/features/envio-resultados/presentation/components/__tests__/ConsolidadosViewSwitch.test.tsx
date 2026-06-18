import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConsolidadosViewSwitch, type ConsolidadosView } from '../ConsolidadosViewSwitch';

describe('ConsolidadosViewSwitch', () => {
  it('renders the tablist with an accessible label', () => {
    render(<ConsolidadosViewSwitch activeView="pacientes" onViewChange={vi.fn()} />);
    expect(screen.getByRole('tablist', { name: /vista de consolidados/i })).toBeInTheDocument();
  });

  it('renders both tabs with the right labels', () => {
    render(<ConsolidadosViewSwitch activeView="pacientes" onViewChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /Lista de pacientes/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Lista de empresas/i })).toBeInTheDocument();
  });

  it.each<[ConsolidadosView, RegExp]>([
    ['pacientes', /Lista de pacientes/i],
    ['empresas', /Lista de empresas/i],
  ])('marks "%s" tab as aria-selected=true', (active, activeLabelRe) => {
    render(<ConsolidadosViewSwitch activeView={active} onViewChange={vi.fn()} />);
    const activeTab = screen.getByRole('tab', { name: activeLabelRe });
    expect(activeTab).toHaveAttribute('aria-selected', 'true');

    // The other tab must be aria-selected=false
    const otherLabel = active === 'pacientes' ? /Lista de empresas/i : /Lista de pacientes/i;
    const otherTab = screen.getByRole('tab', { name: otherLabel });
    expect(otherTab).toHaveAttribute('aria-selected', 'false');
  });

  it('invokes onViewChange with the clicked view id', () => {
    const onViewChange = vi.fn();
    render(<ConsolidadosViewSwitch activeView="pacientes" onViewChange={onViewChange} />);

    fireEvent.click(screen.getByRole('tab', { name: /Lista de empresas/i }));
    expect(onViewChange).toHaveBeenCalledWith('empresas');

    fireEvent.click(screen.getByRole('tab', { name: /Lista de pacientes/i }));
    expect(onViewChange).toHaveBeenCalledWith('pacientes');
  });

  it('invokes onViewChange exactly once per click', () => {
    const onViewChange = vi.fn();
    render(<ConsolidadosViewSwitch activeView="pacientes" onViewChange={onViewChange} />);

    fireEvent.click(screen.getByRole('tab', { name: /Lista de empresas/i }));
    expect(onViewChange).toHaveBeenCalledTimes(1);
  });

  it('is a controlled component — does not toggle aria-selected on its own', () => {
    const onViewChange = vi.fn();
    render(<ConsolidadosViewSwitch activeView="pacientes" onViewChange={onViewChange} />);

    // Click "empresas" but the prop is still "pacientes" — aria-selected must NOT flip.
    fireEvent.click(screen.getByRole('tab', { name: /Lista de empresas/i }));
    expect(screen.getByRole('tab', { name: /Lista de pacientes/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /Lista de empresas/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});
