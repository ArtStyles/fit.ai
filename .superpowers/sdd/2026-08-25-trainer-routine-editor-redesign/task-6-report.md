# Task 6 report: mobile and accessibility hardening

## Status

Implemented and verified. The trainer routine editor now preserves its approved desktop workspace while remaining contained, readable, keyboard-operable, and touch-friendly at the required 320, 360, 390, 430, and 450 px mobile widths.

## Commit

Commit message: `fix(coach): harden routine editor on mobile`

The final commit hash is recorded in the Task 6 handoff because this report is part of that commit.

## Delivered behavior

- Kept the approved desktop editor/action split with the exact `lg:grid-cols-[minmax(0,1fr)_18rem]` invariant and explicit `min-w-0` containment.
- Made day navigation a valid roving-focus tab interface. Arrow Left/Right, Home, and End select and focus a day while exactly one associated `tabpanel` remains active.
- Separated day reorder controls from the `tablist`, retaining their relationship to the active day without placing non-tab children inside the tab list.
- Raised day, exercise, reorder, edit, delete, batch-picker, and dialog controls to at least 44 by 44 CSS pixels.
- Reflowed exercise headings and controls on narrow screens, kept metric labels and values in a contained three-column grid, and displayed missing RPE as `Libre`.
- Preserved the weekly action panel after the active editor on mobile and added bottom safe-area padding with `env(safe-area-inset-bottom)`.
- Made batch selection operable with Space and Enter, exposed its selected count, and restored focus to the opener when the dialog closes, including after a successful pending submission.
- Retained existing editor mutations, save guards, draft reconciliation, and professional-action separation. No dependency or persistence contract changed.
- Corrected adjacent contrast and definition-list semantics revealed by the complete accessibility fixture, using existing theme tokens.

## Files committed

- `src/components/coaching/ProgramTemplateEditor.tsx`
- `src/components/coaching/PublishProgramRevisionDialog.tsx`
- `src/components/coaching/__tests__/fixtures/trainerAccessibility.fixture.tsx`
- `src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts`
- `src/components/coaching/program-editor/ActiveTemplateWorkout.tsx`
- `src/components/coaching/program-editor/ProgramTemplateActions.tsx`
- `src/components/coaching/program-editor/ProgramTemplateSummary.tsx`
- `src/components/coaching/program-editor/TemplateDayTabs.tsx`
- `src/components/coaching/program-editor/TemplateExerciseBatchPicker.tsx`
- `src/components/coaching/program-editor/TemplateExerciseCard.tsx`
- `.superpowers/sdd/2026-08-25-trainer-routine-editor-redesign/task-6-report.md`

## RED evidence

Mobile touch-target regression:

```powershell
pnpm vitest run src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts -t "contains the active-day editor and readable metrics at 320 px" --maxWorkers=4 --reporter=verbose
```

Result before implementation: exit code 1. The `Bajar Día A` and `Subir Día B` controls measured 44 by 22 CSS pixels.

Roving tab regression:

```powershell
pnpm vitest run src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts -t "uses roving tab focus" --maxWorkers=4 --reporter=verbose
```

Result before implementation: exit code 1. The selected day tab did not expose the required `tabindex="0"` roving-focus state.

Batch keyboard and focus-return regression:

```powershell
pnpm vitest run src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts -t "selects a batch with Space" --maxWorkers=4 --reporter=verbose
```

Result before implementation: exit code 1. Keyboard selection succeeded, but the batch-picker opener did not regain focus after the dialog closed.

The first unfiltered RED attempt exceeded the command timeout while multiple failures accumulated. Only the exact Vitest/Vite processes started by that attempt were stopped, then each requirement was isolated with the targeted commands above.

## GREEN and final verification

Complete accessibility and editor regression suites:

```powershell
pnpm vitest run src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts src/components/coaching/__tests__/programTemplateEditor.test.tsx --maxWorkers=4
```

Result: exit code 0; 2 files passed; 65 tests passed; duration 40.25 seconds.

The accessibility file contributes 31 passing acceptance tests. Axe runs independently for the metadata editor and batch dialog rather than combining unrelated surfaces into one result. The editor suite contributes 34 passing regressions covering existing mutations, drafts, reconciliation, and action guards.

Final static gates:

```powershell
pnpm type-check
pnpm exec eslint src/components/coaching/ProgramTemplateEditor.tsx src/components/coaching/PublishProgramRevisionDialog.tsx src/components/coaching/program-editor/ActiveTemplateWorkout.tsx src/components/coaching/program-editor/ProgramTemplateActions.tsx src/components/coaching/program-editor/ProgramTemplateSummary.tsx src/components/coaching/program-editor/TemplateDayTabs.tsx src/components/coaching/program-editor/TemplateExerciseBatchPicker.tsx src/components/coaching/program-editor/TemplateExerciseCard.tsx src/components/coaching/__tests__/fixtures/trainerAccessibility.fixture.tsx src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts
git diff --check
```

Result: all three commands exited 0. TypeScript completed with `tsc --noEmit --incremental false`; scoped ESLint reported no findings; `git diff --check` reported no whitespace errors.

## Exact-width visual review

The editor was rendered in the in-app browser with the representative two-day, three-exercise fixture at every required width.

| Viewport | Document width | Card containment | Metric separation | Review |
| --- | ---: | --- | --- | --- |
| 320 px | 320 px | contained | separated | exercise actions wrap below the title; cards and metrics remain readable |
| 360 px | 360 px | contained | separated | day and exercise controls remain clear and touch-sized |
| 390 px | 390 px | contained | separated | no horizontal overflow or card collision |
| 430 px | 430 px | contained | separated | no horizontal overflow or card collision |
| 450 px | 450 px | contained | separated | no horizontal overflow or card collision |

The temporary Vite review configuration was deleted, its exact child process was stopped, and port 4177 was verified to have no remaining listener.

## Accessibility findings resolved

- The former tab list included reorder buttons, which violated Axe's required-child rule. Reorder controls now live in a separate labelled group.
- The weekly summary placed an extra span directly under `dl`; it is now nested inside the corresponding `dd`.
- Selected tabs and primary actions now use the existing primary/background token pairing for sufficient contrast.
- Destructive controls use stronger destructive borders with foreground text while retaining their established semantic color.
- The expanded fixture now includes multiple days, multiple exercises, catalog pagination, a relationship, and an assignment so Axe and responsive assertions exercise the real workspace shape rather than an empty-state shortcut.

## Concerns and boundaries

- Vitest emitted the repository's existing `vite-tsconfig-paths` advisory; it did not affect exit status.
- Browser acceptance and visual review validate CSS geometry, keyboard interaction, focus restoration, and Axe rules in the local fixture. They do not replace VoiceOver/TalkBack or physical-device safe-area validation.
- Remote Supabase persistence and deployment are outside this client hardening task and were not changed.

## Fix round 1/5: resolved tab relationships and bound mobile accessibility contracts

### Status

Addressed every review finding. Each day tab now owns a resolvable panel ID, the fixture binds all requested keyboard/focus/safe-area/theme behaviors, and existing editor state/reconciliation regressions remain green.

Commit message: `fix(coach): complete routine editor accessibility`

The fix commit hash is recorded in the handoff because this appended report is part of that commit.

### Changes

- Rendered one stable `tabpanel` for every day. The active panel contains the editor; inactive panels remain as empty `hidden` and `inert` shells so every `aria-controls` IDREF resolves without duplicate forms, exercise nodes, or visible controls.
- Kept panels keyed by workout ID and retained the existing lifted day/exercise save state, prescription drafts, structural pending state, and reconciliation policy.
- Added runtime coverage for Arrow Left and End alongside Arrow Right and Home. The test verifies roving focus, selection, panel visibility, both IDREF targets, and exactly one panel in the accessibility tree.
- Added a successful batch-confirmation path that selects with Space, confirms with Enter, waits for close, verifies focus on the external `Agregar varios ejercicios` opener, proves its pending `aria-disabled` state, and measures its 44 px target.
- Updated the shared touch-target helper to measure rendered `aria-disabled` actions. A negative sentinel regression proves a 44 by 20 px aria-disabled button is rejected rather than skipped.
- Added a route-like fixture using the real `AppShell`, `AppScrollViewport`, and fixed `BottomNav`, plus the route's `pb-28` clearance. With a simulated 24 px Capacitor inset, the test reaches the true scroll end, keeps the action panel above the nav, and verifies the panel incorporates the full inset.
- Routed action-panel padding through `--app-safe-area-bottom`, which already combines Capacitor variables with browser `env()` fallbacks.
- Ran metadata and batch-dialog Axe acceptance independently in both dark and light themes.
- Raised the saved-state light tone from emerald 600 to emerald 700 and changed the assignment explanation to `text-foreground/80` after light-theme Axe identified serious contrast failures. Dark-theme tones remain unchanged.
- Did not add an opener-unmount fallback: the component contract keeps the workout and its external opener mounted after batch confirmation, including while refreshed exercises are pending. The bound success test verifies that exact contract; adding a fallback target for an out-of-contract parent removal would introduce unused behavior.

### RED evidence

Initial focused review run:

```powershell
pnpm vitest run src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts --maxWorkers=4 --reporter=verbose -t "uses roving|restores focus to the external|measures aria-disabled|scrolls the route editor"
```

Result before fixes: exit code 1; 3 failed, 1 passed, 32 skipped.

- Day B's tab referenced `template-day-panel-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, but the locator count was 0 because only the active panel existed.
- The aria-disabled sentinel expected the target helper to reject, but the helper resolved successfully because `[aria-disabled="true"]` was explicitly excluded.
- The route-shell test could not find `[data-app-scroll-viewport]` because the fixture exposed only the standalone editor.
- The successful-confirmation focus test passed immediately, proving the existing implementation already restored focus after the real async success path; the missing issue was binding coverage, not product behavior.

After introducing the real route shell, the safe-area assertion still failed with 12 px instead of the simulated 24 px, isolating the product defect to the action panel's direct `env()` use.

Light-theme Axe RED:

```powershell
pnpm vitest run src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts --maxWorkers=4 --reporter=verbose -t "editor with .* theme has no critical/serious Axe findings"
```

Result before contrast fixes: exit code 1; both dark cases passed and both light cases failed with serious `color-contrast` findings. The exact targets were the saved-state `text-emerald-600` indicator and the assignment explanation on its violet-tinted surface.

The first complete combined run with full inactive panel contents produced 14 failures: hidden controls still duplicated raw DOM locators and structural exercise counts. Reducing inactive panels to empty hidden/inert shells fixed the root cause without weakening selectors or accessibility assertions.

### GREEN and final verification

Final amended accessibility and editor suites:

```powershell
pnpm vitest run src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts src/components/coaching/__tests__/programTemplateEditor.test.tsx --maxWorkers=4
```

Result: exit code 0; 2 files passed; 70 tests passed; duration 38.28 seconds. The accessibility suite now contributes 36 tests and the unchanged editor regression suite contributes 34.

Static gates:

```powershell
pnpm type-check
pnpm exec eslint src/components/coaching/AssignProgramDialog.tsx src/components/coaching/ProgramTemplateEditor.tsx src/components/coaching/__tests__/fixtures/trainerAccessibility.fixture.tsx src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts src/components/coaching/program-editor/ActiveTemplateWorkout.tsx src/components/coaching/program-editor/ProgramTemplateActions.tsx src/components/coaching/program-editor/SaveStateIndicator.tsx tests/e2e/helpers/acceptance.ts
git diff --check
```

Result: type-check exited 0 with `tsc --noEmit --incremental false`; scoped ESLint exited 0 with no findings after removing one unused test locator; diff validation exited 0.

### Files in fix round

- `src/components/coaching/AssignProgramDialog.tsx`
- `src/components/coaching/ProgramTemplateEditor.tsx`
- `src/components/coaching/__tests__/fixtures/trainerAccessibility.fixture.tsx`
- `src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts`
- `src/components/coaching/program-editor/ActiveTemplateWorkout.tsx`
- `src/components/coaching/program-editor/ProgramTemplateActions.tsx`
- `src/components/coaching/program-editor/SaveStateIndicator.tsx`
- `tests/e2e/helpers/acceptance.ts`
- `.superpowers/sdd/2026-08-25-trainer-routine-editor-redesign/task-6-report.md`

### Boundaries

- The existing Vite path-resolution and stale Browserslist advisories remain warnings only; no assertion or exit status was weakened.
- The fixture validates a nonzero Capacitor safe-area variable and the real fixed navigation geometry in Chromium. Physical-device system bars and screen-reader announcements remain device-validation boundaries.
