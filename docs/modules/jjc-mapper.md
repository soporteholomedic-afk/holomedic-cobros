# Módulo JJC Mapper

> Ubicación: `src/features/jjc-mapper/` · Rutas: `/areas/medicina/jjc`, `/areas/medicina/jjc/[idAtencion]`, `/api/areas/medicina/jjc/*`

## Propósito

Digitaliza la evaluación dermatológica facial JJC (medicina): el médico marca lesiones (pecas, lunares, manchas, cicatrices, otras) sobre la imagen del rostro del paciente, registra fototipo Fitzpatrick, fotoprotector y un cuestionario de piel, y persiste la evaluación asociada a la atención.

**Lo esencial en tres líneas:**

1. Lee el detalle del paciente desde **SIGLA** (`AtencionRepository`, pool `DB_*`/`ICCGSA`) y persiste la evaluación en **HOLOMEDIC** (`JjcEvaluacionRepository`, pool `HOLOMEDIC_DB_*`) — dos pools distintos por consulta.
2. La clave `idAtencion` es el string compuesto `CodSed + CodTCl + NumOrd` (con `CodSed ≤ 9` precedido de `'0'`), el mismo formato que produce el endpoint de pacientes.
3. El módulo es del área **medicina**; las rutas `/areas/musculoesqueletica/jjc/*` comparten nombre y permiso (`jjc`) pero usan otros features (`entrevista-osteomuscular`, `evaluacion-osteomuscular`, `musculoesqueletica-pdf`), no este módulo.

## Arquitectura interna

| Capa | Responsabilidad | Archivos clave |
|---|---|---|
| `domain/` | Reglas puras: creación de puntos de lesión (coordenadas clamp [0,1]), valores válidos de fototipo/fotoprotector y su correspondencia, estilos por tipo de lesión, puertos | `domain/entities.ts`, `domain/lesionStyles.ts`, `domain/ports.ts` |
| `application/` | Casos de uso: detalle de atención, carga y guardado de evaluación (guardado valida reglas de negocio) | `application/getAtencionDetalle.ts`, `application/loadJjcEvaluacion.ts`, `application/saveJjcEvaluacion.ts` |
| `composition/` | Composition root — único lugar donde los adapters concretos se bindean a los puertos | `composition/container.ts` |
| `infrastructure/sqlserver/` | `SqlServerAtencionRepository` (SIGLA, lectura) y `SqlServerJjcEvaluacionRepository` (HOLOMEDIC, upsert transaccional) + scripts de migración | `infrastructure/sqlserver/AtencionRepository.ts`, `infrastructure/sqlserver/JjcEvaluacionRepository.ts`, `infrastructure/sqlserver/migrations/*.sql` |
| `presentation/` | Mapper facial interactivo y formulario (componentes); estado del formulario con `useReducer` (hook sin fetch) | `presentation/components/JjcFaceLesionMapper.tsx`, `FaceScanCanvas.tsx`, `LesionMarkers.tsx`, `LesionCounters.tsx`, `VerticalLesionToolbar.tsx`, `FototipoFitzpatrickPicker.tsx`, `CuestionarioPielForm.tsx`, `PatientSummaryFields.tsx`, `SiNoToggle.tsx`, `JjcFormTabs.tsx`, `FormField.tsx`, `EvaluacionForm.tsx`; `presentation/hooks/useJjcEvaluacion.ts` |
| Tipos compartidos | `@/types/jjc` (`LesionType`, `LesionPoint`, `Fototipo`, `Fotoprotector`, `CuestionarioPiel`, `JjcEvaluacion`, `AtencionDetalle`) vive fuera del feature y es importado por todas las capas | `src/types/jjc.ts` |

## Puntos de entrada

### Páginas

| Ruta | Archivo | Notas |
|---|---|---|
| `/areas/medicina/jjc` | `src/app/areas/medicina/jjc/page.tsx` | Listado de atenciones; consume `GET /api/areas/medicina/pacientes` y `DownloadCell` para el PDF |
| `/areas/medicina/jjc/[idAtencion]` | `src/app/areas/medicina/jjc/[idAtencion]/page.tsx` | RSC: `buildGetAtencionDetalle()` + `JjcFaceLesionMapper` |

### API

| Método y ruta | Handler | Notas |
|---|---|---|
| `POST /api/areas/medicina/jjc/evaluaciones` | `src/app/api/areas/medicina/jjc/evaluaciones/route.ts` | Guarda (upsert) con `area: 'medicina'`; `createdBy` desde la sesión JWT |
| `GET /api/areas/medicina/jjc/evaluaciones?idAtencion=` | ídem | Carga la evaluación (404 si no existe) |
| `GET /api/areas/medicina/jjc/[idAten]/pdf` | `src/app/api/areas/medicina/jjc/[idAten]/pdf/route.ts` | PDF con `pdf-lib` + `fontkit`; mapea campos (`mapAtencionToPdfFields.ts`), dibuja marcadores de lesiones (`drawLesionMarkers.ts`), embebe imágenes del paciente y la firma del usuario (lee `getUsuarioDb()` del módulo auth) |

### Exportados

| Export | Archivo | Uso |
|---|---|---|
| `buildGetAtencionDetalle`, `buildSaveJjcEvaluacion`, `buildLoadJjcEvaluacion` | `composition/container.ts` | Fábricas usadas por la página RSC y las rutas API |
| `createLesionPoint`, `FOTOTIPO_VALUES`, `FOTOPROTECTOR_VALUES`, `FOTOPROTECTOR_POR_FOTOTIPO`, `parseFototipo`, `parseFotoprotector` | `domain/entities.ts` | Reglas de dominio puras |
| `LESION_FILL`, `LESION_LABEL` | `domain/lesionStyles.ts` | Color y etiqueta por tipo de lesión (`P`=Pecas, `L`=Lunar, `M`=Mancha, `C`=Cicatriz, `O`=Otras) |
| `IAtencionRepository`, `IJjcEvaluacionRepository` | `domain/ports.ts` | Contratos de salida |
| `useJjcEvaluacion` | `presentation/hooks/useJjcEvaluacion.ts` | Reducer del estado del formulario (form, points, activeTool, preguntas) |

## Flujo de datos

Evaluación (happy path):

1. En `/areas/medicina/jjc` el operador busca atenciones (`GET /api/areas/medicina/pacientes`, que también consulta `dbo.Evaluacion` en HOLOMEDIC para marcar cuáles ya tienen evaluación).
2. Al abrir `/areas/medicina/jjc/[idAtencion]`, la página RSC ejecuta `GetAtencionDetalleUseCase` → `SqlServerAtencionRepository.getDetalle(idAtencion)`: un join sobre `Orden` + `Cliente` + `Persona` + `TipoChequeo` + `OrdenImg` (+ `OUTER APPLY` sobre `OrdenxServicio`/`Servicio` para el área) en SIGLA, matching por la concatenación `CodSed+CodTCl+NumOrd`.
3. El `JjcFaceLesionMapper` monta `useJjcEvaluacion` (estado local con `useReducer`); el médico elige herramienta (`P`/`L`/`M`/`C`/`O` o `delete`) y hace clic sobre el rostro — cada clic crea un `LesionPoint` con coordenadas normalizadas [0,1] (`createLesionPoint` clampa y rechaza NaN/negativos).
4. Al intentar cargar una evaluación previa, el cliente consulta `GET /api/areas/medicina/jjc/evaluaciones?idAtencion=`; `LoadJjcEvaluacionUseCase` → `loadByAtencion(id, 'medicina')` (LEFT JOIN `Evaluacion` + `EvaluacionMedicina`).
5. Al guardar, `POST /api/areas/medicina/jjc/evaluaciones` → `SaveJjcEvaluacionUseCase` valida (idAtencion no vacío, fototipo ∈ `FOTOTIPO_VALUES`, fecha ≤ hoy, observaciones ≤ 500 caracteres, lesiones válidas; el fotoprotector toma el default según fototipo si no viene) y persiste.
6. `SqlServerJjcEvaluacionRepository.save()` abre una transacción en HOLOMEDIC y hace dos `MERGE` (upsert): uno sobre `dbo.Evaluacion` (base genérica) y otro sobre `dbo.EvaluacionMedicina` (fototipo, fotoprotector, `lesionesJson`, `preguntasJson`), con commit atómico para preservar el invariante 1:1.

## Dependencias

| Tipo | Dependencia | Uso |
|---|---|---|
| Interna | `src/lib/db.ts` → `getPool()` (SIGLA) y `getHolomedicPool()` (HOLOMEDIC) | Dos pools: lectura de la atención / persistencia de la evaluación |
| Interna | `@/types/jjc` (alias de `src/types/jjc.ts`) | Tipos compartidos entre capas (fuera del feature) |
| Interna | `features/auth` → `getUsuarioDb()` | Firma del médico para el PDF (`/api/areas/medicina/jjc/[idAten]/pdf`) |
| Interna | `src/lib/platform.ts` → `FILE_SERVER_BASE_PATH` | Resolución de `UbiFir`/`UbiHue` (imágenes del paciente) |
| Externa | `mssql` | Acceso a SQL Server |
| Externa | `pdf-lib` + `@pdf-lib/fontkit` | Generación del PDF de la evaluación (ruta API, no el módulo) |
| BD SIGLA (lectura) | `Orden`, `Cliente`, `Persona`, `TipoChequeo`, `OrdenImg`, `OrdenxServicio`, `Servicio` | Detalle de la atención |
| BD HOLOMEDIC (escritura) | `dbo.Evaluacion`, `dbo.EvaluacionMedicina` (PK compuesta `(idAtencion, area)` con FK 1:1; `dbo.EvaluacionMusculoEsqueletica` reservada para el futuro) | Persistencia de evaluaciones |

## Configuración

| Variable / constante | Propósito | Dónde se lee |
|---|---|---|
| `DB_*` (`DB_NAME` default `ICCGSA`) | Pool SIGLA para el detalle de atenciones | `src/lib/db.ts` (`getPool`) |
| `HOLOMEDIC_DB_*` | Pool HOLOMEDIC para evaluaciones | `src/lib/db.ts` (`getHolomedicPool`) |
| `FILE_SERVER_BASE_PATH` | Base para resolver las rutas de imágenes `UbiFir`/`UbiHue` | `src/lib/platform.ts` (consumido por `AtencionRepository`) |
| `FOTOTIPO_VALUES` (`'I-II'`, `'III-IV'`, `'V-VI'`) | Subconjunto aceptado de fototipo Fitzpatrick | `domain/entities.ts` |
| `FOTOPROTECTOR_POR_FOTOTIPO` | Default de fotoprotector según fototipo (`+90`/`+65`/`+50`) | `domain/entities.ts` |
| `migrations/*.sql` | Esquema y normalización (3 tablas) — scripts de referencia para DBA | `infrastructure/sqlserver/migrations/` |

## Cómo probarlo

```bash
pnpm test src/features/jjc-mapper
```

Archivos de test del módulo:

- `application/__tests__/loadJjcEvaluacion.test.ts`
- `application/__tests__/saveJjcEvaluacion.test.ts`
- `domain/__tests__/entities.test.ts`
- `infrastructure/sqlserver/__tests__/JjcEvaluacionRepository.test.ts`
- `presentation/components/__tests__/FaceScanCanvas.test.tsx`
- `presentation/components/__tests__/FototipoFitzpatrickPicker.test.tsx`
- `presentation/components/__tests__/LesionCounters.test.tsx`
- `presentation/components/__tests__/LesionMarkers.test.tsx`
- `presentation/components/__tests__/PatientSummaryFields.test.tsx`
- `presentation/components/__tests__/VerticalLesionToolbar.test.tsx`
- `presentation/hooks/__tests__/useJjcEvaluacion.test.ts`

## Gotchas

- **`idAtencion` es un string compuesto, no un número**: `CodSed + CodTCl + NumOrd` con padding `'0'` cuando `CodSed ≤ 9`. El WHERE del detalle reconstruye la misma concatenación; cualquier consumidor debe generar el id con la misma regla.
- **Dos bases en un solo flujo**: el detalle viene de SIGLA (read-only) y la evaluación se guarda en HOLOMEDIC. No hay FK entre ambas — la integridad referencial es responsabilidad de la aplicación.
- **Lesiones y cuestionario se persisten como JSON** (`NVARCHAR(MAX)`): sin consultas SQL sobre la estructura interna de las lesiones; todo el procesamiento es en la aplicación.
- **El guardado es un upsert doble transaccional** (`MERGE` sobre `Evaluacion` + `EvaluacionMedicina`): o quedan ambas filas o ninguna. El invariante 1:1 además está forzado por FK en el esquema normalizado.
- **Confusión de rutas**: `/areas/musculoesqueletica/jjc/*` NO usa este módulo (usa `entrevista-osteomuscular`, `evaluacion-osteomuscular` y `musculoesqueletica-pdf`). Este módulo es medicina; el área se fija como `'medicina'` en la ruta API.
- **Dos scripts `003_*` en `migrations/`** (`003_add_area_to_jjc_evaluacion.sql` y `003_normalize_jjc_evaluacion_3_tables.sql`): los scripts son documentación/secuencia para DBA, no se ejecutan automáticamente en startup (a diferencia de auth/cobranza, aquí no hay `migrate()` en el arranque).
- **`useJjcEvaluacion` no hace fetch**: es solo estado (`useReducer`); la carga/guardado pasa por las rutas API desde los componentes de página. El componente `JjcFaceLesionMapper` recibe el detalle ya resuelto por la página RSC.
- **Coordenadas normalizadas [0,1]**: `createLesionPoint` clampa `x`/`y` a 1 y devuelve `null` para NaN/negativos — los marcadores son independientes del tamaño de render de la imagen.
- **PDF con firma**: el endpoint de PDF incrusta la imagen de firma del usuario autenticado (`getUsuarioDb().getFirma`); un usuario sin firma cargada produce un PDF sin esa sección.
