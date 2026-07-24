import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VerticalLesionToolbar } from '../VerticalLesionToolbar';

describe('VerticalLesionToolbar', () => {
  it('has toolbar role and vertical orientation', () => {
    render(<VerticalLesionToolbar activeTool="P" onToolChange={vi.fn()} />);
    const tb = screen.getByRole('toolbar');
    expect(tb).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('renders 5 type buttons + delete', () => {
    render(<VerticalLesionToolbar activeTool="P" onToolChange={vi.fn()} />);
    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('O')).toBeInTheDocument();
    expect(screen.getByLabelText('Eliminar lesión')).toBeInTheDocument();
  });

  it('calls onToolChange with type on click', () => {
    const fn = vi.fn();
    render(<VerticalLesionToolbar activeTool="P" onToolChange={fn} />);
    fireEvent.click(screen.getByText('L'));
    expect(fn).toHaveBeenCalledWith('L');
  });

  it('calls onToolChange with delete on delete click', () => {
    const fn = vi.fn();
    render(<VerticalLesionToolbar activeTool="P" onToolChange={fn} />);
    fireEvent.click(screen.getByLabelText('Eliminar lesión'));
    expect(fn).toHaveBeenCalledWith('delete');
  });

  it('highlights active tool button with ring', () => {
    const { rerender } = render(<VerticalLesionToolbar activeTool="P" onToolChange={vi.fn()} />);
    expect(screen.getByText('P').className).toContain('ring');
    rerender(<VerticalLesionToolbar activeTool="L" onToolChange={vi.fn()} />);
    expect(screen.getByText('P').className).not.toContain('ring');
    expect(screen.getByText('L').className).toContain('ring');
  });

  it('type buttons have accessible labels', () => {
    render(<VerticalLesionToolbar activeTool="P" onToolChange={vi.fn()} />);
    expect(screen.getByLabelText('Pecas (P)')).toBeInTheDocument();
    expect(screen.getByLabelText('Lunar (L)')).toBeInTheDocument();
    expect(screen.getByLabelText('Mancha (M)')).toBeInTheDocument();
    expect(screen.getByLabelText('Cicatriz (C)')).toBeInTheDocument();
    expect(screen.getByLabelText('Otras (O)')).toBeInTheDocument();
  });
});
