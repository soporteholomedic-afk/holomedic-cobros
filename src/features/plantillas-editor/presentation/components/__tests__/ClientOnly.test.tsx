import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { ClientOnly } from '../ClientOnly';

describe('ClientOnly', () => {
  it('renders children after mount', async () => {
    render(<ClientOnly><span data-testid="child">hi</span></ClientOnly>);
    expect(await screen.findByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
  });
});
