## Exploration: Mitigación de Riesgos Identificados

### Current State

El proyecto **holomedic-cobros** tiene 5 riesgos identificados durante `sdd-init` y 1 adicional descubierto durante la exploración:

1. **Sin proveedor de cobertura** — @vitest/coverage-v8 no está instalado, no hay script de coverage.
2. **Sin formateador** — No existe Prettier, biome, ni .editorconfig.
3. **Sin AGENTS.md / archivos de convención** — El archivo no existe, pero `.gga` lo referencia como `RULES_FILE`.
4. **Configuración serial de vitest** — `singleFork: true`, `singleThread: true`, `maxWorkers: 1`.
5. **Sin E2E** — No hay Playwright, Cypress, ni Puppeteer.
6. **(NUEVO) GGA apunta a AGENTS.md inexistente** — El config `.gga` tiene `RULES_FILE="AGENTS.md"` pero el archivo no existe → GGA fallará silenciosamente al leer las reglas.

### Testing Infrastructure (for context)

- **Stack**: Vitest v4.1.7 + @testing-library/react + jsdom
- **Tests**: 7 archivos, 18 tests, todos pasan (~18s)
- **Mock data**: Compartida via `src/utils/__tests__/mockData.ts`
- **Patterns**: Unit tests (utils), Component tests (components), Integration test (app)
- **Setup**: `vitest.setup.ts` con jest-dom matchers y cleanup en afterEach

### Affected Areas

| Archivo | Por qué está afectado |
|---|---|
| `package.json` | Necesita script `test:coverage` y dependencia `@vitest/coverage-v8` / formateador / posible `test:e2e` |
| `vitest.config.ts` | Debe revisarse la configuración de pools (singleFork/singleThread) |
| `.gga` | Referencia AGENTS.md que no existe — debe crearse o corregirse |
| `AGENTS.md` | Debe crearse con convenciones del proyecto si se usa GGA |
| `.prettierrc` / `biome.json` | Debe crearse configuración de formateador |
| `eslint.config.mjs` | Podría necesitar plugin de formateador (si se elige Prettier) |
| `pnpm-lock.yaml` | Se modificará al instalar nuevas dependencias |

### Approaches

#### Risk 1: Coverage Provider

| Approach | Description | Pros | Cons | Effort |
|---|---|---|---|---|
| **A: @vitest/coverage-v8** | Instalar proveedor nativo V8 coverage | Rápido, nativo, sin dependencias C++ | Solo cubre V8 (no instrumentación) | Low |
| **B: @vitest/coverage-istanbul** | Usar Istanbul para instrumentación | Más preciso, soporta thresholds por rama | Más lento, dependencia extra | Low |
| **C: Ambos condicionales** | Dejar que el desarrollador elija | Flexible | Complejidad añadida en scripts | Low |

**Evidence**: `.gitignore` ya tiene `/coverage`. Vitest soporta coverage nativamente. Solo falta el paquete y el script.

#### Risk 2: Formatter

| Approach | Description | Pros | Cons | Effort |
|---|---|---|---|---|
| **A: Prettier** | Estándar de facto, integración ESLint vía eslint-config-prettier | Comunidad grande, IDE support universal | Config boilerplate, posible conflicto con ESLint | Low |
| **B: Biome** | Tool unificada (formatter + linter), más rápido que Prettier | Sin conflicto ESLint, velocidad, configuración única | Menos adopción, requiere migrar de ESLint? | Med |
| **C: Solo ESLint** | Mejorar reglas ESLint actuales | Sin nueva dependencia | ESLint no formatea, solo lint | Low |

**Evidence**: Código actual usa comillas mixtas — `layout.tsx` con `"` (doble), `page.tsx` y demás con `'` (simple). Sin consistencia visible en orden de clases Tailwind.

#### Risk 3: AGENTS.md / Convention Files

| Approach | Description | Pros | Cons | Effort |
|---|---|---|---|---|
| **A: Crear AGENTS.md** | Documentar stack, convenciones, y reglas del proyecto + corregir .gga | Soluciona el bug de GGA, guía a futuros agentes | Tiempo de documentación inicial | Low |
| **B: Cambiar RULES_FILE en .gga** | Apuntar a otro archivo o vaciarlo | Mínimo esfuerzo | No resuelve la falta de convenciones | Low |
| **C: Ambos** | Crear AGENTS.md Y usarlo como RULES_FILE | Aprovecha GGA, documenta todo | (ninguno significativo) | Low |

**Evidence**: `.gga` usa `RULES_FILE="AGENTS.md"`. No existe AGENTS.md en el proyecto. GGA fallará en `--pr-mode` al intentar leerlo.

#### Risk 4: vitest.config.ts Setup

| Approach | Description | Pros | Cons | Effort |
|---|---|---|---|---|
| **A: Mantener singleFork/singleThread** | Conservar la serialización actual | CI determinista, sin race conditions | Tests lentos a futuro (>100 tests) | None |
| **B: Eliminar restricciones paralelas** | Quitar singleFork, singleThread, dejar maxWorkers default | Tests más rápidos (especialmente en CI con multi-core) | Posibles race conditions si los tests comparten estado | Low |
| **B: Configuración híbrida** | CI usa singleFork, dev usa paralelo | Lo mejor de ambos mundos | Dos configuraciones que mantener | Med |

**Evidence**: Vitest usa forks pool por defecto → `threads.singleThread` es ignorado. `maxWorkers: 1` junto con `forks.singleFork: true` serializan efectivamente. Con solo 18 tests y 18s de duración, no es cuello de botella hoy pero escalará mal.

#### Risk 5: E2E Testing

| Approach | Description | Pros | Cons | Effort |
|---|---|---|---|---|
| **A: No agregar E2E ahora** | Diferir hasta que haya rutas múltiples o auth | Sin costo ahora | Riesgo si la app crece sin supervisión | None |
| **B: Playwright** | Agregar Playwright para pruebas E2E | Estándar moderno, robusto, generador de tests | Overhead de configuración, tests lentos (~2-10s cada uno) | Med |
| **C: Cypress** | Alternativa a Playwright | Debug visual, time-travel | Más pesado, menos performante que Playwright | Med |

**Evidence**: App SPA de página única (~2243 líneas TS/TSX), sin autenticación, sin API externa, sin routing complejo. La prueba de integración (`HomeIntegration.test.tsx`) ya cubre el flujo principal. E2E agregaría poco valor hoy.

### Risk Discovery: Hidden Risk #6 — .gga apunta a AGENTS.md inexistente

**Archivo**: `.gga` línea 37: `RULES_FILE="AGENTS.md"`

AGENTS.md no existe en el proyecto. Cuando GGA intente ejecutar `--pr-mode`, fallará al no encontrar el archivo de reglas. Esto debe corregirse como parte de la mitigación del Riesgo 3.

### Recommendation

| Riesgo | Enfoque recomendado | Orden |
|---|---|---|
| #1 Coverage | **A: @vitest/coverage-v8** — instalar y agregar script `test:coverage` | 1º |
| #2 Formatter | **A: Prettier** — con eslint-config-prettier para no duplicar reglas | 2º |
| #3 AGENTS.md | **C: Crear AGENTS.md + corregir .gga** — documentar stack y reglas | 3º |
| #6 GGA rotura | Resuelto por #3 (crear AGENTS.md que .gga ya referencia) | 3º (junto) |
| #4 vitest config | **B: Eliminar restricciones paralelas** (o B+híbrida si se quiere CI seguro) | 4º |
| #5 E2E | **A: No agregar E2E ahora** — diferir a cuando la app requiera routing/multi-página | 5º |

El orden recomendado es: **Coverage → Formatter → AGENTS.md (+ fix GGA) → vitest config → E2E (diferir)**.

### Risks

- AGENTS.md inexistente rompe GGA silenciosamente (riesgo #6, descubierto ahora)
- Agregar coverage puede aumentar el tiempo de CI si no se configuran thresholds adecuados
- Quitar restricciones paralelas de vitest puede exponer race conditions en tests que compartan estado global (ej: mock de temporizadores)
- Prettier + ESLint pueden conflictuar si no se configura correctamente `eslint-config-prettier`

### Ready for Proposal

**Yes** — la exploración es completa. La propuesta puede pasar directamente a detallar el plan de mitigación. El orden recomendado es claro y cada riesgo tiene un enfoque definido con evidencia del código.
