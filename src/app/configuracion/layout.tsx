import TabsConfiguracion from './TabsConfiguracion';

/**
 * Shared layout of the `/configuracion` section (feature
 * `configuracion-tabs`): a compact section label plus the per-permiso
 * tab bar, then the active tab's page. Server Component — the only
 * client leaves are `TabsConfiguracion` and each page's own client
 * content (e.g. `UsuariosPanel`, `FirmaForm`).
 */
export default function ConfiguracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="px-6 pt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Configuración
        </p>
        <TabsConfiguracion />
      </div>
      {children}
    </div>
  );
}
