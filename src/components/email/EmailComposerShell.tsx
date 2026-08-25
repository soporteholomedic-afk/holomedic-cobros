'use client';

import type { EmailComposerShellProps } from './types';

/**
 * Full-screen overlay shell for the email composition. Consumers that
 * do not own their own overlay wrapper (new features) mount this
 * around the two panels; consumers with an existing overlay wrapper
 * mount the panels directly.
 */
export function EmailComposerShell({ children }: EmailComposerShellProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="email-composer-shell"
      className="fixed inset-0 z-50 overflow-y-auto bg-white dark:bg-slate-950"
    >
      <div className="min-h-full p-6">
        {children}
      </div>
    </div>
  );
}
