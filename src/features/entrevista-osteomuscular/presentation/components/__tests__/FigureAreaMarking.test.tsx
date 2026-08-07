import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { FigureAreaMark } from '@/types/entrevista-osteomuscular';
import {
  FigureAreaMarking,
  clamp01,
  getContainedRect,
} from '../FigureAreaMarking';

/** Box geometry stub: jsdom no calcula layout real. */
function stubSvgGeometry(svg: Element, width: number, height: number) {
  const rect = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(rect);
}

/** Pointer primario en coordenadas absolutas (patrón del repo, ver FaceScanCanvas.test.tsx). */
function pointerDownAt(element: Element, clientX: number, clientY: number) {
  fireEvent.pointerDown(element, { clientX, clientY, isPrimary: true, button: 0 });
}

const MANOS = { src: '/assets/images/musculo/entrevista/manos.png', alt: 'Diagrama de manos', width: 117, height: 81 };
const TORSO = { src: '/assets/images/musculo/entrevista/cuerpo_torso.png', alt: 'Diagrama de torso', width: 110, height: 136 };

interface HarnessProps {
  image?: typeof MANOS;
  ariaLabel?: string;
  className?: string;
  initialMarks?: FigureAreaMark[];
  onChange?: (marks: FigureAreaMark[]) => void;
}

function MarkingHarness({
  image = MANOS,
  ariaLabel = 'Figura de manos y muñecas',
  className,
  initialMarks = [],
  onChange,
}: HarnessProps) {
  const [marks, setMarks] = useState<FigureAreaMark[]>(initialMarks);
  return (
    <FigureAreaMarking
      imageSrc={image.src}
      imageAlt={image.alt}
      ariaLabel={ariaLabel}
      imageWidth={image.width}
      imageHeight={image.height}
      marks={marks}
      onMarksChange={(next) => {
        setMarks(next);
        onChange?.(next);
      }}
      className={className}
    />
  );
}

function renderHarness(options: HarnessProps = {}) {
  const onChange = vi.fn();
  const view = render(<MarkingHarness {...options} onChange={onChange} />);
  const svg = screen.getByRole('img', { name: options.ariaLabel ?? 'Figura de manos y muñecas' });
  return { view, onChange, svg };
}

function marksIn(svg: Element): HTMLElement[] {
  return Array.from(svg.querySelectorAll<HTMLElement>('[data-mark-id]'));
}

describe('FigureAreaMarking — geometría contenida (object-contain)', () => {
  it('calcula el rectángulo dibujable de una imagen 117x81 dentro de una caja 200x150', () => {
    const rect = getContainedRect(200, 150, 117, 81);
    expect(rect.x).toBe(0);
    expect(rect.y).toBeCloseTo(5.769230769230769, 10);
    expect(rect.width).toBe(200);
    expect(rect.height).toBeCloseTo(138.46153846153845, 10);
  });

  it('calcula el rectángulo dibujable de una imagen vertical 110x136 dentro de una caja 96x112', () => {
    const rect = getContainedRect(96, 112, 110, 136);
    expect(rect.x).toBeCloseTo(2.705882352941176, 5);
    expect(rect.y).toBe(0);
    expect(rect.width).toBeCloseTo(90.58823529411765, 5);
    expect(rect.height).toBe(112);
  });

  it('acota las coordenadas normalizadas al rango inclusivo 0..1', () => {
    expect(clamp01(-0.25)).toBe(0);
    expect(clamp01(1.25)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });
});

describe('FigureAreaMarking — colocación y remoción de marcas', () => {
  it('coloca una primera marca al hacer clic en un punto vacío de la figura', () => {
    const { onChange, svg } = renderHarness();
    stubSvgGeometry(svg, 200, 150);

    pointerDownAt(svg, 100, 75);

    expect(onChange).toHaveBeenCalledTimes(1);
    const [next] = onChange.mock.calls[0] as [FigureAreaMark[]];
    expect(next).toHaveLength(1);
    expect(next[0].x).toBeCloseTo(0.5, 5);
    expect(next[0].y).toBeCloseTo(0.5, 5);
    expect(next[0].id).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eliminar marca 1 en Diagrama de manos' })).toBeInTheDocument();
  });

  it('agrega varias marcas y conserva las existentes', () => {
    const { onChange, svg } = renderHarness();
    stubSvgGeometry(svg, 200, 150);

    pointerDownAt(svg, 50, 40);
    pointerDownAt(svg, 150, 110);

    expect(onChange).toHaveBeenCalledTimes(2);
    const [first] = onChange.mock.calls[0] as [FigureAreaMark[]];
    const [second] = onChange.mock.calls[1] as [FigureAreaMark[]];
    expect(second).toHaveLength(2);
    expect(second[0]).toEqual(first[0]);
    expect(second[0].x).toBeCloseTo(0.25, 2);
    expect(second[1].x).toBeCloseTo(0.75, 2);
    expect(marksIn(svg)).toHaveLength(2);
  });

  it('remueve solo la marca clickeada y conserva las demás', () => {
    const { onChange, svg } = renderHarness();
    stubSvgGeometry(svg, 200, 150);

    pointerDownAt(svg, 50, 40);
    pointerDownAt(svg, 150, 110);
    onChange.mockClear();

    const [firstMark] = marksIn(svg);
    pointerDownAt(firstMark, 0, 0);

    expect(onChange).toHaveBeenCalledTimes(1);
    const [remaining] = onChange.mock.calls[0] as [FigureAreaMark[]];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].x).toBeCloseTo(0.75, 2);
    expect(marksIn(svg)).toHaveLength(1);
  });

  it('ignora los clics en las bandas de letterbox (fuera del área dibujable)', () => {
    const { onChange, svg } = renderHarness({ image: MANOS });
    stubSvgGeometry(svg, 200, 150);

    // Banda vertical superior/inferior de una imagen horizontal
    pointerDownAt(svg, 100, 0);
    pointerDownAt(svg, 100, 150);

    // Bandas laterales de una imagen vertical dentro de una caja ancha
    const torso = renderHarness({ image: TORSO, ariaLabel: 'Figura de torso' });
    stubSvgGeometry(torso.svg, 200, 150);
    pointerDownAt(torso.svg, 10, 75);

    expect(onChange).not.toHaveBeenCalled();
    expect(torso.onChange).not.toHaveBeenCalled();
    expect(marksIn(svg)).toHaveLength(0);
    expect(marksIn(torso.svg)).toHaveLength(0);
  });

  it('acepta y registra coordenadas en los bordes del área dibujable (0 y 1 inclusive)', () => {
    const { onChange, svg } = renderHarness();
    stubSvgGeometry(svg, 200, 150);

    // Bordes exactos del contained rect (0..1 inclusivo)
    const contained = getContainedRect(200, 150, MANOS.width, MANOS.height);
    pointerDownAt(svg, contained.x, contained.y);
    pointerDownAt(svg, contained.x + contained.width, contained.y + contained.height);

    const [second] = onChange.mock.calls[1] as [FigureAreaMark[]];
    expect(second[0].x).toBe(0);
    expect(second[0].y).toBe(0);
    expect(second[1].x).toBe(1);
    expect(second[1].y).toBe(1);
  });

  it('mantiene la posición relativa de la marca al re-renderizar con otro tamaño de caja', () => {
    renderHarness({
      initialMarks: [{ id: 'm1', x: 0.5, y: 0.5 }],
    });
    const button = screen.getByRole('button', { name: 'Eliminar marca 1 en Diagrama de manos' });
    const circle = button.querySelector('circle');
    expect(circle).not.toBeNull();
    expect(circle?.getAttribute('cx')).toBe(String(0.5 * MANOS.width));
    expect(circle?.getAttribute('cy')).toBe(String(0.5 * MANOS.height));
  });
});

describe('FigureAreaMarking — accesibilidad y teclado', () => {
  it('expone cada marca como un botón SVG con aria-label y tabIndex', () => {
    const { svg } = renderHarness({
      initialMarks: [
        { id: 'm1', x: 0.25, y: 0.5 },
        { id: 'm2', x: 0.75, y: 0.5 },
      ],
    });

    const [first, second] = screen.getAllByRole('button');
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '0');
    expect(first).toHaveAttribute('aria-label', 'Eliminar marca 1 en Diagrama de manos');
    expect(second).toHaveAttribute('aria-label', 'Eliminar marca 2 en Diagrama de manos');
    expect(svg).toHaveAttribute('aria-label', 'Figura de manos y muñecas');

    // El clic con puntero sobre una marca la remueve (queda solo la segunda)
    pointerDownAt(first, 0, 0);
    const remaining = screen.getAllByRole('button');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveAttribute('aria-label', 'Eliminar marca 1 en Diagrama de manos');
    expect(remaining[0]).toHaveAttribute('data-mark-id', 'm2');
  });

  it('remueve una marca con Enter y con Espacio desde el teclado', () => {
    renderHarness({
      initialMarks: [
        { id: 'm1', x: 0.25, y: 0.5 },
        { id: 'm2', x: 0.75, y: 0.5 },
      ],
    });

    const first = screen.getByRole('button', { name: 'Eliminar marca 1 en Diagrama de manos' });
    fireEvent.keyDown(first, { key: 'Enter' });
    // Las etiquetas se renumeran al remover: la única marca restante es m2
    const remaining = screen.getAllByRole('button');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveAttribute('data-mark-id', 'm2');

    const renumbered = screen.getByRole('button', { name: 'Eliminar marca 1 en Diagrama de manos' });
    fireEvent.keyDown(renumbered, { key: ' ' });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
