'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { ClienteSiglaSinFicha } from '../../application/listarEmpresasInactivas';
import type { Empresa } from '../../domain/entities';

export interface EstadoAltaSigla {
  /** The SIGLA client whose ficha is being created; null while closed. */
  fila: ClienteSiglaSinFicha | null;
  sectores: string[];
  /** Loads the sector list and opens the alta prefilled for that client. */
  abrir: (fila: ClienteSiglaSinFicha) => Promise<void>;
  cerrar: () => void;
  /** POST /api/crm/empresas + PATCH relación 'cliente' (S11: ya es cliente SIGLA). */
  crear: (cuerpo: Record<string, unknown>) => Promise<Empresa | { error: string }>;
  crearSector: (nombre: string) => Promise<string | { error: string }>;
  crearOportunidad: (idEmpresa: string, cuerpo: Record<string, unknown>) => Promise<unknown | { error: string }>;
}

/**
 * Bridge between the "Solo en SIGLA" segment and the alta panel (S11): the
 * SIGLA client has NO ficha yet, so creating one prefills razón social, RUC
 * and contact data from SIGLA and, right after the POST succeeds, flips the
 * relación to 'cliente' through the existing PATCH endpoint — the client
 * already sends patients. A relation-PATCH failure keeps the ficha standing
 * (prospecto) and warns with a toast: nothing is lost.
 */
export function useAltaDesdeSigla(onCreada: () => void): EstadoAltaSigla {
  const [fila, setFila] = useState<ClienteSiglaSinFicha | null>(null);
  const [sectores, setSectores] = useState<string[]>([]);

  const abrir = useCallback(async (nueva: ClienteSiglaSinFicha) => {
    setFila(nueva);
    try {
      const res = await fetch('/api/crm/sectores', { cache: 'no-store' });
      const body = (await res.json()) as { success?: boolean; sectores?: { nombre: string }[] };
      if (res.ok && body.success) setSectores((body.sectores ?? []).map((s) => s.nombre));
    } catch {
      setSectores([]); // el alta funciona igual: el usuario crea el sector desde el panel
    }
  }, []);

  const cerrar = useCallback(() => setFila(null), []);

  const crear = useCallback(
    async (cuerpo: Record<string, unknown>): Promise<Empresa | { error: string }> => {
      try {
        const res = await fetch('/api/crm/empresas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo),
        });
        const body = (await res.json()) as { success?: boolean; empresa?: Empresa; error?: string };
        if (!res.ok || !body.success || !body.empresa) {
          return { error: body.error ?? 'No se pudo crear la empresa' };
        }
        try {
          const r2 = await fetch(`/api/crm/empresas/${body.empresa.idEmpresa}/relacion`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relacion: 'cliente' }),
          });
          if (!r2.ok) {
            toast.error('La ficha quedó creada como prospecto: cámbiale la relación a cliente desde su ficha.');
          }
        } catch {
          toast.error('La ficha quedó creada como prospecto: cámbiale la relación a cliente desde su ficha.');
        }
        onCreada();
        return body.empresa;
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'No se pudo crear la empresa' };
      }
    },
    [onCreada],
  );

  const crearSector = useCallback(async (nombre: string): Promise<string | { error: string }> => {
    try {
      const res = await fetch('/api/crm/sectores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      });
      const body = (await res.json()) as { success?: boolean; sector?: { nombre: string }; error?: string };
      if (!res.ok || !body.success || !body.sector) return { error: body.error ?? 'No se pudo crear el sector' };
      setSectores((prev) => (prev.includes(body.sector!.nombre) ? prev : [...prev, body.sector!.nombre].sort()));
      return body.sector.nombre;
    } catch {
      return { error: 'No se pudo crear el sector' };
    }
  }, []);

  const crearOportunidad = useCallback(
    async (idEmpresa: string, cuerpo: Record<string, unknown>): Promise<unknown | { error: string }> => {
      try {
        const res = await fetch('/api/crm/oportunidades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idEmpresa, ...cuerpo }),
        });
        const body = (await res.json()) as { success?: boolean; oportunidad?: unknown; error?: string };
        if (!res.ok || !body.success) return { error: body.error ?? 'No se pudo crear la oportunidad' };
        return body.oportunidad ?? null;
      } catch {
        return { error: 'No se pudo crear la oportunidad' };
      }
    },
    [],
  );

  return { fila, sectores, abrir, cerrar, crear, crearSector, crearOportunidad };
}
