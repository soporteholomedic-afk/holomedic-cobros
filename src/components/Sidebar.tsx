'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, FileSpreadsheet, Home, DollarSign, Menu, X } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/cobranza', label: 'Cobranza', icon: DollarSign },
  { href: '/valoraciones', label: 'Valoraciones', icon: FileSpreadsheet },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const closeMobile = useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  const toggleMobile = useCallback(() => {
    setIsMobileOpen((prev) => !prev);
  }, []);

  return (
    <>
      {/* Mobile hamburger button — visible below md */}
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

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0`}
      >
        {/* Brand */}
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

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
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
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800">
          <p className="text-[10px] text-slate-600">
            Holomedic S.A.C. &copy; {new Date().getFullYear()}
          </p>
        </div>
      </aside>
    </>
  );
}
