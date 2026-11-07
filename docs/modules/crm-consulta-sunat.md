# Módulo crm-consulta-sunat

> Ubicación: `src/features/crm/` (extensión del CRM) · Rutas: `/admin/crm/configuracion`, API `/api/crm/configuracion/apifacturacion`, `/api/crm/ruc/{ruc}` · Feature doc: `odd/tasks/crm-consulta-sunat.md`

## Propósito

Consulta de datos de empresas por RUC contra apifacturacion.com (padrón SUNAT): al tipear los 11 dígitos del RUC en el **alta de empresa** o en la tarjeta **"Falta RUC"** del CRM, el sistema autocompleta razón social y dirección fiscal y muestra el estado/condición del contribuyente (ACTIVO·HABIDO / BAJA). El token y la URL de la API se administran **desde la app** en `/admin/crm/configuracion`, con el token cifrado en base de datos.

## Arquitectura interna

| Capa | Responsabilidad | Archivos clave |
|---|---|---|
| `domain/` | Tipos y errores del lookup | `entities.ts` (`DatosSunat`), `ports.ts` (`IConsultaRucServicio`, `ConfigCrmRepository` port), `errors.ts` (`RucNoEncontradoError` 404, `ConsultaNoConfiguradaError` 503, `ServicioConsultaError` 502) |
| `application/` | Caso de uso del lookup y de la configuración | `consultarRuc.ts` (`ConsultarRucUseCase` — valida el RUC antes de leer config o gastar consulta), `configuracion/configApifacturacion.ts` (resolver DB>env, `GuardarConfigApifacturacionUseCase` con cifrado ANTES de escribir, `probarApifacturacion`) |
| `infrastructure/` | Cliente externo, store de config y persistencia | `apifacturacion/clienteApifacturacion.ts` (POST `{url}/ruc/{ruc}`, token en form, timeout 10 s, fetch inyectable, valida estrictamente el shape externo, nunca loguea el token), `sqlserver/sqlServerConfigRepository.ts` (portado de la línea E5; upsert + auditoría en UNA transacción, secretos nunca en la auditoría), `config/cifradoSecretos.ts` (AES-256-GCM con `CRM_CONFIG_KEY`, fail-closed), `getCrmDb.ts` (`getCrmConfigRepository()` comparte pool + `migrate()`) |
| `presentation/` | Autocompletado en el CRM y panel de configuración | `components/useConsultaRuc.ts` (hook compartido: debounce 500 ms, abort, estados no bloqueantes), `components/AltaPanel.tsx` (autofill con guard `autollenadoPara`: el tipeo manual siempre gana), `components/RucFaltante.tsx` (preview antes de guardar; contrato PATCH intacto), `components/configuracion/PanelApifacturacion.tsx` + `CampoSecreto.tsx` (token enmascarado, Reemplazar/Quitar) |

## Esquema

- `dbo.CrmEmpresa` — columna nueva `direccion NVARCHAR(300) NULL` (migración guarded idempotente, `columnaEmpresa`); `completarRuc` preserva la dirección guardada.
- `dbo.CrmConfig` + `dbo.CrmConfigAuditoria` — store genérico clave/valor (portado de E5, renombrado `CRM_*`→`Crm*` por la invariante anti-namespace-legacy de `migrate.test`). Claves: `apifacturacion.token` (secreto cifrado), `apifacturacion.url` (default `https://api.apifacturacion.com`).

## Configuración

| Fuente | Prioridad | Variable / clave |
|---|---|---|
| DB `CrmConfig` | 1 | `apifacturacion.token` (cifrado), `apifacturacion.url` |
| Env | 2 (solo token) | `APIFACTURACION_TOKEN` |
| Master key de cifrado | obligatoria para guardar secretos | `CRM_CONFIG_KEY` (32 bytes base64/hex en `.env.local`; fail-closed sin ella) |

Sin token configurado el lookup responde **503** con mensaje claro; la UI lo muestra sin bloquear el formulario. Un token en DB que no descifra degrada estrictamente a "sin configurar" (nunca revive el de env — precedente E5).

## Puntos de entrada

### API

| Endpoint | Método | Notas |
|---|---|---|
| `/api/crm/ruc/{ruc}` | GET | Permiso `crm` (prefijo `/api/crm`). 200 `{success, datos}` · 400 RUC inválido · **503 sin configurar** · 404 no encontrado · 502 servicio caído. `no-store`. |
| `/api/crm/configuracion/apifacturacion` | GET/PUT | Permiso dedicado `crm_configuracion`. GET nunca devuelve el token en claro (solo máscara + fuente). PUT: `''`/ausente = mantener, `null` = borrar; 503 si falta `CRM_CONFIG_KEY` al escribir un secreto. |
| `/api/crm/configuracion/apifacturacion/probar` | POST | Una consulta real con el RUC demo `20525426778` (consume crédito pago); mensajes genéricos de fallo. |

### Páginas / navegación

| Ruta | Gate |
|---|---|
| `/admin/crm/configuracion` | `crm_configuracion` (página + entrada Sidebar "Consulta SUNAT") |

## Testing

- Use case/ruta/hook: fakes + `vi.stubGlobal('fetch')` / fetch inyectable; el cliente prueba forma de request, taxonomía de errores y que el token nunca aparece en logs.
- Store config: suite contra la DB HOLOMEDIC real con prefijo de claves aleatorio por corrida (`sqlServerConfigRepository.test.ts`).
- Migración: invariantes en `migrate.test.ts` (6 CREATE TABLE, sin namespace `CRM_*` legacy, sin DROP/DELETE/TRUNCATE, guarded ADD de `direccion`).
- UI: jsdom para AltaPanel/RucFaltante (autofill, badge, payload con `direccion`, contrato PATCH /ruc fijado).
