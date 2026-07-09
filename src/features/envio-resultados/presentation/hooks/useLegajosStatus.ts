import { useState, useCallback } from 'react';

export interface CheckLegajosItem {
  ruc: string;
  dni: string;
  idAten: string;
}

export interface LegajosRowStatus {
  hasCamo: boolean;
  hasEmo: boolean;
  error?: string;
  loading?: boolean;
}

export interface UseLegajosStatusReturn {
  statuses: Record<string, LegajosRowStatus>;
  checkAll: (items: CheckLegajosItem[]) => Promise<void>;
  checkRow: (item: CheckLegajosItem) => Promise<void>;
  isChecking: boolean;
  error: string | null;
}

export function useLegajosStatus(): UseLegajosStatusReturn {
  const [statuses, setStatuses] = useState<Record<string, LegajosRowStatus>>({});
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkAll = useCallback(async (items: CheckLegajosItem[]) => {
    if (items.length === 0) return;
    setIsChecking(true);
    setError(null);

    setStatuses((prev) => {
      const next = { ...prev };
      for (const item of items) {
        next[item.idAten] = {
          hasCamo: false,
          hasEmo: false,
          loading: true,
        };
      }
      return next;
    });

    try {
      const response = await fetch('/api/files/check-legajos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(items),
      });

      if (!response.ok) {
        throw new Error(`Error en la solicitud: ${response.statusText}`);
      }

      const data = (await response.json()) as Record<
        string,
        { hasCamo: boolean; hasEmo: boolean; error?: string }
      >;

      setStatuses((prev) => {
        const next = { ...prev };
        for (const item of items) {
          const res = data[item.idAten];
          if (res) {
            next[item.idAten] = {
              hasCamo: res.hasCamo,
              hasEmo: res.hasEmo,
              error: res.error,
              loading: false,
            };
          } else {
            next[item.idAten] = {
              hasCamo: false,
              hasEmo: false,
              loading: false,
              error: 'No se recibió estado para esta ficha.',
            };
          }
        }
        return next;
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      setStatuses((prev) => {
        const next = { ...prev };
        for (const item of items) {
          next[item.idAten] = {
            hasCamo: false,
            hasEmo: false,
            loading: false,
            error: errMsg,
          };
        }
        return next;
      });
    } finally {
      setIsChecking(false);
    }
  }, []);

  const checkRow = useCallback(async (item: CheckLegajosItem) => {
    setStatuses((prev) => ({
      ...prev,
      [item.idAten]: {
        hasCamo: false,
        hasEmo: false,
        loading: true,
      },
    }));

    try {
      const response = await fetch('/api/files/check-legajos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([item]),
      });

      if (!response.ok) {
        throw new Error(`Error en la solicitud: ${response.statusText}`);
      }

      const data = (await response.json()) as Record<
        string,
        { hasCamo: boolean; hasEmo: boolean; error?: string }
      >;

      const res = data[item.idAten];
      setStatuses((prev) => ({
        ...prev,
        [item.idAten]: res
          ? {
              hasCamo: res.hasCamo,
              hasEmo: res.hasEmo,
              error: res.error,
              loading: false,
            }
          : {
              hasCamo: false,
              hasEmo: false,
              loading: false,
              error: 'No se recibió estado para esta ficha.',
            },
      }));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setStatuses((prev) => ({
        ...prev,
        [item.idAten]: {
          hasCamo: false,
          hasEmo: false,
          loading: false,
          error: errMsg,
        },
      }));
    }
  }, []);

  return {
    statuses,
    checkAll,
    checkRow,
    isChecking,
    error,
  };
}
