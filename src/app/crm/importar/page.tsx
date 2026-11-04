import { ImportarEmpresas } from '@/features/crm/presentation/components/ImportarEmpresas';

/**
 * `/crm/importar` — import empresas from an Excel. Gated by the proxy on the
 * `crm` permiso (it falls under the `/crm` entry) and rendered inside the
 * shared SessionShell.
 */
export default function ImportarEmpresasPage() {
  return <ImportarEmpresas />;
}
