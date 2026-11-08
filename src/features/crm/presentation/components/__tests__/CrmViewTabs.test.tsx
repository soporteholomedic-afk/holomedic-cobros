import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { CrmViewTabs } from '../CrmViewTabs';

describe('CrmViewTabs — Pipeline | Inactivas (S1)', () => {
  it('starts with Pipeline selected and notifies the parent when Inactivas is clicked', () => {
    const onViewChange = vi.fn();
    render(<CrmViewTabs activeView="pipeline" onViewChange={onViewChange} inactivasCount={null} />);
    expect(screen.getByRole('tab', { name: /Pipeline/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Inactivas/ })).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(screen.getByRole('tab', { name: /Inactivas/ }));
    expect(onViewChange).toHaveBeenCalledWith('inactivas');
  });

  it('marks Inactivas as selected when active and shows the count badge only once loaded', () => {
    render(<CrmViewTabs activeView="inactivas" onViewChange={vi.fn()} inactivasCount={23} />);
    const tab = screen.getByRole('tab', { name: /Inactivas/ });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(within(tab).getByText('23')).toBeTruthy();
  });

  it('shows no badge while the count is unknown and none when the list is empty', () => {
    render(<CrmViewTabs activeView="pipeline" onViewChange={vi.fn()} inactivasCount={0} />);
    expect(screen.queryByText('0')).toBeNull();
  });
});
