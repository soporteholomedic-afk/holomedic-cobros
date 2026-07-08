'use client';

import { type ReactNode, useSyncExternalStore } from 'react';

function useIsClient() {
  return useSyncExternalStore(
    () => () => { /* no-op subscription */ },
    () => true,
    () => false,
  );
}

export function ClientOnly({ children }: { children: ReactNode }) {
  const isClient = useIsClient();
  if (!isClient) return null;
  return <>{children}</>;
}
