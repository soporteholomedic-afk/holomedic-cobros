import type { ReactNode } from 'react';

/**
 * Prop contracts for the shared, area-agnostic email composition module.
 *
 * The module is presentational only: it accepts generic data and
 * callbacks, never references feature concepts, and performs no I/O.
 * Feature-specific pieces (template selector, attachment lists,
 * WYSIWYG editor element, headers) are injected through slots.
 */

export interface EmailPreviewPanelProps {
  /** Subject line rendered in the preview card header. */
  subject: string;
  /** Raw composed HTML body; rendered through the allowlist sanitizer. */
  html: string;
  /** Hint shown while no body is available. */
  emptyHint: string;
  /** Optional template name rendered in the preview card footer. */
  templateName?: string;
  /** Optional attachment area rendered below the preview card. */
  attachmentsSlot?: ReactNode;
  /** Optional drop zone rendered after the attachment area. */
  dropZoneSlot?: ReactNode;
}

export interface EmailControlsPanelProps {
  to: string;
  onToChange: (v: string) => void;
  cc: string;
  onCcChange: (v: string) => void;
  subject: string;
  onSubjectChange: (v: string) => void;
  /** Template selector (and any target toggle) injected by the consumer. */
  templateSlot: ReactNode;
  /** Body editor composition injected by the consumer. */
  bodySlot: ReactNode;
  onSend: () => void;
  sendDisabled: boolean;
  sending: boolean;
  /** Optional header row (title, back button, target toggle). */
  headerSlot?: ReactNode;
}

/**
 * Generic over the signature field key so consumers can keep their
 * domain key unions (e.g. `keyof SignatureData`) without widening
 * their change handlers. The default instantiation is the plain
 * string-keyed contract.
 */
export interface SignatureEditorProps<K extends string = string> {
  fields: { key: K; label: string }[];
  values: Record<K, string>;
  onChange: (key: K, value: string) => void;
}
