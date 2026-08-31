# Módulo Evaluación Osteomuscular

> Ubicación: `src/features/evaluacion-osteomuscular/` · Rutas: `/areas/musculoesqueletica/jjc/[idAtencion]/evaluacion` (páginas 1–5) · API: `/api/areas/musculoesqueletica/jjc/evaluacion`

## Propósito

Digitaliza la evaluación clínica osteomuscular del área JJC (musculoesquelética): un formulario paginado de 5 páginas (miembros superiores, columna, muñeca-mano con tests clínicos, motilidad y maniobras) que se persiste como documento JSON por `idAtencion` y alimenta las páginas 5–9 del PDF que genera `musculoesqueletica-pdf`.

## Arquitectura interna

| Capa | Responsabilidad | Archivos clave |
|---|---|---|
| `domain/` | Puerto de persistencia | `domain/ports.ts` (`IEvaluacionOsteomuscularRepository`) |
| `application/` | Casos de uso de guardado y carga con validación mínima del payload | `application/saveEvaluacionOsteomuscular.ts`, `application/loadEvaluacionOsteomuscular.ts` |
| `infrastructure/` | Adaptador SQL Server (upsert transaccional) y migración de columna | `infrastructure/sqlserver/SqlServerEvaluacionOsteomuscularRepository.ts`, `infrastructure/sqlserver/migrations/002_add_evaluacion_json_to_evaluacion_musculo.sql` |
| `composition/` | Composition root: único punto donde el adaptador concreto se enlaza al puerto | `composition/container.ts` (`buildSaveEvaluacionOsteomuscular`, `buildLoadEvaluacionOsteomuscular`) |
| `presentation/` | Formularios paginados, componente de imagen anatómica, contexto y hook de estado | `presentation/components/EvaluacionFormPag{1..5}.tsx`, `presentation/components/EvaluacionLayoutShell.tsx`, `presentation/components/AnatomicalImage.tsx`, `presentation/components/Paginacion.tsx`, `presentation/context/EvaluacionOsteomuscularContext.tsx`, `presentation/hooks/useEvaluacionOsteomuscular.ts`, `presentation/helpers/parseOptionalNumber.ts`, `presentation/constants/paginas.ts` |

Los tipos del documento (`EvaluacionOsteomuscular`) viven en `src/types/evaluacion-osteomuscular.ts`. Es el módulo gemelo de `entrevista-osteomuscular`: misma estructura de capas y mismo patrón de contexto/hook.

## Puntos de entrada

### Páginas

| Ruta | Archivo | Contenido |
|---|---|---|
| `/areas/musculoesqueletica/jjc/[idAtencion]/evaluacion` | `src/app/areas/musculoesqueletica/jjc/[idAtencion]/evaluacion/page.tsx` | Página 1 (`EvaluacionFormPag1`) |
| `.../evaluacion/pagina2` … `pagina5` | `.../evaluacion/pagina{2,3,4,5}/page.tsx` | Páginas 2–5 (`EvaluacionFormPag{2..5}`) |
| Layout compartido | `.../evaluacion/layout.tsx` | Server Component: carga la atención con `buildGetAtencionDetalle()` (`jjc-mapper`), `notFound()` si no existe, monta `EvaluacionOsteomuscularProvider` + `EvaluacionLayoutShell` |

### API

| Método y ruta | Handler | Comportamiento |
|---|---|---|
| `GET /api/areas/musculoesqueletica/jjc/evaluacion?idAtencion=` | `src/app/api/areas/musculoesqueletica/jjc/evaluacion/route.ts` | 200 con `{ data }`, 404 si no hay evaluación guardada, 400 sin `idAtencion`, 500 en error interno |
| `POST /api/areas/musculoesqueletica/jjc/evaluacion` | ídem | Body `{ idAtencion, evaluacion }` → 200 (upsert), 400 en validación, 500 en error interno |

### Exportados

| Export | Archivo | Consumidores |
|---|---|---|
| `buildSaveEvaluacionOsteomuscular` / `buildLoadEvaluacionOsteomuscular` | `composition/container.ts` | Ruta API de evaluación y `musculoesqueletica-pdf/composition/container.ts` (loader del PDF) |
| `EvaluacionOsteomuscularProvider`, `useEvaluacionContext` | `presentation/context/EvaluacionOsteomuscularContext.tsx` | Layout de evaluación |
| `useEvaluacionOsteomuscular` | `presentation/hooks/useEvaluacionOsteomuscular.ts` | Provider |
| `AnatomicalImage` | `presentation/components/AnatomicalImage.tsx` | Los 5 formularios (`EvaluacionFormPag1..5`) |
| `parseOptionalNumber` | `presentation/helpers/parseOptionalNumber.ts` | Inputs numéricos opcionales (meses, años) |

## Flujo de datos

Happy path de guardado:

1. El layout server-side carga la atención (`jjc-mapper`) y monta el provider; atención inexistente → `notFound()`.
2. `EvaluacionOsteomuscularProvider` hace `GET /api/.../evaluacion?idAtencion=` al montarse; si hay datos, `hydrate()` los mezcla sobre el estado inicial.
3. Cada control del formulario escribe vía `setField(path, valor)` con dot-paths sobre la raíz `evaluacionClinicaOsteomuscular.miembrosSuperiores.*` y secciones de columna/motilidad; los checkboxes laterales usan `CheckDxIx`/`CheckSimple` (componentes internos de cada página).
4. `isDirty` se deriva de comparar el snapshot JSON contra el último guardado.
5. Al guardar, el provider hace `POST /api/.../evaluacion` con `{ idAtencion, evaluacion }`.
6. `SaveEvaluacionOsteomuscularUseCase` valida `idAtencion` no vacío, que el payload sea objeto y que exista `evaluacion.evaluacionClinicaOsteomuscular`.
7. `SqlServerEvaluacionOsteomuscularRepository.save` ejecuta dos `MERGE` en una transacción: base en `dbo.Evaluacion` y JSON en `dbo.EvaluacionMusculoEsqueletica.evaluacionJson`.
8. `markSaved()` actualiza el snapshot y `EvaluacionLayoutShell` muestra `UnsavedChangesModal` si se intenta salir con cambios.

## Dependencias

| Tipo | Dependencia | Uso |
|---|---|---|
| Interna | `features/jjc-mapper` | `buildGetAtencionDetalle()` para `AtencionDetalle` en el layout |
| Interna | `components/UnsavedChangesModal` | Confirmación de salida con cambios pendientes |
| Interna | `lib/db` (`getHolomedicPool`) | Pool SQL Server de HOLOMEDIC |
| Externa | `mssql` | Transacciones y consultas parametrizadas |
| Externa | `next/image` | `AnatomicalImage` envuelve `Image` con `fill` + `object-contain` y `sizes` |
| Externa | `next/navigation`, `lucide-react` | Navegación e iconos del shell |
| BD | `dbo.Evaluacion` + `dbo.EvaluacionMusculoEsqueletica` (HOLOMEDIC) | Fila base compartida con la entrevista + columna `evaluacionJson` |
| Assets | `public/assets/images/musculo/entrevista/*` | Figuras anatómicas de los tests (mismo repositorio canónico que la entrevista) |

## Configuración

| Variable / constante | Propósito | Dónde se lee |
|---|---|---|
| `HOLOMEDIC_DB_*` (`.env.local`) | Conexión al pool SQL Server de HOLOMEDIC | `src/lib/db.ts` vía `getHolomedicPool()` |
| `AREA_MUSCULOESQUELETICA = 'musculoesqueletica'` | Discriminador de área en ambas tablas | `infrastructure/sqlserver/SqlServerEvaluacionOsteomuscularRepository.ts` |
| `EVALUACION_API_PATH = '/api/areas/musculoesqueletica/jjc/evaluacion'` | Endpoint de carga/guardado | `presentation/context/EvaluacionOsteomuscularContext.tsx` |
| `PAGINAS_EVALUACION` / `TOTAL_PAGINAS_EVALUACION` (5 páginas) | Mapa página→sufijo de ruta | `presentation/constants/paginas.ts` |

## Cómo probarlo

```bash
pnpm vitest run src/features/evaluacion-osteomuscular
```

Archivos de test del módulo:

- `application/__tests__/loadEvaluacionOsteomuscular.test.ts`
- `application/__tests__/saveEvaluacionOsteomuscular.test.ts`
- `infrastructure/sqlserver/__tests__/SqlServerEvaluacionOsteomuscularRepository.test.ts`
- `presentation/components/__tests__/EvaluacionFormPag1.test.tsx`
- `presentation/components/__tests__/EvaluacionFormPag2.test.tsx`
- `presentation/components/__tests__/EvaluacionFormPag3.finkelstein.test.tsx`
- `presentation/components/__tests__/EvaluacionFormPag3.tail.test.tsx`
- `presentation/components/__tests__/EvaluacionFormPag4.test.tsx`
- `presentation/components/__tests__/EvaluacionFormPag5.test.tsx`
- `presentation/components/__tests__/EvaluacionLayoutShell.test.tsx`
- `presentation/components/__tests__/Paginacion.test.tsx`
- `presentation/helpers/__tests__/parseOptionalNumber.test.ts`
- `presentation/hooks/__tests__/useEvaluacionOsteomuscular.test.ts`
- `presentation/hooks/__tests__/useEvaluacionOsteomuscular.columna.test.ts`
- `presentation/hooks/__tests__/useEvaluacionOsteomuscular.munecaMano.test.ts`
- `presentation/hooks/__tests__/useEvaluacionOsteomuscular.persistencia.test.ts`
- `presentation/hooks/__tests__/useEvaluacionOsteomuscular.pg5.test.ts`

## Gotchas

- **`fechaEvaluacion` siempre es "ahora"**: a diferencia del repositorio de entrevista (que usa `datosGenerales.fechaEntrevista`), este adaptador escribe `new Date()` en la fila base en cada guardado. Si se necesita la fecha del payload, hay que cambiar el adaptador.
- **Validación mínima**: el use case solo exige `idAtencion` y la presencia de `evaluacionClinicaOsteomuscular`; no hay validación profunda de secciones (comparado con `detalleIrradiacion` en la entrevista). El resto viaja con cast directo.
- **Convención dx/ix y dot-paths**: igual que la entrevista; los paths largos (`evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano.sintomatologiaParestesica.*`) se construyen con constantes locales por página (`BASE_MUNECA`, `SPX` en `EvaluacionFormPag3`) para evitar errores de tipeo.
- **`AnatomicalImage` requiere contenedor con altura**: usa `next/image` con `fill`; el padre debe dar altura (`className="w-full h-24"`) o la imagen colapsa.
- **Inputs numéricos opcionales**: los campos de meses/año aceptan `null`; siempre pasarlos por `parseOptionalNumber` para que el string vacío se convierta en `null` y no en `0`.
- **Fila base compartida con la entrevista**: ambos repositorios hacen MERGE sobre la misma fila de `dbo.Evaluacion` (`idAtencion+area='musculoesqueletica'`); guardar la evaluación actualiza `updatedAt` de la fila base que también usa la entrevista.
- **Imágenes compartidas**: las figuras referencian `public/assets/images/musculo/entrevista/` (mismos assets que la entrevista y el PDF); renombrar o mover un asset rompe las tres superficies a la vez.
