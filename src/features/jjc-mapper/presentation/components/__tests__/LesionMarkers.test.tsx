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
    // p1: x=0.3*422=126.6, y=0.4*279=111.6
    expect(Number.parseFloat(circles[0].getAttribute('cx')!)).toBeCloseTo(126.6, 1);
    expect(Number.parseFloat(circles[0].getAttribute('cy')!)).toBeCloseTo(111.6, 1);
    // p3: x=0.2*422=84.4, y=0.8*279=223.2
    expect(Number.parseFloat(circles[2].getAttribute('cx')!)).toBeCloseTo(84.4, 1);
    expect(Number.parseFloat(circles[2].getAttribute('cy')!)).toBeCloseTo(223.2, 1);
  });

  it('each circle has aria-label with type and position', () => {
    render(<LesionMarkers points={pts} />);
    // p1: cx=127 (Math.round(126.6)), cy=112 (Math.round(111.6))
    expect(document.querySelectorAll('circle')[0]).toHaveAttribute('aria-label', 'Pecas en 127,112');
  });

  it('circles have r=4.2', () => {
    render(<LesionMarkers points={pts} />);
    document.querySelectorAll('circle').forEach((c) => expect(c).toHaveAttribute('r', '4.2'));
  });

  it('renders empty for no points', () => {
    const { container } = render(<LesionMarkers points={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
