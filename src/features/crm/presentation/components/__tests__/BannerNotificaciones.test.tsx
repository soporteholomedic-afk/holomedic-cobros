import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { BannerNotificaciones } from '../BannerNotificaciones';
import type { AuthUser } from '@/features/auth/presentation/hooks/useAuth';

const useAuthMock = vi.hoisted(() => ({ user: null as AuthUser | null, loading: false }));
vi.mock('@/features/auth/presentation/hooks/useAuth', () => ({ useAuth: () => useAuthMock }));

type FakePermiso = 'default' | 'granted' | 'denied';

class FakeNotification {
  static permission: FakePermiso = 'default';
  static requestPermission = vi.fn(async (): Promise<FakePermiso> => 'granted');
  constructor(public title: string, public options?: NotificationOptions) {}
}

const USUARIO: AuthUser = {
  idUsuario: 'u-1',
  usuario: 'spalomino',
  nombre: 'Scott Palomino',
  area: 'Comercial',
  correo: null,
  permisos: ['crm'],
  activo: true,
};

beforeEach(() => {
  localStorage.clear();
  FakeNotification.permission = 'default';
  FakeNotification.requestPermission = vi.fn(async (): Promise<FakePermiso> => 'granted');
  vi.stubGlobal('Notification', FakeNotification);
  useAuthMock.user = USUARIO;
  useAuthMock.loading = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** crm-notificaciones (S1/S2): opt-in browser notifications with a persistent banner while off. */
describe('BannerNotificaciones (S2)', () => {
  it('shows the banner while the switch is off', async () => {
    render(<BannerNotificaciones />);
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('Activa las notificaciones del navegador');
    expect(screen.getByRole('switch', { name: 'Activar notificaciones del navegador' })).toHaveAttribute('aria-checked', 'false');
  });

  it('the banner disappears once the user activates the switch', async () => {
    render(<BannerNotificaciones />);
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('switch', { name: 'Activar notificaciones del navegador' }));
    await waitFor(() => expect(screen.queryByText(/Activa las notificaciones del navegador/)).toBeNull());
    expect(screen.getByRole('switch', { name: 'Desactivar notificaciones del navegador' })).toBeInTheDocument();
    expect(localStorage.getItem('crm-notificaciones-nav:u-1')).toBe('1');
  });

  it('keeps asking with a hint when the browser denied the permission', async () => {
    FakeNotification.permission = 'denied';
    render(<BannerNotificaciones />);
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('bloqueadas');
    expect(screen.getByRole('switch', { name: 'Activar notificaciones del navegador' })).toBeDisabled();
  });

  it('offers the switch off when activated', async () => {
    localStorage.setItem('crm-notificaciones-nav:u-1', '1');
    FakeNotification.permission = 'granted';
    render(<BannerNotificaciones />);
    await waitFor(() => expect(screen.queryByText(/Activa las notificaciones del navegador/)).toBeNull());
    fireEvent.click(screen.getByRole('switch', { name: 'Desactivar notificaciones del navegador' }));
    await waitFor(() => expect(screen.getByText(/Activa las notificaciones del navegador/)).toBeInTheDocument());
    expect(localStorage.getItem('crm-notificaciones-nav:u-1')).toBeNull();
  });

  it('renders nothing for users without the crm permiso or unsupported browsers', () => {
    useAuthMock.user = { ...USUARIO, permisos: [] };
    const { container } = render(<BannerNotificaciones />);
    expect(container).toBeEmptyDOMElement();

    useAuthMock.user = USUARIO;
    vi.unstubAllGlobals();
    const sinApi = render(<BannerNotificaciones />);
    expect(sinApi.container).toBeEmptyDOMElement();
  });
});
