import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockUsePathname = vi.hoisted(() => vi.fn().mockReturnValue('/'));
// Estable entre renders como el router real de Next (un objeto nuevo
// por llamada re-armaría el polling en cada render del Sidebar).
const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
const mockUseRouter = vi.hoisted(() => vi.fn(() => routerMock));
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { dismiss: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
  useRouter: mockUseRouter,
}));

// E3·T6: el Sidebar monta useNotificacionesConversaciones (badge +
// toasts globales) — sonner se moquea para no emitir toasts reales.
vi.mock('sonner', () => ({
  toast: toastMock,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, onClick, ...props }: { children: React.ReactNode; href: string; onClick?: () => void }) => (
    <a href={href} onClick={onClick} {...props}>{children}</a>
  ),
}));

import Sidebar from '../Sidebar';
import { AuthProvider, type AuthUser } from '@/features/auth/presentation/hooks/useAuth';

const nonAdminUser: AuthUser = {
  idUsuario: 'u-cobranza',
  usuario: 'acobranza',
  nombre: 'Ana Cobranza',
  area: 'Cobranza',
  permisos: ['cobranza'],
  activo: true,
};

const adminUser: AuthUser = {
  idUsuario: 'u-admin',
  usuario: 'aadmin',
  nombre: 'Admin General',
  area: 'Sistemas',
  permisos: ['admin'],
  activo: true,
};

// editor-firmas PR3 (task 3.7): the "Mi firma" entry is gated by the
// `firma_correo` permiso alone — NOT by `admin` nor `plantillas`.
const firmaUser: AuthUser = {
  idUsuario: 'u-firma',
  usuario: 'jfirma',
  nombre: 'Julián Firma',
  area: 'Cobranza',
  permisos: ['firma_correo'],
  activo: true,
};

// agente-ia-crm E3·T6: the "Conversaciones" entry is gated by its
// OWN permiso `crm_conversaciones` — independent of `crm` (the CRM
// panel entry): an operator with only crm_conversaciones sees the
// bandeja entry but NOT the CRM panel.
const conversacionesUser: AuthUser = {
  idUsuario: 'u-conversaciones',
  usuario: 'mconversa',
  nombre: 'Marcos Conversa',
  area: 'Cobranza',
  permisos: ['crm_conversaciones'],
  activo: true,
};

const crmUser: AuthUser = {
  idUsuario: 'u-crm',
  usuario: 'vcrm',
  nombre: 'Vera Crm',
  area: 'Sistemas',
  permisos: ['crm'],
  activo: true,
};

function mockAuthMe(user: AuthUser | null): void {
  global.fetch = vi.fn().mockImplementation((url: string) =>
    url === '/api/auth/me'
      ? Promise.resolve(user
          ? { ok: true, json: () => Promise.resolve({ usuario: user }) }
          : { ok: false })
      : Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  ) as unknown as typeof fetch;
}

// E3·T6: auth + resumen de notificaciones en un solo mock de fetch —
// el badge vive del GET /api/crm/conversaciones/notificaciones.
function mockAuthMeNotificaciones(user: AuthUser, payload: unknown): void {
  global.fetch = vi.fn().mockImplementation((url: string) =>
    url === '/api/auth/me'
      ? Promise.resolve({ ok: true, json: () => Promise.resolve({ usuario: user }) })
      : url === '/api/crm/conversaciones/notificaciones'
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })
        : Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  ) as unknown as typeof fetch;
}

const resumenConAyuda = {
  success: true,
  requiereAyuda: 2,
  pendienteVinculacion: 0,
  total: 12,
  ultimaActividad: '2026-06-15T12:30:00.000Z',
  requiereAyudaDetalle: [],
};

const resumenSinAyuda = {
  ...resumenConAyuda,
  requiereAyuda: 0,
};

const renderSidebar = () =>
  render(
    <AuthProvider>
      <Sidebar />
    </AuthProvider>,
  );

describe('Sidebar Component', () => {
  beforeEach(() => {
    mockAuthMe(nonAdminUser);
  });

  it('debe mostrar la marca "Holomedic" con subtítulo "Facturación"', () => {
    renderSidebar();
    expect(screen.getByText('Holomedic')).toBeInTheDocument();
    expect(screen.getByText('Facturación')).toBeInTheDocument();
  });

  it('debe mostrar los ítems de navegación: Inicio, Cobranza, Consolidados, Valoraciones, Areas, Plantillas', () => {
    renderSidebar();
    expect(screen.getByText('Inicio')).toBeInTheDocument();
    expect(screen.getByText('Cobranza')).toBeInTheDocument();
    expect(screen.getByText('Consolidados')).toBeInTheDocument();
    expect(screen.getByText('Valoraciones')).toBeInTheDocument();
    expect(screen.getByText('Areas')).toBeInTheDocument();
    expect(screen.getByText('Plantillas')).toBeInTheDocument();
  });

  it('debe enlazar Inicio a "/"', () => {
    renderSidebar();
    const link = screen.getByText('Inicio').closest('a');
    expect(link).toHaveAttribute('href', '/');
  });

  it('debe enlazar Cobranza a "/cobranza"', () => {
    renderSidebar();
    const link = screen.getByText('Cobranza').closest('a');
    expect(link).toHaveAttribute('href', '/cobranza');
  });

  it('debe enlazar Valoraciones a "/valoraciones"', () => {
    renderSidebar();
    const link = screen.getByText('Valoraciones').closest('a');
    expect(link).toHaveAttribute('href', '/valoraciones');
  });

  it('debe enlazar Consolidados a "/consolidados"', () => {
    renderSidebar();
    const link = screen.getByText('Consolidados').closest('a');
    expect(link).toHaveAttribute('href', '/consolidados');
  });

  // PR 4 — Task 4.7: "Add nav entry 'Plantillas' → /admin/plantillas/consolidados"
  it('debe enlazar Plantillas a "/admin/plantillas/consolidados"', () => {
    renderSidebar();
    const link = screen.getByText('Plantillas').closest('a');
    expect(link).toHaveAttribute('href', '/admin/plantillas/consolidados');
  });

  it('debe mostrar Consolidados entre Cobranza y Valoraciones en el orden de navegación', () => {
    renderSidebar();
    const navLinks = screen.getAllByRole('link').map((l) => l.textContent?.trim());
    const cobranzaIdx = navLinks.indexOf('Cobranza');
    const consolidadosIdx = navLinks.indexOf('Consolidados');
    const valoracionesIdx = navLinks.indexOf('Valoraciones');
    expect(cobranzaIdx).toBeLessThan(consolidadosIdx);
    expect(consolidadosIdx).toBeLessThan(valoracionesIdx);
  });

  it('debe mostrar el botón hamburguesa en mobile con aria-label', () => {
    renderSidebar();
    const button = screen.getByLabelText('Abrir menú');
    expect(button).toBeInTheDocument();
  });

  it('debe cambiar aria-label a "Cerrar menú" al hacer click en hamburguesa', () => {
    renderSidebar();
    const button = screen.getByLabelText('Abrir menú');
    fireEvent.click(button);
    expect(screen.getByLabelText('Cerrar menú')).toBeInTheDocument();
  });

  it('la marca debe enlazar a "/"', () => {
    renderSidebar();
    const brandLink = screen.getByText('Holomedic').closest('a');
    expect(brandLink).toHaveAttribute('href', '/');
  });

  it('debe mostrar el enlace Usuarios para usuarios con permiso admin', async () => {
    mockAuthMe(adminUser);
    renderSidebar();
    expect(await screen.findByText('Admin General')).toBeInTheDocument();
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
  });

  it('debe ocultar el enlace Usuarios para usuarios sin permiso admin', async () => {
    renderSidebar();
    expect(await screen.findByText('Ana Cobranza')).toBeInTheDocument();
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument();
  });

  // editor-firmas PR3 — task 3.7: "Mi firma" → /admin/plantillas/firma
  describe('Mi firma entry (permiso firma_correo)', () => {
    it('debe mostrar "Mi firma" para un usuario con permiso firma_correo y enlazar a /admin/plantillas/firma', async () => {
      mockAuthMe(firmaUser);
      renderSidebar();
      expect(await screen.findByText('Julián Firma')).toBeInTheDocument();

      const link = screen.getByText('Mi firma').closest('a');
      expect(link).toHaveAttribute('href', '/admin/plantillas/firma');
    });

    it('debe ocultar "Mi firma" para un usuario sin permiso firma_correo', async () => {
      renderSidebar();
      expect(await screen.findByText('Ana Cobranza')).toBeInTheDocument();
      expect(screen.queryByText('Mi firma')).not.toBeInTheDocument();
    });

    it('debe ocultar "Mi firma" incluso para un admin sin permiso firma_correo', async () => {
      mockAuthMe(adminUser);
      renderSidebar();
      expect(await screen.findByText('Admin General')).toBeInTheDocument();
      expect(screen.queryByText('Mi firma')).not.toBeInTheDocument();
    });
  });

  describe('AreasMenuItem dropdown', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/');
    });

    it('debe mostrar el trigger "Areas" con aria-expanded=false inicialmente', () => {
      renderSidebar();
      const trigger = screen.getByRole('button', { name: /Areas/i });
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('debe mostrar los 3 sub-ítems al hacer click en el trigger', () => {
      renderSidebar();
      const trigger = screen.getByRole('button', { name: /Areas/i });
      fireEvent.click(trigger);

      expect(screen.getByText('MusculoEsqueletica')).toBeInTheDocument();
      expect(screen.getByText('Medicina')).toBeInTheDocument();
      expect(screen.getByText('Calidad')).toBeInTheDocument();
    });

    it('debe ocultar los sub-ítems al hacer click nuevamente en el trigger', () => {
      renderSidebar();
      const trigger = screen.getByRole('button', { name: /Areas/i });
      fireEvent.click(trigger);
      expect(screen.getByText('MusculoEsqueletica')).toBeInTheDocument();

      fireEvent.click(trigger);
      expect(screen.queryByText('MusculoEsqueletica')).not.toBeInTheDocument();
    });

    it('cada sub-ítem debe enlazar a su ruta /areas/<slug>', () => {
      renderSidebar();
      fireEvent.click(screen.getByRole('button', { name: /Areas/i }));

      const musculo = screen.getByText('MusculoEsqueletica').closest('a');
      expect(musculo).toHaveAttribute('href', '/areas/musculoesqueletica');

      const medicina = screen.getByText('Medicina').closest('a');
      expect(medicina).toHaveAttribute('href', '/areas/medicina');

      const calidad = screen.getByText('Calidad').closest('a');
      expect(calidad).toHaveAttribute('href', '/areas/calidad');
    });

    it('debe cerrar el dropdown al hacer click fuera', () => {
      renderSidebar();
      fireEvent.click(screen.getByRole('button', { name: /Areas/i }));
      expect(screen.getByText('MusculoEsqueletica')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);
      expect(screen.queryByText('MusculoEsqueletica')).not.toBeInTheDocument();
    });

    it('debe cerrar el dropdown al presionar Escape', () => {
      renderSidebar();
      fireEvent.click(screen.getByRole('button', { name: /Areas/i }));
      expect(screen.getByText('MusculoEsqueletica')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText('MusculoEsqueletica')).not.toBeInTheDocument();
    });

    it('debe marcar como activo el sub-ítem correspondiente a la ruta actual', () => {
      mockUsePathname.mockReturnValue('/areas/medicina');
      renderSidebar();
      fireEvent.click(screen.getByRole('button', { name: /Areas/i }));

      const medicinaLink = screen.getByText('Medicina').closest('a');
      expect(medicinaLink).toHaveAttribute('href', '/areas/medicina');
      expect(screen.getByText('Medicina')).toBeInTheDocument();
    });

    it('debe cambiar aria-expanded a true al abrir el dropdown', () => {
      renderSidebar();
      const trigger = screen.getByRole('button', { name: /Areas/i });
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
  });

  // agente-ia-crm E3·T6: entrada global "Conversaciones" + badge de ayuda
  describe('Conversaciones entry (permiso crm_conversaciones, E3·T6)', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/');
      mockUseRouter.mockClear();
      toastMock.mockClear();
      toastMock.dismiss.mockClear();
    });

    it('debe mostrar "Conversaciones" y enlazar a /crm/conversaciones con el permiso', async () => {
      mockAuthMe(conversacionesUser);
      renderSidebar();
      expect(await screen.findByText('Marcos Conversa')).toBeInTheDocument();

      const link = screen.getByText('Conversaciones').closest('a');
      expect(link).toHaveAttribute('href', '/crm/conversaciones');
    });

    it('permiso propio: con SOLO crm_conversaciones ve Conversaciones pero NO el panel CRM', async () => {
      mockAuthMe(conversacionesUser);
      renderSidebar();
      expect(await screen.findByText('Conversaciones')).toBeInTheDocument();
      expect(screen.queryByText('CRM')).not.toBeInTheDocument();
    });

    it('permiso propio: con SOLO crm ve el panel CRM pero NO Conversaciones', async () => {
      mockAuthMe(crmUser);
      renderSidebar();
      expect(await screen.findByText('CRM')).toBeInTheDocument();
      expect(screen.queryByText('Conversaciones')).not.toBeInTheDocument();
    });

    it('debe ocultar "Conversaciones" sin el permiso crm_conversaciones', async () => {
      mockAuthMe(nonAdminUser);
      renderSidebar();
      expect(await screen.findByText('Ana Cobranza')).toBeInTheDocument();
      expect(screen.queryByText('Conversaciones')).not.toBeInTheDocument();
    });

    it('marca activa la entrada en /crm/conversaciones', async () => {
      mockUsePathname.mockReturnValue('/crm/conversaciones');
      mockAuthMe(conversacionesUser);
      renderSidebar();
      const link = (await screen.findByText('Conversaciones')).closest('a');
      expect(link?.className).toContain('text-sky-300');
    });

    it('badge: cuenta requiereAyuda con aria-label cuando > 0', async () => {
      mockAuthMeNotificaciones(conversacionesUser, resumenConAyuda);
      renderSidebar();

      const badge = await screen.findByLabelText('2 conversaciones necesitan ayuda');
      expect(badge).toHaveTextContent('2');
    });

    it('badge: oculto cuando requiereAyuda es 0', async () => {
      mockAuthMeNotificaciones(conversacionesUser, resumenSinAyuda);
      renderSidebar();
      expect(await screen.findByText('Marcos Conversa')).toBeInTheDocument();

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/crm/conversaciones/notificaciones',
          expect.anything(),
        ),
      );
      expect(screen.queryByLabelText(/conversaciones necesitan ayuda/)).not.toBeInTheDocument();
    });

    it('sin permiso no polea notificaciones (ni badge ni fetch)', async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) =>
        url === '/api/auth/me'
          ? Promise.resolve({ ok: true, json: () => Promise.resolve({ usuario: nonAdminUser }) })
          : Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
      );
      global.fetch = fetchSpy as unknown as typeof fetch;
      renderSidebar();
      expect(await screen.findByText('Ana Cobranza')).toBeInTheDocument();

      expect(
        fetchSpy.mock.calls.filter((c) => String(c[0]).includes('notificaciones')),
      ).toHaveLength(0);
    });
  });

  // agente-ia-crm E4·T6: entrada global "Calidad" — el panel de
  // métricas vive en el MISMO permiso crm_conversaciones que la
  // bandeja (ruta prefijo más largo /crm/calidad).
  describe('Calidad entry (permiso crm_conversaciones, E4·T6)', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/');
      mockUseRouter.mockClear();
      toastMock.mockClear();
      toastMock.dismiss.mockClear();
    });

    it('debe mostrar "Calidad" y enlazar a /crm/calidad con el permiso', async () => {
      mockAuthMe(conversacionesUser);
      renderSidebar();
      expect(await screen.findByText('Marcos Conversa')).toBeInTheDocument();

      const link = screen.getByText('Calidad').closest('a');
      expect(link).toHaveAttribute('href', '/crm/calidad');
    });

    it('permiso propio: con SOLO crm_conversaciones ve Calidad pero NO el panel CRM', async () => {
      mockAuthMe(conversacionesUser);
      renderSidebar();
      expect(await screen.findByText('Calidad')).toBeInTheDocument();
      expect(screen.queryByText('CRM')).not.toBeInTheDocument();
    });

    it('permiso propio: con SOLO crm ve el panel CRM pero NO Calidad', async () => {
      mockAuthMe(crmUser);
      renderSidebar();
      expect(await screen.findByText('CRM')).toBeInTheDocument();
      expect(screen.queryByText('Calidad')).not.toBeInTheDocument();
    });

    it('debe ocultar "Calidad" sin el permiso crm_conversaciones', async () => {
      mockAuthMe(nonAdminUser);
      renderSidebar();
      expect(await screen.findByText('Ana Cobranza')).toBeInTheDocument();
      expect(screen.queryByText('Calidad')).not.toBeInTheDocument();
    });

    it('marca activa la entrada en /crm/calidad', async () => {
      mockUsePathname.mockReturnValue('/crm/calidad');
      mockAuthMe(conversacionesUser);
      renderSidebar();
      const link = (await screen.findByText('Calidad')).closest('a');
      expect(link?.className).toContain('text-sky-300');
    });
  });

  // agente-ia-crm E4·T8: entrada global "Conocimiento" — la carga de
  // conocimiento vive en su PROPIO permiso crm_conocimiento (ruta
  // /admin/crm/conocimiento), independiente de crm/admin.
  describe('Conocimiento entry (permiso crm_conocimiento, E4·T8)', () => {
    const conocimientoUser: AuthUser = {
      idUsuario: 'u-conocimiento',
      usuario: 'cconocim',
      nombre: 'Carla Conocimiento',
      area: 'Comercial',
      permisos: ['crm_conocimiento'],
      activo: true,
    };

    beforeEach(() => {
      mockUsePathname.mockReturnValue('/');
      mockUseRouter.mockClear();
      toastMock.mockClear();
      toastMock.dismiss.mockClear();
    });

    it('debe mostrar "Conocimiento" y enlazar a /admin/crm/conocimiento con el permiso', async () => {
      mockAuthMe(conocimientoUser);
      renderSidebar();
      expect(await screen.findByText('Carla Conocimiento')).toBeInTheDocument();

      const link = screen.getByText('Conocimiento').closest('a');
      expect(link).toHaveAttribute('href', '/admin/crm/conocimiento');
    });

    it('permiso propio: con SOLO crm_conocimiento ve Conocimiento pero NO el panel CRM', async () => {
      mockAuthMe(conocimientoUser);
      renderSidebar();
      expect(await screen.findByText('Conocimiento')).toBeInTheDocument();
      expect(screen.queryByText('CRM')).not.toBeInTheDocument();
    });

    it('permiso propio: con SOLO crm ve el panel CRM pero NO Conocimiento', async () => {
      mockAuthMe(crmUser);
      renderSidebar();
      expect(await screen.findByText('CRM')).toBeInTheDocument();
      expect(screen.queryByText('Conocimiento')).not.toBeInTheDocument();
    });

    it('debe ocultar "Conocimiento" sin el permiso crm_conocimiento', async () => {
      mockAuthMe(nonAdminUser);
      renderSidebar();
      expect(await screen.findByText('Ana Cobranza')).toBeInTheDocument();
      expect(screen.queryByText('Conocimiento')).not.toBeInTheDocument();
    });

    it('marca activa la entrada en /admin/crm/conocimiento', async () => {
      mockUsePathname.mockReturnValue('/admin/crm/conocimiento');
      mockAuthMe(conocimientoUser);
      renderSidebar();
      const link = (await screen.findByText('Conocimiento')).closest('a');
      expect(link?.className).toContain('text-sky-300');
    });
  });
});
