/**
 * Compatibility re-export — the implementation moved to the shared
 * email module (`src/components/email`). This path must keep
 * resolving because the EmailEditor characterization suite mocks
 * `../LocalFileDropZone` by this relative path. Do not inline new
 * logic here.
 *
 * WU-6 (REQ-02) — the re-export also forwards the opt-in
 * `onRename?(index, next)` local rename affordance to envio-resultados
 * callers; cobranza/facturacion simply never pass it.
 */
export { LocalFileDropZone } from '@/components/email/LocalFileDropZone';
