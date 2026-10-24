/**
 * Tests for the MI FIRMA tab of `/configuracion` (feature
 * `configuracion-tabs`).
 *
 * The page embeds the legacy signature editor INSIDE the tabs layout:
 * first registered area → `resolveFirmaPageData` → `FirmaForm`, with
 * the canonical entry's defensive 404s (empty registry, unresolvable
 * page). The resolver, registry and form are mocked — this test pins
 * the PAGE's wiring, not the resolver's internals (those have their
 * own suite under
 * `src/app/admin/plantillas/[area]/firma/__tests__/`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

const resolveFirmaPageDataMock = vi.hoisted(() => vi.fn());

vi.mock('@/app/admin/plantillas/[area]/firma/resolveFirmaPageData', () => ({
  resolveFirmaPageData: resolveFirmaPageDataMock,
}));

const areaConfigsMock = vi.hoisted(() => new Map<string, unknown>());

vi.mock('@/features/plantillas-editor/infrastructure/areaConfigRegistry', () => ({
  AREA_CONFIGS: areaConfigsMock,
}));

vi.mock('@/features/firma-correo/presentation/components/FirmaForm', () => ({
  FirmaForm: ({ initialFirma }: { initialFirma: unknown }) => (
    <div data-testid="firma-form" data-initial={JSON.stringify(initialFirma)} />
  ),
}));

import ConfiguracionFirmaPage from '../page';

const FIRMA_FIXTURE = {
  nombre: 'Ana Cobranza',
  area: 'Cobranza',
  correo: 'ana@holomedic.com',
  telefono: '',
  anexo: '',
};

describe('/configuracion/firma page', () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    resolveFirmaPageDataMock.mockReset();
    areaConfigsMock.clear();
    areaConfigsMock.set('consolidados', {});
    areaConfigsMock.set('cobranza', {});
  });

  it('resuelve la PRIMERA área registrada y renderiza FirmaForm con la firma', async () => {
    resolveFirmaPageDataMock.mockResolvedValue({ notFound: false, initialFirma: FIRMA_FIXTURE });
    const jsx = await ConfiguracionFirmaPage();
    render(jsx);
    expect(resolveFirmaPageDataMock).toHaveBeenCalledWith('consolidados');
    expect(screen.getByTestId('firma-form')).toBeInTheDocument();
    expect(screen.getByTestId('firma-form')).toHaveAttribute(
      'data-initial',
      JSON.stringify(FIRMA_FIXTURE),
    );
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('resuelve a 404 cuando la página no se puede resolver (sin sesión / usuario ausente)', async () => {
    resolveFirmaPageDataMock.mockResolvedValue({ notFound: true });
    await expect(ConfiguracionFirmaPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
  });

  it('resuelve a 404 cuando el registro de áreas está vacío (defensivo)', async () => {
    areaConfigsMock.clear();
    await expect(ConfiguracionFirmaPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(resolveFirmaPageDataMock).not.toHaveBeenCalled();
  });
});
