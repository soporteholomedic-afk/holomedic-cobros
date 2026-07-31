'use client';

import type { InfoReportadaItem } from './SectionCard';

export interface ParestesiaRow {
  label: string;
  dxPath: string;
  ixPath: string;
  dxChecked: boolean;
  ixChecked: boolean;
}

export interface UmbralCriterioItem {
  label: string;
  path: string;
  ixPath: string;
  checked: boolean;
  ixChecked: boolean;
}

export interface UmbralBlock {
  criterios: UmbralCriterioItem[];
}

export interface MolestiasLevesBlock {
  dxPath: string;
  ixPath: string;
  dxChecked: boolean;
  ixChecked: boolean;
}

interface ParestesiaCardProps {
  titulo: string;
  tieneParestesia: boolean;
  inicioMolestia: string;
  infoReportada: InfoReportadaItem[];
  rows: ParestesiaRow[];
  umbral: UmbralBlock;
  molestiasLeves: MolestiasLevesBlock;
  onCheckChange: (path: string, value: boolean) => void;
  onTieneParestesiaChange: (value: boolean) => void;
  onInicioMolestiaChange: (value: string) => void;
}

export function ParestesiaCard({
  titulo,
  tieneParestesia,
  inicioMolestia,
  infoReportada,
  rows,
  umbral,
  molestiasLeves,
  onCheckChange,
  onTieneParestesiaChange,
  onInicioMolestiaChange,
}: ParestesiaCardProps) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-3 ${
        tieneParestesia ? 'ring-2 ring-sky-200' : ''
      }`}
    >
      {/* Left panel */}
      <div className="p-6 lg:border-r border-slate-200">
        {/* Header with SI/NO */}
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-sky-700">{titulo}</h4>
          <div className="flex items-center gap-3">
            <label className="flex items-center text-sm text-slate-700 cursor-pointer">
              <input
                type="radio"
                className="mr-1.5 text-sky-600"
                checked={tieneParestesia}
                onChange={() => onTieneParestesiaChange(true)}
              />
              SI
            </label>
            <label className="flex items-center text-sm text-slate-700 cursor-pointer">
              <input
                type="radio"
                className="mr-1.5 text-sky-600"
                checked={!tieneParestesia}
                onChange={() => onTieneParestesiaChange(false)}
              />
              NO
            </label>
          </div>
        </div>

        {/* Inicio de molestia */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            ¿CUÁNDO SE INICIÓ LA MOLESTIA?
          </label>
          <input
            type="text"
            value={inicioMolestia}
            onChange={(e) => onInicioMolestiaChange(e.target.value)}
            className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm transition-all focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            placeholder="(años, meses, semanas o días)"
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
          <div className="h-48 flex items-center justify-center text-slate-400 italic text-sm text-center">
            [Imagen {titulo}]
            <br />
            N: Indicar sobre la figura el área de distribución de la molestia
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
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td className="p-3 text-sm text-slate-700">{row.label}</td>
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    className="rounded text-sky-600"
                    checked={row.dxChecked}
                    onChange={(e) => onCheckChange(row.dxPath, e.target.checked)}
                  />
                </td>
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    className="rounded text-sky-600"
                    checked={row.ixChecked}
                    onChange={(e) => onCheckChange(row.ixPath, e.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Umbral positivo */}
        <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] bg-slate-50 border-b border-slate-200">
            <div className="p-3 border-r border-slate-200">
              <p className="text-xs font-bold text-slate-700 uppercase">
                Umbral positivo{' '}
                <span className="font-normal normal-case">(marcar x en ☐)</span>
              </p>
            </div>
            <div className="w-16 flex items-center justify-center border-r border-slate-200">
              <span className="text-xs font-bold text-slate-500">DX</span>
            </div>
            <div className="w-16 flex items-center justify-center">
              <span className="text-xs font-bold text-slate-500">IX</span>
            </div>
          </div>
          {umbral.criterios.map((c) => (
            <div
              key={c.path}
              className="grid grid-cols-[1fr_auto_auto] border-b border-slate-200"
            >
              <div className="p-3 border-r border-slate-200">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded text-sky-600"
                    checked={c.checked || c.ixChecked}
                    onChange={(e) => {
                      onCheckChange(c.path, e.target.checked);
                      onCheckChange(c.ixPath, e.target.checked);
                    }}
                  />
                  {c.label}
                </label>
              </div>
              <div className="w-16 flex items-center justify-center border-r border-slate-200">
                <input
                  type="checkbox"
                  className="rounded text-sky-600"
                  checked={c.checked}
                  onChange={(e) => onCheckChange(c.path, e.target.checked)}
                />
              </div>
              <div className="w-16 flex items-center justify-center">
                <input
                  type="checkbox"
                  className="rounded text-sky-600"
                  checked={c.ixChecked}
                  onChange={(e) => onCheckChange(c.ixPath, e.target.checked)}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Molestias leves */}
        <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto]">
            <div className="p-3 bg-slate-50 border-r border-slate-200">
              <p className="text-xs font-bold text-slate-700 uppercase">
                Molestias leves
              </p>
              <p className="text-xs text-slate-500">
                episodios de molestias por debajo del umbral
              </p>
            </div>
            <div className="w-16 flex items-center justify-center border-r border-slate-200">
              <input
                type="checkbox"
                className="rounded text-sky-600"
                checked={molestiasLeves.dxChecked}
                onChange={(e) => onCheckChange(molestiasLeves.dxPath, e.target.checked)}
              />
            </div>
            <div className="w-16 flex items-center justify-center">
              <input
                type="checkbox"
                className="rounded text-sky-600"
                checked={molestiasLeves.ixChecked}
                onChange={(e) => onCheckChange(molestiasLeves.ixPath, e.target.checked)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
