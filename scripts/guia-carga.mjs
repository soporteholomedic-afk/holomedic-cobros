/**
 * Dev-only module loader for `scripts/guia.ts` (agente-ia-crm) — lets a
 * plain `node` run the project's TypeScript application layer with the
 * SAME semantics the bundlers use:
 *
 *   1. `@/…` tsconfig alias        → `<repo>/src/…`
 *   2. extensionless relative ids  → try `.ts`, `.tsx`, `/index.ts`
 *
 * Node 24 strips types natively, so NO transpiler dependency is needed:
 * this hook only rewrites specifiers. Loaded via
 * `node --import ./scripts/guia-carga.mjs scripts/guia.ts`
 * (wired as the `guia` npm script — development tooling only; nothing
 * here participates in `next build`/`next start`).
 */
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { statSync } from 'node:fs';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(RAIZ, 'src');

/** First existing FILE among TS-style candidates for a base path. */
function comoUrlArchivo(base) {
  const candidatos = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`];
  for (const cand of candidatos) {
    try {
      if (statSync(cand).isFile()) return pathToFileURL(cand).href;
    } catch {
      /* candidato inexistente — seguir */
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // 1) Alias de tsconfig: `@/x` → `<repo>/src/x`
    if (specifier.startsWith('@/')) {
      const url = comoUrlArchivo(path.join(SRC, specifier.slice(2)));
      if (url) return { url, shortCircuit: true };
    }
    // 2) Relativos sin extensión (estilo TS): resolver contra el padre
    //    probando `.ts` / `.tsx` / `/index.ts`.
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL &&
      !/\.[cm]?[jt]sx?$/.test(specifier)
    ) {
      const dirPadre = path.dirname(new URL(context.parentURL).pathname);
      const url = comoUrlArchivo(path.resolve(dirPadre, specifier));
      if (url) return { url, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const resultado = nextLoad(url, context);
    // Interop quirke único del repo bajo Node puro: los repos usan
    // `import * as mssql from 'mssql'` (namespace). El cjs-module-lexer
    // de Node NO detecta los exports dinámicos de mssql v12 (los
    // bundlers sí los sintetizan, por eso vitest/Next andan). Se
    // reescribe al default-import que src/lib/db.ts ya usa — semántica
    // idéntica bajo esModuleInterop. Solo aplica a este loader DEV.
    if (
      resultado?.source &&
      /\.[cm]?tsx?$/.test(url) &&
      !url.includes('node_modules')
    ) {
      const fuente = resultado.source.toString();
      const parche = fuente.replace(
        /import\s+\*\s+as\s+mssql\s+from\s+'mssql';?/g,
        "import mssqlCjs from 'mssql'; const mssql = mssqlCjs;",
      );
      if (parche !== fuente) return { ...resultado, source: parche };
    }
    return resultado;
  },
});
