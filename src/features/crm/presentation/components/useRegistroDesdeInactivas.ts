'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { hoyEnLima } from '../../application/validar';
import type { Empresa, Oportunidad } from '../../domain/entities';

interface RegistroListo {
  empresa: Empresa;
  empresas: Empresa[];
  oportunidades: Oportunidad[];
  /** `YYYY-MM-DD` Lima, for the panel's calendar. */
  hoy: string;
}

export interface EstadoRegistro {
  listo: RegistroListo | null;
  /** Loads the empresas + oportunidades lists and prepares the panel for that empresa. */
  abrir: (idEmpresa: string) => Promise<void>;
  cerrar: () => void;
  /** The panel saved a contact: close it and let the caller refresh its list. */
  guardado: () => void;
}

/**
 * Bridge between the "Inactivas" view and `RegistrarContactoPanel` (S6): the
 * panel is a board-native component that needs the full empresas and
 * oportunidades lists, so opening it from the inactivas tab loads both once
 * and keeps them for the panel's lifetime. Failures surface as a toast and
 * simply keep the list open.
 */
export function useRegistroDesdeInactivas(onGuardado: () => void): EstadoRegistro {
  const [listo, setListo] = useState<RegistroListo | null>(null);

  const abrir = useCallback(async (idEmpresa: string) => {
    try {
      const [resEmpresas, resOportunidades] = await Promise.all([
        fetch('/api/crm/empresas'),
        fetch('/api/crm/oportunidades'),
      ]);
      const bodyEmpresas = (await resEmpresas.json()) as { success?: boolean; empresas?: Empresa[] };
      const bodyOportunidades = (await resOportunidades.json()) as {
        success?: boolean;
        oportunidades?: Oportunidad[];
      };
      if (!resEmpresas.ok || !bodyEmpresas.success || !bodyEmpresas.empresas) {
        throw new Error('No se pudieron cargar las empresas');
      }
      if (!resOportunidades.ok || !bodyOportunidades.success) {
        throw new Error('No se pudieron cargar las oportunidades');
      }
      const empresa = bodyEmpresas.empresas.find((e) => e.idEmpresa === idEmpresa);
      if (!empresa) throw new Error('No se encontró la empresa en el CRM');
      setListo({
        empresa,
        empresas: bodyEmpresas.empresas,
        oportunidades: bodyOportunidades.oportunidades ?? [],
        hoy: hoyEnLima(),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir el registro de contacto');
    }
  }, []);

  const cerrar = useCallback(() => setListo(null), []);

  const guardado = useCallback(() => {
    setListo(null);
    onGuardado();
  }, [onGuardado]);

  return { listo, abrir, cerrar, guardado };
}
