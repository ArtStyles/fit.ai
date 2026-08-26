# Final review correction report

## Status

Ready to integrate from `codex/trainer-routine-editor` after a final correction round against fixed base `724b11df5fd318ffb0a40545a525714c32e53272`. The implementation, directed regressions, full Vitest suite, local trainer database suite, type-check, lint, and whitespace checks are green.

## Corrections implemented

### 1. Unsaved navigation protection

- The routine editor now protects every non-saved descriptive state: `dirty`, `saving`, and `error`.
- Native unload/reload uses `beforeunload`.
- Same-origin SPA links are guarded through a capture-phase anchor listener using public DOM APIs; no private Next.js router API was introduced.
- Browser Back is guarded with a same-document History API sentinel. Cancel restores the editor entry; accept continues to the prior entry.
- Browser tests cover native unload and internal `Rutinas` navigation for all three states, browser Back cancellation while dirty, and unblocked internal navigation after a successful save.

### 2. Exercise picker close race

- The catalog ignores Radix X and Escape close requests while asynchronous confirmation is pending.
- A successful confirmation still performs exactly one external close and preserves selection while pending.
- A real-browser regression exercises X, Escape, selection retention, and the final successful close.

### 3. Real batch concurrency proof

- The pgTAP suite now creates two independent authenticated `dblink` sessions against a committed, dedicated fixture.
- Session A completes the real append RPC and is held at a controlled commit gate while retaining the RPC's workout lock.
- Session B invokes the same real RPC; `pg_blocking_pids` proves it waits for session A.
- Both calls then complete, insert four rows total, and leave unique consecutive server-owned order indexes `1..4`.
- The rollback test remains atomic through a rerunnable test-only trigger created outside the surrounding pgTAP transaction, avoiding an AccessExclusive-lock artifact in the concurrency scenario.

### 4. Stale catalog selections

- The action exposes unavailable identifiers only for the caller's submitted IDs and only after the canonical unavailable-exercise RPC error.
- The server re-queries public availability without exposing database error details or unrelated catalog rows.
- The picker retains the whole failed selection, marks unavailable rows with `aria-invalid` and `ID <uuid> ya no disponible`, allows those selected rows to be deselected, prevents re-selection, and retries the remaining valid IDs.
- A browser regression starts with 10 selected exercises, marks two stale IDs, deselects them, and verifies the second request contains the remaining eight IDs in order.

### 5. Minor review items

- `Editar información` is collapsed by default; interaction and accessibility tests now open it explicitly.
- The append action validates the RPC response positionally against the requested exercise IDs and requires strictly increasing server-owned `orderIndex` values.

## TDD evidence

RED was captured before implementation:

- Actions plus picker view: `4 failed, 28 passed` (stale-ID contract, positional/order response validation, and unavailable-row semantics).
- Pending dialog close: `1 failed` because the X close propagated to the parent.
- Internal navigation states: `3 failed` because dirty/saving/error links navigated.
- Collapsed metadata summary: `1 failed` because the editor was initially visible.

GREEN after the minimal fixes:

- `pnpm vitest run src/app/actions/__tests__/trainerPrograms.test.ts src/components/plan/__tests__/ExercisePicker.test.ts --maxWorkers=2 --reporter=verbose` -> `32 passed`.
- `pnpm vitest run src/components/plan/__tests__/planInteractions.test.tsx --maxWorkers=1 --reporter=verbose` -> `9 passed`.
- `pnpm vitest run src/components/coaching/__tests__/programTemplateEditor.test.tsx --maxWorkers=1 --reporter=verbose` -> `39 passed`.
- `pnpm vitest run src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts --maxWorkers=1 --reporter=verbose` -> `36 passed`.
- `pnpm test -- --maxWorkers=4` -> `265 files passed`, `2,291 tests passed`.
- `pnpm test:db:trainers` -> exit `0`, including the 28-assertion batch append pgTAP file and the authorization scan.
- `pnpm type-check` -> exit `0`.
- `pnpm lint` -> exit `0`.
- `git diff --check` -> exit `0`.

## Automatic review

The complete diff from `724b11df5fd318ffb0a40545a525714c32e53272` was reviewed for behavior, authorization boundaries, response validation, test determinism, public navigation APIs, and unrelated edits. No unresolved correctness, security, accessibility, or scope concern was found.

## Environment boundaries

- No `.env.local` was created or modified.
- No authenticated live-environment smoke test was run because credentials/session material were not in scope.
- The database proof ran against the repository's ephemeral local trainer-programming database; it does not prove that any migration is applied to a remote Supabase project.
- No merge, push, worktree cleanup, or remote state change was performed.
