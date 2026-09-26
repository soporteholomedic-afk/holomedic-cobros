import { getSession } from '@/lib/auth';
import { FormularioNuevaEmpresa } from '@/features/crm/presentation/components/FormularioNuevaEmpresa';

/**
 * `/crm/empresas/nueva` — manual empresa registration (post-verify UX
 * remediation). PAGE pattern by design: an 11-field creation form
 * doesn't fit ModalBase's 1–2 field confirmation scope; as a page it
 * inherits the NavCrm layout (the Empresas entry highlights via its
 * `/crm/empresas` prefix) and gives the inbound flow an addressable
 * entry point. Static segment takes precedence over /crm/empresas/[id].
 *
 * The proxy only requires `crm` on the /crm prefix, so this Server
 * Component re-checks `crm_admin` (the POST is the real gate and stays
 * crm_admin-only in-route); without it the form is replaced by the
 * Spanish access panel.
 */
export default async function NuevaEmpresaPage() {
  const session = await getSession();
  const esAdmin = session?.permisos.includes('crm_admin') ?? false;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Nueva empresa</h1>
        <p className="text-sm text-muted-foreground">
          Registra los datos de contacto de una empresa que solicita una cotización.
        </p>
      </header>

      {esAdmin ? (
        <FormularioNuevaEmpresa />
      ) : (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Esta acción requiere el permiso crm_admin.
        </p>
      )}
    </main>
  );
}
