'use client';

import { useRouter } from 'next/navigation';

interface PaginacionProps {
  totalPaginas: number;
  paginaActual: number;
  baseUrl?: string;
  onChange?: (pagina: number) => void;
}

function resolveUrl(baseUrl: string, pagina: number): string {
  if (pagina === 1) return baseUrl;
  return `${baseUrl}/pagina${pagina}`;
}

export function Paginacion({ totalPaginas, paginaActual, baseUrl, onChange }: PaginacionProps) {
  const router = useRouter();

  if (totalPaginas <= 0) return null;

  const handleClick = (pagina: number) => {
    if (pagina === paginaActual) return;
    if (onChange) {
      onChange(pagina);
    } else if (baseUrl) {
      router.push(resolveUrl(baseUrl, pagina));
    }
  };

  return (
    <div className="flex items-center justify-center gap-1.5 mt-6">
      {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((num) => (
        <button
          key={num}
          type="button"
          onClick={() => handleClick(num)}
          disabled={num === paginaActual}
          className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
            num === paginaActual
              ? 'bg-[#0070c0] text-white cursor-default'
              : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100 cursor-pointer'
          }`}
        >
          {num}
        </button>
      ))}
    </div>
  );
}
