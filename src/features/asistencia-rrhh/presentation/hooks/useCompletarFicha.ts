'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { DatosFicha } from '@/features/asistencia-rrhh/domain/entities';

/**
 * Completes one ficha via POST /api/asistencia-rrhh/fichas/[id]
 * (REQ-F1-10, ADR-6 session namespace). The hook owns the fetch and its
 * outcomes so the component stays declarative:
 *
 *  - success (200): the RSC tree refreshes (the completed ficha leaves
 *    the queue) and `error` stays null;
 *  - server rejection (400/404/500): the server's `error` message is
 *    surfaced verbatim, NO refresh;
 *  - network failure: a friendly offline message, NO refresh.
 *
 * Wire body follows the design contract with `fecha_ingreso`
 * (snake_case); optional fields absent are simply omitted.
 */
export function useCompletarFicha(fichaId: number): {
  completar: (datos: DatosFicha) => Promise<boolean>;
  enviando: boolean;
  error: string | null;
} {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completar = useCallback(
    async (datos: DatosFicha): Promise<boolean> => {
      setEnviando(true);
      setError(null);
      try {
        const res = await fetch(`/api/asistencia-rrhh/fichas/${fichaId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dni: datos.dni,
            apellidos: datos.apellidos,
            area: datos.area,
            fecha_ingreso: datos.fechaIngreso,
            nombres: datos.nombres,
            cargo: datos.cargo,
          }),
        });
        if (!res.ok) {
          const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(cuerpo?.error ?? `Error ${res.status} al completar la ficha`);
          return false;
        }
        router.refresh();
        return true;
      } catch {
        setError('No se pudo conectar con el servidor');
        return false;
      } finally {
        setEnviando(false);
      }
    },
    [fichaId, router],
  );

  return { completar, enviando, error };
}
