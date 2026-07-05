# Phase 2 Acquisition, Registration, and Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the thin public hero and long activation flow with a trustworthy bilingual landing, streamlined registration, five-stage onboarding, and privacy-safe funnel measurement.

**Architecture:** Render public marketing from locale-specific content objects and shared server components. Keep authentication on existing unprefixed routes while carrying locale through a secure query/cookie contract. Split the onboarding monolith into stage components backed by the existing answer type and persistence key.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Supabase Auth/Postgres, Vitest, Playwright, Axe.

## Global Constraints

- Spanish Latin America is primary; English is complete and reviewed before indexing.
- Never render fabricated user counts, satisfaction percentages, ratings, or testimonials.
- Primary public CTA copy is `Crear mi plan gratis` / `Create my free plan`.
- Payment UI remains informational; no checkout simulation.
- Preserve email verification, onboarding persistence, safety screening, and deterministic plan generation.
- Analytics accepts only allowlisted event names and scalar, non-sensitive properties.

---

### Task 1: Bilingual landing content and reusable marketing sections

**Files:**
- Create: `src/components/marketing/MarketingHeader.tsx`
- Create: `src/components/marketing/HeroSection.tsx`
- Create: `src/components/marketing/TrainingLoopSection.tsx`
- Create: `src/components/marketing/ProductPreviewSection.tsx`
- Create: `src/components/marketing/SafetySection.tsx`
- Create: `src/components/marketing/MarketingFaq.tsx`
- Create: `src/components/marketing/MarketingFooter.tsx`
- Create: `src/lib/marketing/homeContent.ts`
- Create: `src/lib/marketing/__tests__/homeContent.test.ts`
- Modify: `src/app/[locale]/page.tsx`

**Interfaces:**
- Produces: `HOME_CONTENT: Record<PublicLocale, HomeContent>` and section components with semantic headings.
- Consumes: Phase 1 `PublicLocale`, `localizedPath`, `buildLocalizedMetadata`, and shared design tokens.

- [ ] **Step 1: Write content-completeness tests**

```ts
// src/lib/marketing/__tests__/homeContent.test.ts
import { describe, expect, it } from 'vitest'
import { HOME_CONTENT } from '../homeContent'

describe('bilingual home content', () => {
  it.each(['es', 'en'] as const)('%s has every approved section', locale => {
    const content = HOME_CONTENT[locale]
    expect(content.hero.title.length).toBeGreaterThan(30)
    expect(content.loop).toHaveLength(4)
    expect(content.previews).toHaveLength(3)
    expect(content.faq.length).toBeGreaterThanOrEqual(5)
  })

  it('does not contain unverified social-proof claims', () => {
    expect(JSON.stringify(HOME_CONTENT)).not.toMatch(/10K|98%|usuarios activos|active users/i)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test -- src/lib/marketing/__tests__/homeContent.test.ts`

Expected: FAIL because `homeContent.ts` is absent.

- [ ] **Step 3: Define the typed bilingual content contract**

```ts
// src/lib/marketing/homeContent.ts
import type { PublicLocale } from '@/lib/i18n/routing'

type HomeContent = {
  hero: { eyebrow: string; title: string; body: string; cta: string; secondary: string }
  problem: { title: string; body: string }
  loop: Array<{ title: string; body: string }>
  previews: Array<{ title: string; body: string; screen: 'dashboard' | 'session' | 'progress' }>
  safety: { title: string; body: string }
  faq: Array<{ question: string; answer: string }>
  finalCta: { title: string; body: string; cta: string }
}

export const HOME_CONTENT: Record<PublicLocale, HomeContent> = {
  es: {
    hero: {
      eyebrow: 'Entrenamiento con dirección',
      title: 'Convierte cada entrenamiento en el siguiente paso de tu progresión.',
      body: 'Vekira adapta tu semana a tu nivel, tiempo, equipo y rendimiento real.',
      cta: 'Crear mi plan gratis', secondary: 'Ver cómo funciona',
    },
    problem: {
      title: 'Deja de improvisar tu progreso.',
      body: 'Sigue una estructura clara, registra lo que haces y recibe el siguiente ajuste con contexto.',
    },
    loop: [
      { title: 'Define tu contexto', body: 'Objetivo, experiencia, días, tiempo y equipo.' },
      { title: 'Recibe una semana viable', body: 'Sesiones construidas alrededor de tu disponibilidad.' },
      { title: 'Entrena y registra', body: 'Peso, repeticiones, esfuerzo y descansos en una sola vista.' },
      { title: 'Progresa con evidencia', body: 'Tu historial orienta la siguiente recomendación.' },
    ],
    previews: [
      { title: 'Tu día, sin ruido', body: 'Ve la sesión de hoy y la acción siguiente.', screen: 'dashboard' },
      { title: 'Registra mientras entrenas', body: 'Controles grandes, descanso y referencia anterior.', screen: 'session' },
      { title: 'Entiende el avance', body: 'Constancia, volumen y marcas en contexto.', screen: 'progress' },
    ],
    safety: {
      title: 'Un plan debe respetar tu contexto.',
      body: 'Vekira considera equipo, duración y restricciones declaradas. No sustituye orientación médica.',
    },
    faq: [
      { question: '¿Necesito gimnasio?', answer: 'No. El plan usa el lugar y el equipo que declares.' },
      { question: '¿Sirve si estoy empezando?', answer: 'Sí. La experiencia modifica volumen, selección y progresión.' },
      { question: '¿Puedo cambiar ejercicios?', answer: 'Sí. Puedes reemplazar movimientos y ajustar tu plan.' },
      { question: '¿Cómo usa mi progreso?', answer: 'Tus sesiones completadas aportan contexto para futuras cargas y ajustes.' },
      { question: '¿Vekira reemplaza a un profesional?', answer: 'No. Es una herramienta de planificación y registro, no un servicio médico.' },
    ],
    finalCta: { title: 'Tu próxima sesión puede tener dirección.', body: 'Crea tu perfil y recibe una primera semana adaptada.', cta: 'Crear mi plan gratis' },
  },
  en: {
    hero: {
      eyebrow: 'Training with direction',
      title: 'Turn every workout into the next step in your progression.',
      body: 'Vekira adapts your week to your level, time, equipment, and actual performance.',
      cta: 'Create my free plan', secondary: 'See how it works',
    },
    problem: { title: 'Stop guessing your way forward.', body: 'Follow a clear structure, log your work, and get the next adjustment with context.' },
    loop: [
      { title: 'Define your context', body: 'Goal, experience, days, time, and equipment.' },
      { title: 'Get a realistic week', body: 'Sessions built around your availability.' },
      { title: 'Train and log', body: 'Weight, reps, effort, and rest in one view.' },
      { title: 'Progress with evidence', body: 'Your history guides the next recommendation.' },
    ],
    previews: [
      { title: 'Your day, without noise', body: 'See today’s session and the next action.', screen: 'dashboard' },
      { title: 'Log while you train', body: 'Large controls, rest, and previous-session reference.', screen: 'session' },
      { title: 'Understand progress', body: 'Consistency, volume, and records in context.', screen: 'progress' },
    ],
    safety: { title: 'A plan should respect your context.', body: 'Vekira considers equipment, duration, and declared restrictions. It does not replace medical guidance.' },
    faq: [
      { question: 'Do I need a gym?', answer: 'No. Your plan uses the location and equipment you declare.' },
      { question: 'Is it suitable for beginners?', answer: 'Yes. Experience changes volume, exercise selection, and progression.' },
      { question: 'Can I replace exercises?', answer: 'Yes. You can replace movements and adjust your plan.' },
      { question: 'How does it use my progress?', answer: 'Completed sessions provide context for future loads and adjustments.' },
      { question: 'Does Vekira replace a professional?', answer: 'No. It is a planning and logging tool, not a medical service.' },
    ],
    finalCta: { title: 'Your next session can have direction.', body: 'Create your profile and get an adapted first week.', cta: 'Create my free plan' },
  },
}
```

- [ ] **Step 4: Build semantic sections and the localized page**

Each section receives only its content slice, uses one H2, and has no client JavaScript unless interactive. `MarketingFaq` uses native `<details>`/`<summary>`. Product previews reuse visual primitives rather than fake user statistics.

`src/app/[locale]/page.tsx` must export `generateMetadata`, validate locale, render exactly one H1 through `HeroSection`, and render sections in the approved order. Registration links use `/register?locale=${locale}`.

- [ ] **Step 5: Verify landing content and rendered accessibility**

Run: `pnpm test -- src/lib/marketing/__tests__/homeContent.test.ts && pnpm test:a11y`

Expected: PASS for `/es` and `/en` at all configured viewports.

- [ ] **Step 6: Commit**

```bash
git add src/components/marketing src/lib/marketing src/app/'[locale]'/page.tsx
git commit -m "feat(marketing): build bilingual conversion landing"
```

### Task 2: Honest Free and Pro information without checkout

**Files:**
- Create: `src/lib/marketing/planComparison.ts`
- Create: `src/lib/marketing/__tests__/planComparison.test.ts`
- Create: `src/components/pricing/EarlyAccessPlans.tsx`
- Modify: `src/app/pricing/page.tsx`
- Delete: `src/components/pricing/PricingSelector.tsx`
- Delete: `src/components/pricing/MockCheckoutButton.tsx`

**Interfaces:**
- Produces: `PLAN_COMPARISON` and a non-transactional `EarlyAccessPlans` component.
- Consumes: current free-plan limit and existing Pro feature descriptions.

- [ ] **Step 1: Write the comparison contract test**

```ts
// src/lib/marketing/__tests__/planComparison.test.ts
import { describe, expect, it } from 'vitest'
import { PLAN_COMPARISON } from '../planComparison'

describe('plan comparison', () => {
  it('states the real free plan limit and never offers checkout', () => {
    expect(PLAN_COMPARISON.find(row => row.key === 'saved-plans')).toMatchObject({ free: '2', pro: 'Ilimitados' })
    expect(JSON.stringify(PLAN_COMPARISON)).not.toMatch(/stripe|checkout|comprar|buy now/i)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/lib/marketing/__tests__/planComparison.test.ts`

Expected: FAIL because the comparison contract is absent.

- [ ] **Step 3: Implement truthful plan information**

```ts
// src/lib/marketing/planComparison.ts
export const PLAN_COMPARISON = [
  { key: 'active-plan', label: 'Plan personalizado activo', free: 'Incluido', pro: 'Incluido' },
  { key: 'saved-plans', label: 'Planes guardados', free: '2', pro: 'Ilimitados' },
  { key: 'session-log', label: 'Registro de sesiones', free: 'Incluido', pro: 'Incluido' },
  { key: 'history', label: 'Historial y progresión', free: 'Incluido', pro: 'Incluido' },
  { key: 'coach', label: 'Coach y ajustes durante acceso anticipado', free: 'Incluido', pro: 'Incluido' },
] as const
```

- [ ] **Step 4: Replace the mock checkout**

`EarlyAccessPlans` renders Free and Pro columns, the comparison rows, and the explicit message `La activación de Pro y los pagos todavía no están disponibles.` Unauthenticated users receive `Continuar gratis`; authenticated users receive a disabled `Pro próximamente` control. Keep the `PageTopBar` title as the page’s only H1 and render the plan introduction as H2. Remove all Stripe, card, billing, cancellation, mock-checkout, and charge language from the rendered page.

- [ ] **Step 5: Verify and commit**

Run: `pnpm test -- src/lib/marketing && pnpm type-check && pnpm lint`

Expected: PASS and `rg -n "MockCheckout|Stripe se conectará" src/app/pricing src/components/pricing` returns no matches.

```bash
git add src/lib/marketing src/components/pricing src/app/pricing/page.tsx
git commit -m "feat(pricing): present plans without simulated checkout"
```

### Task 3: Streamlined registration without false social proof

**Files:**
- Create: `src/app/(auth)/register/registerProfile.ts`
- Create: `src/app/(auth)/register/__tests__/registerProfile.test.ts`
- Create: `src/app/[locale]/privacidad/page.tsx`
- Create: `src/app/[locale]/privacy/page.tsx`
- Create: `src/app/[locale]/terminos/page.tsx`
- Create: `src/app/[locale]/terms/page.tsx`
- Modify: `src/app/(auth)/register/page.tsx`
- Modify: `src/app/(auth)/register/RegisterForm.tsx`
- Modify: `src/app/(auth)/register/VerifyCodeStep.tsx`
- Modify: `.env.example`

**Interfaces:**
- Produces: `registrationLocale(searchParams, cookieLocale)` and signup metadata containing only `preferred_language` when full name is not yet known.
- Consumes: Supabase signup, verification flow, `normalizeLanguage`, and onboarding redirect.

- [ ] **Step 1: Write locale and metadata tests**

```ts
// src/app/(auth)/register/__tests__/registerProfile.test.ts
import { describe, expect, it } from 'vitest'
import { registrationLocale, signupMetadata } from '../registerProfile'

describe('registration profile', () => {
  it('prefers an explicit supported locale', () => {
    expect(registrationLocale('en', 'es')).toBe('en')
    expect(registrationLocale('pt', 'en')).toBe('en')
  })

  it('does not require or invent a full name', () => {
    expect(signupMetadata('es')).toEqual({ preferred_language: 'es' })
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/app/'(auth)'/register/__tests__/registerProfile.test.ts`

Expected: FAIL because helper is absent.

- [ ] **Step 3: Implement the pure helper**

```ts
// src/app/(auth)/register/registerProfile.ts
import { normalizeLanguage, type AppLanguage } from '@/lib/i18n'

export function registrationLocale(query: string | undefined, cookie: string | undefined): AppLanguage {
  return query === 'es' || query === 'en' ? query : normalizeLanguage(cookie)
}

export function signupMetadata(locale: AppLanguage) {
  return { preferred_language: locale }
}
```

- [ ] **Step 4: Reduce the form and replace the side panel**

Remove `full_name` and `confirm_password` from the first registration form. Keep email, password, checklist, show/hide control, verification, and inline errors. Change `Crea tu cuenta` from H2 to the page’s single H1. Submit:

```ts
options: { data: signupMetadata(locale) }
```

Replace the fixed `STATS` panel with three truthful product benefits: adaptive week, guided logging, and visible progression. Add locale-aware links to privacy and terms below the submit button. Spanish legal pages live at `/es/privacidad` and `/es/terminos`; English pages live at `/en/privacy` and `/en/terms`. Reuse the current privacy sections, replace the placeholder support address with required `NEXT_PUBLIC_SUPPORT_EMAIL`, document it in `.env.example`, and add terms covering account use, acceptable conduct, fitness/medical limitation, user content, termination, and contact. Keep the `selectedPlan` query only as an informational early-access label; remove price and checkout language.

- [ ] **Step 5: Run registration checks**

Run: `pnpm test -- src/app/'(auth)'/register && pnpm type-check && pnpm lint`

Expected: PASS; no source under registration contains `10K+`, `98%`, or `200+`.

- [ ] **Step 6: Commit**

```bash
git add src/app/'(auth)'/register src/app/'[locale]'/privacidad src/app/'[locale]'/privacy src/app/'[locale]'/terminos src/app/'[locale]'/terms .env.example
git commit -m "feat(auth): streamline trustworthy registration"
```

### Task 4: Five-stage onboarding architecture

**Files:**
- Create: `src/components/onboarding/onboardingStages.ts`
- Create: `src/components/onboarding/__tests__/onboardingStages.test.ts`
- Create: `src/components/onboarding/StageShell.tsx`
- Create: `src/components/onboarding/ProfileStage.tsx`
- Create: `src/components/onboarding/AvailabilityStage.tsx`
- Create: `src/components/onboarding/EquipmentStage.tsx`
- Create: `src/components/onboarding/SafetyStage.tsx`
- Create: `src/components/onboarding/ConfirmationStage.tsx`
- Modify: `src/app/onboarding/OnboardingWizard.tsx`
- Modify: `src/app/onboarding/types.ts`

**Interfaces:**
- Produces: `OnboardingStageId`, `buildOnboardingStages`, `stageProgress`, and five stage components.
- Consumes: existing `OnboardingAnswers`, `saveOnboardingAnswers`, `generatePlan`, `checkUsernameAvailable`, and localStorage key `fitai_onboarding_v2`.

- [ ] **Step 1: Write stage-model tests**

```ts
// src/components/onboarding/__tests__/onboardingStages.test.ts
import { describe, expect, it } from 'vitest'
import { buildOnboardingStages, stageProgress } from '../onboardingStages'

describe('onboarding stages', () => {
  it('always exposes five content stages plus generation', () => {
    expect(buildOnboardingStages()).toEqual([
      'profile', 'availability', 'equipment', 'safety', 'confirmation', 'generating',
    ])
  })

  it('reports user-facing progress across five stages', () => {
    expect(stageProgress('profile')).toEqual({ current: 1, total: 5, percent: 20 })
    expect(stageProgress('confirmation')).toEqual({ current: 5, total: 5, percent: 100 })
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/components/onboarding/__tests__/onboardingStages.test.ts`

Expected: FAIL because the stage model does not exist.

- [ ] **Step 3: Implement the stage model**

```ts
// src/components/onboarding/onboardingStages.ts
export const ONBOARDING_STAGES = [
  'profile', 'availability', 'equipment', 'safety', 'confirmation', 'generating',
] as const
export type OnboardingStageId = (typeof ONBOARDING_STAGES)[number]

export const buildOnboardingStages = () => [...ONBOARDING_STAGES]

export function stageProgress(stage: OnboardingStageId) {
  const index = ONBOARDING_STAGES.indexOf(stage)
  const current = stage === 'generating' ? 5 : index + 1
  return { current, total: 5, percent: (current / 5) * 100 }
}
```

- [ ] **Step 4: Split and compose the five stages**

Map existing fields without dropping safety data:

- `ProfileStage`: full name, username, goal, fitness level.
- `AvailabilityStage`: days, duration, cardio preferences, activity level.
- `EquipmentStage`: location and conditional equipment.
- `SafetyStage`: warning symptoms, limitations, movement restrictions, professional clearance.
- `ConfirmationStage`: age, gender, height, weight, summary, and automatic/manual plan choice.

`StageShell` receives `title`, `description`, `current`, `total`, `onBack`, `onNext`, and `canContinue`. Use Lucide icons, not emojis. Preserve local persistence; add a migration function that maps legacy step keys to their containing new stage.

- [ ] **Step 5: Keep safety and generation gates intact**

The wizard must call `saveOnboardingAnswers(answers)` before either automatic generation or manual start. It must not skip `SafetyStage`, and it must continue to display the existing professional-clearance blocking result.

- [ ] **Step 6: Run onboarding checks**

Run: `pnpm test -- src/components/onboarding src/app/'(auth)'/register && pnpm type-check && pnpm lint`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/onboarding src/app/onboarding
git commit -m "feat(onboarding): consolidate activation into five stages"
```

### Task 5: Privacy-safe first-party funnel events

**Files:**
- Create: `supabase/migrations/034_product_events.sql`
- Create: `src/lib/analytics/events.ts`
- Create: `src/lib/analytics/__tests__/events.test.ts`
- Create: `src/app/api/analytics/route.ts`
- Create: `src/components/analytics/TrackPageView.tsx`
- Modify: `src/app/[locale]/page.tsx`
- Modify: `src/app/(auth)/register/RegisterForm.tsx`
- Modify: `src/app/onboarding/OnboardingWizard.tsx`

**Interfaces:**
- Produces: `AnalyticsEventName`, `sanitizeEvent`, `trackEvent`.
- Consumes: Supabase service client only inside the server route; browser sends same-origin JSON.

- [ ] **Step 1: Write allowlist and sanitization tests**

```ts
// src/lib/analytics/__tests__/events.test.ts
import { describe, expect, it } from 'vitest'
import { sanitizeEvent } from '../events'

describe('analytics events', () => {
  it('accepts allowlisted scalar properties', () => {
    expect(sanitizeEvent({ name: 'landing_view', properties: { locale: 'es', section: 2 } }))
      .toEqual({ name: 'landing_view', properties: { locale: 'es', section: 2 } })
  })

  it('rejects unknown names and sensitive/free-form keys', () => {
    expect(sanitizeEvent({ name: 'password_captured', properties: {} })).toBeNull()
    expect(sanitizeEvent({ name: 'signup_started', properties: { email: 'a@b.com' } })).toBeNull()
    expect(sanitizeEvent({ name: 'onboarding_step_completed', properties: { injury: 'knee' } })).toBeNull()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/lib/analytics/__tests__/events.test.ts`

Expected: FAIL because analytics module is absent.

- [ ] **Step 3: Create the event contract**

Implement the exact event union from the roadmap. `sanitizeEvent` accepts only `locale`, `path`, `stage`, `source`, `screen`, `authenticated`, and `duration_bucket`; values must be string, number, or boolean and total serialized properties must be at most 1 KB. `path` is always `window.location.pathname` without query or hash, must begin with `/`, and is capped at 200 characters so emails, tokens, usernames, and search terms cannot leak through URLs. `trackEvent` uses `navigator.sendBeacon` when available and falls back to `fetch(..., { keepalive: true })`.

- [ ] **Step 4: Create the storage migration and API route**

```sql
-- supabase/migrations/034_product_events.sql
CREATE TABLE public.product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_name TEXT NOT NULL,
  anonymous_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  locale TEXT CHECK (locale IN ('es', 'en')),
  path TEXT,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX product_events_occurred_at_idx ON public.product_events (occurred_at DESC);
CREATE INDEX product_events_name_idx ON public.product_events (event_name, occurred_at DESC);
```

No client RLS policy is added. The API route validates `Origin`, limits the body to 2 KB, derives `user_id` server-side, reads/sets an `HttpOnly`, `SameSite=Lax` anonymous UUID cookie, and inserts through the service client. It returns `202` for a valid event and `400` for invalid input.

- [ ] **Step 5: Instrument the approved activation events**

Add `landing_view` on localized home render, CTA clicks, `signup_started`, `signup_completed`, each stage completion, `onboarding_abandoned` on visibility exit only when incomplete, and `plan_generated` after success. Never send answers, email, name, limitations, weight, height, age, or free-form text.

- [ ] **Step 6: Verify analytics**

Run: `pnpm test -- src/lib/analytics/__tests__/events.test.ts && pnpm type-check && pnpm lint`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/034_product_events.sql src/lib/analytics src/app/api/analytics src/components/analytics src/app/'[locale]'/page.tsx src/app/'(auth)'/register/RegisterForm.tsx src/app/onboarding/OnboardingWizard.tsx
git commit -m "feat(analytics): measure activation without sensitive data"
```

### Task 6: Activation E2E, SEO, and accessibility acceptance

**Files:**
- Create: `tests/e2e/marketing.spec.ts`
- Create: `tests/e2e/registration.spec.ts`
- Create: `tests/e2e/onboarding.spec.ts`
- Create: `tests/e2e/helpers/auth.ts`
- Create: `scripts/seed-e2e-account.ts`
- Modify: `tests/e2e/accessibility.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: release-level browser tests.
- Consumes: deterministic Supabase test account setup already used by the project environment.

- [ ] **Step 1: Add public landing assertions**

```ts
// tests/e2e/marketing.spec.ts
import { expect, test } from '@playwright/test'

test('Spanish landing has one H1 and a registration CTA', async ({ page }) => {
  await page.goto('/es')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Crear mi plan gratis' })).toHaveAttribute('href', '/register?locale=es')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/es$/)
})
```

- [ ] **Step 2: Add registration and onboarding happy-path tests**

Registration test asserts only email and password are required, terms/privacy links exist, and verification is shown after submit. Onboarding test uses a verified test user, completes exactly five visible stages, verifies the safety stage cannot be bypassed, and observes the generated-plan success redirect.

Create `scripts/seed-e2e-account.ts` using `SUPABASE_SERVICE_ROLE_KEY` to create or reset only the account identified by `E2E_USER_EMAIL`, mark it verified, and reset its profile/onboarding/plan test rows. The script must refuse to run unless `E2E_USER_EMAIL` ends in `@example.test`. Add `"test:e2e:seed": "tsx --env-file=.env.local scripts/seed-e2e-account.ts"`.

```ts
// tests/e2e/helpers/auth.ts
import { expect, type Page } from '@playwright/test'

export async function signInAsE2EUser(page: Page) {
  const email = process.env.E2E_USER_EMAIL
  const password = process.env.E2E_USER_PASSWORD
  if (!email || !password) throw new Error('E2E_USER_EMAIL and E2E_USER_PASSWORD are required')
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/onboarding|\/dashboard/)
}
```

- [ ] **Step 3: Expand Axe routes**

Add `/register?locale=es`, `/register?locale=en`, and every rendered onboarding stage to the accessibility suite. Assert no unintended horizontal overflow.

- [ ] **Step 4: Run the phase acceptance suite**

Run: `pnpm test:e2e:seed && pnpm type-check && pnpm lint && pnpm test && pnpm test:e2e && pnpm build`

Expected: all commands exit 0 and both localized landings build as indexable routes.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e scripts/seed-e2e-account.ts package.json
git commit -m "test(activation): cover bilingual acquisition funnel"
```
