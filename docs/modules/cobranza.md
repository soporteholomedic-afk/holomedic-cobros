# Módulo Cobranza

> Ubicación: `src/features/cobranza/` · Rutas: `/cobranza`, `/api/cobranza/*`, `/api/send-email`

## Propósito

Automatiza el envío de correos de cobranza por empresa a partir de un Excel de consolidados: memoriza los destinarios (`to`/`cc`) por RUC/DNI de la empresa, compone el correo con la plantilla y registra una auditoría inmutable de cada intento de envío (exitoso o fallido).

**Lo esencial en tres líneas:**

1. El operador sube el Excel en `/cobranza`; el parseo ocurre con `parseExcelData` (`src/utils/excelParser.ts`, fuera del módulo) y el resultado agrupa comprobantes por empresa (`ClienteGroup`).
2. El directorio de contactos persiste en `HOLOMEDIC.dbo.EmpresaContactos` (upsert idempotente por RUC); la auditoría de envíos es append-only en `HOLOMEDIC.dbo.CobranzaEnviosHistorial`.
3. El envío real sale por `POST /api/send-email` (nodemailer vía `@/utils/sendEmail`), que audita cada intento con `registrarAuditoriaCobranza` — best-effort: una falla de auditoría jamás cambia el resultado del envío.

## Arquitectura interna

| Capa | Responsabilidad | Archivos clave |
|---|---|---|
| `domain/` | Entidades (`EmpresaContacto`, `CobranzaEnvioHistorial`), puertos y la política compartida de claves válidas (`esClaveDirectorioValida`) | `domain/entities.ts`, `domain/ports.ts` |
| `infrastructure/` | Adaptadores SQL Server (directorio e historial), singletons de conexión y el auditor best-effort | `infrastructure/getContactDb.ts`, `infrastructure/getCobranzaHistorialDb.ts`, `infrastructure/registrarAuditoriaCobranza.ts`, `infrastructure/sqlserver/sqlServerContactRepository.ts`, `infrastructure/sqlserver/sqlServerCobranzaHistorialRepository.ts`, `infrastructure/sqlserver/migrate.ts`, `infrastructure/sqlserver/errors.ts` |
| `presentation/hooks/` | Hooks cliente dueños de toda la lógica de fetch (los componentes nunca llaman `fetch` directo) | `hooks/useCompanyContact.ts`, `hooks/useCobranzaHistorial.ts`, `hooks/useSendCobranzaEmail.ts` |
| `presentation/helpers/` | Mappers puros `ClienteGroup` → metadatos de auditoría / contexto de interpolación / extracto Infocorte | `helpers/buildCobranzaAuditMetadata.ts`, `helpers/buildCobranzaInterpolationContext.ts`, `helpers/buildInfocorteExtract.ts` |
| `presentation/components/` | Compositor de correo y visualización del historial | `components/CobranzaEmailComposer.tsx`, `components/HistorialNotificaciones.tsx` |

## Puntos de entrada

### Páginas

| Ruta | Archivo | Notas |
|---|---|---|
| `/cobranza` | `src/app/cobranza/page.tsx` | Orquesta componentes compartidos (`FileUpload`, `DashboardStats`, `ClientList`, `ClientDetailModal`) + `CobranzaEmailComposer` del módulo; requiere permiso `cobranza` |

### API

| Método y ruta | Handler | Notas |
|---|---|---|
| `GET /api/cobranza/contactos?ruc=` | `src/app/api/cobranza/contactos/route.ts` | Par prefill del compositor (`contacto: null` si no hay registro) |
| `PUT /api/cobranza/contactos` | ídem | Upsert idempotente; `updatedBy` se resuelve del JWT en el servidor; clave inválida → 400; carrera de primer insert → 409 (`ContactConflictError`) |
| `GET /api/cobranza/historial/[ruc]` | `src/app/api/cobranza/historial/[ruc]/route.ts` | Envíos del cliente, más recientes primero, sin el cuerpo HTML (`cuerpoResumen`) |
| `POST /api/send-email` | `src/app/api/send-email/route.ts` | Envío con `purpose: 'cobranza'` (FormData); audita SUCCESS/FAILED vía `registrarAuditoriaCobranza`; requiere permiso `cobranza` |

### Exportados

| Export | Archivo | Uso |
|---|---|---|
| `EmpresaContacto`, `SaveContactInput`, `CobranzaEnvioHistorial`, `RegistroEnvioCobranzaInput`, `RUC_PATTERN`, `esClaveDirectorioValida` | `domain/entities.ts` | `RUC_PATTERN` también lo consume `/api/valoraciones/contactos` |
| `ICompanyContactRepository`, `ICobranzaEnviosHistorialRepository` | `domain/ports.ts` | Contratos de los adaptadores |
| `getContactDb`, `getCobranzaHistorialDb` | `infrastructure/` | Singletons consumidos por las rutas API (y por `/api/valoraciones/contactos`) |
| `registrarAuditoriaCobranza` | `infrastructure/registrarAuditoriaCobranza.ts` | Consumido por `/api/send-email` |

## Flujo de datos

Envío de cobranza (happy path):

1. El operador sube el Excel en `/cobranza`; `parseExcelData` produce los `ClienteGroup` y la UI lista empresas con métricas.
2. Al elegir una empresa, `useCompanyContact(ruc, razonSocial)` hace `GET /api/cobranza/contactos?ruc=`. Si la clave es basura (`esClaveDirectorioValida` falla: RUC malformado o razón social `'CLIENTE SIN NOMBRE'`), el hook pasa a estado `skipped` y **no** consulta la API — el envío nunca se bloquea.
3. El par memorizado prellena `to`/`cc` del `CobranzaEmailComposer`; en paralelo `useCobranzaHistorial(ruc)` carga los envíos previos para `HistorialNotificaciones`.
4. Al confirmar, `useSendCobranzaEmail.send()` aplica **persist-before-dispatch**: primero ejecuta `saveContact` (PUT upsert) y solo si persiste despacha el `POST /api/send-email` con FormData (`to`, `cc`, `subject`, `html`, `purpose: 'cobranza'`, metadatos de auditoría y adjuntos).
5. La ruta envía el correo con `sendEmail` (nodemailer) y registra exactamente una fila de auditoría con el resultado (`SUCCESS` o `FAILED` + `errorDetalle`).
6. El historial se recarga y muestra el intento más reciente.

## Dependencias

| Tipo | Dependencia | Uso |
|---|---|---|
| Interna | `src/lib/db.ts` → `getHolomedicPool()` | Pool SQL Server de `HOLOMEDIC` |
| Interna | `@/utils/sendEmail` | Transporte SMTP (nodemailer) |
| Interna (consumidores externos) | `/api/valoraciones/contactos` usa `getContactDb` + `RUC_PATTERN` de este módulo | Directorio compartido entre módulos |
| Externa | `mssql` | Acceso a SQL Server |
| Externa | `nodemailer` (vía `@/utils/sendEmail`) | Envío de correo |
| BD | `HOLOMEDIC.dbo.EmpresaContactos` | Directorio `to`/`cc` por RUC/DNI (PK `ruc VARCHAR(11)`) |
| BD | `HOLOMEDIC.dbo.CobranzaEnviosHistorial` | Auditoría append-only (IDENTITY, CHECK `SUCCESS|FAILED`, `fechaEnvio DEFAULT SYSUTCDATETIME()`) |

## Configuración

| Variable / constante | Propósito | Dónde se lee |
|---|---|---|
| `HOLOMEDIC_DB_*` / `DB_*` | Conexión al SQL Server `HOLOMEDIC` | `src/lib/db.ts` (`getHolomedicPool`) |
| Variables SMTP (vía `@/utils/sendEmail`) | Transporte de correo saliente | `src/utils/sendEmail.ts` |
| `RUC_PATTERN = /^\d{8,11}$/` | Clave de directorio: RUC de 11 dígitos o DNI de 8 | `domain/entities.ts` |
| `RAZON_SOCIAL_JUNK = 'CLIENTE SIN NOMBRE'` | Razón social basura del parser que nunca se memoriza (comparación exacta post-trim) | `domain/entities.ts` |
| `MAX_RECIPIENTS` y límites del payload | Validación del formulario de envío | `src/app/api/send-email/route.ts` |

## Cómo probarlo

```bash
pnpm test src/features/cobranza
```

Archivos de test del módulo:

- `domain/__tests__/entities.test.ts`
- `domain/__tests__/esClaveDirectorioValida.test.ts`
- `domain/__tests__/ports.test.ts`
- `infrastructure/__tests__/getContactDb.test.ts`
- `infrastructure/__tests__/registrarAuditoriaCobranza.test.ts`
- `infrastructure/sqlserver/__tests__/errors.test.ts`
- `infrastructure/sqlserver/__tests__/migrate.test.ts`
- `infrastructure/sqlserver/__tests__/sqlServerCobranzaHistorialRepository.test.ts`
- `infrastructure/sqlserver/__tests__/sqlServerContactRepository.test.ts`
- `presentation/components/__tests__/CobranzaEmailComposer.test.tsx`
- `presentation/components/__tests__/HistorialNotificaciones.test.tsx`
- `presentation/helpers/__tests__/buildCobranzaAuditMetadata.test.ts`
- `presentation/helpers/__tests__/buildCobranzaInterpolationContext.test.ts`
- `presentation/helpers/__tests__/buildInfocorteExtract.test.ts`
- `presentation/hooks/__tests__/useCobranzaHistorial.test.ts`
- `presentation/hooks/__tests__/useCompanyContact.test.ts`
- `presentation/hooks/__tests__/useSendCobranzaEmail.test.ts`

## Gotchas

- **La auditoría nunca lanza**: `registrarAuditoriaCobranza` atrapa toda falla (pool caído, INSERT rechazado) y solo emite un `console.warn('[cobranza-audit] ...')`. Una caída de la auditoría no cambia el resultado que ve el operador — el warning es la única traza.
- **Claves basura: skip, no bloqueo**: un RUC malformado o `'CLIENTE SIN NOMBRE'` no se memoriza (ni cliente ni servidor), pero el envío procede igual. La comparación de la razón social es exacta post-trim: variantes en mayúsculas/minúsculas pasan a propósito (podrían ser nombres reales).
- **`updatedBy` y `updatedAt` no viajan desde el cliente**: el primero se resuelve del JWT en la ruta; la segunda la estampa el adaptador al escribir.
- **Upsert con carrera controlada**: el upsert es un solo batch `UPDATE ...; IF @@ROWCOUNT = 0 INSERT ...`; una carrera de primer insert produce error único 2601/2627 → `ContactConflictError` → HTTP 409.
- **El historial es append-only por diseño**: el puerto no expone update/delete; el read model excluye `cuerpoResumen` (LOB `NVARCHAR(MAX)`) para mantener liviana la respuesta.
- **`fechaEnvio` en UTC**: columna `DATETIME2(3) DEFAULT SYSUTCDATETIME()` (deliberado; el borrador usaba `GETDATE()`).
- **Parseo fuera del módulo**: el parser del Excel (`src/utils/excelParser.ts`) y los componentes de UI genéricos (`FileUpload`, `ClientList`, `ClientDetailModal`) viven fuera de `src/features/cobranza/`; el módulo aporta compositor, hooks, helpers y persistencia.
- **`/api/send-email` es ruta protegida con permiso `cobranza`** (ver `RUTAS_PROTEGIDAS` en auth): consumidores script sin sesión reciben 401, no un redirect.
