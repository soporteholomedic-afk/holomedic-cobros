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
- [ ] T1: Introduce a clear page header and template configuration section; label the subject and body, improve mobile form layout, action/feedback placement, accessible controls and focus. Preserve selection/save/preview flow. Check focused TemplateEditor tests and lint/types. Status: implementation verified, work-unit closure pending combined verification and local commit; browser check unavailable so far. Writer changed TemplateEditor.tsx and its focused test (196 insertions/144 deletions); RED observed before implementation. Independent verifier ran `pnpm exec vitest run src/features/plantillas-editor/presentation/components/__tests__/TemplateEditor.test.tsx`: 13/13 passed. ESLint and diff --check passed. Prior `pnpm test -- <path>` unexpectedly ran whole suite with 12 unrelated failures. TypeScript and browser checks not run.
- [ ] T2: Harmonize token palette, chips and body editor surface in light/dark modes without regressing drag/drop or table picker; add/update focused UI tests where meaningful and verify functional flow. Status: in progress; writer updated four presentation components and four tests; 36/36 focused component tests and source ESLint passed. Combined independent verification pending; no browser check.

## Acceptance
- Creating or choosing an existing template, adding tokens to subject/body, saving and toggling preview keep working.
- At narrow/mobile widths the form and palette stack without horizontal overflow; on desktop the palette and form have clear hierarchy.
- Visible labels and focus states for controls; text and surfaces legible in dark and light modes.
- Focused tests, lint/typecheck and responsive browser checks when available; report unavailable checks rather than asserting success.

## Evidence and next step
- Existing app map: TemplateEditor.tsx:265-410, TokenPalette.tsx:40-72, TokenChip.tsx:39-63, SubjectTokenInput.tsx:31-48, BlockNoteEditorView.tsx:258-266.
- UI/UX Pro Max query `form labels validation` returned associated-label and submission-feedback guidelines; the generated healthcare landing pattern is not used.
- Next: delegate T2 polish, then run focused tests and browser checks if available. `pnpm test -- <path>` forwarded `--` into Vitest and did not filter; use `pnpm exec vitest run <path>`. Native ASSESS returned unassessable because untracked files need explicit declaration; independent verifier passed. User authorized local work-unit commits and selected feature-branch-chain for future delivery; remote policy conflict must be resolved before any push/PR. Combined independent verification pending, then commit T1 and T2 as separate cohesive units. No push or PR authorized.
