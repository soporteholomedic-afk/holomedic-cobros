import path from 'path';
import { FILE_SERVER_BASE_PATH } from '@/lib/platform';

/**
 * Allowed absolute roots for the patient firma/huella image tokens
 * (`{{image:image_firma_paciente}}` / `{{image:image_huella_paciente}}`).
 *
 * Those tokens resolve `atencion.rutaFirma` / `atencion.rutaHuella`, which
 * the SQL Server adapter has already mapped from the raw SIGLA UNC path to
 * the platform file-server base (`\\172.16.10.12\sigla` on Windows,
 * `/mnt/sigla` on Linux). The server base is therefore an allowed root —
 * images live in per-patient folders on the share, not under `public/`.
 *
 * The two public roots stay in the list so templates and tests can exercise
 * the same token path with local fixtures.
 *
 * `fileServerBasePath` is a parameter (defaulting to the platform constant)
 * so tests can point at a temporary directory without touching the real
 * share.
 */
export function buildFirmaHuellaRoots(
  publicRoot: string,
  fileServerBasePath: string = FILE_SERVER_BASE_PATH,
): string[] {
  return [
    fileServerBasePath,
    path.join(publicRoot, 'musculoesqueletica-pdf', 'assets'),
    path.join(publicRoot, 'assets'),
  ];
}