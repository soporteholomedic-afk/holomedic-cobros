'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import { ToasterClient } from './ToasterClient';

export default function SessionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname.startsWith('/auth/');

  if (isAuthPage) {
    return (
      <div className="min-h-full flex">
        <ToasterClient />
        <main className="flex-1 min-h-screen flex flex-col">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full flex">
      <Sidebar />
      <ToasterClient />
      <main className="flex-1 md:ml-64 min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
        {children}
      </main>
    </div>
  );
}
