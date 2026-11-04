import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { CrmBoard } from '../CrmBoard';
import { mockApi } from './crmFixtures';

afterEach(() => vi.restoreAllMocks());

describe('Board header — import entry', () => {
  it('has an "Importar empresas" link to the import view, right before "Nueva empresa"', async () => {
    mockApi();
    render(<CrmBoard />);
    await screen.findByText('Constructora Andina S.A.C.');
    const enlace = screen.getByRole('link', { name: 'Importar empresas' });
    expect(enlace).toHaveAttribute('href', '/crm/importar');
    const nueva = screen.getByRole('button', { name: /Nueva empresa/ });
    expect(enlace.compareDocumentPosition(nueva) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(enlace.parentElement as HTMLElement).getByRole('button', { name: /Nueva empresa/ })).toBe(nueva);
  });
});
