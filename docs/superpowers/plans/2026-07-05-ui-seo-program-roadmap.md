# Vekira UI and Bilingual SEO Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved full-interface redesign and Spanish-first bilingual SEO program as five independently reviewable releases.

**Architecture:** Keep the authenticated product on its existing unprefixed routes while public acquisition and content routes use explicit `/es` and `/en` prefixes. Share design tokens, localization helpers, metadata builders, and analytics contracts across releases, but keep marketing, product, community, and content layouts independently testable.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Supabase, Vitest, Playwright, Axe, MDX.

## Global Constraints

- Preserve the Vekira brand and violet identity; this is not a rebrand.
- Spanish for Latin America is the primary language; English content requires human review before indexing.
- Meet WCAG 2.2 AA and retain global `prefers-reduced-motion` support.
- Validate responsive behavior at 375, 768, 1024, and 1440 px.
- Public pages use `/es` and `/en`; authenticated product routes remain unprefixed.
- Do not implement Stripe, checkout, billing, refunds, or automated subscriptions.
- Do not expose medical data, credentials, or free-form sensitive text in analytics.
- Preserve PWA, Capacitor Android, Supabase Auth, plan generation, and session persistence behavior.
- Use TDD for pure logic and Playwright/Axe for critical rendered flows.
- Run `pnpm type-check`, `pnpm lint`, `pnpm test`, and `pnpm build` before each release.

---

## Release order

1. [Phase 1: UI, localization, and technical SEO foundations](./2026-07-05-ui-seo-phase-1-foundations.md)
2. [Phase 2: Acquisition, registration, and onboarding](./2026-07-05-ui-seo-phase-2-acquisition-activation.md)
3. [Phase 3: Dashboard, session, plan, and progress](./2026-07-05-ui-seo-phase-3-core-training.md)
4. [Phase 4: Community, profiles, settings, and accessibility closure](./2026-07-05-ui-seo-phase-4-community-settings.md)
5. [Phase 5: Public exercise library and organic content](./2026-07-05-ui-seo-phase-5-organic-growth.md)

Each phase must be merged only after its own acceptance suite passes. A later phase may consume interfaces from an earlier phase but must not require unfinished work from a later phase.

## Specification coverage map

| Approved specification area | Implemented by |
| --- | --- |
| Visual tokens, navigation, states, responsive shell | Phase 1 Tasks 1–2 |
| Accessibility foundations and browser matrix | Phase 1 Task 5; Phase 4 Task 4 |
| Spanish/English routing, canonical, `hreflang`, robots, sitemap | Phase 1 Tasks 3–4; Phase 5 Task 4 |
| Landing and truthful plan presentation | Phase 2 Tasks 1–2 |
| Registration, legal links, and five-stage onboarding | Phase 2 Tasks 3–4 |
| Privacy-safe product measurement | Phase 2 Task 5 |
| Dashboard, active session, weekly plan, progress | Phase 3 Tasks 1–4 |
| Feed, share templates, profiles, discovery, settings | Phase 4 Tasks 1–3 |
| MDX content, commercial pages, editorial clusters | Phase 5 Tasks 1–2 |
| Public exercise library | Phase 5 Task 3 |
| Structured data and SEO operations | Phase 5 Task 4 |
| Offline session preservation and sync feedback | Phase 3 Task 2 |
| Payment exclusion | Every phase global constraints |

## Cross-phase interfaces

Phase 1 produces:

```ts
export type PublicLocale = 'es' | 'en'
export function isPublicLocale(value: string): value is PublicLocale
export function localizedPath(locale: PublicLocale, route: PublicRoute): string
export function buildLocalizedMetadata(input: LocalizedMetadataInput): Metadata
export const APP_NAV_ITEMS: readonly AppNavItem[]
```

Phase 2 produces:

```ts
export type AnalyticsEventName =
  | 'landing_view'
  | 'primary_cta_clicked'
  | 'language_changed'
  | 'signup_started'
  | 'signup_completed'
  | 'onboarding_step_completed'
  | 'onboarding_abandoned'
  | 'plan_generated'
  | 'first_session_started'
  | 'first_session_completed'
  | 'plan_adjustment_used'
  | 'organic_page_cta_clicked'

export function trackEvent(
  name: AnalyticsEventName,
  properties?: Record<string, string | number | boolean>,
): void
```

Phase 5 consumes both contracts for localized content and organic conversion tracking.

## Program acceptance

- [ ] All five phase plans pass their acceptance commands.
- [ ] Critical routes work at the four required viewport widths without unintended horizontal scrolling.
- [ ] Axe reports no critical or serious violations on landing, registration, onboarding, dashboard, active session, plan, progress, feed, settings, article, and public exercise templates.
- [ ] Spanish and English public URLs emit valid reciprocal canonical and `hreflang` annotations.
- [ ] Private routes emit `noindex` and are not disallowed in `robots.txt`.
- [ ] Analytics contains no medical fields, credentials, or free-form user text.
- [ ] Payment integration remains absent.
- [ ] PWA and Android-safe-area behavior remain functional.
