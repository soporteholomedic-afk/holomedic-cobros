import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FaceScanCanvas } from '../FaceScanCanvas';
import type { LesionPoint } from '@/types/jjc';

function stubRect(el: Element, w: number, h: number) {
  el.getBoundingClientRect = () => ({ top: 0, left: 0, width: w, height: h }) as DOMRect;
}
function pointerDown(el: Element, cx: number, cy: number) {
  stubRect(el, 400, 500);
  fireEvent.pointerDown(el, { clientX: cx, clientY: cy });
}

const pts: LesionPoint[] = [
  { id: 'p1', type: 'P', x: 0.3, y: 0.4 },
  { id: 'p2', type: 'L', x: 0.7, y: 0.6 },
];

describe('FaceScanCanvas', () => {
  it('renders img + SVG overlay', () => {
    render(<FaceScanCanvas points={[]} activeTool="P" onAddPoint={vi.fn()} onRemovePoint={vi.fn()} />);
    expect(screen.getByAltText('Rostro')).toHaveAttribute('src');
    const svg = document.querySelector('svg')!;
    expect(svg).toHaveAttribute('viewBox', '0 0 100 100');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'none');
  });

  it('calls onAddPoint with normalized coords when type tool active', () => {
    const fn = vi.fn();
    render(<FaceScanCanvas points={[]} activeTool="M" onAddPoint={fn} onRemovePoint={vi.fn()} />);
    pointerDown(document.querySelector('svg')!, 120, 250);
    expect(fn).toHaveBeenCalledTimes(1);
    const pt = fn.mock.calls[0][0] as LesionPoint;
    expect(pt.type).toBe('M');
    expect(pt.x).toBeCloseTo(0.3, 3);
    expect(pt.y).toBeCloseTo(0.5, 3);
    expect(pt.id).toBeDefined();
  });

  it('does not add point in delete mode', () => {
    const fn = vi.fn();
    render(<FaceScanCanvas points={[]} activeTool="delete" onAddPoint={fn} onRemovePoint={vi.fn()} />);
    pointerDown(document.querySelector('svg')!, 200, 300);
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls onRemovePoint when clicking marker in delete mode', () => {
    const fn = vi.fn();
    render(<FaceScanCanvas points={pts} activeTool="delete" onAddPoint={vi.fn()} onRemovePoint={fn} />);
    fireEvent.click(document.querySelectorAll('circle')[0]);
    expect(fn).toHaveBeenCalledWith('p1');
  });

  it('does not remove in type mode', () => {
    const fn = vi.fn();
    render(<FaceScanCanvas points={pts} activeTool="P" onAddPoint={vi.fn()} onRemovePoint={fn} />);
    fireEvent.click(document.querySelectorAll('circle')[0]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('markers have aria-labels', () => {
    render(<FaceScanCanvas points={pts} activeTool="P" onAddPoint={vi.fn()} onRemovePoint={vi.fn()} />);
    document.querySelectorAll('circle').forEach((c) => expect(c).toHaveAttribute('aria-label'));
  });
});
