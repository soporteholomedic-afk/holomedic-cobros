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

        // ---- Merge: Map<normalizedDni, UnifiedPerson> ----
        const map = new Map<string, UnifiedPerson>();

        // Pass 1: Worker rows
        for (const row of workerRows) {
          const dni = normalizeDni(row.NroDId);
          if (!dni) continue; // skip rows with no extractable DNI

          const existing = map.get(dni);
          if (!existing) {
            map.set(dni, {
              dni,
              nombre: row.Pacien,
              empresa: row.NomCom,
              tipoExamen: row.DesTCh,
              proyecto: row.DesDes,
              fichas: [],
            });
          }
          // If same DNI appears multiple times in workers (different exams),
          // the first occurrence wins for nombre/empresa/tipoExamen/proyecto.
          // The spec doesn't specify dedup behavior for multi-exam workers
          // in the unified table — first-occurrence is a safe default.
        }

        // Pass 2: Order rows
        for (const row of orderRows) {
          const dni = normalizeDni(row.NroDId);
          if (!dni) continue;

          const ficha: UnifiedFicha = {
            idAten: row.IdAten,
            nroRuc: row.NroRuc,
            nomCFa: row.NomCFa,
          };

          const existing = map.get(dni);
          if (existing) {
            existing.fichas.push(ficha);
          } else {
            // Order-only person (no matching worker)
            map.set(dni, {
              dni,
              nombre: '',
              empresa: '',
              tipoExamen: '',
              proyecto: '',
              fichas: [ficha],
            });
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
