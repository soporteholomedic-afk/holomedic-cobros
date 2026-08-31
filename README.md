# Holomedic Cobros

Plataforma web de gestión de facturación, cobranza y envío de resultados de Holomedic S.A.C.: centraliza reportes contables, audita saldos por cliente, genera valoraciones automatizadas y despacha informes por correo con firma corporativa.

> Documentación completa: [Módulos](docs/modules/README.md) · [Flujo de desarrollo](docs/DEVELOPMENT.md) · [Despliegue](docs/DEPLOY.md)

## Ruta rápida

```bash
pnpm install                # jamás npm/yarn — pnpm 11.9.0 con pnpm-lock.yaml
cp .env.local.example .env.local   # completar credenciales (ver tabla de entorno)
pnpm dev                    # → http://localhost:3001
```

## Stack

| Tecnología | Uso |
|---|---|
| Next.js 16 (App Router) + React 19 | Framework — Server Components por defecto, rutas protegidas vía `src/proxy.ts` |
| TypeScript (strict) | Sin `any`; tipos compartidos en `src/types/` |
| Tailwind CSS 4 | Estilos |
| SQL Server (`mssql`) | Dos pools: `DB_*` → SIGLA/ICCGSA, `HOLOMEDIC_DB_*` → HOLOMEDIC |
| Nodemailer | Envío de correos (SMTP por propósito: facturación / consolidados / cobranza) |
| ExcelJS · pdf-lib · puppeteer-core (Edge) | Generación de Excel y PDF |
| Vitest + Testing Library | Tests unitarios junto al código fuente (`*.test.ts`) |

## Módulos

Cada módulo vive en `src/features/<modulo>/` con capas hexagonales (`domain` / `application` / `infrastructure` / `presentation`). Documentación detallada en [docs/modules/](docs/modules/README.md).

| Dominio | Módulos |
|---|---|
| Cobros / Admin | [auth](docs/modules/auth.md) · [cobranza](docs/modules/cobranza.md) · [valoraciones](docs/modules/valoraciones.md) · [jjc-mapper](docs/modules/jjc-mapper.md) |
| Osteomuscular / PDF | [entrevista-osteomuscular](docs/modules/entrevista-osteomuscular.md) · [evaluacion-osteomuscular](docs/modules/evaluacion-osteomuscular.md) · [musculoesqueletica-pdf](docs/modules/musculoesqueletica-pdf.md) · [plantillas-editor](docs/modules/plantillas-editor.md) |
| Envío / Informes | [envio-resultados](docs/modules/envio-resultados.md) · [firma-correo](docs/modules/firma-correo.md) |

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo en `http://localhost:3001` (producción Docker usa el 3000) |
| `pnpm build` / `pnpm start` | Build de producción / servidor standalone |
| `pnpm lint` | ESLint (en trabajo diario: solo archivos modificados) |
| `pnpm test` | Vitest — todos los tests |
| `pnpm vitest run src/features/<modulo>` | Tests de un solo módulo |

## Estructura

```
src/
  app/          # Rutas App Router (páginas + endpoints /api)
  features/     # 10 módulos de negocio, hexagonal por feature
  components/   # UI compartida
  lib/          # Pools SQL, plataforma, utilidades server
  proxy.ts      # Protección de rutas (Next 16: proxy, no middleware)
scripts/sync-sdk.mjs  # Espejo al SDK Windows (sync-sdk.sh / sync-sdk.ps1)
sigla-cli/      # Runtime .NET para PDFs (git-trackreado a propósito)
```

## Entorno (`.env.local`)

Plantilla: `.env.local.example`. Variables principales: `DB_*` / `HOLOMEDIC_DB_*` (conexiones SQL), `SMTP_USER_FACTURACION` / `_CONSOLIDADOS` / `_COBRANZA`, `JWT_SECRET`, `COOKIE_SECURE`. Para exploración de la base SIGLA usar únicamente el perfil read-only `explorar_datos` (`HOLOMEDIC_DB_USER`). Tabla completa en [docs/DEPLOY.md](docs/DEPLOY.md#c-entorno-y-configuración).

## Flujo de trabajo

Trabajo diario **siempre en `develop`**; feature branches desde `develop`; `master` solo recibe merges promovidos. En remoto existen únicamente `master` y `develop`. Detalle completo y checklists en [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Despliegue

- **Producción**: Docker (Next.js standalone) en Linux, puerto 3000, con patrón de rollback `-old`.
- **SDK Windows**: `node scripts/sync-sdk.mjs` (o wrappers `sync-sdk.sh` / `sync-sdk.ps1`) espeja el repo al share de red; `.env.local` se copia manualmente.

Procedimientos paso a paso en [docs/DEPLOY.md](docs/DEPLOY.md).
