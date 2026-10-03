# Template editor redesign

## Objective
Redesign the existing internal template editor so its creation workflow is readable, structured, accessible and responsive without changing template selection, token insertion, saving or preview behavior.

## Context and constraints
- Current screenshot: sparse dark workspace with cramped template controls, unlabeled subject/editor and a body editor that visually clashes with its dark shell.
- Use UI/UX Pro Max guidance from nextlevelbuilder/ui-ux-pro-max-skill at 477bcb2: explicit labels, visible feedback, accessible focus and responsive layout. Its generated marketing/Neumorphism recommendation is inapplicable to this internal tool; retain the project's existing slate/sky theme.
- Preserve Spanish UI convention, existing drop targets and BlockNote behavior; no backend/schema changes, new dependencies or SDK live sync without review of its destructive mirror plan.
- Work on feature/plantillas-editor-redesign from develop; leave unrelated untracked odd/tasks/crm-dark-mode.md untouched.
- Route: delegated writer (multiple non-trivial presentation files); verification routed by native assessment. Actual source diff: 428 authored changed lines (265 added, 163 removed); user selected feature-branch-chain and explicitly authorized local Conventional Commits. This does not authorize remote branches, push or PR; repository remote branch policy permits only master/develop, so chain publication needs separate policy resolution.

## Tasks
- [x] T1: Introduce a clear page header and template configuration section; label the subject and body, improve mobile form layout, action/feedback placement, accessible controls and focus. Preserve selection/save/preview flow. Check focused TemplateEditor tests and lint/types. Status: complete; commit `8b35205` (`feat(templates): clarify editor form hierarchy`). Writer observed RED before implementation; independent verifier passed 13/13 focused tests, targeted ESLint, TypeScript (`--noEmit --incremental false`) and diff --check. Browser checks unavailable; earlier mis-scoped broad run showed 12 unrelated failures.
- [x] T2: Harmonize token palette, chips and body editor surface in light/dark modes without regressing drag/drop or table picker; add/update focused UI tests where meaningful and verify functional flow. Status: complete; commit `2afc6ee` (`feat(templates): align tokens and editor themes`). Visual-only styling has no meaningful behavior-level RED; 36/36 focused component tests passed, and the combined independent run passed 49/49, targeted ESLint, TypeScript and diff --check. Browser visual check not run.

## Acceptance
- Creating or choosing an existing template, adding tokens to subject/body, saving and toggling preview keep working.
- At narrow/mobile widths the form and palette stack without horizontal overflow; on desktop the palette and form have clear hierarchy.
- Visible labels and focus states for controls; text and surfaces legible in dark and light modes.
- Focused tests, lint/typecheck and responsive browser checks when available; report unavailable checks rather than asserting success.

## Evidence and next step
- Existing app map: TemplateEditor.tsx:265-410, TokenPalette.tsx:40-72, TokenChip.tsx:39-63, SubjectTokenInput.tsx:31-48, BlockNoteEditorView.tsx:258-266.
- UI/UX Pro Max query `form labels validation` returned associated-label and submission-feedback guidelines; the generated healthcare landing pattern is not used.
- Combined independent verification: 5 focused files / 49 tests passed; targeted ESLint, `pnpm exec tsc --noEmit --incremental false` and `git diff --check` passed. No browser rendering was checked; SDK share is not mounted, so live sync is pending.
- Work-unit commits: T1 `8b35205`, T2 `2afc6ee` (base: `11c8c2e`). `pnpm test -- <path>` forwarded `--` into Vitest and did not filter; use `pnpm exec vitest run <path>`. Native ASSESS was unassessable because untracked files required declaration; independent verifier passed. RDD is off; no native review started.
- Next: run browser review at 375/768/1440 px in light/dark modes when a browser environment is available; mount SDK share and inspect `node scripts/sync-sdk.mjs --dry-run` before syncing. User selected feature-branch-chain for future delivery, but remote policy allows only master/develop: obtain separate policy resolution before any remote branch, push or PR. No push or PR authorized.
