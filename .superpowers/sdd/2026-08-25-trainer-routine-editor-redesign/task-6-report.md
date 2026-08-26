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
