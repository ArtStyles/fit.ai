# Notifications Minimal Swipe Dismiss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the notifications route and persistently dismiss the current plan-update notice with a mobile swipe gesture.

**Architecture:** Store user-owned attention dismissal keys in Supabase, derive the current plan notice key from plan id plus `updated_at`, and exclude only that exact version during attention selection. Render the AI plan notice through a focused swipeable client component with optimistic rollback while keeping product notification history independent.

**Tech Stack:** Next.js 14, React 18, TypeScript, Supabase/PostgreSQL RLS, Framer Motion, Tailwind CSS, Vitest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-20-notifications-minimal-swipe-dismiss-design.md`

## Global Constraints

- Remove the "Centro personal" summary and the redundant priority headings.
- Dismissal is permanent only for the exact active plan version and reappears for a newer `updated_at`.
- Swipe left is the primary mobile interaction; keyboard and assistive technology retain an explicit action.
- Failed persistence restores the notice and announces the failure.
- Do not delete or mutate the active workout plan.
- Do not add a new runtime dependency.

---

### Task 1: Persist attention dismissals safely

**Files:**
- Create: `supabase/migrations/052_notification_attention_dismissals.sql`
- Create: `supabase/tests/052_notification_attention_dismissals_test.sql`
- Modify: `scripts/test-trainer-foundations-db.mjs`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: `notification_attention_dismissals` with row shape `{ user_id: string; notice_key: string; dismissed_at: string }`.
- Produces: authenticated `SELECT` and `INSERT (notice_key)` for the current owner only.

- [ ] **Step 1: Write the failing pgTAP test**

Add literal assertions that the table exists, `(user_id, notice_key)` is unique,
`user_id` defaults to `auth.uid()`, authenticated users cannot supply an owner,
and same-owner duplicate insertion is idempotent through `ON CONFLICT DO NOTHING`.

- [ ] **Step 2: Run the DB test to verify RED**

Run: `npm run test:db`

Expected: FAIL while applying or testing migration 052 because the table does not exist.

- [ ] **Step 3: Implement the minimal migration and generated type surface**

Create the table with:

```sql
CREATE TABLE public.notification_attention_dismissals (
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  notice_key TEXT NOT NULL CHECK (char_length(notice_key) BETWEEN 1 AND 160),
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notice_key)
);
```

Enable and force RLS, add owner `SELECT` and `INSERT` policies, revoke broad
access, grant `SELECT`, and grant `INSERT (notice_key)` only. Extend the database
test runner to apply migration/test 052 after 040 and 047. Mirror the table in
`src/types/database.ts`.

- [ ] **Step 4: Run the DB test to verify GREEN**

Run: `npm run test:db`

Expected: PASS with all 040, 047, and 052 pgTAP assertions.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/052_notification_attention_dismissals.sql supabase/tests/052_notification_attention_dismissals_test.sql scripts/test-trainer-foundations-db.mjs src/types/database.ts
git commit -m "feat: persist notification attention dismissals"
```

### Task 2: Filter and dismiss the exact plan version

**Files:**
- Modify: `src/app/actions/notifications.ts`
- Modify: `src/app/actions/__tests__/notifications.test.ts`

**Interfaces:**
- Produces: `buildPlanUpdateNoticeKey(planId: string, updatedAt: string): string`.
- Produces: `dismissPlanUpdateNotification(noticeKey: string): Promise<{ ok: true } | { ok: false; error: string }>`.
- Extends: `NotificationAttention` with `dismissalKey: string | null`.

- [ ] **Step 1: Write failing action tests**

Add tests proving:

```ts
expect(buildPlanUpdateNoticeKey(PLAN_ID, UPDATED_AT))
  .toBe(`plan-update:${PLAN_ID}:${UPDATED_AT}`)
```

and observable behaviors: a stored exact key hides AI notes and exposes the next
eligible promo; a later `updated_at` remains visible; malformed/stale keys do not
write; repeated current-version dismissal succeeds.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm test -- src/app/actions/__tests__/notifications.test.ts`

Expected: FAIL because the key builder/action and dismissal lookup are absent.

- [ ] **Step 3: Implement the minimal server behavior**

Select `updated_at` for the active plan, base recency on that value, look up only
the derived dismissal key, and pass `null` AI notes into `selectDashboardNotice`
when dismissed. In the mutation, authenticate, validate the key, re-read the
active plan, compare the derived key, insert `{ notice_key: expectedKey }` with
conflict-ignore semantics, and revalidate `/notifications` after success.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm test -- src/app/actions/__tests__/notifications.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/notifications.ts src/app/actions/__tests__/notifications.test.ts
git commit -m "feat: dismiss current plan update notice"
```

### Task 3: Add the compact swipeable plan notice

**Files:**
- Create: `src/components/notifications/SwipeDismissPlanNotice.tsx`
- Create: `src/components/notifications/__tests__/swipeDismissPlanNotice.test.tsx`
- Modify: `src/components/notifications/NotificationAttentionCard.tsx`

**Interfaces:**
- Produces: `shouldDismissPlanNotice(offsetX: number, velocityX: number): boolean`.
- Consumes: `dismissPlanUpdateNotification(noticeKey)`.

- [ ] **Step 1: Write failing component and interaction tests**

Test hand-derived thresholds (`-88px`, `-650px/s`), ensure rightward movement
never dismisses, render an explicit `Quitar aviso del plan` action, and test the
interaction helper so success removes the item while server failure returns a
restorable error result.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm test -- src/components/notifications/__tests__/swipeDismissPlanNotice.test.tsx`

Expected: FAIL because the swipe component and helpers do not exist.

- [ ] **Step 3: Implement the minimal swipe component**

Use Framer Motion `drag="x"`, negative drag elasticity, `onDragEnd`, and
`AnimatePresence`. Reveal a right-side "Quitar" action, clamp rightward travel,
truncate the note to two lines, keep `/plan` navigation, expose the keyboard
fallback, and use `useReducedMotion()` for the exit transition. Optimistically
hide, call the action, refresh on success, and restore plus toast/`aria-live` on
failure.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm test -- src/components/notifications/__tests__/swipeDismissPlanNotice.test.tsx src/app/actions/__tests__/notifications.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/notifications/SwipeDismissPlanNotice.tsx src/components/notifications/__tests__/swipeDismissPlanNotice.test.tsx src/components/notifications/NotificationAttentionCard.tsx
git commit -m "feat: add swipe dismissal for plan notices"
```

### Task 4: Simplify the notification page hierarchy

**Files:**
- Modify: `src/components/notifications/NotificationsPageContent.tsx`
- Modify: `src/components/notifications/NotificationCenter.tsx`
- Modify: `src/app/(app)/notifications/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: compact `NotificationAttentionCard` and existing `NotificationCenter`.
- Produces: one flat `max-w-3xl` notification feed without nested outer cards.

- [ ] **Step 1: Write the failing page test**

Assert the route renders the plan notice and activity but omits "Centro personal",
"notificaciones sin leer", "Prioridad", and "Requiere tu atencion". Assert the
empty history remains labelled and is not wrapped by a second card surface.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm test -- "src/app/(app)/notifications/__tests__/page.test.tsx" src/components/notifications/__tests__/notificationCenter.test.tsx`

Expected: FAIL on the old summary and priority copy.

- [ ] **Step 3: Implement the minimal hierarchy**

Remove summary state and imports, render attention and history in a flat
`max-w-3xl` stack, keep explicit error messaging, and reduce empty-state padding
and borders. Preserve aggregate unread updates inside `NotificationCenter` only.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm test -- "src/app/(app)/notifications/__tests__/page.test.tsx" src/components/notifications/__tests__/notificationCenter.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/notifications/NotificationsPageContent.tsx src/components/notifications/NotificationCenter.tsx "src/app/(app)/notifications/__tests__/page.test.tsx"
git commit -m "refactor: simplify notification page hierarchy"
```

### Task 5: Verify behavior and visual quality

**Files:**
- Modify only files required by failures found during verification, always with a failing regression test first.

**Interfaces:**
- Produces: verified mobile, desktop, database, type, lint, build, and regression behavior.

- [ ] **Step 1: Run focused regression tests**

Run: `npm test -- src/app/actions/__tests__/notifications.test.ts src/components/notifications/__tests__/swipeDismissPlanNotice.test.tsx src/components/notifications/__tests__/notificationCenter.test.tsx "src/app/(app)/notifications/__tests__/page.test.tsx"`

Expected: PASS.

- [ ] **Step 2: Run static and database verification**

Run: `npm run type-check && npm run lint && npm run test:db`

Expected: PASS with no new warnings attributable to this change.

- [ ] **Step 3: Run full regression and production build**

Run: `npm test`

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Verify responsive interaction**

Open `/notifications` at 390x844 and desktop width. Confirm compact hierarchy,
left swipe tracking, revealed destructive action, successful removal, failure
rollback, keyboard action, focus visibility, and reduced-motion behavior.

- [ ] **Step 5: Commit any test-first verification fixes**

```bash
git add <verified-files>
git commit -m "fix: complete notification dismissal verification"
```
