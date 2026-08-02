# Safe-Area Modals and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every mobile dialog a safe-area-aware bottom sheet, preserve centered desktop dialogs, and position dismissible notifications below system bars.

**Architecture:** Keep Radix responsible for portals, focus, Escape, and open state. Centralize responsive geometry and motion in the shared `DialogContent` plus named CSS rules, remove consumer classes that override that contract, and encode toast safe-area geometry directly in the shared provider. Source-contract tests protect the responsive CSS and class contracts while one Playwright test verifies real rendered geometry and touch targets.

**Tech Stack:** Next.js 14, React 18, TypeScript, Radix Dialog/Toast, Tailwind CSS, Vitest, Playwright.

## Global Constraints

- Below Tailwind `sm` (640 px), every dialog is anchored to the bottom and enters in 280 ms from below the viewport.
- At and above 640 px, dialogs remain centered and use a 200 ms opacity/scale entrance.
- Mobile dialog height is at most `calc(100dvh - var(--app-safe-area-top) - 1.5rem)`.
- Mobile dialog content includes `--app-safe-area-bottom`; toast placement includes top, left, and right safe areas.
- Dialog and toast close controls are at least 44 × 44 px and the dialog label is `Cerrar`.
- `prefers-reduced-motion: reduce` removes translations, scaling, and timed transitions.
- Toast duration stays 3.2 seconds, swipe direction stays right, and notification business behavior does not change.
- Do not change dialog content, actions, or business logic.

## File Structure

- Create `src/components/ui/__tests__/dialog-layout-contract.test.ts`: source-level contract for dialog geometry, motion, reduced motion, and close accessibility.
- Create `src/components/ui/__tests__/dialog-consumers.test.ts`: audit every current `DialogContent` consumer for classes that override the shared contract.
- Create `src/components/feedback/__tests__/toast-layout-contract.test.ts`: source-level contract for toast safe areas, motion reduction, and close target size.
- Create `tests/e2e/overlays.spec.ts`: rendered mobile/desktop dialog geometry and touch-target acceptance.
- Modify `src/components/ui/dialog.tsx`: apply the shared dialog class and accessible 44 px close control.
- Modify `src/styles/globals.css`: define mobile sheet geometry, desktop centering, animations, and reduced-motion behavior.
- Modify `src/components/feedback/ToastProvider.tsx`: safe-area-aware viewport and 44 px close control.
- Modify dialog consumers listed in Task 2: remove only positional, margin, and height classes that conflict with the shared layout.

---

### Task 1: Build the shared responsive dialog contract

**Files:**
- Create: `src/components/ui/__tests__/dialog-layout-contract.test.ts`
- Create: `tests/e2e/overlays.spec.ts`
- Modify: `src/components/ui/dialog.tsx:14-51`
- Modify: `src/styles/globals.css:149-218`
- Modify: `src/components/plan/PlanAdjustButton.tsx:197-199`

**Interfaces:**
- Consumes: `--app-safe-area-top`, `--app-safe-area-bottom`, Radix `data-state`, and Tailwind breakpoint `sm = 640px`.
- Produces: CSS class `.fitai-dialog-content`; `DialogContent` keeps the existing React prop/ref API.

- [ ] **Step 1: Write the failing source-contract test**

Create `src/components/ui/__tests__/dialog-layout-contract.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dialog = readFileSync(new URL('../dialog.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../../styles/globals.css', import.meta.url), 'utf8')

function readRule(source: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  expect(match, `Missing CSS rule for ${selector}`).not.toBeNull()
  return match?.[1] ?? ''
}

describe('shared dialog layout contract', () => {
  it('uses a safe mobile bottom sheet with a 44px close control', () => {
    expect(dialog).toContain('fitai-dialog-content')
    expect(dialog).toContain('h-11 w-11')
    expect(dialog).toContain('<span className="sr-only">Cerrar</span>')

    const mobile = readRule(css, '.fitai-dialog-content')
    expect(mobile).toContain('inset-inline: 1rem;')
    expect(mobile).toContain('bottom: 0;')
    expect(mobile).toContain('max-height: calc(100dvh - var(--app-safe-area-top) - 1.5rem);')
    expect(mobile).toContain('overflow-y: auto;')
    expect(css).toContain('padding-bottom: calc(1.5rem + var(--app-safe-area-bottom)) !important;')
    expect(css).toContain('fitai-dialog-sheet-in 280ms')
    expect(css).toContain('fitai-dialog-sheet-out 200ms')
  })

  it('restores centered geometry and restrained motion from 640px', () => {
    const desktopStart = css.indexOf('@media (min-width: 640px)')
    expect(desktopStart).toBeGreaterThan(-1)
    const desktop = readRule(css.slice(desktopStart), '.fitai-dialog-content')
    expect(desktop).toContain('left: 50%;')
    expect(desktop).toContain('top: 50%;')
    expect(desktop).toContain('transform: translate(-50%, -50%);')
    expect(desktop).toContain('max-height: calc(100dvh - 3rem);')
    expect(css).toContain('fitai-dialog-desktop-in 200ms')
    expect(css).toContain('fitai-dialog-desktop-out 150ms')
  })

  it('removes dialog and overlay motion for reduced-motion users', () => {
    const reducedStart = css.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(reducedStart).toBeGreaterThan(-1)
    const reduced = css.slice(reducedStart)
    expect(reduced).toContain('.fitai-dialog-content[data-state="open"]')
    expect(reduced).toContain('.fitai-dialog-content[data-state="closed"]')
    expect(reduced).toContain('animation: none;')
    expect(dialog).toContain('motion-reduce:data-[state=open]:animate-none')
    expect(dialog).toContain('motion-reduce:data-[state=closed]:animate-none')
  })
})
```

- [ ] **Step 2: Write the failing rendered-geometry test**

Create `tests/e2e/overlays.spec.ts`:

```ts
import { expect, test } from './fixtures'
import { signInAsE2EUser } from './helpers/auth'
import { seedCoreProductFixture } from './helpers/core-product'

test('dialogs are bottom sheets on mobile and centered panels on desktop', async ({ page }) => {
  test.setTimeout(120_000)
  await seedCoreProductFixture('es')
  await signInAsE2EUser(page)
  await page.goto('/plan')
  await page.addStyleTag({
    content: ':root { --safe-area-inset-top: 32px !important; --safe-area-inset-bottom: 20px !important; }',
  })

  await page.getByRole('button', { name: /ajustar plan|adjust plan/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const viewport = page.viewportSize()
  const dialogBox = await dialog.boundingBox()
  const closeBox = await dialog.getByRole('button', { name: /cerrar|close/i }).boundingBox()
  expect(viewport).not.toBeNull()
  expect(dialogBox).not.toBeNull()
  expect(closeBox).not.toBeNull()
  if (!viewport || !dialogBox || !closeBox) throw new Error('Overlay geometry is unavailable')

  expect(closeBox.width).toBeGreaterThanOrEqual(44)
  expect(closeBox.height).toBeGreaterThanOrEqual(44)

  if (viewport.width < 640) {
    expect(dialogBox.y).toBeGreaterThanOrEqual(56)
    expect(Math.abs(dialogBox.y + dialogBox.height - viewport.height)).toBeLessThanOrEqual(1)
    expect(dialogBox.width).toBeLessThanOrEqual(viewport.width - 32)
  } else {
    expect(Math.abs(dialogBox.x + dialogBox.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2)
    expect(Math.abs(dialogBox.y + dialogBox.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(2)
  }
})
```

- [ ] **Step 3: Run both tests and verify RED**

Run:

```powershell
pnpm vitest run src/components/ui/__tests__/dialog-layout-contract.test.ts
pnpm playwright test tests/e2e/overlays.spec.ts --project=mobile-375 --project=desktop-1024
```

Expected: Vitest fails because `.fitai-dialog-content`, safe-area rules, and `Cerrar` do not exist. Playwright fails because the current close button is 16 × 16 px and the mobile dialog is centered instead of bottom-anchored.

- [ ] **Step 4: Apply the shared class and accessible close control**

In `src/components/ui/dialog.tsx`, retain the existing Radix structure but replace the overlay/content/close class strings with:

```tsx
<DialogPrimitive.Overlay
  ref={ref}
  className={cn(
    'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none',
    className,
  )}
  {...props}
/>
```

```tsx
<DialogPrimitive.Content
  ref={ref}
  className={cn(
    'fitai-dialog-content fixed z-50 grid max-w-lg gap-4 border bg-background p-6 shadow-lg',
    className,
  )}
  {...props}
>
  {children}
  <DialogPrimitive.Close className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground ring-offset-background transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
    <X className="h-4 w-4" />
    <span className="sr-only">Cerrar</span>
  </DialogPrimitive.Close>
</DialogPrimitive.Content>
```

- [ ] **Step 5: Add exact mobile, desktop, and reduced-motion CSS**

Insert this `@layer components` block in `src/styles/globals.css` after the base layers and before `@layer utilities`:

```css
@layer components {
  .fitai-dialog-content {
    inset-inline: 1rem;
    bottom: 0;
    width: auto;
    max-height: calc(100dvh - var(--app-safe-area-top) - 1.5rem);
    overflow-y: auto;
    border-radius: 1.5rem 1.5rem 0 0;
    transform-origin: bottom center;
  }

  .fitai-dialog-content[data-state="open"] {
    animation: fitai-dialog-sheet-in 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .fitai-dialog-content[data-state="closed"] {
    animation: fitai-dialog-sheet-out 200ms ease-in both;
  }
}

@media (max-width: 639px) {
  .fitai-dialog-content {
    padding-bottom: calc(1.5rem + var(--app-safe-area-bottom)) !important;
  }
}

@media (min-width: 640px) {
  .fitai-dialog-content {
    inset-inline: auto;
    right: auto;
    bottom: auto;
    left: 50%;
    top: 50%;
    width: 100%;
    max-height: calc(100dvh - 3rem);
    border-radius: var(--radius);
    transform: translate(-50%, -50%);
    transform-origin: center;
  }

  .fitai-dialog-content[data-state="open"] {
    animation: fitai-dialog-desktop-in 200ms ease-out both;
  }

  .fitai-dialog-content[data-state="closed"] {
    animation: fitai-dialog-desktop-out 150ms ease-in both;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fitai-dialog-content[data-state="open"],
  .fitai-dialog-content[data-state="closed"] {
    animation: none;
  }
}

@keyframes fitai-dialog-sheet-in {
  from { opacity: 0; transform: translate3d(0, 100%, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}

@keyframes fitai-dialog-sheet-out {
  from { opacity: 1; transform: translate3d(0, 0, 0); }
  to { opacity: 0; transform: translate3d(0, 100%, 0); }
}

@keyframes fitai-dialog-desktop-in {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

@keyframes fitai-dialog-desktop-out {
  from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  to { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
}
```

- [ ] **Step 6: Let the plan-adjustment dialog inherit the shared geometry**

In `src/components/plan/PlanAdjustButton.tsx`, replace:

```tsx
<DialogContent className="mx-4 max-h-[88vh] max-w-lg gap-0 overflow-y-auto rounded-2xl border-border/60 bg-popover p-0">
```

with:

```tsx
<DialogContent className="max-w-lg gap-0 overflow-y-auto rounded-2xl border-border/60 bg-popover p-0">
```

- [ ] **Step 7: Run the focused tests and verify GREEN**

Run:

```powershell
pnpm vitest run src/components/ui/__tests__/dialog-layout-contract.test.ts
pnpm playwright test tests/e2e/overlays.spec.ts --project=mobile-375 --project=desktop-1024
```

Expected: both Vitest and both Playwright projects pass. The mobile box ends at the viewport bottom and starts at or below 56 px with the injected 32 px top inset; the desktop box is centered; the close target is at least 44 × 44 px.

- [ ] **Step 8: Commit the shared dialog behavior**

```powershell
git add src/components/ui/dialog.tsx src/styles/globals.css src/components/plan/PlanAdjustButton.tsx src/components/ui/__tests__/dialog-layout-contract.test.ts tests/e2e/overlays.spec.ts
git commit -m "fix(ui): make dialogs safe responsive sheets"
```

---

### Task 2: Remove consumer overrides that break the shared dialog

**Files:**
- Create: `src/components/ui/__tests__/dialog-consumers.test.ts`
- Modify: `src/components/chat/ChatContainer.tsx:263`
- Modify: `src/components/measurements/MeasurementsClient.tsx:420`
- Modify: `src/components/plan/PlanWorkoutWorkspace.tsx:193-202`
- Modify: `src/components/plan/ReadinessReviewDialog.tsx:128`
- Modify: `src/components/plan/WorkoutAdjustButton.tsx:102`
- Modify: `src/components/plan/WorkoutExerciseManager.tsx:150-171`
- Modify: `src/components/session/ExerciseCard.tsx:151`
- Modify: `src/components/social/PostImageCropper.tsx:135`
- Modify: `src/components/social/ProfileConnectionsStats.tsx:98`

**Interfaces:**
- Consumes: `.fitai-dialog-content` from Task 1.
- Produces: all current `DialogContent` consumers inherit shared position, safe maximum height, and responsive transform without changing their content styles.

- [ ] **Step 1: Write the failing consumer-audit test**

Create `src/components/ui/__tests__/dialog-consumers.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : []
  })
}

const consumers = tsxFiles(resolve(process.cwd(), 'src'))
  .filter(path => readFileSync(path, 'utf8').includes('<DialogContent'))

describe('dialog consumer layout contract', () => {
  it('does not override shared mobile position, margin, transform, or height', () => {
    for (const path of consumers) {
      const source = readFileSync(path, 'utf8')
      const tags = source.match(/<DialogContent\b[\s\S]*?>/g) ?? []
      expect(tags.length, `No DialogContent found in ${path}`).toBeGreaterThan(0)

      for (const tag of tags) {
        for (const forbidden of [
          'mx-4', 'bottom-0', 'left-0', 'top-auto', 'w-full',
          'max-w-none', 'translate-x-0', 'translate-y-0',
        ]) {
          expect(tag, `${path} overrides ${forbidden}`).not.toContain(forbidden)
        }
        expect(tag, `${path} overrides shared max height`).not.toMatch(/\bmax-h-\[/)
      }
    }
  })
})
```

- [ ] **Step 2: Run the audit and verify RED**

Run:

```powershell
pnpm vitest run src/components/ui/__tests__/dialog-consumers.test.ts
```

Expected: FAIL on the remaining `mx-4`, `max-h-[…]`, and manual bottom-sheet tokens.

- [ ] **Step 3: Remove only the conflicting tokens**

Apply these exact class replacements:

```tsx
// ChatContainer.tsx
<DialogContent className="max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">

// MeasurementsClient.tsx
<DialogContent className="max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">

// PlanWorkoutWorkspace.tsx — workout detail
<DialogContent className="border-border/70 bg-background p-5 lg:hidden">

// PlanWorkoutWorkspace.tsx — discard confirmation
<DialogContent className="max-w-sm rounded-2xl border-border/70">

// ReadinessReviewDialog.tsx
<DialogContent className="max-w-md overflow-y-auto">

// WorkoutAdjustButton.tsx
<DialogContent className="max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">

// WorkoutExerciseManager.tsx — both dialogs
<DialogContent className="max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">

// ExerciseCard.tsx
<DialogContent className="max-w-sm rounded-2xl border-border/70">

// PostImageCropper.tsx
<DialogContent className="max-w-md overflow-y-auto border-border/70 p-0 sm:rounded-2xl">

// ProfileConnectionsStats.tsx
<DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
```

Do not remove width caps, colors, borders, internal overflow choices, padding, or product-specific radius classes.

- [ ] **Step 4: Run the audit and dialog acceptance tests**

Run:

```powershell
pnpm vitest run src/components/ui/__tests__/dialog-consumers.test.ts src/components/ui/__tests__/dialog-layout-contract.test.ts
pnpm playwright test tests/e2e/overlays.spec.ts --project=mobile-375 --project=desktop-1024
```

Expected: all tests pass; no consumer reintroduces fixed position, outer mobile margin, manual transforms, or a conflicting maximum height.

- [ ] **Step 5: Commit the consumer cleanup**

```powershell
git add src/components/chat/ChatContainer.tsx src/components/measurements/MeasurementsClient.tsx src/components/plan/PlanWorkoutWorkspace.tsx src/components/plan/ReadinessReviewDialog.tsx src/components/plan/WorkoutAdjustButton.tsx src/components/plan/WorkoutExerciseManager.tsx src/components/session/ExerciseCard.tsx src/components/social/PostImageCropper.tsx src/components/social/ProfileConnectionsStats.tsx src/components/ui/__tests__/dialog-consumers.test.ts
git commit -m "fix(ui): inherit shared dialog geometry"
```

---

### Task 3: Make toast notifications safe and easy to dismiss

**Files:**
- Create: `src/components/feedback/__tests__/toast-layout-contract.test.ts`
- Modify: `src/components/feedback/ToastProvider.tsx:64-101`

**Interfaces:**
- Consumes: existing `ToastProvider`, `useToast`, Radix toast state, and `--app-safe-area-{top,right,left}`.
- Produces: unchanged `showToast(options: ToastOptions): void`; a safe-area-aware viewport and 44 × 44 px close target.

- [ ] **Step 1: Write the failing toast contract test**

Create `src/components/feedback/__tests__/toast-layout-contract.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const toast = readFileSync(new URL('../ToastProvider.tsx', import.meta.url), 'utf8')

describe('toast layout contract', () => {
  it('positions the viewport below top safe area and inside lateral safe areas', () => {
    expect(toast).toContain('top-[calc(var(--app-safe-area-top)_+_1rem)]')
    expect(toast).toContain('right-[calc(var(--app-safe-area-right)_+_1rem)]')
    expect(toast).toContain(
      'w-[calc(100vw_-_var(--app-safe-area-left)_-_var(--app-safe-area-right)_-_2rem)]',
    )
  })

  it('provides a 44px close target and removes state motion when requested', () => {
    expect(toast).toContain('flex h-11 w-11')
    expect(toast).toContain('motion-reduce:data-[state=open]:animate-none')
    expect(toast).toContain('motion-reduce:data-[state=closed]:animate-none')
    expect(toast).toContain('aria-label="Cerrar notificacion"')
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm vitest run src/components/feedback/__tests__/toast-layout-contract.test.ts
```

Expected: FAIL because the viewport still uses `right-4 top-4`, the close control has no 44 px box, and reduced-motion state classes are absent.

- [ ] **Step 3: Add reduced-motion state overrides to each toast**

Append these tokens to the `ToastPrimitive.Root` class list after the open/closed animation strings:

```tsx
'motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none',
```

- [ ] **Step 4: Enlarge the close target without enlarging its icon**

Replace the toast close class with:

```tsx
<ToastPrimitive.Close
  aria-label="Cerrar notificacion"
  className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
>
  <X className="h-4 w-4" />
</ToastPrimitive.Close>
```

- [ ] **Step 5: Replace fixed offsets with safe-area calculations**

Replace `ToastPrimitive.Viewport` with:

```tsx
<ToastPrimitive.Viewport className="fixed right-[calc(var(--app-safe-area-right)_+_1rem)] top-[calc(var(--app-safe-area-top)_+_1rem)] z-[100] flex w-[calc(100vw_-_var(--app-safe-area-left)_-_var(--app-safe-area-right)_-_2rem)] max-w-sm flex-col gap-2 outline-none" />
```

- [ ] **Step 6: Run the focused toast and dialog tests**

Run:

```powershell
pnpm vitest run src/components/feedback/__tests__/toast-layout-contract.test.ts src/components/ui/__tests__/dialog-layout-contract.test.ts src/components/ui/__tests__/dialog-consumers.test.ts
```

Expected: all three contract suites pass and the `showToast` API remains unchanged.

- [ ] **Step 7: Commit toast safety**

```powershell
git add src/components/feedback/ToastProvider.tsx src/components/feedback/__tests__/toast-layout-contract.test.ts
git commit -m "fix(ui): keep toasts below system bars"
```

---

### Task 4: Run final regression and visual verification

**Files:**
- Verify only; production changes are not expected.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: evidence that unit, type, lint, build, browser geometry, and accessibility checks pass together.

- [ ] **Step 1: Run all Vitest suites**

Run:

```powershell
pnpm test
```

Expected: PASS with no failed Vitest files.

- [ ] **Step 2: Run static verification**

Run:

```powershell
pnpm type-check
pnpm lint
```

Expected: TypeScript reports no errors; ESLint reports no new errors or warnings in changed files.

- [ ] **Step 3: Run mobile and desktop overlay acceptance**

Run:

```powershell
pnpm playwright test tests/e2e/overlays.spec.ts tests/e2e/accessibility.spec.ts --project=mobile-375 --project=desktop-1024
```

Expected: dialog geometry, 44 px targets, keyboard/accessibility audits, and horizontal-overflow checks pass in both projects.

- [ ] **Step 4: Build the production application**

Run:

```powershell
pnpm build
```

Expected: Next.js production build completes successfully.

- [ ] **Step 5: Inspect the final diff and repository state**

Run:

```powershell
git diff --check HEAD~3..HEAD
git status --short --branch
```

Expected: no whitespace errors; only the pre-existing untracked `.superpowers/` directory remains outside the commits.
