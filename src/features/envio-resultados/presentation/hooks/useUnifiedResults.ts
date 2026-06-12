'use client';

import { useState, useEffect } from 'react';
import type { SpResultRow, OrderRow, UnifiedPerson, UnifiedFicha } from '@/types/sp-result';
import { normalizeDni } from '@/lib/normalize-dni';

interface UseUnifiedResultsReturn {
  people: UnifiedPerson[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches worker exam data (SP_RPT_MATRIZICCGSA) and patient order data
 * (SP_SEL_ORDEN), then merges them client-side by normalized DNI with
 * FULL OUTER JOIN semantics.
 *
 * Workers without matching orders still appear (fichas: []).
 * Orders without matching workers still appear (worker fields empty).
 *
 * @param companyName - Company name to filter worker rows by (NomCom match)
 * @param fechaInicio - Start date for both queries
 * @param fechaFin - End date for both queries
 */
export function useUnifiedResults(
  companyName: string,
  fechaInicio: string,
  fechaFin: string,
): UseUnifiedResultsReturn {
  const [people, setPeople] = useState<UnifiedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        // ---- Build query params ----
        const resultsParams = new URLSearchParams();
        if (fechaInicio) resultsParams.set('fechaInicio', fechaInicio);
        if (fechaFin) resultsParams.set('fechaFin', fechaFin);

        const ordersParams = new URLSearchParams();
        ordersParams.set('companyName', companyName);
        if (fechaInicio) ordersParams.set('fechaInicio', fechaInicio);
        if (fechaFin) ordersParams.set('fechaFin', fechaFin);

        // ---- Fetch both endpoints in parallel ----
        const [resultsRes, ordersRes] = await Promise.allSettled([
          fetch(`/api/consolidados/results?${resultsParams.toString()}`),
          fetch(`/api/consolidados/results_by_companies?${ordersParams.toString()}`),
        ]);

        if (cancelled) return;

        // ---- Parse worker data (SP_RPT_MATRIZICCGSA) ----
        let workerRows: SpResultRow[] = [];

        if (resultsRes.status === 'fulfilled' && resultsRes.value.ok) {
          const resultsData = await resultsRes.value.json();
          const allRows = (resultsData.rows ?? resultsData) as SpResultRow[];
          // Filter by company name (exact match on NomCom column)
          workerRows = allRows.filter(
            (row) => row.NomCom && row.NomCom.trim() === companyName.trim(),
          );
        }

        // ---- Parse order data (SP_SEL_ORDEN) ----
        let orderRows: OrderRow[] = [];

        if (ordersRes.status === 'fulfilled' && ordersRes.value.ok) {
          const ordersData = await ordersRes.value.json();
          orderRows = Array.isArray(ordersData) ? (ordersData as OrderRow[]) : [];
        }

        // ---- Both fetches completely failed → error ----
        const workerFailed = resultsRes.status === 'rejected' || (resultsRes.status === 'fulfilled' && !resultsRes.value.ok);
        const ordersFailed = ordersRes.status === 'rejected' || (ordersRes.status === 'fulfilled' && !ordersRes.value.ok);

        if (workerFailed && ordersFailed) {
          if (!cancelled) {
            setError('Error al cargar los consolidados. Intente nuevamente.');
            setPeople([]);
          }
          return;
        }

        if (cancelled) return;

        // ---- Merge: one primary row per (normalizedDni, DesDes) ----
        // This gives each project its own table row with its own tipoExamen (DesTCh).
        const map = new Map<string, UnifiedPerson>();
        // Tracks the composite key of the first project row for each DNI, so order
        // fichas (which have no DesDes) can be attached to a deterministic row.
        const dniFirstKey = new Map<string, string>();

        // Pass 1: Worker rows → one entry per (DNI + DesDes)
        for (const row of workerRows) {
          const dni = normalizeDni(row.NroDId);
          if (!dni) continue;

          const key = `${dni}|${row.DesDes}`;
          if (!map.has(key)) {
            map.set(key, {
              dni,
              nombre: row.Pacien,
              empresa: row.NomCom,
              tipoExamen: row.DesTCh,
              proyecto: row.DesDes,
              fichas: [],
            });
            // Record the first key seen for this DNI (order fichas will attach here)
            if (!dniFirstKey.has(dni)) {
              dniFirstKey.set(dni, key);
            }
          }
          // Same (DNI + DesDes) appearing again → skip; dedup within same project.
        }

        // Pass 2: Order rows → attach to the first project row for that DNI.
        // SP_SEL_ORDEN has no DesDes, so we cannot correlate to a specific project.
        for (const row of orderRows) {
          const dni = normalizeDni(row.NroDId);
          if (!dni) continue;

          const ficha: UnifiedFicha = {
            idAten: row.IdAten,
            nroRuc: row.NroRuc,
            nomCFa: row.NomCFa,
            proyecto: '',
          };

          const firstKey = dniFirstKey.get(dni);
          if (firstKey) {
            map.get(firstKey)!.fichas.push(ficha);
          } else {
            // Order-only person (no matching worker row at all)
            const orderKey = `${dni}|`;
            const existing = map.get(orderKey);
            if (existing) {
              existing.fichas.push(ficha);
            } else {
              map.set(orderKey, {
                dni,
                nombre: '',
                empresa: '',
                tipoExamen: '',
                proyecto: '',
                fichas: [ficha],
              });
              dniFirstKey.set(dni, orderKey);
            }
          }
        }

        if (cancelled) return;

        // ---- Convert Map to sorted array ----
        const merged = Array.from(map.values());
        merged.sort((a, b) => a.nombre.localeCompare(b.nombre));

        setPeople(merged);
      } catch (err) {
        if (!cancelled) {
          setError('Error al cargar los consolidados. Intente nuevamente.');
          setPeople([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [companyName, fechaInicio, fechaFin]);

  return { people, loading, error };
}
