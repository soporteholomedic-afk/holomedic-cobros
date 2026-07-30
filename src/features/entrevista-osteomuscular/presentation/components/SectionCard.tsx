'use client';

export interface InfoReportadaItem {
  label: string;
  path: string;
  checked: boolean;
}

export type TableRow =
  | {
      kind: 'row';
      label: string;
      dxPath: string;
      ixPath: string;
      dxChecked: boolean;
      ixChecked: boolean;
      isSubItem?: boolean;
    }
  | { kind: 'group-label'; label: string };

interface SectionCardProps {
  titulo: string;
  tieneDolor: boolean;
  onTieneDolorChange: (value: boolean) => void;
  inicioMolestia: string;
  onInicioMolestiaChange: (value: string) => void;
  infoReportada: InfoReportadaItem[];
  rows: TableRow[];
  onCheckChange: (path: string, value: boolean) => void;
  observaciones: string;
  onObservacionesChange: (value: string) => void;
}

export function SectionCard({
  titulo,
  tieneDolor,
  onTieneDolorChange,
  inicioMolestia,
  onInicioMolestiaChange,
  infoReportada,
  rows,
  onCheckChange,
  observaciones,
  onObservacionesChange,
}: SectionCardProps) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-3 ${
        tieneDolor ? 'ring-2 ring-sky-200' : ''
      }`}
    >
      {/* Left panel */}
      <div className="p-6 lg:border-r border-slate-200">
        {/* Header with toggle */}
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-sky-700">{titulo}</h4>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {tieneDolor ? 'Sí' : 'No'}
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={tieneDolor}
                onChange={(e) => onTieneDolorChange(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600" />
            </label>
          </div>
        </div>

        {/* Inicio de molestia */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            INICIO DE MOLESTIA
          </label>
          <input
            type="text"
            value={inicioMolestia}
            onChange={(e) => onInicioMolestiaChange(e.target.value)}
            className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm transition-all focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            placeholder="ej. Hace 2 semanas"
          />
        </div>

        {/* Info reportada */}
        <div className="space-y-2">
          <p className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            INFORMACIÓN REPORTADA
          </p>
          <div className="grid grid-cols-2 gap-2">
            {infoReportada.map((item) => (
              <label
                key={item.path}
                className="flex items-center text-sm text-slate-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="mr-2 rounded text-sky-600"
                  checked={item.checked}
                  onChange={(e) => onCheckChange(item.path, e.target.checked)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>

        {/* Image placeholder */}
        <div className="mt-8 border-t border-slate-200 pt-4 flex justify-center bg-slate-50 rounded-lg p-4">
          <div className="h-48 flex items-center justify-center text-slate-400 italic text-sm">
            [Imagen {titulo}]
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="lg:col-span-2 p-6">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="text-left p-3">SÍNTOMAS / SIGNOS</th>
              <th className="text-center p-3 w-24">DX</th>
              <th className="text-center p-3 w-24">IX</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, idx) => {
              if (row.kind === 'group-label') {
                return (
                  <tr key={idx}>
                    <td
                      colSpan={3}
                      className="p-3 text-sm font-semibold text-slate-700 bg-slate-50/50"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={idx}>
                  <td
                    className={`p-3 text-sm ${
                      row.isSubItem
                        ? 'pl-8 text-slate-500'
                        : 'text-slate-700'
                    }`}
                  >
                    {row.label}
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      className="rounded text-sky-600"
                      checked={row.dxChecked}
                      onChange={(e) =>
                        onCheckChange(row.dxPath, e.target.checked)
                      }
                    />
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      className="rounded text-sky-600"
                      checked={row.ixChecked}
                      onChange={(e) =>
                        onCheckChange(row.ixPath, e.target.checked)
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Observaciones */}
        <div className="mt-6">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            OBSERVACIONES ESPECÍFICAS - {titulo}
          </label>
          <textarea
            value={observaciones}
            onChange={(e) => onObservacionesChange(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm transition-all focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 resize-none h-24"
            placeholder="Notas adicionales..."
          />
        </div>
      </div>
    </div>
  );
}
