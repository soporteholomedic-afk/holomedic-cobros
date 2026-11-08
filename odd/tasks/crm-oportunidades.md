# CRM: separar Empresa / Oportunidad / Actividad

Rediseño comercial de `src/features/crm`: la empresa deja de ser la tarjeta del Kanban y pasa a ser
ficha permanente; las **oportunidades comerciales** son las tarjetas; las actividades (historial)
pueden vincularse a una oportunidad. Basado en `docs/subidos/2026-11-07-20-06-19-Mejoras-CRM.txt`.

## Specs

### S1 — Modelo de tres conceptos
> "El producto debe distinguir tres conceptos que actualmente están demasiado relacionados."
> **Empresa**: "Es la organización con la que Holomedic mantiene una relación comercial. Existe una sola ficha por empresa."
> **Oportunidades**: "Negocios concretos que buscamos conseguir o cerrar." — "Una empresa puede tener varias oportunidades simultáneamente, incluso con distintos responsables si la política comercial lo permite."
> **Actividades**: "Llamadas, correos, mensajes y seguimientos realizados." — "Las actividades pertenecen al historial de la empresa y pueden relacionarse con una oportunidad específica."
- Empresa conserva: "Razón social, RUC, sector y datos generales", "Personas de contacto", "Comercial responsable", "Relación con Holomedic: Prospecto o Cliente", "Última interacción comercial", "Historial completo de actividades", "Todas sus oportunidades comerciales, actuales y anteriores".
- Regla principal: "una empresa nunca se considera perdida únicamente porque una negociación fracasa."
- Campos de la oportunidad (tabla del documento): Nombre / Empresa / Responsable / Origen ("Identificar si nosotros contactamos o si la empresa llegó sola") / Servicio de interés / Etapa comercial / Monto estimado / Próxima acción / Resultado final ("Registrar si se ganó o perdió y, en este último caso, por qué").
- Actividad: "Se mantiene el concepto que actualmente maneja Holomedic: llamada, correo, WhatsApp, medio utilizado, resultado, resumen y próxima acción." — "al registrar una actividad, el usuario podrá indicar a qué oportunidad corresponde." — "Si la llamada es general y no corresponde a ningún negocio específico, se registra solamente en el historial de la empresa."
- Etapas de la oportunidad: `por_contactar | contactado | en_seguimiento | cotizado | ganada | perdida`.
  Criterios: Por contactar "Se identificó una oportunidad, pero todavía no se inició el contacto"; Contactado "Se realizó el primer acercamiento o recibimos la solicitud"; En seguimiento "Existe una conversación comercial pendiente de avanzar"; Cotizado "Ya se entregó una propuesta económica"; Ganada "El cliente aceptó la propuesta o confirmó el acuerdo comercial"; Perdida "La negociación terminó sin concretarse".

### S2 — Kanban por oportunidades
> "Actualmente: cada tarjeta representa una empresa. Nuevo diseño: cada tarjeta representa una oportunidad comercial."
> "Una empresa puede aparecer en varias columnas porque tiene distintas oportunidades."
> "El estado Cliente debe salir del Kanban y convertirse en una condición de la empresa. En su lugar tendremos Ganada, que representa el resultado de una oportunidad."
> "Añadiría Cotizado, porque es importante distinguir las conversaciones comerciales de las propuestas económicas efectivamente presentadas."
> "cuando una oportunidad pasa a Perdida, solamente se cierra esa oportunidad. La empresa y sus demás oportunidades no se modifican."
- Caso 1: "La oportunidad pasa a Perdida y solicita el motivo."

### S3 — Ficha de empresa
> "Esta sería la principal pantalla de consulta de una empresa."
- Muestra: razón social, RUC, sector, relación (Cliente/Prospecto), responsable, "Actividad de servicios" (p. ej. "Sin actividad reciente"), "Último contacto", "Última atención", "Oportunidades — N registradas" (cada una con su etapa), "Historial de actividades".
- "El historial general debe conservar todas las actividades, sin importar si la oportunidad está abierta, ganada o perdida."
- Objetivo: "¿Quién es esta empresa? ¿Qué negocios tenemos con ella? ¿Qué hemos conversado o gestionado?"

### S4 — Procesos existentes (tabla del documento)
> "Nueva empresa — Crea la ficha empresarial. Puede ofrecer crear su primera oportunidad en el mismo proceso."
> "Nos contactaron — Primero busca la empresa. Si ya existe, crea una oportunidad vinculada; si no existe, registra la empresa y su primera oportunidad."
> "Registrar contacto — Pasa a llamarse Registrar actividad o Registrar gestión. Permite relacionarla con una oportunidad."
> "Mover tarjeta — Mueve una oportunidad, no la empresa."
> "Ver empresa — Muestra información general, oportunidades, contactos personales e historial completo."
> "Importar empresas — Crea o actualiza fichas de empresa, sin generar automáticamente oportunidades ficticias."
> "Si una empresa que ya trabaja con Holomedic solicita un servicio adicional, el comercial no debe crear otra empresa ni modificar su relación general. Solo debe registrar una nueva oportunidad."

### S5 — Casos que el producto debe manejar
- Caso 1 (prospecto rechaza): "La oportunidad pasa a Perdida y solicita el motivo. La empresa permanece como Prospecto, con su historial disponible para futuras gestiones."
- Caso 2 (cliente pide otro servicio): "El comercial abre su ficha y crea una nueva oportunidad. La negociación sigue su propio recorrido, sin afectar las oportunidades anteriores ni la condición de cliente."
- Caso 3 (cliente 4 meses sin enviar trabajadores): "La empresa continúa siendo cliente, pero se identifica como Sin actividad de servicios reciente." — "La condición de actividad reciente se actualiza cuando efectivamente vuelve a enviar trabajadores." — "ganar una negociación no es lo mismo que comprobar que el cliente volvió a utilizar los servicios."

### S6 — Reglas de producto (tabla del documento)
1. "Una empresa puede tener múltiples oportunidades." → "No duplicar fichas para registrar nuevos negocios."
2. "Una oportunidad tiene una sola etapa comercial vigente." → "Su resultado es independiente de otras oportunidades."
3. "Una empresa puede ser cliente y tener oportunidades perdidas." → "No cambiar automáticamente su condición de cliente."
4. "Una actividad puede ser general o específica." → "Debe quedar en el historial de la empresa y, cuando corresponda, en el de la oportunidad."
5. "Ganar una oportunidad no implica que se realizó un servicio." → "Diferenciar el resultado comercial de la actividad asistencial."
6. "La inactividad de cuatro meses se calcula por servicios, no por llamadas." → "Un correo reciente no elimina la alerta de inactividad."
7. "Una empresa sin datos de atenciones no debe clasificarse automáticamente como inactiva." → "Mostrar Sin información o Pendiente de primera atención, según corresponda."
8. "Las oportunidades perdidas conservan su historial." → "Si surge otra negociación, crear una oportunidad nueva en lugar de sobrescribir la anterior."
- Definición de Cliente: "una empresa que ya tiene un acuerdo comercial confirmado con Holomedic. En cambio, la actividad reciente se determina por las atenciones efectivamente realizadas."

### S7 — Validación funcional (7 comprobaciones del documento)
1. Crear una empresa sin crear obligatoriamente una oportunidad.
2. Crear dos oportunidades diferentes para una misma empresa.
3. Marcar una oportunidad como perdida sin cambiar el estado de la empresa.
4. Registrar una actividad vinculada con una oportunidad específica.
5. Consultar todas las actividades desde la ficha de empresa.
6. Cerrar una oportunidad como ganada sin alterar otras negociaciones abiertas.
7. Identificar a un cliente inactivo sin clasificarlo como prospecto o perdido.

### S8 — Decisiones del usuario (2026-11-07)
- Última atención / actividad de servicios: **leer SIGLA en vivo** (perfil read-only `explorar_datos`) — sin campo manual.
- Migración de datos existentes: **abiertas + perdidas migran** — abiertas → oportunidad con misma etapa + próxima acción + origen copiados; `perdido` → oportunidad `perdida` conservando motivo; `cliente` → solo relación `cliente`, sin tarjeta sintética; historial y contactos intactos; todo lo creado por la migración queda marcado como migrado.

## Tasks

| ID | Specs | Route | Commit |
|----|-------|-------|--------|
| T1 | S1 | inline (contrato de dominio) | `4467542` |
| T2 | S1,S6,S8 | worker | `0459f08` + fix `4bfb209` |
| T3 | S3,S5,S6 | worker (exploración) + inline | `4467542` |
| T4 | S1,S2,S4 | worker | `b50de28` |
| T5 | S4 | worker | `9c21a5b` |
| T6 | S2 | worker | `77901a1` |
| T7 | S3 | worker | `2b49a2e` |
| T8 | S4 | worker | `4e8789a` |
| T9 | S4,S7 | worker + inline | `3bebf02` |
| T10 | — | inline | `3bebf02` |

## Log
- L1 (petición original): "@docs/subidos/2026-11-07-20-06-19-Mejoras-CRM.txt contrasta e imolementa"
- L2: contraste — hoy `CrmEmpresa.etapa` (por_contactar/contactado/en_seguimiento/cliente/perdido) es la tarjeta; no existe cotizado/ganada, responsable, servicio, monto; `CrmInteraccion` sin vínculo a negocio; CRM no lee atenciones de SIGLA; `migrate.ts` batch idempotente autoejecutado.
- L3: usuario eligió SIGLA en vivo para última atención (S8).
- L4: usuario eligió migración "abiertas + perdidas migran" (S8).
- L5: riesgo alto identificado — migración de datos en BD compartida (alto-riesgo 1) y cambio de contratos de API consumidos por la UI (alto-riesgo 3). Commit de migración aislado para revisión nativa.
- L6 (T3, evidencia): pool SIGLA ya existente (`getPool()`, `src/lib/db.ts:61`, `DB_*`/`DB_NAME`). Ruta de datos confirmada en vivo: `Cliente.NroRuc` (texto 11 dígitos, sin guiones) → `Orden.CodCli` → `MAX(Orden.FecAte)`; `LEFT JOIN` conserva NULL para empresas sin atenciones (S6.7). Nota de proceso: el sondeo interactivo usó el pool `DB_` (perfil `sa`) por error de selección de prefijo — queries read-only; próximas verificaciones interactivas deben usar `explorar_datos` (regla AGENTS.md). El adapter en runtime usa el pool existente de la app.
- L7 (T3 cierre): `SqlServerAtencionesRepository` + `fechaLima` implementados; 4/4 tests unitarios en verde (Lima-day mapping, NULL sin atenciones, RUC inexistente, forma de la query). Cableado en ruta API queda para T5.
- L8 (slice boundary, 2026-11-07): 3 commits — 4467542 (dominio + adapter SIGLA T1/T3), 0459f08 (esquema SQL + migración + repos T2, aislado para revisión nativa por alto-riesgo 1). El tamaño de slice excede ~400 líneas por ser contrato + migración coherentes; estrategia de entrega: commits por unidad, suite completa en T9, y ensayo de migración en contenedor SQL Server local (imagen en descarga) antes de promoción — nunca contra el servidor compartido.
- L9 (T2 verificación de campo, 2026-11-07): el ensayo en contenedor (mssql 2022 local, no el servidor compartido) encontró un defecto real — `EXEC(''literal'' + QUOTENAME(@x))` es T-SQL inválido y su error de compilación NO aborta el batch externo: el sweep no eliminaba nada y `DROP COLUMN` fallaba con checks vivos. Corregido en 4bfb209 (string en variable + predicate por `sys.sql_expression_dependencies` para checks multi-columna) con pin de regresión; ensayo 2/2 GREEN (upgrade S8 exacto + idempotencia + instalación fresca). T4 commiteado en b50de28 (34 archivos, 252/252) con la corrección de dominio `pendiente_primera` (S6.7) que T4 detectó en mi T1. Contenedor y arnés temporales eliminados; el pin estático queda en migrate.test.ts.
- L10 (cierre, 2026-11-07): 10 commits en `feature/crm-oportunidades` (~13.300 líneas). Verificación final: suite completa CRM **73 archivos / 1058 tests** en verde (dominio, aplicación, infraestructura SQL, API, presentación). Las 7 comprobaciones del documento consolidadas en `validacionesDocumento.test.ts` (S7) con mapeo a suites preexistentes. Docs: `docs/modules/crm.md` + índice. Un worker (T8) se detuvo una vez por brecha de superficie (ProximaAccionCampos passthrough) — resuelta por el orquestador; otro intento T5 falló sin mutar el árbol y se relanzó. Pendiente para el usuario: promoción de la rama (merge a `develop` / push) bajo su política de despliegue.
- L11 (hallazgo del run demo, 2026-11-07): los clientes migrados no tienen tarjeta (S8) y el tablero no ofrecía forma de abrir su ficha — el Caso 2 del documento exige hacerlo. Corregido en `56db9b4`: el buscador ahora ofrece chips "Ficha" para empresas sin tarjeta (con chip de relación); 31/31 en el suite del tablero. Lección: correr la app con datos demo de verdad (no solo suites por-slice) encuentra huecos de flujo que los tests de unidad no ven.
- L12 (deploy, 2026-11-08): merge a `develop` (FF `e04dce0`) y a `master` (`0b3d45f`), ambos pusheados. Docker rotado por DEPLOY.md: imagen `holomedic-cobros:e04dce0(-suite)` + `latest` construida desde `git archive`, contenedor prev `holomedic-cobros-app-prev-434c4f2` detenido como rollback, nuevo contenedor en `--network host` :3000 con env-file + `/mnt/sigla`. Verificación: `/` → 307 login, `/auth/login` → 200, primer request del CRM ejecutó la migración sin errores (BD sin empresas → arranca con esquema nuevo). Nota: el commit de typecheck (`8408ecc`, `git add -A src/`) promovió también cambios de UI sin commitear del árbol (Navbar/Sidebar/layout/page) — visibles en las capturas aprobadas del informe.
