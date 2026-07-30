'use client';

interface PaginacionProps {
  totalPaginas: number;
  paginaActual: number;
  onChange?: (pagina: number) => void;
}

export function Paginacion({ totalPaginas, paginaActual, onChange }: PaginacionProps) {
  if (totalPaginas <= 0) return null;

  return (
    <div className="flex items-center justify-center gap-1.5 mt-6">
      {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((num) => (
        <button
          key={num}
          type="button"
          onClick={() => onChange?.(num)}
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
