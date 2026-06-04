import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/cobranza',
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/components/Navbar', () => ({
  default: () => <div data-testid="navbar-mock">Navbar</div>,
}));

vi.mock('@/components/FileUpload', () => ({
  default: ({ onDataLoaded }: { onDataLoaded: (data: unknown) => void }) => (
    <div data-testid="file-upload-mock">FileUpload</div>
  ),
}));

vi.mock('@/components/DashboardStats', () => ({
  default: () => <div data-testid="dashboard-stats-mock">DashboardStats</div>,
}));

vi.mock('@/components/ClientList', () => ({
  default: () => <div data-testid="client-list-mock">ClientList</div>,
}));

vi.mock('@/components/ClientDetailModal', () => ({
  default: () => <div data-testid="client-detail-mock">ClientDetailModal</div>,
}));

vi.mock('@/components/EmailComposerModal', () => ({
  EmailComposerModal: () => <div data-testid="email-composer-mock">EmailComposerModal</div>,
}));

import CobranzaPage from '../page';

describe('Cobranza Page — /cobranza', () => {
  it('debe mostrar el Navbar', () => {
    render(<CobranzaPage />);
    expect(screen.getByTestId('navbar-mock')).toBeInTheDocument();
  });

  it('debe mostrar FileUpload cuando no hay datos cargados', () => {
    render(<CobranzaPage />);
    expect(screen.getByTestId('file-upload-mock')).toBeInTheDocument();
  });

  it('debe mostrar el footer con copyright', () => {
    render(<CobranzaPage />);
    expect(screen.getByText(/Holomedic S.A.C/)).toBeInTheDocument();
  });
});
