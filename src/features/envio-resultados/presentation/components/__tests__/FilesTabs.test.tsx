import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilesTabs, type FilesTab } from '../FilesTabs';

describe('FilesTabs', () => {
  it.each<[FilesTab, RegExp]>([
    ['ready', /Listo para enviar/],
    ['all', /Todos/],
  ])('renders both tabs and marks "%s" as active', (active, activeLabelRe) => {
    render(<FilesTabs activeTab={active} onTabChange={vi.fn()} />);

    const tabReady = screen.getByRole('tab', { name: /Listo para enviar/ });
    const tabAll = screen.getByRole('tab', { name: /Todos/ });
    expect(tabReady).toBeInTheDocument();
    expect(tabAll).toBeInTheDocument();

    const activeBtn = screen.getByRole('tab', { name: activeLabelRe });
    expect(activeBtn).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onTabChange with the clicked tab id', () => {
    const onTabChange = vi.fn();
    render(<FilesTabs activeTab="ready" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('tab', { name: /Todos/ }));
    expect(onTabChange).toHaveBeenCalledWith('all');

    fireEvent.click(screen.getByRole('tab', { name: /Listo para enviar/ }));
    expect(onTabChange).toHaveBeenCalledWith('ready');
  });

  it('exposes the tablist role and the star icon on the Ready tab', () => {
    const { container } = render(<FilesTabs activeTab="ready" onTabChange={vi.fn()} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    // The lucide Star icon renders as an inline svg with the
    // `lucide-star` class — proves the icon is wired without depending
    // on a brittle aria-label.
    expect(container.querySelector('.lucide-star')).toBeTruthy();
  });
});
