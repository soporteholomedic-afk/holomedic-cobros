# Índice de módulos

El código de negocio vive en `src/features/<modulo>/` siguiendo arquitectura hexagonal por feature, con cuatro capas fijas:

| Capa | Contenido |
|---|---|
| `domain/` | Entidades, validaciones y **puertos** (interfaces) — sin dependencias de framework ni I/O |
| `application/` | Casos de uso que orquestan puertos |
| `infrastructure/` | Adaptadores concretos: SQL Server (`mssql`), SMTP, share UNC, spawn de procesos, singletons de fábrica (`getXxxDb`, `getXxxRepository`) |
| `presentation/` | Componentes React, hooks y helpers de cliente |

Algunos módulos añaden una capa `composition/` (p. ej. `jjc-mapper`, `musculoesqueletica-pdf`) con el wiring de dependencias (container de inyección).

Convención verificada en `envio-resultados` (`domain/ports.ts` → `SendResultsUseCase` → `UncFileRepository`/`EmailService`), `firma-correo` (`IFirmaRepository` → `GetOwnFirmaUseCase`/`SaveOwnFirmaUseCase` → `SqlServerFirmaRepository`) y `musculoesqueletica-pdf` (puertos `PdfPrinter`/`PdfMerger` → `PdfService` → `EdgePrinter`/`PdfLibMerger`). Los tests viven en carpetas `__tests__/` junto al código y se ejecutan con Vitest (`pnpm vitest run src/features/<modulo>` para un solo módulo).

## Cobros / Admin

| Módulo | Ubicación | Propósito | Rutas app principales |
|---|---|---|---|
| [auth](./auth.md) | `src/features/auth/` | Autenticación con sesión/permisos y CRUD de usuarios (`RUTAS_PROTEGIDAS`, `PERMISOS`) | `/auth/login`, `/auth/denegado`, `/admin/usuarios` |
| [cobranza](./cobranza.md) | `src/features/cobranza/` | Composición y envío de correos de cobranza con contactos e historial por RUC | `/cobranza` |
| [valoraciones](./valoraciones.md) | `src/features/valoraciones/` | Reportes de valoración/facturación por empresa (PDF y Excel) y su envío | `/valoraciones` |
| [plantillas-editor](./plantillas-editor.md) | `src/features/plantillas-editor/` | Editor de plantillas de correo por área con versiones, defaults y papelera (`dbo.templates`) | `/admin/plantillas` |

## Osteomuscular / PDF

| Módulo | Ubicación | Propósito | Rutas app principales |
|---|---|---|---|
| [jjc-mapper](./jjc-mapper.md) | `src/features/jjc-mapper/` | Mapeo de datos de atención JJC (medicina) para fichas y PDFs | `/areas/medicina/jjc` |
| [entrevista-osteomuscular](./entrevista-osteomuscular.md) | `src/features/entrevista-osteomuscular/` | Formulario multipágina de entrevista osteomuscular | `/areas/musculoesqueletica/jjc/[idAtencion]/entrevista` |
| [evaluacion-osteomuscular](./evaluacion-osteomuscular.md) | `src/features/evaluacion-osteomuscular/` | Formulario multipágina de evaluación osteomuscular | `/areas/musculoesqueletica/jjc/[idAtencion]/evaluacion` |
| [musculoesqueletica-pdf](./musculoesqueletica-pdf.md) | `src/features/musculoesqueletica-pdf/` | PDF osteomuscular offline: HTML → Edge (print) → merge en un solo documento | API `/api/areas/musculoesqueletica/jjc/[idAten]/pdf` |

## Envío / Informes

| Módulo | Ubicación | Propósito | Rutas app principales |
|---|---|---|---|
| [envio-resultados](./envio-resultados.md) | `src/features/envio-resultados/` | Envío consolidado de resultados médicos por correo (adjuntos del share SIGLA + PDFs vía `SIGLA.PdfCli.exe`) con historial auditable | `/consolidados`, `/consolidados/envio-resultados`, `/consolidados/historial-envios` |
| [firma-correo](./firma-correo.md) | `src/features/firma-correo/` | Firma de correo HTML auto-servicio por usuario, inyectada en todos los correos salientes | `/admin/plantillas/firma` |
