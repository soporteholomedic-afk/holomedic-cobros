'use client';

import { useState, useEffect } from 'react';
import type { SpResultRow, OrderRow, UnifiedPerson, UnifiedFicha } from '@/types/sp-result';
import { normalizeDni } from '@/lib/normalize-dni';
import { normalizeCondic } from '@/lib/condic';

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

        // ---- Merge: Map<normalizedDni, UnifiedPerson> by zipping workers and orders ----
        interface TempPerson {
          dni: string;
          nombre: string;
          empresa: string;
          workers: { proyecto: string; tipoExamen: string; condic: string }[];
          orders: { idAten: string; nroRuc: string; nomCFa: string }[];
        }

        const tempMap = new Map<string, TempPerson>();

        const getOrCreateTemp = (dni: string): TempPerson => {
          let entry = tempMap.get(dni);
          if (!entry) {
            entry = {
              dni,
              nombre: '',
              empresa: '',
              workers: [],
              orders: [],
            };
            tempMap.set(dni, entry);
          }
          return entry;
        };

        // Pass 1: Worker rows
        for (const row of workerRows) {
          const dni = normalizeDni(row.NroDId);
          if (!dni) continue;

          const entry = getOrCreateTemp(dni);
          if (!entry.nombre) entry.nombre = row.Pacien;
          if (!entry.empresa) entry.empresa = row.NomCom;

          // Dedup exact same project + test type combination
          const isDuplicate = entry.workers.some(
            (w) => w.proyecto === row.DesDes && w.tipoExamen === row.DesTCh
          );
          if (!isDuplicate) {
            entry.workers.push({
              proyecto: row.DesDes,
              tipoExamen: row.DesTCh,
              // normalizeCondic is called exactly once per Condic value in the
              // dedup block. The first non-empty normalized value wins, so
              // duplicate SP rows for the same (proyecto+tipoExamen) keep
              // their original condic. The UI receives a pre-normalized
              // string and never has to re-check 'NULL'.
              condic: normalizeCondic(row.Condic),
            });
          }
        }

        // Pass 2: Order rows
        for (const row of orderRows) {
          const dni = normalizeDni(row.NroDId);
          if (!dni) continue;

          const entry = getOrCreateTemp(dni);
          entry.orders.push({
            idAten: row.IdAten,
            nroRuc: row.NroRuc,
            nomCFa: row.NomCFa,
          });
        }

        const map = new Map<string, UnifiedPerson>();

        for (const [dni, entry] of tempMap.entries()) {
          const workerCountForFichas = entry.workers.length > 1 ? entry.workers.length : 0;
          const fichasCount = Math.max(entry.orders.length, workerCountForFichas);
          const fichas: UnifiedFicha[] = [];

          for (let i = 0; i < fichasCount; i++) {
            fichas.push({
              idAten: entry.orders[i]?.idAten ?? '',
              nroRuc: entry.orders[i]?.nroRuc ?? '',
              nomCFa: entry.orders[i]?.nomCFa ?? '',
              proyecto: entry.workers[i]?.proyecto ?? '',
              tipoExamen: entry.workers[i]?.tipoExamen ?? '',
              condic: entry.workers[i]?.condic ?? '',
            });
          }

          const primaryFicha = fichas[0];

          map.set(dni, {
            dni,
            nombre: entry.nombre,
            empresa: entry.empresa,
            proyecto: primaryFicha?.proyecto ?? entry.workers[0]?.proyecto ?? '',
            tipoExamen: primaryFicha?.tipoExamen ?? entry.workers[0]?.tipoExamen ?? '',
            condic: primaryFicha?.condic ?? entry.workers[0]?.condic ?? '',
            fichas,
          });
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
