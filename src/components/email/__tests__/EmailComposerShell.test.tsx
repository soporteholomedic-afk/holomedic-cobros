import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EmailComposerShell } from '../EmailComposerShell';

describe('EmailComposerShell', () => {
  it('renders as a dialog overlay containing its children', () => {
    render(
      <EmailComposerShell>
        <div data-testid="panel-left">preview</div>
        <div data-testid="panel-right">controls</div>
      </EmailComposerShell>,
    );

    const shell = screen.getByRole('dialog');
    expect(shell).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('panel-left')).toHaveTextContent('preview');
    expect(screen.getByTestId('panel-right')).toHaveTextContent('controls');
  });
});
