'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Building2, FileSpreadsheet, Home, DollarSign, FileText, Mail, Menu, X, LogOut, Settings } from 'lucide-react';
import AreasMenuItem from './AreasMenuItem';
import { useAuth } from '@/features/auth/presentation/hooks/useAuth';
import { plantillasEntryHref } from '@/features/plantillas-editor/infrastructure/areaConfigRegistry';

const navItems = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/cobranza', label: 'Cobranza', icon: DollarSign },
  { href: '/consolidados', label: 'Consolidados', icon: FileText },
  { href: '/valoraciones', label: 'Valoraciones', icon: FileSpreadsheet },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { user, logout, loading } = useAuth();

  // plantillas-area-usuario: the Plantillas entry opens the editor of the
  // logged-in user's area (slug of user.area, e.g. "Facturación" →
  // /admin/plantillas/facturacion). A user WITHOUT an area gets the entry
  // BLOCKED (disabled, non-navigable) — never a consolidados fallback.
  // While auth is loading the slot renders nothing (avoids a misleading
  // disabled flash for users who do have an area).
  const plantillasHref = plantillasEntryHref(user?.area);

  const closeMobile = useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  const toggleMobile = useCallback(() => {
    setIsMobileOpen((prev) => !prev);
  }, []);

  const isAdmin = user?.permisos.includes('admin');
  // crm (S1a/pr1): the CRM entry is gated by its OWN permiso — the
  // route requires exactly `crm` via RUTAS_PROTETGIDAS; crm_admin is a
  // separate elevation for the import surface and never shown here.
  const canCrm = user?.permisos.includes('crm');
  // configuracion-tabs (S4): `firma_correo` no longer opens a separate
  // "Mi firma" entry — it now feeds the shared "Configuración" entry
  // below. The MI FIRMA tab route keeps its own `firma_correo` gate in
  // RUTAS_PROTEGIDAS (design D1/D6 unchanged at the route level).
  const canEditFirma = user?.permisos.includes('firma_correo');
  // configuracion-tabs (S2/S3): ONE "Configuración" entry replaces the
  // separate "Usuarios" and "Mi firma" entries. Visible with `admin`
  // OR `firma_correo`; each holder lands on the FIRST tab it can open
  // — the tabs bar inside the page filters the rest, and every
  // /configuracion sub-route keeps its own per-tab permiso in
  // RUTAS_PROTEGIDAS.
  const canSeccionConfiguracion = isAdmin === true || canEditFirma === true;
  const configuracionHref = isAdmin
    ? '/configuracion/usuarios'
    : '/configuracion/firma';
  // Boundary-safe prefix: /configuracion plus any sub-route, without
  // matching lookalikes like /configuracion-otros.
  const configuracionSectionActiva =
    pathname === '/configuracion' || pathname.startsWith('/configuracion/');

  return (
    <>
      <button
        onClick={toggleMobile}
        className="fixed top-4 left-4 z-50 md:hidden flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 text-white shadow-lg hover:bg-slate-800 transition-colors"
        aria-label={isMobileOpen ? 'Cerrar menú' : 'Abrir menú'}
      >
        {isMobileOpen ? (
          <X className="w-5 h-5" />
        ) : (
          <Menu className="w-5 h-5" />
        )}
      </button>

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={closeMobile}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0`}
      >
        <Link href="/" onClick={closeMobile} className="flex items-center space-x-3 px-6 h-16 border-b border-slate-800">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 shadow-md shadow-sky-500/20 text-white">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-sky-100 to-sky-400 bg-clip-text text-transparent">
              Holomedic
            </span>
            <span className="block text-[10px] text-sky-400 font-semibold uppercase tracking-wider -mt-0.5">
              Facturación
            </span>
          </div>
        </Link>

        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {navItems
            .map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobile}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-sky-950/50 text-sky-300 border border-sky-800/30 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400 shadow-sm shadow-sky-400/50" />
                  )}
                </Link>
              );
            })}

          <AreasMenuItem onItemClick={closeMobile} />

          {!loading &&
            (plantillasHref ? (
              <Link
                href={plantillasHref}
                onClick={closeMobile}
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  pathname === plantillasHref
                    ? 'bg-sky-950/50 text-sky-300 border border-sky-800/30 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Mail className="w-5 h-5" />
                <span>Plantillas</span>
                {pathname === plantillasHref && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400 shadow-sm shadow-sky-400/50" />
                )}
              </Link>
            ) : (
              <span
                data-plantillas-bloqueado=""
                aria-disabled="true"
                title="Sin área asignada: pedile a un administrador que te asigne una en Configuración → Usuarios"
                className="flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-500 opacity-60 cursor-not-allowed select-none"
              >
                <Mail className="w-5 h-5" />
                <span>Plantillas</span>
              </span>
            ))}

          {canCrm && (
            <Link
              href="/crm"
              onClick={closeMobile}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                pathname === '/crm'
                  ? 'bg-sky-950/50 text-sky-300 border border-sky-800/30 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Building2 className="w-5 h-5" />
              <span>CRM</span>
              {pathname === '/crm' && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400 shadow-sm shadow-sky-400/50" />
              )}
            </Link>
          )}

          {canSeccionConfiguracion && (
            <Link
              href={configuracionHref}
              onClick={closeMobile}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                configuracionSectionActiva
                  ? 'bg-sky-950/50 text-sky-300 border border-sky-800/30 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span>Configuración</span>
              {configuracionSectionActiva && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400 shadow-sm shadow-sky-400/50" />
              )}
            </Link>
          )}
        </nav>

        <div className="px-3 py-3 border-t border-slate-800 space-y-2">
          {!loading && user && (
            <div className="px-4 py-2">
              <p className="text-xs text-slate-500 truncate">{user.nombre}</p>
              <p className="text-[10px] text-slate-600 capitalize">{user.area}</p>
            </div>
          )}
          {!loading && user && (
            <button
              onClick={() => { logout(); closeMobile(); }}
              className="flex items-center space-x-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-950/20 transition-all duration-200 w-full"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar sesión</span>
            </button>
          )}
          <div className="px-4 py-2">
            <p className="text-[10px] text-slate-600">
              Holomedic S.A.C. &copy; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
