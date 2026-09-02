'use client';

import { useState } from 'react';

import type { DatosFicha, Empleado } from '@/features/asistencia-rrhh/domain/entities';
import { useCompletarFicha } from '@/features/asistencia-rrhh/presentation/hooks/useCompletarFicha';

/**
 * Completion form for one pending ficha (REQ-F1-10/13). dni/apellidos/
 * area/fecha_ingreso are required by the API contract; nombres arrives
 * prefilled with the device-reported name (RRHH may correct it). The
 * hook owns the POST + refresh; errors surface under the form.
 */
interface CompletarFichaFormProps {
  ficha: Empleado;
}

export function CompletarFichaForm({ ficha }: CompletarFichaFormProps) {
  const { completar, enviando, error } = useCompletarFicha(ficha.id);
  const [dni, setDni] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [nombres, setNombres] = useState(ficha.nombres ?? '');
  const [area, setArea] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState('');

  const enviar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const datos: DatosFicha = { dni, apellidos, area, fechaIngreso };
    if (nombres.trim() !== '') datos.nombres = nombres;
    await completar(datos);
  };

  return (
    <form onSubmit={(e) => void enviar(e)} className="space-y-3 rounded-md border p-4">
      <p className="text-sm text-muted-foreground">
        Usuario de equipo: <span className="font-mono">{ficha.userId}</span>
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">DNI</span>
          <input
            type="text"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            maxLength={15}
            required
            className="rounded-md border px-2 py-1.5"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Apellidos</span>
          <input
            type="text"
            value={apellidos}
            onChange={(e) => setApellidos(e.target.value)}
            maxLength={100}
            required
            className="rounded-md border px-2 py-1.5"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Nombres</span>
          <input
            type="text"
            value={nombres}
            onChange={(e) => setNombres(e.target.value)}
            maxLength={100}
            className="rounded-md border px-2 py-1.5"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Área</span>
          <input
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            maxLength={80}
            required
            className="rounded-md border px-2 py-1.5"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Fecha de ingreso</span>
          <input
            type="date"
            value={fechaIngreso}
            onChange={(e) => setFechaIngreso(e.target.value)}
            required
            className="rounded-md border px-2 py-1.5"
          />
        </label>
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {enviando ? 'Completando…' : 'Completar ficha'}
      </button>
    </form>
  );
}
