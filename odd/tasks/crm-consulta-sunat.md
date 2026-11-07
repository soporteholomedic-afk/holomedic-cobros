# Feature: crm-consulta-sunat — Datos de empresas vía apifacturacion.com con config in-app

> Rama: `feature/crm-consulta-sunat` (desde `develop`) · Creado: 2026-11-07 · Base: CRM simple (`dbo.CrmEmpresa`) en db `HOLOMEDIC`

## Objetivo
Al ingresar el RUC de una empresa en el CRM (alta y tarjeta "Falta RUC"), consultar apifacturacion.com (SUNAT) y autocompletar razón social y dirección fiscal, mostrando estado/condición SUNAT. La API (token + URL) se configura desde la app, con el token cifrado en DB.

## Specs

- **S1** — "Ahora vamos a realizar la mejora para la implementación de obtener los datos de las empresas: https://apifacturacion.com/" — el CRM consulta `POST https://api.apifacturacion.com/ruc/{ruc}` (form-data `token`) y devuelve JSON con razón social, dirección fiscal, ubigeo, estado y condición.
- **S2** — "Necesito que la api se agregue en configuración" — el token y la URL se administran desde la UI de configuración de la app (`/admin/crm/configuracion`), NO solo por `.env.local`. El token se guarda cifrado (AES-256-GCM, clave maestra `CRM_CONFIG_KEY` de env, fail-closed en prod); nunca en repo, logs ni auditoría en claro.
- **S3** — Respuesta de alcance: "Alta + Falta RUC" — el lookup corre en el formulario de alta de empresa Y en la tarjeta "Falta RUC" al completar los 11 dígitos; muestra estado (ACTIVO/BAJA) y condición (HABIDO).
- **S4** — Respuesta de dirección: "Guardar en la empresa" — la dirección fiscal se persiste en la empresa; si falta la columna `direccion` en `dbo.CrmEmpresa`, se agrega con el patrón de migración guarded existente (`columnaEmpresa`). Sin RUC en DB la empresa admite `ruc NULL` (index único filtrado existente).
- **S5** — Respuesta de token: "Ya tengo token" — el usuario lo pega en la UI de configuración (o `APIFACTURACION_TOKEN` de env como fallback; resolver DB > env, patrón E5). Sin token configurado, el lookup responde estado claro "no configurado" (503), sin romper.
- **S6** — "en la db HOLOMEDIC, NO SILA" — todo el módulo opera sobre la conexión `HOLOMEDIC_DB_*` existente (`getHolomedicPool()`). La DB live NO tiene tablas `CRM_*` (verificado 2026-11-07): la migración crea `CRM_Config` + `CRM_ConfigAuditoria` sin colisiones.

## Decisiones técnicas
- **Port desde la línea E5** (nunca mergeada a develop; develop pivoteó al CRM simple): commits `47f2880` (T1 cifrado) y `6ef59fe` (T2 repo config) se portan por cherry-pick resolviendo conflictos aditivos. El módulo es genérico (clave/valor + auditoría sin secretos).
- `getCrmDb()` de develop devuelve el repo directamente (sin contenedor `.config` como en la línea E5): el acceso al repo de config se agrega sin romper ese contrato (accesorio propio o extensión aditiva).
- Rutas API nuevas: `GET|PUT /api/crm/configuracion/apifacturacion` + `POST .../probar`, protegidas por el permiso `crm_configuracion` (ya registrado en `PERMISOS`, sin rutas ni UI en develop). `RUTAS_PROTEGIDAS` necesita las entradas (longest-first gana al prefijo `/api/crm`).
- Lookup: `GET /api/crm/ruc/{ruc}` queda cubierto por el permiso `crm` vía el prefijo `/api/crm` existente.
- Timeout y errores del cliente externo mapeados a estados de UI: no encontrado (404), no configurado (503), servicio caído (502), RUC inválido (400).

## Tasks

- **T1** [S6, S2] — U1: port cifrado + CRM_Config (cherry-picks `47f2880`, `6ef59fe`, conflictos aditivos; tests incluidos). *Commit propio: cambio de esquema (Risk 1) + crypto (Risk 2).*
- **T2** [S2, S5] — U2: use cases config apifacturacion + APIs GET/PUT/probar + `RUTAS_PROTEGIDAS` + página `/admin/crm/configuracion` (CampoSecreto + estado token + probar conexión) + entrada Sidebar. *Tests incluidos.*
- **T3** [S4] — U3: columna `direccion` en `CrmEmpresa` (migración guarded), dominio (`Empresa`/`DatosEmpresa`/`CrearEmpresaDatos`), repo SQL, validadores. *Commit propio: Risk 1.*
- **T4** [S1, S5] — U4: port `IConsultaRucServicio` + `ApiFacturacionCliente` (timeout, validación de respuesta externa) + `ConsultarRucUseCase` + ruta `GET /api/crm/ruc/[ruc]`. *Tests con fetch mockeado.*
- **T5** [S3] — U5: alta de empresa autocompleta por RUC (razón social + dirección, badge estado/condición, estados carga/error).
- **T6** [S3] — U6: tarjeta "Falta RUC" autocompleta al tipear el RUC.
- **T7** — Cierre: docs del módulo, sync SDK, verificación independiente, review.

## Reglas de ejecución
Test-first en cambios de comportamiento (RED observado → GREEN); tests/lint solo de archivos modificados (modo apply, nunca suite global en apply); pnpm exclusivamente; nunca commitear `.env*`; un work-unit commit por tarea (Conventional Commits); push/PR/merge solo si el usuario lo pide.

## Log

- **L1** — 2026-11-07: "Ahora vamos a realizar la mejora para la implementación de obtener los datos de las empresas: https://apifacturacion.com/"
- **L2** — 2026-11-07: "en la db HOLOMEDIC, NO SILA" (aclaración de base de datos para el contexto del CRM).
- **L3** — 2026-11-07: Respuestas de alcance: "Alta + Falta RUC" · token: "Ya tengo token" · dirección: "Guardar en la empresa".
- **L4** — 2026-11-07: "Necesito que la api se agregue en configuración" — el token/URL van a configuración in-app; añade U2 y el port del módulo E5 como U1. Previo a esto se diagnosticó que la línea `agente-ia-crm` (con su config) nunca llegó a develop ni a la DB live: el port parte de los commits `47f2880`/`6ef59fe`.
- **L5** — 2026-11-07: Pre-tarea: se limpiaron los datos de prueba de `dbo.CrmEmpresa` (5 empresas → 0) con backup en `temp/crm-backup-2026-11-07.json`. Sectores (7) intactos.
