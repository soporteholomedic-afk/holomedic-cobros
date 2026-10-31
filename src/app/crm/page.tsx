import { CrmBoard } from '@/features/crm/presentation/components/CrmBoard';

/**
 * `/crm` — the simple CRM board. Gated by the proxy on the `crm` permiso
 * (RUTAS_PROTEGIDAS) and rendered inside the shared SessionShell.
 */
export default function CrmPage() {
  return <CrmBoard />;
}
