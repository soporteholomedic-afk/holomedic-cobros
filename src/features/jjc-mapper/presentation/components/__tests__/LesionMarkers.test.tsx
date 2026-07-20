import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LesionMarkers } from '../LesionMarkers';
import type { LesionPoint } from '@/types/jjc';

const pts: LesionPoint[] = [
  { id: 'p1', type: 'P', x: 0.3, y: 0.4 },
  { id: 'p2', type: 'L', x: 0.7, y: 0.6 },
  { id: 'p3', type: 'M', x: 0.2, y: 0.8 },
];

describe('LesionMarkers', () => {
  it('renders one circle per point at correct viewBox position', () => {
    render(<LesionMarkers points={pts} />);
    const circles = document.querySelectorAll('circle');
    expect(circles.length).toBe(3);
    expect(circles[0]).toHaveAttribute('cx', '30');
    expect(circles[0]).toHaveAttribute('cy', '40');
    expect(circles[2]).toHaveAttribute('cx', '20');
    expect(circles[2]).toHaveAttribute('cy', '80');
  });

  it('each circle has aria-label with type and position', () => {
    render(<LesionMarkers points={pts} />);
    expect(document.querySelectorAll('circle')[0]).toHaveAttribute('aria-label', 'Pecas en 30%,40%');
  });

  it('circles have r=3.5', () => {
    render(<LesionMarkers points={pts} />);
    document.querySelectorAll('circle').forEach((c) => expect(c).toHaveAttribute('r', '3.5'));
  });

  it('renders empty for no points', () => {
    const { container } = render(<LesionMarkers points={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
