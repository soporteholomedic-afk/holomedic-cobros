'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * NavCrm — the CRM section navigation (post-verify UX remediation).
 * Renders the product owner's commercial flow in order: a vendedor
 * opens "Cola de hoy", enters an empresa's detail from the registry or
 * the queue, and registers the send/transition; an admin additionally
 * manages cartera, imports new companies and reviews productivity.
 *
 * Presentation-only: the /crm layout reads the session server-side and
 * passes `permisos` down (cartera/page.tsx precedent), so this client
 * component stays free of session fetching. The proxy (RUTAS_PROTEGIDAS)
 * owns authorization — hiding Importar without `crm_admin` is wayfinding,
 * not a security boundary.
 */

interface SeccionCrm {
  href: string;
  label: string;
  /**
   * Extra route prefix this section owns, for sections whose page tree
   * lives OUTSIDE their own href: the registry root is /crm (exact), but
   * the detail pages /crm/empresas/[id] belong to it too. Sections
   * without a prefix match their href and its subroutes.
   */
  prefijo?: string;
  /** Optional elevation required to see the entry. */
  permiso?: 'crm_admin';
}

const SECCIONES: readonly SeccionCrm[] = [
  { href: '/crm', label: 'Empresas', prefijo: '/crm/empresas' },
  { href: '/crm/cola', label: 'Cola de hoy' },
  { href: '/crm/cartera', label: 'Mi cartera' },
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
                  : 'text-slate-600 hover:bg-sky-50 hover:text-sky-700'
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
