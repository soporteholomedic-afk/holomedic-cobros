'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layers, ChevronDown, Bone, Stethoscope, Award } from 'lucide-react';

interface AreaEntry {
  href: string;
  label: string;
  icon: typeof Bone;
}

const SUB_AREAS: readonly AreaEntry[] = [
  { href: '/areas/musculoesqueletica', label: 'MusculoEsqueletica', icon: Bone },
  { href: '/areas/medicina', label: 'Medicina', icon: Stethoscope },
  { href: '/areas/calidad', label: 'Calidad', icon: Award },
] as const;

interface AreasMenuItemProps {
  onItemClick?: () => void;
}

export default function AreasMenuItem({ onItemClick }: AreasMenuItemProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isAnyActive = SUB_AREAS.some((a) => pathname === a.href);

  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleItemClick = () => {
    setIsOpen(false);
    onItemClick?.();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls="areas-menu"
        className={`flex items-center w-full space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
          isAnyActive
            ? 'bg-sky-950/50 text-sky-300 border border-sky-800/30 shadow-sm'
            : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
        }`}
      >
        <Layers className="w-5 h-5" />
        <span className="flex-1 text-left">Areas</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          id="areas-menu"
          role="menu"
          aria-label="Areas"
          className="mt-1 ml-4 space-y-1 border-l border-slate-800 pl-3"
        >
          {SUB_AREAS.map((area) => {
            const isActive = pathname === area.href;
            const Icon = area.icon;
            return (
              <Link
                key={area.href}
                href={area.href}
                role="menuitem"
                onClick={handleItemClick}
                className={`flex items-center space-x-3 px-4 py-2 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-sky-950/50 text-sky-300'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{area.label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400 shadow-sm shadow-sky-400/50" />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
