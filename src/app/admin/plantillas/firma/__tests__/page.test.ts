/**
 * Tests for the canonical `/admin/plantillas/firma` redirect page
 * (editor-firmas task 3.3).
 *
 * Spec `firma-correo` / "Canonical entry":
 *  - WHEN opening `/admin/plantillas/firma`
 *  - THEN redirect to the FIRST registered area's signature page.
 * A defensive branch: an EMPTY registry (no registered areas) has no
 * redirect target → `notFound()`.
 *
 * Mock fidelity: the `next/navigation` mocks THROW like the real
 * implementations (`redirect` → NEXT_REDIRECT, `notFound` →
 * NEXT_NOT_FOUND) so the page's control flow — a redirect terminates
 * the render — is exercised, not just the call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock, notFoundMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}));

import CanonicalFirmaPage from '../page';

describe('canonical /admin/plantillas/firma page', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    notFoundMock.mockClear();
  });

  it('redirects to the FIRST registered area signature page (consolidados)', () => {
    expect(() => CanonicalFirmaPage()).toThrow(
      'NEXT_REDIRECT:/admin/plantillas/consolidados/firma',
    );

    expect(redirectMock).toHaveBeenCalledWith('/admin/plantillas/consolidados/firma');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('calls notFound() when the area registry is empty (no redirect target)', () => {
    vi.resetModules();
    vi.doMock('@/features/plantillas-editor/infrastructure/areaConfigRegistry', () => ({
      AREA_CONFIGS: new Map(),
      getAreaConfig: () => undefined,
    }));
    vi.doMock('next/navigation', () => ({
      redirect: redirectMock,
      notFound: notFoundMock,
    }));

    return import('../page').then(({ default: freshPage }) => {
      expect(() => freshPage()).toThrow('NEXT_NOT_FOUND');

      expect(notFoundMock).toHaveBeenCalledTimes(1);
      expect(redirectMock).not.toHaveBeenCalled();
    });
  });
});
