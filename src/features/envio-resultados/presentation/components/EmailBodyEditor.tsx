/**
 * Compatibility re-export — the implementation moved to the shared
 * email module (`src/components/email`). This path must keep
 * resolving because the EmailEditor characterization suite mocks
 * `../EmailBodyEditor` by this relative path, and EmailEditor's lazy
 * import seam goes through it. Do not inline new logic here.
 */
export { EmailBodyEditor } from '@/components/email/EmailBodyEditor';
export type { EmailBodyEditorHandle, EmailBodyEditorProps } from '@/components/email/EmailBodyEditor';
