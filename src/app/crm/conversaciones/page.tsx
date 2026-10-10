import { BandejaConversaciones } from '@/features/crm/presentation/components/conversaciones/BandejaConversaciones';

/**
 * `/crm/conversaciones` (permiso `crm_conversaciones`, agente-ia-crm
 * E1) — the WhatsApp-style bandeja: Server Component wrapper that
 * renders the client BandejaConversaciones shell (crm/page.tsx
 * precedent). The page owns no data and no session read — the proxy
 * gates the route via RUTAS_PROTEGIDAS, and the bandeja fetches its
 * list/hilo client-side through the /api/crm/conversaciones routes.
 */
export default function ConversacionesPage() {
  return (
    <main className="space-y-6 p-6">
      <BandejaConversaciones />
    </main>
  );
}
