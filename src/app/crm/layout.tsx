import { NavCrm } from '@/features/crm/presentation/components/NavCrm';
import { getSession } from '@/lib/auth';

/**
 * `/crm` segment layout (post-verify UX remediation): renders the CRM
 * section navigation above EVERY page of the section — Empresas, Cola
 * de hoy, Mi cartera, Importar (crm_admin only), Productividad — so the
 * nav tells the vendedor's daily flow and every page (detail included,
 * same /crm prefix) keeps clickable navigation to the rest.
 *
 * The session is read ONCE here, server-side (cartera/page.tsx
 * precedent), and only the `permisos` array crosses to the client
 * (server-serialization). The proxy (RUTAS_PROTEGIDAS) already gates
 * every /crm route — this layout adds navigation, never authorization.
 */
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const permisos = session?.permisos ?? [];

  return (
    <>
      <div className="mx-auto max-w-6xl px-6 pt-6">
        <NavCrm permisos={permisos} />
      </div>
      {children}
    </>
  );
}
