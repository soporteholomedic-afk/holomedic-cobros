/**
 * `/crm` — placeholder for the B2B CRM module (S1a/pr1). Protected by
 * RUTAS_PROTEGIDAS via the proxy (permiso `crm`). pr4 replaces this
 * placeholder with the empresa list (EmpresaList + filters).
 */
export default function CrmPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">CRM</h1>
        <p className="text-sm text-muted-foreground">
          Gestión de empresas, contactos y seguimiento comercial.
        </p>
      </header>

      <section
        aria-label="Estado del módulo"
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <p className="text-sm text-slate-600">
          Módulo en preparación — el registro de empresas estará disponible
          próximamente.
        </p>
      </section>
    </main>
  );
}
