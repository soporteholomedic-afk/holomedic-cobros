import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FototipoFitzpatrickPicker } from '../FototipoFitzpatrickPicker';

describe('FototipoFitzpatrickPicker', () => {
  it('renders 3 radiogroup buttons', () => {
    render(<FototipoFitzpatrickPicker value={null} onChange={() => {}} />);
    const group = screen.getByRole('radiogroup', { name: /fototipo/i });
    expect(group).toBeInTheDocument();
    const buttons = screen.getAllByRole('radio');
    expect(buttons).toHaveLength(3);
  });

  it('marks the selected value as aria-checked', () => {
    render(<FototipoFitzpatrickPicker value="III-IV" onChange={() => {}} />);
    const selected = screen.getByRole('radio', { name: /tipo iii – iv/i });
    expect(selected).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange when a card is clicked', async () => {
    const onChange = vi.fn();
    render(<FototipoFitzpatrickPicker value={null} onChange={onChange} />);
    const button = screen.getByRole('radio', { name: /tipo i – ii/i });
    await userEvent.click(button);
    expect(onChange).toHaveBeenCalledWith('I-II');
  });
});
