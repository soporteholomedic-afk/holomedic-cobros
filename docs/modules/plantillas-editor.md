# Módulo Plantillas Editor

> Ubicación: `src/features/plantillas-editor/` · Rutas: `/admin/plantillas/[area]` · API: `/api/plantillas` y subrutas (`[id]`, `[id]/*`, `trash`, `firma`)

## Propósito

Editor administrativo de plantillas de correo por área (`consolidados`, `cobranza`, `valoraciones`) con WYSIWYG BlockNote, paleta de tokens interoperables (`{{empresa}}`, `{{tabla:documentosVencidos:fecha,monto}}`), versionado append-only, soft-delete con papelera, clones y plantilla default por área+tipo. Los flujos de envío consumen la proyección `SpitchDTO`, nunca la entidad completa de autoría.

## Arquitectura interna

| Capa | Responsabilidad | Archivos clave |
|---|---|---|
| `domain/` | Entidades y puerto de repositorio | `domain/entities.ts` (`Template`, `TemplateVersion`, `SaveTemplateInput`, `SpitchDTO`, `TokenAttrs`, `SPITCH_TYPES`), `domain/ports.ts` (`ITemplateRepository`) |
| `application/` | Casos de uso (uno por operación) | `application/saveTemplate.ts`, `listTemplates.ts`, `softDeleteTemplate.ts`, `restoreTemplate.ts`, `cloneTemplate.ts`, `rollbackTemplate.ts`, `setDefaultTemplate.ts`, `listVersions.ts`, `projectToSpitchDTO.ts` |
| `infrastructure/` | Repositorio SQL Server, migración, factory singleton y registro de áreas | `infrastructure/sqlserver/sqlServerTemplateRepository.ts`, `infrastructure/sqlserver/migrate.ts`, `infrastructure/sqlserver/errors.ts` (`TemplateNotFoundError`, `TemplateDefaultConflictError`), `infrastructure/getTemplateDb.ts`, `infrastructure/areaConfigRegistry.ts` (`AREA_CONFIGS`) |
| `presentation/` | Editor BlockNote, paleta de tokens y helpers de serialización | `presentation/components/TemplateEditor.tsx`, `BlockNoteEditorView.tsx`, `TokenPalette.tsx`, `TokenChip.tsx`, `ColumnPicker.tsx`, `SubjectTokenInput.tsx`, `CellBackgroundColorButton.tsx`, `ClientOnly.tsx`, `tableCellColors.ts`; `presentation/helpers/` (`saveTemplateApi.ts`, `tokenParser.ts`, `tokenSerializer.ts`, `tokenLabel.ts`, `extractPlaceholders.ts`, `splitIntoSegments.ts`, `documentWithTokensAsText.ts`, `postProcessTokenBlocks.ts`, `paletteDropRouter.ts`, `buildPreviewHtml.ts`) |

## Puntos de entrada

### Páginas

| Ruta | Archivo | Contenido |
|---|---|---|
| `/admin/plantillas/[area]` | `src/app/admin/plantillas/[area]/page.tsx` | Server Component: resuelve área+plantillas activas (`resolveAreaAndTemplates.ts`) y renderiza `TemplateEditor`; área desconocida → 404 |
| `/admin/plantillas/[area]/firma` | `src/app/admin/plantillas/[area]/firma/` | Firma de correo del área (permiso `firma_correo`) |
| `/admin/plantillas/firma` | `src/app/admin/plantillas/firma/` | Redirección canónica de "Mi Firma" |

### API

| Método y ruta | Archivo | Comportamiento |
|---|---|---|
| `GET /api/plantillas?area=&type=` | `src/app/api/plantillas/route.ts` | Lista activas proyectadas a `SpitchDTO`; área desconocida o `type` inválido → 400 |
| `POST /api/plantillas` | ídem | Crea/actualiza (body con `id` opcional); 201 con `{ id, currentVersionId }`; 404 id inexistente; 409 conflicto de default |
| `GET /api/plantillas/[id]` | `src/app/api/plantillas/[id]/route.ts` | Devuelve la plantilla COMPLETA de autoría (incluye soft-deleted, para papelera); 404 si falta |
| `DELETE /api/plantillas/[id]` | ídem | Soft delete (`deletedAt=now`, limpia `isDefault`); 200 con `{ id, deletedAt }` |
| `POST /api/plantillas/[id]/clone` | `src/app/api/plantillas/[id]/clone/route.ts` | Duplica una plantilla (incluida una de la papelera) |
| `POST /api/plantillas/[id]/restore` | `src/app/api/plantillas/[id]/restore/route.ts` | Restaura desde la papelera (`deletedAt=null`) |
| `POST /api/plantillas/[id]/rollback` | `src/app/api/plantillas/[id]/rollback/route.ts` | Vuelve a una versión histórica (body `{ versionId }`) |
| `GET /api/plantillas/[id]/versions` | `src/app/api/plantillas/[id]/versions/route.ts` | Historial de versiones |
| `PATCH /api/plantillas/[id]/default` | `src/app/api/plantillas/[id]/default/route.ts` | Marca la plantilla como default de área+tipo |
| `GET /api/plantillas/trash?area=` | `src/app/api/plantillas/trash/route.ts` | Solo soft-deleted del área (papelera) |
| `GET` / `PUT /api/plantillas/firma` | `src/app/api/plantillas/firma/route.ts` | Firma de correo del usuario (permiso `firma_correo`) |

### Exportados

| Export | Archivo | Consumidores |
|---|---|---|
| `getTemplateDb` | `infrastructure/getTemplateDb.ts` | Todas las rutas `/api/plantillas*` y `resolveAreaAndTemplates` |
| `AREA_CONFIGS`, `getAreaConfig` | `infrastructure/areaConfigRegistry.ts` | Página admin y validación de área en `GET/POST /api/plantillas` |
| `TemplateEditor` | `presentation/components/TemplateEditor.tsx` | `/admin/plantillas/[area]/page.tsx` |
| `projectToSpitchDTO` | `application/projectToSpitchDTO.ts` | `GET /api/plantillas` (frontera con los flujos de envío) |
| Casos de uso (`SaveTemplateUseCase`, `ListTemplatesUseCase`, …) | `application/*.ts` | Rutas API |

## Flujo de datos

Happy path de edición y guardado:

1. `/admin/plantillas/[area]` (Server Component) llama `resolveAreaAndTemplates(area)`: `getAreaConfig` valida el área (desconocida → 404), `getTemplateDb()` abre el pool HOLOMEDIC y ejecuta la migración idempotente, y `ListTemplatesUseCase.listActive(area)` trae las plantillas activas.
2. `TemplateEditor` (client) recibe `areaConfig` + `templates` como props serializables; monta `BlockNoteEditorView` vía import dinámico solo en cliente (BlockNote/ProseMirror no corre en SSR).
3. El usuario selecciona una plantilla existente (`loadHtml(tpl.bodyHtml)`) o crea una nueva; los tokens se insertan arrastrando chips de `TokenPalette` (dnd-kit) o editando el asunto con `SubjectTokenInput`. Los tokens de tabla abren `ColumnPicker` para elegir columnas.
4. El HTML persistido siempre lleva los tokens como texto plano `{{token}}` / `{{tabla:name:cols}}`: el inline-content custom de BlockNote serializa a texto en `toExternalHTML` (`tokenSerializer`), y al cargar, `postProcessTokenBlocks` reconstruye los chips.
5. "Vista previa" computa `buildPreviewHtml` bajo demanda con `mockPreviewData` del `AreaConfig` (sin tocar datos reales).
6. Al guardar, `saveTemplateApi` hace `POST /api/plantillas` con `{ area, type, name, subject, bodyHtml, id?, isDefault? }`.
7. La ruta valida el body, `SaveTemplateUseCase` delega en el repositorio: en una transacción se actualiza el snapshot denormalizado (`templates.subject/bodyHtml`), se inserta una fila nueva en `template_versions` (append-only) y se resuelve el default (índice único filtrado `idx_templates_default_area_type`).
8. Respuesta 201 `{ id, currentVersionId }`; conflictos de default (errores SQL 2601/2627) se mapean a `TemplateDefaultConflictError` → 409.

## Dependencias

| Tipo | Dependencia | Uso |
|---|---|---|
| Externa | `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine` | Editor WYSIWYG (aislado tras `BlockNoteEditorView`) |
| Externa | `@dnd-kit/core`, `@dnd-kit/sortable` | Drag & drop de la paleta de tokens |
| Externa | `mssql` | Repositorio SQL Server |
| Interna | `lib/db` (`getHolomedicPool`) | Pool HOLOMEDIC (`HOLOMEDIC_DB_*`) |
| Interna (consumidores) | flujos de envío (p. ej. consolidados `send-results`) | Leen `SpitchDTO` desde `GET /api/plantillas` |
| BD | `dbo.templates`, `dbo.template_versions` (HOLOMEDIC) | Snapshot actual + historial de versiones |

## Configuración

| Variable / constante | Propósito | Dónde se lee |
|---|---|---|
| `HOLOMEDIC_DB_*` (`.env.local`) | Conexión del pool (la migración corre en la primera conexión) | `src/lib/db.ts` vía `infrastructure/getTemplateDb.ts` |
| `SPITCH_TYPES = ['company', 'patient']` | Audiencias válidas de una plantilla | `domain/entities.ts` (validado en rutas y tests) |
| `AREA_CONFIGS` (`consolidados`, `cobranza`, `valoraciones`) | Registro de áreas: tokens, tablas predefinidas y mocks de preview | `infrastructure/areaConfigRegistry.ts` |
| Índice único `idx_templates_default_area_type` | Un solo default por `area+type` (filtrado a activos) | `infrastructure/sqlserver/migrate.ts` |
| `__setTemplateDbForTests` | Test seam para inyectar un repo mock sin abrir SQL | `infrastructure/getTemplateDb.ts` |

## Cómo probarlo

```bash
pnpm vitest run src/features/plantillas-editor
```

Archivos de test del módulo (todos bajo `__tests__/` de su capa): `application/__tests__/` (cloneTemplate, listTemplates, listVersions, projectToSpitchDTO, restoreTemplate, rollbackTemplate, saveTemplate, setDefaultTemplate, softDeleteTemplate), `domain/__tests__/` (entities, ports), `infrastructure/__tests__/` (areaConfigRegistry, getTemplateDb) y `infrastructure/sqlserver/__tests__/` (migrate, sqlServerTemplateRepository), `presentation/components/__tests__/` (BlockNoteEditorView, ClientOnly, ColumnPicker, SubjectTokenInput, TemplateEditor, TokenChip, TokenPalette) y `presentation/helpers/__tests__/` (buildPreviewHtml, documentWithTokensAsText, extractPlaceholders, paletteDropRouter, postProcessTokenBlocks, roundTrip, saveTemplateApi, splitIntoSegments, tokenLabel, tokenParser, tokenSerializer).

## Gotchas

- **Dos formas de listar, propositivamente distintas**: `GET /api/plantillas` devuelve `SpitchDTO` (sin campos de autoría) para los flujos de envío; `GET /api/plantillas/[id]` devuelve la plantilla COMPLETA (el editor la necesita) y lee incluso filas soft-deleted para previsualizar clone/restore desde la papelera.
- **El split activo/papelera se aplica en SQL, no en el use case**: `listByArea` excluye soft-deleted y `listDeletedByArea` hace el filtro inverso; `ListTemplatesUseCase` no post-filtra (decisión para que el contrato sea testeable a nivel SQL).
- **`isDefault` omitido en update = `false`**: el repositorio trata la ausencia de forma determinista (nunca "conservar el valor almacenado"); el editor siempre envía el booleano explícito.
- **Cada guardado crea una versión**: `template_versions` es append-only y `currentVersionId` apunta al snapshot vigente; el rollback copia la versión histórica como nueva versión vigente (no destruye historial).
- **Soft delete limpia el default**: al borrar, si la plantilla era default se desmarca (`isDefault=false`); no hay re-electión automática de otro default.
- **BlockNote está aislado a propósito**: `BlockNoteEditorView` es el único archivo que importa `@blocknote/*`; el formato almacenado (`{{token}}` como texto inline) es independiente de BlockNote, de modo que reemplazar el editor solo cambia ese componente (misma filosofía que `src/components/email/EmailBodyEditor.tsx`).
- **El preview nunca toca datos reales**: `buildPreviewHtml` usa exclusivamente `mockPreviewData` del `AreaConfig`; los montos vienen pre-formateados como strings.
- **No confundir con las plantillas SIGLA**: `GET /api/informes/[idAten]/plantillas` (consumido por `usePlantillas` de `envio-resultados`) consulta un stored procedure de SIGLA para informes médicos; es un concepto distinto y no usa este módulo.
- **Permisos**: `/admin/plantillas` y `/api/plantillas` requieren el permiso `plantillas`; las rutas `firma` requieren `firma_correo` (entradas más largas en `RUTAS_PROTEGIDAS` para que una sesión solo-firma pueda acceder sin el permiso general).
- **Área nueva = registro + migración**: agregar un área exige editar `AREA_CONFIGS`; cualquier ruta o página con un área no registrada devuelve 404/400 por diseño.
