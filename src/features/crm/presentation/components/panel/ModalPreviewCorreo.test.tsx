import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  construirVistaPrevia,
  correoRemitenteCrm,
  ModalPreviewCorreo,
  SeccionSecuenciaCorreos,
  TARJETAS_SECUENCIA,
  type DatosVistaPrevia,
} from './ModalPreviewCorreo';

/**
 * Email preview contract (task 9.2, spec OP-8 + EM-3, design D5): the
 * panel's "Secuencia Completa de Correos" section shows the 5 mock cards
 * and every card opens a READ-ONLY preview (De/Para/Asunto + verbatim
 * interpolated body). The interpolation escapes the datos BEFORE joining
 * the template HTML (escape-at-interpolation) so client data can never
 * inject markup, and NO attachment box exists in v1 (decision 3).
 *
 * Pure helpers tested with ZERO mocks; the section tested through its
 * own click seam (static module — no fetch, no router).
 */

const DATOS: DatosVistaPrevia = {
  empresa: 'Constructora Los Andes',
  contacto: 'Fernando Valdivia',
  correo: 'fvaldivia@losandes.com',
  sector: 'Construcción',
  trabajadores: 85,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TARJETAS_SECUENCIA — the 5 mock cards (pure)', () => {
  it('has exactly one card per template key, in mock order', () => {
    expect(TARJETAS_SECUENCIA.map((t) => t.clave)).toEqual([
      'carta_presentacion',
      'seguimiento_1',
      'seguimiento_2',
      'seguimiento_3',
      'reactivacion_3m',
    ]);
    expect(TARJETAS_SECUENCIA).toHaveLength(5);
  });

  it('carries the mock chips and titles verbatim', () => {
    expect(TARJETAS_SECUENCIA[0]).toMatchObject({
      chip: 'Día 1 • Inmediato',
      titulo: '1. Carta de Presentación',
    });
    expect(TARJETAS_SECUENCIA[4]).toMatchObject({
      chip: 'A los 3 Meses',
      titulo: '5. Saludo tras 3 Meses',
    });
  });

  it('softens card 1 description (decision 3 — no folleto wording in v1)', () => {
    expect(TARJETAS_SECUENCIA[0].descripcion).not.toContain('folleto');
    expect(TARJETAS_SECUENCIA[0].descripcion).toContain('exámenes médicos');
  });
});

describe('correoRemitenteCrm — the De: line identity (pure)', () => {
  it('uses NEXT_PUBLIC_SMTP_USER_CRM when provisioned', () => {
    vi.stubEnv('NEXT_PUBLIC_SMTP_USER_CRM', 'crm@clinica.com');
    expect(correoRemitenteCrm()).toBe('crm@clinica.com');
  });

  it('falls back to a visible placeholder when the env is absent (no crash)', () => {
    vi.stubEnv('NEXT_PUBLIC_SMTP_USER_CRM', '');
    expect(correoRemitenteCrm()).toBeTruthy();
    expect(correoRemitenteCrm()).not.toBe('');
  });
});

describe('construirVistaPrevia — escape-at-interpolation (pure)', () => {
  it('resolves De/Para/Asunto with the [Empresa] token', () => {
    vi.stubEnv('NEXT_PUBLIC_SMTP_USER_CRM', 'crm@clinica.com');
    const vista = construirVistaPrevia('carta_presentacion', DATOS);
    expect(vista.de).toBe('Clínica de Salud Ocupacional <crm@clinica.com>');
    expect(vista.para).toBe('Fernando Valdivia <fvaldivia@losandes.com>');
    expect(vista.asunto).toBe(
      'Presentación: Chequeos médicos y salud para los trabajadores de Constructora Los Andes',
    );
  });

  it('interpolates plain datos into the verbatim HTML body', () => {
    const vista = construirVistaPrevia('seguimiento_1', DATOS);
    expect(vista.cuerpoHtml).toContain('Hola <strong>Fernando Valdivia</strong>');
    expect(vista.cuerpoHtml).toContain('Constructora Los Andes');
    expect(vista.cuerpoHtml).toContain('(85 aprox.)');
  });

  it('escapes HTML-significant datos BEFORE interpolation (XSS guard)', () => {
    const hostil: DatosVistaPrevia = {
      ...DATOS,
      contacto: '<img src=x onerror="alert(1)">',
      empresa: 'ACME & Hijos',
    };
    const vista = construirVistaPrevia('carta_presentacion', hostil);
    expect(vista.cuerpoHtml).not.toContain('<img');
    expect(vista.cuerpoHtml).toContain('&lt;img');
    expect(vista.cuerpoHtml).toContain('ACME &amp; Hijos');
    expect(vista.asunto).not.toContain('<img');
  });
});

describe('SeccionSecuenciaCorreos + ModalPreviewCorreo (component)', () => {
  it('renders the section header, badge and the 5 clickable cards', () => {
    render(<SeccionSecuenciaCorreos />);
    expect(
      screen.getByRole('heading', {
        name: 'Secuencia Completa de Correos (Incluye Reactivación tras 3 Meses)',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('4 correos iniciales + 1 de reactivación')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Leer mensaje/ })).toHaveLength(5);
  });

  it('opens the read-only preview when a card is clicked and closes via Entendido', async () => {
    vi.stubEnv('NEXT_PUBLIC_SMTP_USER_CRM', 'crm@clinica.com');
    render(<SeccionSecuenciaCorreos />);

    await userEvent.click(screen.getAllByRole('button', { name: /Leer mensaje/ })[0]!);

    const dialog = screen.getByRole('dialog', { name: 'Vista del Mensaje' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('De:')).toBeInTheDocument();
    expect(screen.getByText('Clínica de Salud Ocupacional <crm@clinica.com>')).toBeInTheDocument();
    expect(
      screen.getByText('Fernando Valdivia <fvaldivia@losandes.com>'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Presentación: Chequeos médicos y salud para los trabajadores de Constructora Los Andes',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Momento del envío: Día 1 (Inmediato al registrar)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Entendido, cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('previews the reactivation template with its own subject and phase', async () => {
    render(<SeccionSecuenciaCorreos />);

    await userEvent.click(screen.getAllByRole('button', { name: /Leer mensaje/ })[4]!);

    expect(
      screen.getByText(
        'Hola de nuevo de la Clínica Ocupacional: ¿Nuevos ingresos o renovaciones en Constructora Los Andes?',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Momento del envío: A los 90 días de la pausa')).toBeInTheDocument();
  });

  it('renders NO attachment box in any preview (EM-3 / decision 3)', async () => {
    render(<SeccionSecuenciaCorreos />);

    await userEvent.click(screen.getAllByRole('button', { name: /Leer mensaje/ })[0]!);

    expect(screen.queryByText(/Folleto_Servicios_Medicos/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Documento informativo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Archivo listo/)).not.toBeInTheDocument();
  });

  it('exports the standalone modal for a single clave with sample data', () => {
    vi.stubEnv('NEXT_PUBLIC_SMTP_USER_CRM', 'crm@clinica.com');
    render(<ModalPreviewCorreo clave="seguimiento_2" onSalir={() => {}} />);

    expect(
      screen.getByText('Precios especiales en exámenes médicos para Constructora Los Andes'),
    ).toBeInTheDocument();
  });
});
