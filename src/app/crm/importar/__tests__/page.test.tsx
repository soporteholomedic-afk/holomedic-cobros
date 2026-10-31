import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import ImportarPage from '../page';

describe('/crm/importar page', () => {
  it('renders the import view with its heading and the way back to the board', () => {
    render(<ImportarPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Importar empresas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver al CRM/ })).toHaveAttribute('href', '/crm');
  });
});
