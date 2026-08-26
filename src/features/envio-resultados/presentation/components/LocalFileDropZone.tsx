/**
 * Compatibility re-export — the implementation moved to the shared
 * email module (`src/components/email`). This path must keep
 * resolving because the EmailEditor characterization suite mocks
 * `../LocalFileDropZone` by this relative path. Do not inline new
 * logic here.
 */
export { LocalFileDropZone } from '@/components/email/LocalFileDropZone';
