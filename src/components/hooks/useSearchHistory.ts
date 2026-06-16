import { useCallback, useMemo, useSyncExternalStore } from 'react';

const STORAGE_KEY_PREFIX = 'holomedic:search-history:';
const DEFAULT_MAX_ITEMS = 10;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function readStorage(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function writeStorage(key: string, value: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    notify();
  } catch {
    // storage may be full or disabled (Safari private mode, quota exceeded)
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window === 'undefined') {
    return () => {
      listeners.delete(listener);
    };
  }
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea === window.localStorage) {
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export interface UseSearchHistoryResult {
  history: string[];
  addTerm: (term: string) => void;
  removeTerm: (term: string) => void;
  clear: () => void;
}

export function useSearchHistory(
  scope: string,
  maxItems: number = DEFAULT_MAX_ITEMS,
): UseSearchHistoryResult {
  const storageKey = `${STORAGE_KEY_PREFIX}${scope}`;

  const getSnapshot = useCallback(
    () => JSON.stringify(readStorage(storageKey).slice(0, maxItems)),
    [storageKey, maxItems],
  );

  const getServerSnapshot = useCallback(() => '[]', []);

  const serialized = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const history = useMemo<string[]>(
    () => JSON.parse(serialized) as string[],
    [serialized],
  );

  const addTerm = useCallback(
    (rawTerm: string) => {
      const term = rawTerm.trim();
      if (term.length === 0) return;
      const current = readStorage(storageKey);
      const filtered = current.filter(
        (t) => t.toLowerCase() !== term.toLowerCase(),
      );
      const next = [term, ...filtered].slice(0, maxItems);
      writeStorage(storageKey, next);
    },
    [maxItems, storageKey],
  );

  const removeTerm = useCallback(
    (term: string) => {
      const current = readStorage(storageKey);
      const next = current.filter((t) => t !== term);
      writeStorage(storageKey, next);
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    writeStorage(storageKey, []);
  }, [storageKey]);

  return { history, addTerm, removeTerm, clear };
}
