import React from 'react';
import Link from 'next/link';
import { Activity, FileSpreadsheet } from 'lucide-react';

interface NavbarProps {
  onReset?: () => void;
  hasData?: boolean;
}

export default function Navbar({ onReset, hasData }: NavbarProps) {
  const showButton = hasData === true;

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-900/95 border-b border-slate-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 shadow-md shadow-sky-500/20 text-white">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-sky-100 to-sky-400 bg-clip-text text-transparent">
                Holomedic
              </span>
              <span className="block text-xs text-sky-400 font-semibold uppercase tracking-wider -mt-1">
                Facturación & Saldos
              </span>
            </div>
          </Link>

          <div className="flex items-center space-x-4">
            {showButton && (
              <button
                onClick={onReset}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-all duration-300 hover:scale-105"
              >
                <FileSpreadsheet className="w-4 h-4 text-sky-400" />
                <span>Cargar nuevo Excel</span>
              </button>
            )}
            <div className="hidden md:flex items-center space-x-2 px-3 py-1 rounded-full bg-sky-950/40 border border-sky-800/30 text-xs text-sky-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span>MVP Ready</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
