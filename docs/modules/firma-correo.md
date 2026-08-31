# Módulo firma-correo

> Ubicación: `src/features/firma-correo/` · Rutas: `/admin/plantillas/firma`, `/admin/plantillas/[area]/firma`, API `/api/plantillas/firma`

## Propósito

Firma de correo electrónico auto-servicio por usuario: cada usuario con el permiso `firma_correo` edita cinco campos estructurados (nombre, área, correo, móvil, anexo) en la página "Mi firma". El servidor compone el bloque HTML email-safe y los flujos de envío (consolidados, cobranza, valoraciones) lo inyectan automáticamente en los correos salientes.

## Arquitectura interna

| Capa | Responsabilidad | Archivos clave |
|---|---|---|
| `domain/` | Entidad, reglas de validación, codec JSON y composición HTML pura | `domain/entities.ts` (`FirmaCorreo`, `CampoFirma`), `domain/validation.ts` (`FIRMAS_RULES`, `validateFirmaCorreo`), `domain/firmaCodec.ts` (`encodeFirma`/`decodeFirma`, sobre v:1), `domain/composeSignatureHtml.ts` (`composeSignatureHtml`, `FIRMA_LOGO_CID`, `FIRMA_TELEFONO_FIJO`, `FIRMA_DIRECCION`), `domain/ports.ts` (`IFirmaRepository`) |
| `application/` | Casos de uso delgado: leer y guardar la firma propia | `application/getOwnFirma.ts` (`GetOwnFirmaUseCase`), `application/saveOwnFirma.ts` (`SaveOwnFirmaUseCase` — valida primero, persiste solo resultados válidos) |
| `infrastructure/` | Adaptador SQL Server: fila huésped en el esquema de plantillas | `infrastructure/sqlserver/sqlServerFirmaRepository.ts` (`SqlServerFirmaRepository`, `FIRMA_STORAGE_AREA = 'firma-correo'`), `infrastructure/sqlserver/index.ts` + `migrate` (reutiliza la migración de plantillas), `infrastructure/getFirmaDb.ts` (singleton con cache de promesa + seam de tests) |
| `presentation/` | Formulario "Mi firma", hooks y helpers de cliente | `presentation/components/FirmaForm.tsx` (render puro + vista previa), `presentation/hooks/useFirmaForm.ts` (estado + submit), `presentation/hooks/useFirmaCorreo.ts` (GET al montar para los compositores de correo), `presentation/helpers/saveFirmaApi.ts` (PUT), `presentation/helpers/resolveLogoCid.ts` (cid → `/logo-holomedic.png`, solo display), `presentation/helpers/replaceFirmaFallback.ts` (recupera la carrera firma-vs-plantilla) |

## Puntos de entrada

### Páginas

| Ruta | Archivo |
|---|---|
| `/admin/plantillas/firma` | `src/app/admin/plantillas/firma/page.tsx` (entrada canónica: redirect al primer área registrada) |
| `/admin/plantillas/[area]/firma` | `src/app/admin/plantillas/[area]/firma/page.tsx` + `resolveFirmaPageData.ts` (prefill desde el registro de usuario; la firma guardada gana) |

### API

| Endpoint | Método | Handler |
|---|---|---|
| `/api/plantillas/firma` | GET | Firma propia + `firmaHtml` compuesto server-side (`GetOwnFirmaUseCase` + `composeSignatureHtml`) |
| `/api/plantillas/firma` | PUT | Guardar firma propia (`SaveOwnFirmaUseCase`); 401/403 sin sesión/permiso, 400 con `fields` por campo |

### Exportados

| Símbolo | Consumido por |
|---|---|
| `FirmaCorreo`, `CampoFirma` | API, página, compositores |
| `composeSignatureHtml` | API (GET/PUT), `FirmaForm` (vista previa) — misma función ⇒ preview == correo enviado |
| `validateFirmaCorreo` / `FIRMAS_RULES` | Formulario (cliente) y `SaveOwnFirmaUseCase` (servidor) — una sola fuente de reglas |
| `useFirmaCorreo` | `EmailEditor` (envio-resultados), `CobranzaEmailComposer` (cobranza), `EnviarValoracionesModal` (valoraciones) |
| `replaceFirmaFallback` | Compositores: reemplaza el `[Falta configurar firma]` ya "horneado" en el cuerpo cuando la firma llega tarde |
| `resolveLogoCid` | `FirmaForm` y paneles de vista previa (nunca al HTML almacenado/enviado) |

## Flujo de datos

Edición y guardado (happy path):

1. El usuario abre `/admin/plantillas/firma` → redirect al primer área registrada (p. ej. `/admin/plantillas/consolidados/firma`).
2. `resolveFirmaPageData(area)` valida el área contra el registro de plantillas (404 si no existe), exige sesión, y arma el prefill desde el registro de usuario (`getUsuarioDb().getById(session.sub)`: nombre, área, correo); si ya hay firma guardada (`GetOwnFirmaUseCase`), esta gana sobre el prefill.
3. `FirmaForm` renderiza los cinco campos; la vista previa ejecuta `composeSignatureHtml(values)` + `resolveLogoCid` — el mismo HTML que saldrá en el correo, salvo el `cid:` del logo.
4. Al enviar, `useFirmaForm.submit` valida en cliente con `validateFirmaCorreo`; si es válida, `saveFirmaApi` hace PUT a `/api/plantillas/firma`.
5. La ruta verifica sesión + permiso `firma_correo`, rechaza bodies con `firma`/`firmaHtml` (no existe superficie de HTML cliente) y delega en `SaveOwnFirmaUseCase`, que re-valida y persiste.
6. `SqlServerFirmaRepository.saveOwnFirma` hace upsert transaccional en `dbo.templates` (área reservada `firma-correo`, `ownerId = session.sub`) + fila append-only en `dbo.template_versions` (`editedBy = ownerId`).

Consumo en un envío:

1. El compositor de correo monta `useFirmaCorreo()` → GET `/api/plantillas/firma` → `firmaHtml` (vacío si no hay firma).
2. El resolver del token `{{firma}}` interpola el HTML o el fallback `[Falta configurar firma]`; si la plantilla ganó la carrera inicial, `replaceFirmaFallback` sustituye el fallback por la firma real **sin re-interpolar** (no pisa ediciones del operador).
3. `src/utils/sendEmail` detecta `cid:holomedic-logo` en el body y adjunta `public/logo-holomedic.png` embebido (CID); los clientes de correo resuelven el logo.

## Dependencias

| Tipo | Dependencia | Uso |
|---|---|---|
| Interna | `features/auth` | `isValidCorreo` (validación de correo), `getUsuarioDb` (prefill), `getSession` |
| Interna | `features/plantillas-editor` | `areaConfigRegistry` (`getAreaConfig`/`AREA_CONFIGS`) — determina áreas válidas y el target del redirect canónico |
| Interna | `features/envio-resultados` | `FIRMA_FALLBACK_HTML` del registry de tokens (usado por `replaceFirmaFallback`) |
| Interna | `@/lib/db` (`getHolomedicPool`) | Pool SQL Server `HOLOMEDIC` |
| Externa | SQL Server `HOLOMEDIC` (`HOLOMEDIC_DB_*`) | Tablas huésped `dbo.templates` / `dbo.template_versions` (cero migración de esquema) |
| Externa | `public/logo-holomedic.png` | Logo embebido vía CID en el transporte SMTP |

## Configuración

| Variable / constante | Propósito | Dónde se lee |
|---|---|---|
| `HOLOMEDIC_DB_*` | Pool SQL Server (mismo pool singleton que plantillas) | `infrastructure/getFirmaDb.ts` → `@/lib/db` |
| `FIRMA_STORAGE_AREA = 'firma-correo'` | Área reservada en `dbo.templates`; **no** está en `AREA_CONFIGS`, por lo que el editor de plantillas nunca la lista | `infrastructure/sqlserver/sqlServerFirmaRepository.ts` |
| `FIRMA_LOGO_CID = 'cid:holomedic-logo'` | Referencia del logo en el HTML; el transporte la adjunta como CID | `domain/composeSignatureHtml.ts` |
| `FIRMA_TELEFONO_FIJO = '480-0217'`, `FIRMA_DIRECCION` | Línea telefónica y dirección fijas de la empresa, no editables | `domain/composeSignatureHtml.ts` |
| `FIRMAS_RULES` | Límites por campo (nombre 2–80, área 2–60, correo ≤120 + formato, móvil 6–20 con ≥6 dígitos, anexo 1–5 dígitos) | `domain/validation.ts` |
| Permiso `firma_correo` | Gate de las rutas `/admin/plantillas/*/firma` y `/api/plantillas/firma` | `src/features/auth/domain/routes.ts` + check in-route en la API |

## Cómo probarlo

```bash
# Solo los tests del módulo
pnpm vitest run src/features/firma-correo
```

Archivos de test (todos en `__tests__/`): `application/__tests__/getOwnFirma.test.ts` y `saveOwnFirma.test.ts`, `domain/__tests__/` (composeSignatureHtml, firmaCodec, validation), `infrastructure/__tests__/getFirmaDb.test.ts`, `infrastructure/sqlserver/__tests__/sqlServerFirmaRepository.test.ts`, `presentation/components/__tests__/FirmaForm.test.tsx`, `presentation/helpers/__tests__/` (replaceFirmaFallback, resolveLogoCid, saveFirmaApi), `presentation/hooks/__tests__/` (useFirmaCorreo, useFirmaForm).

## Gotchas

- El HTML de la firma **nunca** proviene del cliente: el PUT rechaza bodies con `firma`/`firmaHtml`; el bloque se compone server-side con `composeSignatureHtml`, que escapa los cinco campos (`escapeHtml`) y solo emite markup estructural fijo. Renderizarlo con `dangerouslySetInnerHTML` en la vista previa es seguro por contrato.
- La firma vive como **fila huésped** en `dbo.templates` con el JSON v:1 en `bodyHtml` (decisión D3: cero migración). `decodeFirma` degrada a `null` cualquier fila corrupta o que no pase la validación vigente — se trata como "sin firma", nunca como error (los cambios de reglas invalidan filas viejas en lugar de romper).
- Siempre `isDefault = 0`: el índice único filtrado de defaults de plantillas nunca se ve afectado.
- La etiqueta del formulario dice "Móvil" pero la clave de almacenamiento es `telefono` — no renombrar la clave (compatibilidad del codec).
- El guion en `"Los Sauces – Surquillo"` de `FIRMA_DIRECCION` es un EN DASH (U+2013) que debe mantenerse byte-exacto.
- `resolveLogoCid` es solo para **display**: el HTML almacenado y enviado conserva `cid:holomedic-logo`; los navegadores no resuelven Content-IDs SMTP.
- `replaceFirmaFallback` usa split/join deliberadamente — nunca re-interpola el cuerpo, para no sobrescribir ediciones manuales del operador.
- Upsert serializado: el lookup del primer guardado ocurre dentro de la transacción para que dos saves concurrentes no dupliquen filas.
- No confundir con `/api/usuarios/[id]/firma` (subida de la **imagen** de firma del CRUD de usuarios — módulo `auth`, sin relación con este módulo).
- Vista previa y correo enviado son byte-idénticos porque comparten la misma función pura de composición.
