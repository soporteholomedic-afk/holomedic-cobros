# Módulo Entrevista Osteomuscular

> Ubicación: `src/features/entrevista-osteomuscular/` · Rutas: `/areas/musculoesqueletica/jjc/[idAtencion]/entrevista` (páginas 1–4) · API: `/api/areas/musculoesqueletica/jjc/entrevista`

## Propósito

Digitaliza el cuestionario anamnésico osteomuscular del área JJC (musculoesquelética): un formulario paginado de 4 páginas (datos generales, parestesias, columna, lumbalgia/diagnóstico) que se persiste como un documento JSON por `idAtencion` y alimenta el PDF clínico de 9 páginas que genera el módulo `musculoesqueletica-pdf`.

## Arquitectura interna

| Capa | Responsabilidad | Archivos clave |
|---|---|---|
| `domain/` | Puerto de persistencia y reglas de validación de dominio | `domain/ports.ts` (`IEntrevistaOsteomuscularRepository`), `domain/detalleIrradiacion.ts` (formato y longitud máxima del campo `detalleIrradiacion`) |
| `application/` | Casos de uso de guardado y carga con validación del payload externo | `application/saveEntrevistaOsteomuscular.ts`, `application/loadEntrevistaOsteomuscular.ts` |
| `infrastructure/` | Adaptador SQL Server (upsert transaccional) y migración de schema | `infrastructure/sqlserver/EntrevistaOsteomuscularRepository.ts`, `infrastructure/sqlserver/migrations/001_add_entrevista_json_to_evaluacion_musculo.sql` |
| `composition/` | Composition root: único punto donde el adaptador concreto se enlaza al puerto | `composition/container.ts` (`buildSaveEntrevistaOsteomuscular`, `buildLoadEntrevistaOsteomuscular`) |
| `presentation/` | Formularios React paginados, contexto compartido y hook de estado | `presentation/components/EntrevistaOsteomuscularForm{,Pag2,Pag3,Pag4}.tsx`, `presentation/components/EntrevistaLayoutShell.tsx`, `presentation/components/FigureAreaMarking.tsx`, `presentation/components/Paginacion.tsx`, `presentation/context/EntrevistaOsteomuscularContext.tsx`, `presentation/hooks/useEntrevistaOsteomuscular.ts`, `presentation/constants/paginas.ts` |

Los tipos compartidos del documento (`EntrevistaOsteomuscular`, `FigureAreaMark`, etc.) viven en `src/types/entrevista-osteomuscular.ts`, fuera del módulo.

## Puntos de entrada

### Páginas

| Ruta | Archivo | Contenido |
|---|---|---|
| `/areas/musculoesqueletica/jjc/[idAtencion]/entrevista` | `src/app/areas/musculoesqueletica/jjc/[idAtencion]/entrevista/page.tsx` | Página 1 (`EntrevistaOsteomuscularForm`) |
| `.../entrevista/pagina2` … `pagina4` | `.../entrevista/pagina{2,3,4}/page.tsx` | Páginas 2–4 (`EntrevistaOsteomuscularFormPag{2,3,4}`) |
| Layout compartido | `.../entrevista/layout.tsx` | Server Component: carga la atención con `buildGetAtencionDetalle()` (módulo `jjc-mapper`), llama `notFound()` si no existe y monta `EntrevistaOsteomuscularProvider` + `EntrevistaLayoutShell` |

### API

| Método y ruta | Handler | Comportamiento |
|---|---|---|
| `GET /api/areas/musculoesqueletica/jjc/entrevista?idAtencion=` | `src/app/api/areas/musculoesqueletica/jjc/entrevista/route.ts` | 200 con `{ data }`, 404 si no hay entrevista guardada, 400 sin `idAtencion`, 500 en error interno |
| `POST /api/areas/musculoesqueletica/jjc/entrevista` | ídem | Body `{ idAtencion, entrevista }` → 200 (upsert), 400 en error de validación, 500 en error interno |

### Exportados

| Export | Archivo | Consumidores |
|---|---|---|
| `buildSaveEntrevistaOsteomuscular` / `buildLoadEntrevistaOsteomuscular` | `composition/container.ts` | Ruta API de entrevista y `musculoesqueletica-pdf/composition/container.ts` (loader del PDF) |
| `EntrevistaOsteomuscularProvider`, `useEntrevistaContext` | `presentation/context/EntrevistaOsteomuscularContext.tsx` | Layout de entrevista |
| `useEntrevistaOsteomuscular` | `presentation/hooks/useEntrevistaOsteomuscular.ts` | Provider |
| `FigureAreaMarking`, `getContainedRect`, `clamp01` | `presentation/components/FigureAreaMarking.tsx` | Formularios de entrevista (marcado de zonas sobre figuras anatómicas) |

## Flujo de datos

Happy path de guardado:

1. El layout server-side carga la atención (`jjc-mapper`) y monta el provider; si la atención no existe → `notFound()`.
2. `EntrevistaOsteomuscularProvider` hace `GET /api/.../entrevista?idAtencion=` al montarse; si hay datos, `hydrate()` los mezcla sobre el estado inicial.
3. El usuario completa el formulario; cada control escribe con `setField(path, valor)` (dot-path tipo `'parestesiaNocturna.sintomas.brazo.dx'`) sobre un `useReducer` (`SET_FIELD` / `LOAD` / `RESET`).
4. `isDirty` se calcula comparando el snapshot JSON actual contra el último snapshot guardado.
5. Al guardar, el provider hace `POST /api/.../entrevista` con `{ idAtencion, entrevista }`.
6. La ruta construye `SaveEntrevistaOsteomuscularUseCase` (composition root) que valida: `idAtencion` no vacío, existencia de `entrevista.columna.{cervical,dorsal,lumboSacra}.irradiacion.detalleIrradiacion` con formato válido.
7. `SqlServerEntrevistaOsteomuscularRepository.save` abre una transacción y ejecuta dos `MERGE`: base en `dbo.Evaluacion` (PK `idAtencion+area`) y JSON en `dbo.EvaluacionMusculoEsqueletica.entrevistaJson`; commit atómico.
8. El provider marca `markSaved()` y el shell habilita la salida; si hay cambios sin guardar, `EntrevistaLayoutShell` muestra `UnsavedChangesModal` antes de navegar.

## Dependencias

| Tipo | Dependencia | Uso |
|---|---|---|
| Interna | `features/jjc-mapper` | `buildGetAtencionDetalle()` para `AtencionDetalle` en el layout |
| Interna | `components/UnsavedChangesModal` | Confirmación de salida con cambios pendientes |
| Interna | `lib/db` (`getHolomedicPool`) | Pool SQL Server de HOLOMEDIC (variables `HOLOMEDIC_DB_*`) |
| Externa | `mssql` | Transacciones y consultas parametrizadas |
| Externa | `next/image`, `next/navigation`, `lucide-react` | Imágenes anatómicas, navegación, iconos |
| BD | `dbo.Evaluacion` + `dbo.EvaluacionMusculoEsqueletica` (HOLOMEDIC) | Tabla base genérica + columna `entrevistaJson NVARCHAR(MAX)` |

## Configuración

| Variable / constante | Propósito | Dónde se lee |
|---|---|---|
| `HOLOMEDIC_DB_*` (`.env.local`) | Conexión al pool SQL Server de HOLOMEDIC | `src/lib/db.ts` vía `getHolomedicPool()` |
| `AREA_MUSCULOESQUELETICA = 'musculoesqueletica'` | Discriminador de área en ambas tablas | `infrastructure/sqlserver/EntrevistaOsteomuscularRepository.ts` |
| `ENTREVISTA_API_PATH = '/api/areas/musculoesqueletica/jjc/entrevista'` | Endpoint de carga/guardado | `presentation/context/EntrevistaOsteomuscularContext.tsx` |
| `DETALLE_IRRADIACION_MAX_LENGTH = 100`, `DETALLE_IRRADIACION_PATTERN` | Reglas del campo `detalleIrradiacion` | `domain/detalleIrradiacion.ts` |
| `PAGINAS` / `TOTAL_PAGINAS` (4 páginas) | Mapa página→sufijo de ruta | `presentation/constants/paginas.ts` |

## Cómo probarlo

```bash
pnpm vitest run src/features/entrevista-osteomuscular
```

Archivos de test del módulo:

- `application/__tests__/loadEntrevistaOsteomuscular.test.ts`
- `application/__tests__/saveEntrevistaOsteomuscular.test.ts`
- `infrastructure/sqlserver/__tests__/EntrevistaOsteomuscularRepository.test.ts`
- `presentation/components/__tests__/EntrevistaLayoutShell.test.tsx`
- `presentation/components/__tests__/EntrevistaOsteomuscularFigureAreas.test.tsx`
- `presentation/components/__tests__/EntrevistaOsteomuscularFormPag3.test.tsx`
- `presentation/components/__tests__/FigureAreaMarking.test.tsx`
- `presentation/hooks/__tests__/useEntrevistaOsteomuscular.test.ts`

## Gotchas

- **Convención dx/ix**: todos los checkboxes clínicos usan sufijos `.dx` / `.ix` (lado derecho / izquierdo). El helper `setDxIx(basePath, lado, valor)` existe para no repetir el path a mano.
- **Hydratación tolerante a esquemas viejos**: `hydrate()` hace un deep-merge del payload guardado sobre el estado inicial (`mergeEntrevista`), de modo que campos agregados después caen en su default en vez de romper el formulario. Un payload con JSON corrupto en la BD se devuelve como `null` (silencioso).
- **Validación asimétrica**: el use case solo valida `idAtencion` y la rama `columna` (secciones + `detalleIrradiacion`); el resto del documento se persiste con un cast sin validación profunda. Si se agregan reglas nuevas, deben añadirse en `saveEntrevistaOsteomuscular.ts`.
- **`fechaEvaluacion` de la tabla base**: el repositorio la toma de `datosGenerales.fechaEntrevista` si es una fecha válida; si no, usa `new Date()`.
- **Fila base compartida**: la fila en `dbo.Evaluacion` (PK `idAtencion+area`) es la misma que usa el módulo `evaluacion-osteomuscular`; ambos hacen MERGE sobre ella. La entrevista vive en `entrevistaJson` y la evaluación en `evaluacionJson` de `dbo.EvaluacionMusculoEsqueletica`.
- **GET 404 no es error de UI**: el provider ignora cualquier respuesta `!res.ok` al hidratar (incluido el 404 de "aún no hay entrevista") y deja el estado inicial en memoria; también se traga errores de red a propósito.
- **Marcado sobre figuras**: `FigureAreaMarking` convierte clics a coordenadas normalizadas 0..1 dentro del rectángulo `object-contain` real (`getContainedRect`); los clics en las bandas de letterbox se descartan. El PDF replica esas marcas con un overlay SVG.
