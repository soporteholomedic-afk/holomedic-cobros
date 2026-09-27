import { describe, expect, it, vi } from 'vitest';

/**
 * Retirement pins (rediseno-crm-panel task 11.1, spec "Retirement of
 * Superseded Views"): /crm/cola, /crm/cartera, /crm/empresas/nueva and
 * /crm/empresas/[id] are redirect stubs — navigating to them lands the
 * operator on the /crm panel. `redirect()` inside a Server Component
 * throws NEXT_REDIRECT (synchronously in a sync component, during the
 * body of an async one); the mock reproduces that contract and each
 * assertion observes the attempted destination. The proxy still gates
 * these paths with the `crm` permission (the /crm prefix entry) BEFORE
 * the stub runs — no route registration changed.
 */

const destinos: string[] = [];

vi.mock('next/navigation', () => ({
  redirect: (url: string): never => {
    destinos.push(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock('@/lib/auth', () => ({
  getSession: async () => null,
}));

import PaginaCola from '../cola/page';
import PaginaCartera from '../cartera/page';
import PaginaNuevaEmpresa from '../empresas/nueva/page';
import PaginaDetalleEmpresa from '../empresas/[id]/page';

/**
 * Renders a retired page and returns the redirect destinations it
 * attempted. redirect() always aborts the render by throwing, so a
 * stub's body never completes — sync throws and async rejections are
 * normalized here.
 */
async function destinosDe(render: () => unknown): Promise<string[]> {
  destinos.length = 0;
  try {
    await render();
  } catch {
    // Expected: the redirect contract aborts the render.
  }
  return [...destinos];
}

const paginasRetiradas: readonly (readonly [string, () => unknown])[] = [
  ['/crm/cola', () => PaginaCola()],
  ['/crm/cartera', () => PaginaCartera()],
  ['/crm/empresas/nueva', () => PaginaNuevaEmpresa()],
  ['/crm/empresas/[id]', () => PaginaDetalleEmpresa()],
];

describe('Rutas CRM retiradas (task 11.1)', () => {
  it.each(paginasRetiradas)('%s aterriza en el panel /crm', async (_ruta, render) => {
    expect(await destinosDe(render)).toEqual(['/crm']);
  });
});
