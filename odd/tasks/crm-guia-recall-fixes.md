# CRM Guía: recall + chat hygiene fixes

## Objective
Fix three defects found while testing the Guía against a real LLM (Gemini) and a real, isolated Engram.

## Evidence (root causes, verified)
1. **Episodic memory is not recalled for natural questions.** `MemoriaEngramHttp.buscar` calls `GET /search?q=<full question>&project&limit` without `match_mode`. Engram defaults to AND over every word, so a sentence with stopwords ("a que hora y por que canal prefiero que me contacten?") returns `[]` even though a saved memory matches. Live check: default => `[]`; `match_mode=any` => the memory (verified on Engram 3.4.0 and on a disposable 3.2.1). Effect: the Guía escalated to a human (case A) although the answer was in memory.
2. **React duplicate-key error in the help card.** `TarjetaAyuda.tsx:85` uses `key={termino}`; `extraerTerminosRecall` does not dedupe, so a repeated term ("que") renders duplicate keys (8 console errors, "2 Issues" overlay).
3. **Citation marker leaks to the customer.** The prompt asks the model to cite KB fragments as `[id N]`; `generarRespuestaAgente.ts` sends `respuesta.texto` verbatim (line ~425), so the WhatsApp text can contain `[id 47]`.

## Scope
Authorized surfaces (exact):
- src/features/crm/infrastructure/engram/memoriaEngramHttp.ts
- src/features/crm/infrastructure/engram/__tests__/memoriaEngramHttp.test.ts
- src/features/crm/presentation/components/conversaciones/TarjetaAyuda.tsx
- src/features/crm/presentation/components/conversaciones/__tests__/TarjetaAyuda.test.tsx
- src/features/crm/application/generarRespuestaAgente.ts
- src/features/crm/application/__tests__/generarRespuestaAgente.test.ts
- src/features/crm/application/limpiarCitasRespuesta.ts (new)
- src/features/crm/application/__tests__/limpiarCitasRespuesta.test.ts (new)

## Constraints
- Test-first: observe RED, then GREEN. Run only the affected files; lint only modified files.
- Do not change `extraerTerminosRecall` semantics (shared with the RAG prefilter and the knowledge gaps).
- The audit columns (`fuentes`, `score`) must be unchanged: only the outgoing/persisted body text is cleaned.
- Pre-existing uncommitted change in `memoriaEngramHttp.ts` + its test (400/405 tolerance in the commit poll) must be preserved untouched.

## Tasks
- [x] T1 Engram recall: send `match_mode=any` in `buscar` (+ test pinning the query param).
- [x] T2 TarjetaAyuda: unique React keys for repeated recall terms (+ test with a repeated term).
- [x] T3 Strip `[id N]` citation markers from the outgoing Guía text (+ unit tests, + engine test).
- [x] T4 Verify: affected suites + lint on modified files; live check with Gemini on conversation 1006 (case A must answer from memory, no key warnings, no `[id N]` in the body).
- [ ] T5 Work-unit commits (pending explicit user approval; do not commit without it).

## Evidence log
- T1-T3 (writer, test-first): RED observed per fix (`expected null to be 'any'`; `expected 2 to have length 1`; body still had `[id 7]`; missing module), then GREEN. 4 affected files: 117 tests pass. `pnpm eslint` on the 8 touched files: exit 0.
- T4 verifier (`pnpm vitest run src/features/crm`): 120 files, 3472 tests: 3458 passed, 13 skipped, 1 failed. `pnpm tsc --noEmit`: exit 0, 0 errors.
- The 1 failure is NOT caused by this change: `infrastructure/sqlserver/__tests__/sqlServerEmpresaRepository.test.ts:219` (integration test against the shared SQL Server) expects `listar({tipo:'Cliente'})` to return only `['Probe Alfa SA']` but the DB also holds the pre-existing clients `ANDES` and `dante sandoval` (visible since the first screenshot of the session). The test file has no local changes; it assumes an empty `Cliente` set. Out of scope here; not fixed.
- Live check, Gemini `gemini-3.5-flash-lite`, conversation 1006: (A) 'A que hora y por que canal prefiero que me contacten?' now answers from the empresa memory ('preferis ... WhatsApp ... antes de las 11') instead of escalating; (D) the resonancia answer has no `[id N]` and `fuentes` still audits id 47; the help card shows 6 distinct chips and 0 console errors (previously 8 duplicate-key errors).
- Known limits: the citation regex does not strip `[id 7 y 8]`, `[ids 7]`, `[id: 7]`. Each live case ran once (LLM is not deterministic).
- T5 pending: commits require explicit user approval.
