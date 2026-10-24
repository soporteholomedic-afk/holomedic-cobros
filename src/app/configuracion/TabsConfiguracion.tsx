'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layers, PenLine, Users } from 'lucide-react';

import { useAuth } from '@/features/auth/presentation/hooks/useAuth';

interface TabEntry {
  href: string;
  label: string;
  icon: typeof Users;
  /** The tab is visible only to sessions holding this permiso. */
  permiso: 'admin' | 'firma_correo';
}

const TABS: readonly TabEntry[] = [
  { href: '/configuracion/usuarios', label: 'Usuarios', icon: Users, permiso: 'admin' },
  { href: '/configuracion/areas', label: 'Áreas', icon: Layers, permiso: 'admin' },
  { href: '/configuracion/firma', label: 'Mi Firma', icon: PenLine, permiso: 'firma_correo' },
] as const;

/**
 * Tab bar of the `/configuracion` section (feature `configuracion-tabs`,
 * S3: "Dentro quiero tener tabs de: USUARIOS, AREAS (VISTA VACÍA), MI
 * FIRMA.").
 *
 * Each tab maps 1:1 to a sub-route gated by exactly ONE permiso (see
 * RUTAS_PROTEGIDAS), so the bar simply filters by the session permisos:
 * `admin` → Usuarios + Áreas, `firma_correo` → Mi Firma. A session
 * holding no tab permiso renders nothing (the proxy would have denied
 * the page long before this bar mounts).
 */
export default function TabsConfiguracion() {
  const pathname = usePathname();
  const { user } = useAuth();
  const permisos = user?.permisos ?? [];
  const visibles = TABS.filter((tab) => permisos.includes(tab.permiso));

  if (visibles.length === 0) return null;

  return (
    <nav
      aria-label="Secciones de configuración"
      className="mt-3 flex w-fit gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60"
    >
      {visibles.map(({ href, label, icon: Icon }) => {
        const activa = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={activa ? 'page' : undefined}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activa
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
