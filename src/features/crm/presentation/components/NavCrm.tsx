'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * NavCrm — the CRM section navigation (rediseno-crm-panel task 11.3).
 * The retired Cola de hoy / Mi cartera views expose NO entry (spec
 * "Retirement of Superseded Views"): the operator panel at /crm is the
 * single operator surface, so the flow is Empresas → (panel) and an
 * admin additionally manages imports and reviews productivity.
 *
 * Presentation-only: the /crm layout reads the session server-side and
 * passes `permisos` down, so this client component stays free of
 * session fetching. The proxy (RUTAS_PROTEGIDAS) owns authorization —
 * hiding Importar without `crm_admin` is wayfinding, not a security
 * boundary.
 */

interface SeccionCrm {
  href: string;
  label: string;
  /**
   * Extra route prefix this section owns, for sections whose page tree
   * lives OUTSIDE their own href: the panel root is /crm (exact), but
   * the legacy /crm/empresas/* deep links (now redirect stubs) land
   * under it too. Sections without a prefix match their href and its
   * subroutes.
   */
  prefijo?: string;
  /** Optional elevation required to see the entry. */
  permiso?: 'crm_admin';
}

const SECCIONES: readonly SeccionCrm[] = [
  { href: '/crm', label: 'Empresas', prefijo: '/crm/empresas' },
  { href: '/crm/importar', label: 'Importar', permiso: 'crm_admin' },
  { href: '/crm/productividad', label: 'Productividad' },
];

interface NavCrmProps {
  /** Session permisos, resolved server-side by the /crm layout. */
  permisos: string[];
}

function estaActiva(seccion: SeccionCrm, pathname: string): boolean {
  if (pathname === seccion.href) return true;
  const prefijo = seccion.prefijo ?? `${seccion.href}/`;
  return pathname === prefijo || pathname.startsWith(`${prefijo}/`);
}

export function NavCrm({ permisos }: NavCrmProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones CRM" className="flex flex-wrap gap-2">
      {SECCIONES.filter((seccion) => !seccion.permiso || permisos.includes(seccion.permiso)).map(
        (seccion) => {
          const activa = estaActiva(seccion, pathname);
          return (
            <Link
              key={seccion.href}
              href={seccion.href}
              aria-current={activa ? 'page' : undefined}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activa
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-sky-50 hover:text-sky-700 dark:text-slate-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300'
              }`}
            >
              {seccion.label}
            </Link>
          );
        },
      )}
    </nav>
  );
}
