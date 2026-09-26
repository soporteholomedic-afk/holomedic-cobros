import { Suspense } from 'react';

import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import { ColaHoy } from '@/features/crm/presentation/components/ColaHoy';

/**
 * `/crm/cola` — "a quién le toca hoy" (tasks pr13/WU3, spec G4).
 * Protected by RUTAS_PROTEGIDAS via the proxy (permiso `crm`, the
 * `/crm` prefix covers it). Server Component wrapper keeps the header
 * outside the `<Suspense>` boundary the client-side queue needs
 * (`/crm` precedent). Derived on request — zero background jobs, no
 * auto-send: the page only shows who is due and links to each detail.
 *
 * The session is read ONCE here (cartera route precedent) to resolve
 * the session's LOGIN NAME (session.sub is the opaque idUsuario;
 * CRM_Empresas.responsable stores usernames) and pass it down for
 * the quick-capture button and the "Iniciar contacto" column — both
 * self-assignment flows speak the username currency end to end.
 */
export default async function ColaPage() {
  const session = await getSession();
  const filaUsuario = session ? await (await getUsuarioDb()).getById(session.sub) : null;
  const usuario = filaUsuario?.usuario ?? null;

  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Cola de hoy</h1>
        <p className="text-sm text-muted-foreground">
          A quién le toca hoy, en un tablero: qué seguimiento enviar, a quién retomar, qué decisión espera y
          qué empresa se puede reactivar.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
          </div>
        }
      >
        <ColaHoy usuario={usuario} nombreUsuario={session?.nombre ?? null} />
      </Suspense>
    </main>
  );
}
