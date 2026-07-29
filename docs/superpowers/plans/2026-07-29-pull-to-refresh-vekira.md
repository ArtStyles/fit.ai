# Vekira Pull-to-Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global mobile pull-to-refresh gesture whose Vekira logo slides in, pulses with two violet energy waves, triggers one haptic impact at the threshold, refreshes through `router.refresh()`, and exits without moving the app chrome.

**Architecture:** Keep gesture math in a pure state machine, render the branded indicator through a body portal, and connect both from a focused client hook mounted once by `AppScrollViewport`. React transition state controls completion, with a 600 ms minimum presentation and 10 second fail-safe.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, CSS keyframes, Capacitor Haptics, Vitest, Playwright.

## Global Constraints

- Scope: all routes inside the authenticated Vekira app shell.
- Platforms: Capacitor Android, PWA, and mobile browser.
- Do not mount the gesture for precise pointers or desktop viewports.
- Use the background-free Vekira SVG mark.
- Use the approved “Pulso de energía” motion; the mark must never rotate.
- Activate at 72 px of raw vertical pull distance.
- Refresh with `router.refresh()` inside a React transition; never call `window.location.reload()`.
- Trigger exactly one `hapticImpact('medium')` on the first threshold crossing in each gesture.
- Keep the refreshing state visible for at least 600 ms and reset after 10 seconds if the transition stalls.
- Respect safe areas and `prefers-reduced-motion`.
- Do not move or deform fixed app chrome.
- Add no dependencies.

## File Structure

New files:

- `src/components/navigation/pull-to-refresh.logic.ts` — pure gesture state, resistance, threshold, cancellation, and release behavior.
- `src/components/navigation/PullToRefreshIndicator.tsx` — portal and branded SVG presentation.
- `src/components/navigation/usePullToRefresh.ts` — mobile touch listeners, haptic boundary, React transition, and timing lifecycle.
- `src/components/navigation/__tests__/pull-to-refresh.logic.test.ts` — state-machine behavior.
- `src/components/navigation/__tests__/PullToRefreshIndicator.test.tsx` — rendered accessibility and visual contract.
- `tests/e2e/pull-to-refresh.spec.ts` — real mobile gesture, RSC refresh, haptic boundary, and fixed-chrome geometry.

Modified files:

- `src/components/navigation/AppScrollViewport.tsx` — mount the one global controller and indicator.
- `src/lib/i18n/index.ts` — add the English translation for the live status.
- `src/lib/i18n/__tests__/i18n.test.ts` — verify the new translation.
- `src/styles/globals.css` — indicator positioning, pulse, waves, exit, and reduced-motion rules.
- `playwright.config.ts` — make the mobile project expose a real coarse touch pointer.

---

### Task 1: Pure Gesture State Machine

**Files:**

- Create: `src/components/navigation/pull-to-refresh.logic.ts`
- Create: `src/components/navigation/__tests__/pull-to-refresh.logic.test.ts`

**Interfaces:**

- Consumes: literal touch points `{ x: number; y: number }`.
- Produces: `PullGestureState`, `PullToRefreshPhase`, `beginPull`, `updatePull`, `releasePull`, `cancelPull`, `resetPull`, and `pullProgress`.
- Later tasks rely on `PULL_ACTIVATE_DISTANCE = 72`, the `thresholdAnnounced` latch, and `releasePull(...).shouldRefresh`.

- [ ] **Step 1: Write the failing state-machine tests**

Create `src/components/navigation/__tests__/pull-to-refresh.logic.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  beginPull,
  cancelPull,
  pullProgress,
  releasePull,
  resetPull,
  shouldStartPull,
  updatePull,
} from '../pull-to-refresh.logic'

describe('pull-to-refresh gesture', () => {
  it('arms exactly at 72 raw vertical pixels with resisted visual travel', () => {
    const started = beginPull({ x: 120, y: 100 })
    const below = updatePull(started, { x: 120, y: 171 })
    const armed = updatePull(below, { x: 120, y: 172 })

    expect(below.phase).toBe('pulling')
    expect(below.rawDistance).toBe(71)
    expect(armed.phase).toBe('armed')
    expect(armed.rawDistance).toBe(72)
    expect(armed.visualDistance).toBeCloseTo(41.76, 2)
    expect(pullProgress(armed)).toBe(1)
  })

  it('adds stronger resistance beyond the threshold and caps visual travel', () => {
    const started = beginPull({ x: 100, y: 100 })
    const beyond = updatePull(started, { x: 100, y: 192 })
    const extreme = updatePull(beyond, { x: 100, y: 2_000 })

    expect(beyond.visualDistance).toBeCloseTo(45.76, 2)
    expect(extreme.visualDistance).toBe(112)
  })

  it('cancels a gesture when horizontal travel dominates', () => {
    const started = beginPull({ x: 100, y: 100 })
    const cancelled = updatePull(started, { x: 151, y: 120 })

    expect(cancelled.phase).toBe('settling')
    expect(cancelled.rawDistance).toBe(0)
    expect(cancelled.visualDistance).toBe(0)
  })

  it('does not refresh when released before the threshold', () => {
    const pulling = updatePull(
      beginPull({ x: 100, y: 100 }),
      { x: 100, y: 160 },
    )
    const released = releasePull(pulling)

    expect(released.shouldRefresh).toBe(false)
    expect(released.state.phase).toBe('settling')
  })

  it('refreshes once released from the armed state', () => {
    const armed = updatePull(
      beginPull({ x: 100, y: 100 }),
      { x: 100, y: 180 },
    )
    const released = releasePull(armed)

    expect(released.shouldRefresh).toBe(true)
    expect(released.state.phase).toBe('refreshing')
  })

  it('latches the first threshold crossing for one haptic per gesture', () => {
    const started = beginPull({ x: 100, y: 100 })
    const firstCrossing = updatePull(started, { x: 100, y: 180 })
    const backedOff = updatePull(firstCrossing, { x: 100, y: 150 })
    const crossedAgain = updatePull(backedOff, { x: 100, y: 185 })

    expect(firstCrossing.thresholdAnnounced).toBe(true)
    expect(backedOff.phase).toBe('pulling')
    expect(backedOff.thresholdAnnounced).toBe(true)
    expect(crossedAgain.thresholdAnnounced).toBe(true)
  })

  it('cancels and resets to a reusable idle state', () => {
    const pulling = updatePull(
      beginPull({ x: 100, y: 100 }),
      { x: 100, y: 150 },
    )

    expect(cancelPull(pulling).phase).toBe('settling')
    expect(resetPull()).toEqual({
      phase: 'idle',
      startX: null,
      startY: null,
      rawDistance: 0,
      visualDistance: 0,
      thresholdAnnounced: false,
    })
  })

  it('only starts for one touch at the top on an enabled mobile surface', () => {
    const valid = {
      enabled: true,
      scrollTop: 0,
      touchCount: 1,
      disabledTarget: false,
    }

    expect(shouldStartPull(valid)).toBe(true)
    expect(shouldStartPull({ ...valid, enabled: false })).toBe(false)
    expect(shouldStartPull({ ...valid, scrollTop: 1 })).toBe(false)
    expect(shouldStartPull({ ...valid, touchCount: 2 })).toBe(false)
    expect(shouldStartPull({ ...valid, disabledTarget: true })).toBe(false)
  })
})
```

The production mutations these tests catch are: a wrong threshold, linear/no resistance,
missing cap, horizontal capture, early refresh, missing refresh, repeated haptic arming,
stale gesture state, or activation away from the top/on an ineligible surface.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
pnpm test src/components/navigation/__tests__/pull-to-refresh.logic.test.ts
```

Expected: FAIL because `../pull-to-refresh.logic` does not exist.

- [ ] **Step 3: Implement the minimal pure state machine**

Create `src/components/navigation/pull-to-refresh.logic.ts`:

```ts
export const PULL_ACTIVATE_DISTANCE = 72
export const PULL_MAX_DISTANCE = 112

const PRE_THRESHOLD_RESISTANCE = 0.58
const POST_THRESHOLD_RESISTANCE = 0.2

export type PullToRefreshPhase =
  | 'idle'
  | 'pulling'
  | 'armed'
  | 'refreshing'
  | 'settling'

export type PullPoint = {
  x: number
  y: number
}

export type PullGestureState = {
  phase: PullToRefreshPhase
  startX: number | null
  startY: number | null
  rawDistance: number
  visualDistance: number
  thresholdAnnounced: boolean
}

export type PullStartContext = {
  enabled: boolean
  scrollTop: number
  touchCount: number
  disabledTarget: boolean
}

export function shouldStartPull(context: PullStartContext): boolean {
  return context.enabled
    && context.scrollTop <= 0
    && context.touchCount === 1
    && !context.disabledTarget
}

export function resetPull(): PullGestureState {
  return {
    phase: 'idle',
    startX: null,
    startY: null,
    rawDistance: 0,
    visualDistance: 0,
    thresholdAnnounced: false,
  }
}

export function beginPull(point: PullPoint): PullGestureState {
  return {
    ...resetPull(),
    phase: 'pulling',
    startX: point.x,
    startY: point.y,
  }
}

function resistedDistance(rawDistance: number): number {
  const thresholdDistance = PULL_ACTIVATE_DISTANCE * PRE_THRESHOLD_RESISTANCE
  const resisted = rawDistance <= PULL_ACTIVATE_DISTANCE
    ? rawDistance * PRE_THRESHOLD_RESISTANCE
    : thresholdDistance
      + (rawDistance - PULL_ACTIVATE_DISTANCE) * POST_THRESHOLD_RESISTANCE

  return Math.min(PULL_MAX_DISTANCE, resisted)
}

export function cancelPull(state: PullGestureState): PullGestureState {
  return {
    ...state,
    phase: 'settling',
    startX: null,
    startY: null,
    rawDistance: 0,
    visualDistance: 0,
  }
}

export function updatePull(
  state: PullGestureState,
  point: PullPoint,
): PullGestureState {
  if (state.startX === null || state.startY === null) return state

  const deltaX = point.x - state.startX
  const deltaY = point.y - state.startY

  if (Math.abs(deltaX) > Math.abs(deltaY)) return cancelPull(state)

  const rawDistance = Math.max(0, deltaY)
  const armed = rawDistance >= PULL_ACTIVATE_DISTANCE

  return {
    ...state,
    phase: armed ? 'armed' : 'pulling',
    rawDistance,
    visualDistance: resistedDistance(rawDistance),
    thresholdAnnounced: state.thresholdAnnounced || armed,
  }
}

export function releasePull(state: PullGestureState): {
  state: PullGestureState
  shouldRefresh: boolean
} {
  if (state.phase === 'armed') {
    return {
      shouldRefresh: true,
      state: {
        ...state,
        phase: 'refreshing',
        startX: null,
        startY: null,
      },
    }
  }

  return {
    shouldRefresh: false,
    state: cancelPull(state),
  }
}

export function pullProgress(state: PullGestureState): number {
  return Math.min(1, state.rawDistance / PULL_ACTIVATE_DISTANCE)
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
pnpm test src/components/navigation/__tests__/pull-to-refresh.logic.test.ts
```

Expected: 8 tests PASS with no warnings.

- [ ] **Step 5: Run type-check and commit**

Run:

```powershell
pnpm type-check
git add -- src/components/navigation/pull-to-refresh.logic.ts src/components/navigation/__tests__/pull-to-refresh.logic.test.ts
git commit -m "feat(navigation): add pull gesture state machine"
```

Expected: type-check passes and the commit contains only the state machine and its tests.

---

### Task 2: Branded Energy-Pulse Indicator

**Files:**

- Create: `src/components/navigation/PullToRefreshIndicator.tsx`
- Create: `src/components/navigation/__tests__/PullToRefreshIndicator.test.tsx`
- Modify: `src/lib/i18n/index.ts`
- Modify: `src/lib/i18n/__tests__/i18n.test.ts`
- Modify: `src/styles/globals.css`

**Interfaces:**

- Consumes: `PullToRefreshPhase`, normalized progress, resisted visual distance, and the reduced-motion preference.
- Produces: `PullToRefreshIndicator` for the body portal and `PullToRefreshIndicatorContent` for real server-rendered behavior tests.
- The visual root exposes `data-pull-refresh-phase="<phase>"` for end-to-end observation.

- [ ] **Step 1: Write the failing rendered-component and translation tests**

Create `src/components/navigation/__tests__/PullToRefreshIndicator.test.tsx`:

```tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { PullToRefreshIndicatorContent } from '../PullToRefreshIndicator'

function renderIndicator(reducedMotion = false, completionPulse = false) {
  return renderToStaticMarkup(
    <I18nProvider language="en" syncDocumentLanguage={false}>
      <PullToRefreshIndicatorContent
        phase="refreshing"
        progress={1}
        visualDistance={45.76}
        reducedMotion={reducedMotion}
        completionPulse={completionPulse}
      />
    </I18nProvider>,
  )
}

describe('PullToRefreshIndicatorContent', () => {
  it('renders the Vekira mark, two energy waves, and an accessible refresh status', () => {
    const html = renderIndicator()

    expect(html).toContain('data-pull-refresh-phase="refreshing"')
    expect(html).toContain('role="status"')
    expect(html).toContain('Updating content')
    expect(html).toContain('M86 86h82l126 352h-84L86 86Z')
    expect(html).toContain('m308 438-78-138')
    expect(html.match(/<span class="vekira-ptr-wave/g)).toHaveLength(2)
    expect(html).not.toContain('animate-spin')
    expect(html).not.toContain('rotate(')
  })

  it('exposes reduced motion to the CSS contract', () => {
    expect(renderIndicator(true)).toContain('data-reduced-motion="true"')
  })

  it('marks a completed refresh for the final visual heartbeat', () => {
    expect(renderIndicator(false, true)).toContain('data-completion-pulse="true"')
  })
})
```

Add this assertion to the existing English translation test in
`src/lib/i18n/__tests__/i18n.test.ts`:

```ts
expect(translate('en', 'Actualizando contenido')).toBe('Updating content')
```

The production mutations these tests catch are: losing the Vekira mark, rendering the
wrong number of waves, removing the live status, falling back to Spanish in English,
adding a spinner/rotation, or ignoring reduced motion.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
pnpm test src/components/navigation/__tests__/PullToRefreshIndicator.test.tsx src/lib/i18n/__tests__/i18n.test.ts
```

Expected: FAIL because the indicator export and English translation do not exist.

- [ ] **Step 3: Add the translation and indicator component**

Add this entry near the loading copy in the `ENGLISH` map in
`src/lib/i18n/index.ts`:

```ts
'Actualizando contenido': 'Updating content',
```

Create `src/components/navigation/PullToRefreshIndicator.tsx`:

```tsx
'use client'

import {
  useEffect,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { PullToRefreshPhase } from './pull-to-refresh.logic'

export type PullToRefreshIndicatorProps = {
  phase: PullToRefreshPhase
  progress: number
  visualDistance: number
  reducedMotion: boolean
  completionPulse: boolean
}

type IndicatorStyle = CSSProperties & {
  '--ptr-progress': string
  '--ptr-distance': string
  '--ptr-scale': string
}

export function PullToRefreshIndicatorContent({
  phase,
  progress,
  visualDistance,
  reducedMotion,
  completionPulse,
}: PullToRefreshIndicatorProps) {
  const { t } = useI18n()

  if (phase === 'idle') return null

  const style: IndicatorStyle = {
    '--ptr-progress': String(progress),
    '--ptr-distance': `${visualDistance}px`,
    '--ptr-scale': String(0.74 + progress * 0.26),
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-pull-refresh-phase={phase}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-completion-pulse={completionPulse ? 'true' : 'false'}
      className="vekira-ptr-indicator"
      style={style}
    >
      <div className="vekira-ptr-energy" aria-hidden="true">
        <span className="vekira-ptr-wave" />
        <span className="vekira-ptr-wave vekira-ptr-wave-delay" />
        <svg
          viewBox="0 0 512 512"
          className="vekira-ptr-mark"
          focusable="false"
        >
          <defs>
            <linearGradient
              id="vekira-ptr-gradient"
              x1="90"
              y1="70"
              x2="415"
              y2="450"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#ddd6fe" />
              <stop offset=".48" stopColor="#a78bfa" />
              <stop offset="1" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
          <path d="M86 86h82l126 352h-84L86 86Z" fill="url(#vekira-ptr-gradient)" />
          <path
            d="m308 438-78-138 85-108-38-27 162-76-12 178-42-30-72 82 67 119h-72Z"
            fill="url(#vekira-ptr-gradient)"
          />
        </svg>
      </div>
      <span className="sr-only">
        {phase === 'refreshing' ? t('Actualizando contenido') : ''}
      </span>
    </div>
  )
}

export function PullToRefreshIndicator(props: PullToRefreshIndicatorProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setPortalTarget(document.body)
  }, [])

  if (!portalTarget) return null
  return createPortal(<PullToRefreshIndicatorContent {...props} />, portalTarget)
}
```

- [ ] **Step 4: Add the approved pulse, waves, slide, and reduced-motion CSS**

Append the following rules inside `@layer utilities` in `src/styles/globals.css`:

```css
  .vekira-ptr-indicator {
    pointer-events: none;
    position: fixed;
    left: 50%;
    top: var(--app-safe-area-top);
    z-index: 80;
    display: grid;
    height: 2.75rem;
    width: 2.75rem;
    place-items: center;
    opacity: clamp(0, var(--ptr-progress), 1);
    transform: translate3d(
      -50%,
      calc(-1.75rem + var(--ptr-distance)),
      0
    );
    will-change: transform, opacity;
  }

  .vekira-ptr-energy {
    position: relative;
    display: grid;
    height: 2.5rem;
    width: 2.5rem;
    place-items: center;
  }

  .vekira-ptr-mark {
    position: relative;
    z-index: 1;
    height: 2rem;
    width: 2rem;
    filter: drop-shadow(0 0.35rem 0.7rem rgb(109 40 217 / 0.38));
    transform: scale(var(--ptr-scale));
    transform-origin: center;
  }

  .vekira-ptr-wave {
    position: absolute;
    inset: 0.2rem;
    border: 1px solid rgb(167 139 250 / 0.58);
    border-radius: 9999px;
    opacity: 0;
  }

  .vekira-ptr-indicator[data-pull-refresh-phase="armed"] {
    animation: vekira-ptr-catch 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .vekira-ptr-indicator[data-pull-refresh-phase="armed"] .vekira-ptr-mark {
    animation: vekira-ptr-heartbeat 420ms ease-out both;
  }

  .vekira-ptr-indicator[data-pull-refresh-phase="armed"] .vekira-ptr-wave {
    animation: vekira-ptr-wave 620ms ease-out both;
  }

  .vekira-ptr-indicator[data-pull-refresh-phase="armed"] .vekira-ptr-wave-delay {
    animation-delay: 160ms;
  }

  .vekira-ptr-indicator[data-pull-refresh-phase="refreshing"] {
    opacity: 1;
  }

  .vekira-ptr-indicator[data-pull-refresh-phase="refreshing"] .vekira-ptr-mark {
    animation: vekira-ptr-loading-pulse 900ms ease-in-out infinite;
  }

  .vekira-ptr-indicator[data-pull-refresh-phase="settling"] {
    opacity: 0;
    transition: opacity 220ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .vekira-ptr-indicator[data-pull-refresh-phase="settling"][data-completion-pulse="true"] .vekira-ptr-mark {
    animation: vekira-ptr-heartbeat 300ms ease-out both;
  }
```

Append these keyframes after the existing keyframes in `src/styles/globals.css`:

```css
@keyframes vekira-ptr-catch {
  0% { transform: translate3d(-50%, calc(-1.75rem + var(--ptr-distance)), 0); }
  48% { transform: translate3d(-50%, calc(-1.5rem + var(--ptr-distance)), 0); }
  100% { transform: translate3d(-50%, calc(-1.75rem + var(--ptr-distance)), 0); }
}

@keyframes vekira-ptr-heartbeat {
  0% { transform: scale(1); }
  38% { transform: scale(1.13); }
  66% { transform: scale(0.97); }
  100% { transform: scale(1); }
}

@keyframes vekira-ptr-wave {
  0% { opacity: 0; transform: scale(0.55); }
  20% { opacity: 0.72; }
  100% { opacity: 0; transform: scale(1.45); }
}

@keyframes vekira-ptr-loading-pulse {
  0%, 100% { transform: scale(0.97); }
  50% { transform: scale(1.03); }
}
```

Extend the existing reduced-motion handling or add:

```css
@media (prefers-reduced-motion: reduce) {
  .vekira-ptr-indicator,
  .vekira-ptr-mark,
  .vekira-ptr-wave {
    animation: none !important;
    transition-duration: 120ms !important;
  }

  .vekira-ptr-wave {
    display: none;
  }
}

.vekira-ptr-indicator[data-reduced-motion="true"] .vekira-ptr-mark,
.vekira-ptr-indicator[data-reduced-motion="true"] .vekira-ptr-wave {
  animation: none !important;
}

.vekira-ptr-indicator[data-reduced-motion="true"] .vekira-ptr-wave {
  display: none;
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
pnpm test src/components/navigation/__tests__/PullToRefreshIndicator.test.tsx src/lib/i18n/__tests__/i18n.test.ts
pnpm type-check
```

Expected: component and translation tests pass; TypeScript reports no errors.

- [ ] **Step 6: Commit the indicator**

Run:

```powershell
git add -- src/components/navigation/PullToRefreshIndicator.tsx src/components/navigation/__tests__/PullToRefreshIndicator.test.tsx src/lib/i18n/index.ts src/lib/i18n/__tests__/i18n.test.ts src/styles/globals.css
git commit -m "feat(navigation): add Vekira refresh pulse"
```

Expected: the commit contains the portal, SVG mark, two-wave pulse, localization, CSS, and real rendered tests.

---

### Task 3: Global Touch Controller and Mobile Integration

**Files:**

- Create: `src/components/navigation/usePullToRefresh.ts`
- Create: `tests/e2e/pull-to-refresh.spec.ts`
- Modify: `src/components/navigation/AppScrollViewport.tsx`
- Modify: `playwright.config.ts`

**Interfaces:**

- Consumes: `RefObject<HTMLDivElement>` for the one app scroll viewport.
- Produces: `{ phase, progress, visualDistance, reducedMotion, completionPulse }`.
- Calls: `hapticImpact('medium')` once when `thresholdAnnounced` changes from false to true.
- Calls: `router.refresh()` once when `releasePull(...).shouldRefresh` is true.
- Completes: after React transition completion plus the 600 ms minimum, or at the 10 second fail-safe.

- [ ] **Step 1: Give the mobile Playwright project a real coarse touch pointer**

Change the `mobile-375` project in `playwright.config.ts` to:

```ts
{
  name: 'mobile-375',
  use: {
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  },
},
```

Leave tablet and desktop project definitions unchanged.

- [ ] **Step 2: Write the failing end-to-end gesture test**

Create `tests/e2e/pull-to-refresh.spec.ts`:

```ts
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAsE2EUser } from './helpers/auth'

async function dragDown(page: Page, viewport: Locator, distance: number) {
  const selector = '[data-app-scroll-viewport]'
  await expect(viewport).toBeVisible()

  await page.evaluate(async ({ selector, distance }) => {
    const target = document.querySelector(selector)
    if (!(target instanceof HTMLElement)) throw new Error('App viewport not found')

    const fire = (type: 'touchstart' | 'touchmove' | 'touchend', y: number) => {
      const touch = new Touch({
        identifier: 1,
        target,
        clientX: 180,
        clientY: y,
        pageX: 180,
        pageY: y,
        radiusX: 2,
        radiusY: 2,
        force: 0.5,
      })
      const activeTouches = type === 'touchend' ? [] : [touch]
      target.dispatchEvent(new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: activeTouches,
        targetTouches: activeTouches,
        changedTouches: [touch],
      }))
    }

    fire('touchstart', 80)
    await new Promise(resolve => setTimeout(resolve, 20))
    fire('touchmove', 80 + distance / 2)
    await new Promise(resolve => setTimeout(resolve, 20))
    fire('touchmove', 80 + distance)
    await new Promise(resolve => setTimeout(resolve, 20))
    fire('touchend', 80 + distance)
  }, { selector, distance })
}

test('pull-to-refresh only activates beyond the threshold and keeps chrome fixed', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375')

  await page.addInitScript(() => {
    const vibrations: Array<number | number[]> = []
    Object.defineProperty(window, '__vekiraTestVibrations', {
      configurable: true,
      value: vibrations,
    })
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: number | number[]) => {
        vibrations.push(pattern)
        return true
      },
    })
  })

  await signInAsE2EUser(page)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.locator('h1')).toHaveCount(1, { timeout: 30_000 })
  await page.waitForLoadState('networkidle')

  const viewport = page.locator('[data-app-scroll-viewport]')
  await viewport.evaluate(element => { element.scrollTop = 0 })

  const header = page.locator('header').first()
  const before = await header.boundingBox()
  if (!before) throw new Error('Fixed header geometry is unavailable')

  const refreshRequests: string[] = []
  page.on('request', request => {
    const url = new URL(request.url())
    const isCurrentRscRefresh = url.pathname === '/dashboard'
      && url.searchParams.has('_rsc')
      && request.headers()['next-router-prefetch'] !== '1'
    if (isCurrentRscRefresh) refreshRequests.push(request.url())
  })

  await dragDown(page, viewport, 48)
  await page.waitForTimeout(750)
  expect(refreshRequests).toHaveLength(0)
  expect(await page.evaluate(() => (
    (window as typeof window & {
      __vekiraTestVibrations: Array<number | number[]>
    }).__vekiraTestVibrations
  ))).toEqual([])

  const refreshStartedAt = Date.now()
  await dragDown(page, viewport, 96)
  await expect(page.locator('[data-pull-refresh-phase="refreshing"]')).toBeVisible()
  await expect.poll(() => refreshRequests.length).toBe(1)
  expect(await page.evaluate(() => (
    (window as typeof window & {
      __vekiraTestVibrations: Array<number | number[]>
    }).__vekiraTestVibrations
  ))).toEqual([40])

  await expect(page.locator('[data-pull-refresh-phase]')).toHaveCount(0, {
    timeout: 3_000,
  })
  expect(Date.now() - refreshStartedAt).toBeGreaterThanOrEqual(600)
  await page.waitForTimeout(500)
  expect(refreshRequests).toHaveLength(1)

  const after = await header.boundingBox()
  if (!after) throw new Error('Fixed header geometry is unavailable after refresh')
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1)
})

test('a stalled refresh releases the indicator through the ten-second fail-safe', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375')

  await signInAsE2EUser(page)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.route('**/dashboard?*', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.has('_rsc')) {
      await new Promise(resolve => setTimeout(resolve, 11_000))
      await route.abort()
      return
    }
    await route.continue()
  })

  const viewport = page.locator('[data-app-scroll-viewport]')
  await viewport.evaluate(element => { element.scrollTop = 0 })
  await dragDown(page, viewport, 96)

  await expect(page.locator('[data-pull-refresh-phase="refreshing"]')).toBeVisible()
  await expect(page.locator('[data-pull-refresh-phase]')).toHaveCount(0, {
    timeout: 12_000,
  })
})
```

This test mocks only the unavailable hardware vibration boundary. It exercises the real
touch listener, state machine, haptic adapter, Next.js RSC request, indicator, timers, and
fixed header.

- [ ] **Step 3: Run the end-to-end test and verify RED**

Run from a terminal with the repository’s existing E2E account variables:

```powershell
pnpm exec playwright test tests/e2e/pull-to-refresh.spec.ts --project=mobile-375
```

Expected: FAIL because a 96 px pull produces neither
`[data-pull-refresh-phase="refreshing"]` nor a current-route RSC refresh.

- [ ] **Step 4: Implement the touch and refresh lifecycle hook**

Create `src/components/navigation/usePullToRefresh.ts`:

```ts
'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { hapticImpact } from '@/lib/native/haptics'
import {
  beginPull,
  cancelPull,
  pullProgress,
  releasePull,
  resetPull,
  shouldStartPull,
  updatePull,
  type PullGestureState,
} from './pull-to-refresh.logic'

const MIN_REFRESH_MS = 600
const REFRESH_FAIL_SAFE_MS = 10_000
const SETTLE_MS = 220
const DISABLED_TARGETS =
  'input, textarea, select, [contenteditable="true"], [data-pull-refresh-disabled]'

function isDisabledTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(DISABLED_TARGETS))
}

export function usePullToRefresh(viewportRef: RefObject<HTMLDivElement>) {
  const router = useRouter()
  const pathname = usePathname()
  const [transitionPending, startTransition] = useTransition()
  const [gesture, setGesture] = useState<PullGestureState>(() => resetPull())
  const [enabled, setEnabled] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [completionPulse, setCompletionPulse] = useState(false)

  const gestureRef = useRef(gesture)
  const refreshStartedAtRef = useRef(0)
  const sawPendingRef = useRef(false)
  const completionTimerRef = useRef<number | null>(null)
  const failSafeTimerRef = useRef<number | null>(null)
  const settleTimerRef = useRef<number | null>(null)

  const commit = useCallback((next: PullGestureState) => {
    gestureRef.current = next
    setGesture(next)
  }, [])

  const clearTimers = useCallback(() => {
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
    if (failSafeTimerRef.current !== null) {
      window.clearTimeout(failSafeTimerRef.current)
      failSafeTimerRef.current = null
    }
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    clearTimers()
    sawPendingRef.current = false
    setCompletionPulse(false)
    commit(resetPull())
  }, [clearTimers, commit])

  const settle = useCallback((completed = false) => {
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
    if (failSafeTimerRef.current !== null) {
      window.clearTimeout(failSafeTimerRef.current)
      failSafeTimerRef.current = null
    }

    setCompletionPulse(completed)
    commit(cancelPull(gestureRef.current))
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current)
    }
    settleTimerRef.current = window.setTimeout(() => {
      commit(resetPull())
      settleTimerRef.current = null
    }, SETTLE_MS)
  }, [commit])

  const triggerRefresh = useCallback(() => {
    refreshStartedAtRef.current = performance.now()
    sawPendingRef.current = false
    failSafeTimerRef.current = window.setTimeout(
      () => settle(false),
      REFRESH_FAIL_SAFE_MS,
    )
    startTransition(() => {
      router.refresh()
    })
  }, [router, settle])

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 1023px) and (pointer: coarse)')
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      setEnabled(mobileQuery.matches)
      setReducedMotion(motionQuery.matches)
    }

    sync()
    mobileQuery.addEventListener('change', sync)
    motionQuery.addEventListener('change', sync)
    return () => {
      mobileQuery.removeEventListener('change', sync)
      motionQuery.removeEventListener('change', sync)
    }
  }, [])

  useEffect(() => {
    if (transitionPending) {
      sawPendingRef.current = true
      return
    }
    if (gesture.phase !== 'refreshing' || !sawPendingRef.current) return

    const elapsed = performance.now() - refreshStartedAtRef.current
    completionTimerRef.current = window.setTimeout(
      () => settle(true),
      Math.max(0, MIN_REFRESH_MS - elapsed),
    )
    return () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current)
        completionTimerRef.current = null
      }
    }
  }, [gesture.phase, settle, transitionPending])

  useEffect(() => {
    reset()
  }, [pathname, reset])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const scheduleIdle = () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current)
      }
      settleTimerRef.current = window.setTimeout(() => {
        commit(resetPull())
        settleTimerRef.current = null
      }, SETTLE_MS)
    }

    const handleTouchStart = (event: TouchEvent) => {
      const phase = gestureRef.current.phase
      if (phase === 'refreshing' || phase === 'settling') return
      if (!shouldStartPull({
        enabled,
        scrollTop: viewport.scrollTop,
        touchCount: event.touches.length,
        disabledTarget: isDisabledTarget(event.target),
      })) return

      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current)
        settleTimerRef.current = null
      }
      setCompletionPulse(false)
      const touch = event.touches[0]
      commit(beginPull({ x: touch.clientX, y: touch.clientY }))
    }

    const handleTouchMove = (event: TouchEvent) => {
      const current = gestureRef.current
      if (current.phase !== 'pulling' && current.phase !== 'armed') return
      if (event.touches.length !== 1) {
        commit(cancelPull(current))
        scheduleIdle()
        return
      }

      const touch = event.touches[0]
      const next = updatePull(current, { x: touch.clientX, y: touch.clientY })

      if (next.phase === 'settling') {
        commit(next)
        scheduleIdle()
        return
      }
      if (next.rawDistance > 0) event.preventDefault()
      if (!current.thresholdAnnounced && next.thresholdAnnounced) {
        void hapticImpact('medium')
      }
      commit(next)
    }

    const handleTouchEnd = () => {
      const current = gestureRef.current
      if (current.phase !== 'pulling' && current.phase !== 'armed') return

      const released = releasePull(current)
      commit(released.state)
      if (released.shouldRefresh) triggerRefresh()
      else scheduleIdle()
    }

    const handleTouchCancel = () => {
      const current = gestureRef.current
      if (current.phase !== 'pulling' && current.phase !== 'armed') return
      commit(cancelPull(current))
      scheduleIdle()
    }

    viewport.addEventListener('touchstart', handleTouchStart, { passive: true })
    viewport.addEventListener('touchmove', handleTouchMove, { passive: false })
    viewport.addEventListener('touchend', handleTouchEnd, { passive: true })
    viewport.addEventListener('touchcancel', handleTouchCancel, { passive: true })
    return () => {
      viewport.removeEventListener('touchstart', handleTouchStart)
      viewport.removeEventListener('touchmove', handleTouchMove)
      viewport.removeEventListener('touchend', handleTouchEnd)
      viewport.removeEventListener('touchcancel', handleTouchCancel)
    }
  }, [commit, enabled, triggerRefresh, viewportRef])

  useEffect(() => clearTimers, [clearTimers])

  return {
    phase: gesture.phase,
    progress: pullProgress(gesture),
    visualDistance: gesture.visualDistance,
    reducedMotion,
    completionPulse,
  }
}
```

- [ ] **Step 5: Mount the controller once in the authenticated scroll shell**

Replace `src/components/navigation/AppScrollViewport.tsx` with:

```tsx
'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { PullToRefreshIndicator } from './PullToRefreshIndicator'
import { usePullToRefresh } from './usePullToRefresh'

interface AppScrollViewportProps {
  children: ReactNode
}

/**
 * The document itself must not be the app's scroll surface. Android's native
 * stretch overscroll is applied to the whole WebView when the root scrolls,
 * which also deforms fixed chrome. Keeping scroll here limits that effect to
 * page content while the top and bottom bars remain outside this element.
 */
export function AppScrollViewport({ children }: AppScrollViewportProps) {
  const pathname = usePathname()
  const viewportRef = useRef<HTMLDivElement>(null)
  const pullToRefresh = usePullToRefresh(viewportRef)

  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  return (
    <>
      <div
        id="app-main-content"
        tabIndex={-1}
        ref={viewportRef}
        className="fitai-safe-content-bottom min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-none"
        data-app-scroll-viewport
      >
        {children}
      </div>
      <PullToRefreshIndicator {...pullToRefresh} />
    </>
  )
}
```

The portal keeps the indicator above `FixedTopBar`, whose content is also portaled to
`document.body`. The viewport and fixed bars remain geometrically unchanged.

- [ ] **Step 6: Run the focused unit and E2E tests and verify GREEN**

Run:

```powershell
pnpm test src/components/navigation/__tests__/pull-to-refresh.logic.test.ts src/components/navigation/__tests__/PullToRefreshIndicator.test.tsx src/lib/i18n/__tests__/i18n.test.ts
pnpm exec playwright test tests/e2e/pull-to-refresh.spec.ts --project=mobile-375
```

Expected:

- all focused Vitest tests pass;
- a 48 px pull produces no RSC refresh and no vibration;
- a 96 px pull produces one RSC refresh and one 40 ms web vibration;
- the indicator remains visible through the minimum presentation and exits;
- fixed header geometry remains within 1 px.

- [ ] **Step 7: Run the complete automated verification**

Run:

```powershell
pnpm test
pnpm type-check
pnpm lint
pnpm build
```

Expected: all commands exit 0 with no new warning or error attributable to the feature.

- [ ] **Step 8: Validate the real native feel**

Run the existing Capacitor application on the Android test device and check:

1. Pull less than the threshold on Dashboard: the mark follows the finger and exits without refreshing.
2. Pull past the threshold: one medium haptic coincides with the first logo heartbeat.
3. Hold after crossing: the haptic does not repeat.
4. Release: two violet waves appear and the mark pulses while refreshing.
5. Repeat on Plan, Progress, Community, Settings, and an active Session.
6. Pull on an input or textarea: the refresh gesture does not capture the control.
7. Start a horizontal gesture: it does not arm pull-to-refresh.
8. Enable Android “Remove animations”: waves and heartbeat disappear.
9. Verify the top and bottom bars never stretch or shift.

Expected: every check matches the approved design and no route needs route-specific code.

- [ ] **Step 9: Commit the global integration**

Run:

```powershell
git add -- src/components/navigation/usePullToRefresh.ts src/components/navigation/AppScrollViewport.tsx tests/e2e/pull-to-refresh.spec.ts playwright.config.ts
git commit -m "feat(navigation): enable global mobile pull refresh"
```

Expected: the final feature commit contains the controller, global mount, touch-device
test configuration, and real end-to-end behavior test.

---

## Final Review Checklist

- [ ] Every new non-trivial function is protected by a test that was observed failing first.
- [ ] The 72 px boundary is tested at both 71 px and 72 px.
- [ ] The mark contains no rotation transform or spinning class.
- [ ] Exactly two energy-wave elements render.
- [ ] The haptic occurs once per gesture and only at the threshold.
- [ ] Sub-threshold release never calls `router.refresh()`.
- [ ] Armed release calls `router.refresh()` once.
- [ ] Refresh presentation lasts at least 600 ms.
- [ ] The 10 second fail-safe clears a stalled indicator.
- [ ] Editable controls, multitouch, and horizontal movement do not arm the gesture.
- [ ] Desktop precise pointers do not enable the gesture.
- [ ] `prefers-reduced-motion` removes pulse and wave animation.
- [ ] Fixed top and bottom chrome remain geometrically stable.
- [ ] `pnpm test`, `pnpm type-check`, `pnpm lint`, and `pnpm build` pass.
- [ ] Native Android haptics and safe-area placement are manually accepted.
