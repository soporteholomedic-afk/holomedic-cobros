import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LesionCounters } from '../LesionCounters';

describe('LesionCounters', () => {
  it('renders all five counter badges', () => {
    const counters = { P: 3, L: 1, M: 0, C: 5, O: 0 };
    render(<LesionCounters counters={counters} />);
    expect(screen.getByText('Pecas')).toBeInTheDocument();
    expect(screen.getByText('Lunar')).toBeInTheDocument();
    expect(screen.getByText('Mancha')).toBeInTheDocument();
    expect(screen.getByText('Cicatriz')).toBeInTheDocument();
    expect(screen.getByText('Otras')).toBeInTheDocument();
  });

  it('displays correct counts', () => {
    const counters = { P: 3, L: 1, M: 0, C: 5, O: 0 };
    render(<LesionCounters counters={counters} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    // M and O both render a 0 count badge
    expect(screen.getAllByText('0')).toHaveLength(2);
  });

  it('renders with empty counters (all zero)', () => {
    const counters = { P: 0, L: 0, M: 0, C: 0, O: 0 };
    render(<LesionCounters counters={counters} />);
    expect(screen.getByText('Pecas')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(5);
  });
});
