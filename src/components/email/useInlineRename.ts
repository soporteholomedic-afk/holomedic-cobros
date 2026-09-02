'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Shared inline-rename interaction state (WU-6): the small state
 * machine behind BOTH rename affordances — the LAN attachment chip
 * (`AttachmentList`, WU-5) and the local file row
 * (`LocalFileDropZone`, REQ-02) — so the Enter/Escape/blur contract
 * can never drift between the two surfaces.
 *
 * Contract (same UX everywhere, REQ-01/REQ-02):
 * - `open(seed)` swaps the display for a text input pre-filled with
 *   the row's current effective name.
 * - Enter or blur commits the draft; Escape cancels and never commits.
 * - The `activeRef` guard prevents the Enter-then-blur sequence from
 *   committing twice, and ignores the trailing blur after a cancel.
 *
 * Pure UI state — validation and persistence belong to the owner of
 * the `onCommit` callback (the composer), keeping this hook
 * presentational.
 */
export function useInlineRename(onCommit: (draft: string) => void) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Guards double-commit: Enter commits and the input unmounts-blurs;
  // blur then fires but must not commit again. Escape marks cancelled
  // so the trailing blur is ignored.
  const activeRef = useRef(false);

  const open = useCallback((seed: string) => {
    setDraft(seed);
    activeRef.current = true;
    setEditing(true);
  }, []);

  const commit = useCallback(() => {
    activeRef.current = false;
    onCommit(draft);
    setEditing(false);
  }, [draft, onCommit]);

  // Blur-time commit: ignored unless the editor is still live (not
  // already committed or cancelled).
  const commitIfActive = useCallback(() => {
    if (!activeRef.current) return;
    commit();
  }, [commit]);

  const cancel = useCallback(() => {
    activeRef.current = false;
    setEditing(false);
  }, []);

  return { editing, draft, setDraft, open, commit, commitIfActive, cancel };
}
