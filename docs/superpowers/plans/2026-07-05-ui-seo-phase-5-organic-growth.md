# Phase 5 Public Exercise Library and Organic Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a validated bilingual content system, indexable commercial/editorial pages, and a public exercise library that converts useful organic traffic into Vekira registrations.

**Architecture:** Store editorial content as validated MDX keyed by stable translation ids. Resolve localized slugs through a content manifest, query public exercise data through a server-only cached repository, and extend the Phase 1 metadata/sitemap helpers rather than generating tags ad hoc.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, MDX, Zod, gray-matter, next-mdx-remote, Supabase, Vitest, Playwright, Axe.

## Global Constraints

- Spanish Latin America is primary; English pages are reviewed before `index: true`.
- Content must be useful on-page and not generated as thin keyword permutations.
- Medical/safety content cannot diagnose, prescribe treatment, or promise injury prevention.
- Exercise pages expose only public catalog fields, never user logs or administrative fields.
- Structured data must match visible content.
- Every organic CTA uses the Phase 2 analytics allowlist.
- No payment work.

---

### Task 1: Validated bilingual MDX content repository

**Files:**
- Create: `src/lib/content/schema.ts`
- Create: `src/lib/content/repository.ts`
- Create: `src/lib/content/__tests__/repository.test.ts`
- Create: `src/components/content/ArticleLayout.tsx`
- Create: `src/components/content/ArticleCta.tsx`
- Create: `src/app/[locale]/guides/[slug]/page.tsx`
- Create: `content/es/guides/sobrecarga-progresiva.mdx`
- Create: `content/en/guides/progressive-overload.mdx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `ContentDocument`, `getContentBySlug`, `getTranslation`, `listContent`, and static params for guide pages.
- Consumes: `PublicLocale`, `buildLocalizedMetadata`, and `trackEvent`.

- [ ] **Step 1: Install and write failing repository tests**

Run: `pnpm add zod gray-matter next-mdx-remote`

```ts
// src/lib/content/__tests__/repository.test.ts
import { describe, expect, it } from 'vitest'
import { getContentBySlug, getTranslation, listContent } from '../repository'

describe('content repository', () => {
  it('loads validated Spanish and English documents', async () => {
    expect((await getContentBySlug('es', 'guides', 'sobrecarga-progresiva'))?.translationId)
      .toBe('guide-progressive-overload')
    expect((await getContentBySlug('en', 'guides', 'progressive-overload'))?.translationId)
      .toBe('guide-progressive-overload')
  })

  it('resolves reciprocal translations', async () => {
    const es = await getContentBySlug('es', 'guides', 'sobrecarga-progresiva')
    expect(await getTranslation(es!, 'en')).toMatchObject({ slug: 'progressive-overload' })
  })

  it('has no duplicate locale/type/slug tuples', async () => {
    const docs = await listContent()
    const keys = docs.map(doc => `${doc.locale}:${doc.type}:${doc.slug}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/lib/content/__tests__/repository.test.ts`

Expected: FAIL because repository and content are absent.

- [ ] **Step 3: Implement the schema and repository**

```ts
// src/lib/content/schema.ts
import { z } from 'zod'

export const contentFrontmatterSchema = z.object({
  translationId: z.string().min(3),
  locale: z.enum(['es', 'en']),
  type: z.enum(['guides', 'commercial']),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(20).max(70),
  description: z.string().min(70).max(170),
  publishedAt: z.string().date(),
  updatedAt: z.string().date(),
  author: z.string().min(2),
  image: z.string().startsWith('/'),
  index: z.boolean(),
})

export type ContentFrontmatter = z.infer<typeof contentFrontmatterSchema>
export type ContentDocument = ContentFrontmatter & { body: string; filePath: string }
```

`repository.ts` reads only `content/{es,en}/{guides,commercial}/*.mdx`, validates frontmatter, rejects duplicate keys and multiple documents with the same translation id/locale, and caches results with React `cache()`.

- [ ] **Step 4: Add the first complete bilingual guide**

Both MDX files use translation id `guide-progressive-overload`, cite the same concepts, and contain these visible sections: definition, what can progress, beginner example, when not to increase load, how Vekira records the signal, and safety disclaimer. English `index` stays `false` until editorial review is recorded; Spanish is `true`.

- [ ] **Step 5: Render the guide route**

The guide page validates locale, generates static params, returns `notFound()` for missing slugs, emits localized metadata only when an equivalent exists, renders `ArticleLayout`, and ends with `ArticleCta` linking to `/register?locale=${locale}&source=guide`. The CTA emits `organic_page_cta_clicked` with only `locale`, `source: 'guide'`, and `path`.

- [ ] **Step 6: Verify and commit**

Run: `pnpm test -- src/lib/content && pnpm type-check && pnpm build`

Expected: PASS; Spanish guide is indexable and English remains `noindex` until reviewed.

```bash
git add package.json pnpm-lock.yaml src/lib/content src/components/content src/app/'[locale]'/guides content
git commit -m "feat(content): add validated bilingual MDX repository"
```

### Task 2: Commercial pages and editorial clusters

**Files:**
- Create: `content/es/commercial/entrenamiento-personalizado.mdx`
- Create: `content/es/commercial/rutinas-adaptativas.mdx`
- Create: `content/es/commercial/entrenamiento-de-fuerza.mdx`
- Create: `content/es/commercial/entrenamiento-en-casa.mdx`
- Create: `content/es/commercial/entrenamiento-con-poco-equipo.mdx`
- Create: `content/es/commercial/seguimiento-de-progresion.mdx`
- Create: `content/es/commercial/coach-de-entrenamiento-con-ia.mdx`
- Create: `content/es/commercial/app-para-registrar-entrenamientos.mdx`
- Create: `content/es/commercial/vekira-vs-rutina-generica.mdx`
- Create: `content/es/commercial/preguntas-frecuentes.mdx`
- Create: `content/en/commercial/personalized-workouts.mdx`
- Create: `content/en/commercial/adaptive-workouts.mdx`
- Create: `content/en/commercial/strength-training.mdx`
- Create: `content/en/commercial/home-workouts.mdx`
- Create: `content/en/commercial/minimal-equipment-workouts.mdx`
- Create: `content/en/commercial/workout-progression-tracking.mdx`
- Create: `content/en/commercial/ai-workout-coach.mdx`
- Create: `content/en/commercial/workout-tracker-app.mdx`
- Create: `content/en/commercial/vekira-vs-generic-workout-plan.mdx`
- Create: `content/en/commercial/faq.mdx`
- Create: `content/es/guides/elegir-rutina-3-4-5-dias.mdx`
- Create: `content/es/guides/tecnica-sentadilla-y-alternativas.mdx`
- Create: `content/es/guides/fatiga-y-recuperacion.mdx`
- Create: `content/en/guides/choosing-a-3-4-5-day-routine.mdx`
- Create: `content/en/guides/squat-technique-and-alternatives.mdx`
- Create: `content/en/guides/training-fatigue-and-recovery.mdx`
- Create: `src/app/[locale]/[commercialSlug]/page.tsx`
- Create: `src/lib/content/commercialRoutes.ts`
- Create: `src/lib/content/__tests__/commercialRoutes.test.ts`

**Interfaces:**
- Produces: ten reciprocal commercial route pairs and four editorial clusters.
- Consumes: Task 1 repository and article components.

- [ ] **Step 1: Define and test the exact commercial route manifest**

```ts
export const COMMERCIAL_ROUTES = [
  ['entrenamiento-personalizado', 'personalized-workouts'],
  ['rutinas-adaptativas', 'adaptive-workouts'],
  ['entrenamiento-de-fuerza', 'strength-training'],
  ['entrenamiento-en-casa', 'home-workouts'],
  ['entrenamiento-con-poco-equipo', 'minimal-equipment-workouts'],
  ['seguimiento-de-progresion', 'workout-progression-tracking'],
  ['coach-de-entrenamiento-con-ia', 'ai-workout-coach'],
  ['app-para-registrar-entrenamientos', 'workout-tracker-app'],
  ['vekira-vs-rutina-generica', 'vekira-vs-generic-workout-plan'],
  ['preguntas-frecuentes', 'faq'],
] as const
```

Test that every pair has one Spanish and one English MDX document sharing a translation id, unique titles/descriptions, and exactly one H1 supplied by the page layout rather than MDX.

- [ ] **Step 2: Create commercial content with fixed intent boundaries**

Each pair contains 700–1,200 useful words and the following mandatory sections: who it is for, problem, how Vekira addresses it, concrete product workflow, limitations, FAQ, and contextual CTA. Comparison content must use only factual statements about Vekira and generic planning; it must not invent competitor features or prices.

- [ ] **Step 3: Create the first cluster entry for each approved cluster**

Add reciprocal guides for:

- Progressive overload.
- Choosing a 3-, 4-, or 5-day routine.
- Squat technique and alternatives.
- Training fatigue and recovery.

Safety pages include reviewer name/date in frontmatter and an explicit non-diagnostic disclaimer.

- [ ] **Step 4: Render commercial slugs safely**

The dynamic commercial route must first resolve `commercialRoutes` and call `notFound()` for any unknown slug so it cannot shadow `/guides`, `/exercises`, or other locale routes. It renders the same validated MDX pipeline and localized alternates.

- [ ] **Step 5: Verify content quality contracts**

Run: `pnpm test -- src/lib/content && pnpm type-check && pnpm build`

Expected: every Spanish/English pair is present; only editorially reviewed documents have `index: true`.

- [ ] **Step 6: Commit**

```bash
git add content src/app/'[locale]'/'[commercialSlug]' src/lib/content
git commit -m "feat(seo): publish bilingual commercial content clusters"
```

### Task 3: Public localized exercise library

**Files:**
- Create: `src/lib/exercises/publicExerciseRepository.ts`
- Create: `src/lib/exercises/publicExerciseSlug.ts`
- Create: `src/lib/exercises/__tests__/publicExerciseSlug.test.ts`
- Create: `src/app/[locale]/exercises/page.tsx`
- Create: `src/app/[locale]/exercises/[slug]/page.tsx`
- Create: `src/components/exercises/public/PublicExerciseCard.tsx`
- Create: `src/components/exercises/public/PublicExerciseDetail.tsx`
- Create: `src/components/exercises/public/ExerciseAlternatives.tsx`
- Create: `src/components/exercises/public/ExerciseCta.tsx`

**Interfaces:**
- Produces: public exercise list/detail routes and stable localized slugs.
- Consumes: public exercise catalog, localized name/instruction fields, `ExerciseImage`, metadata helper, and organic CTA analytics.

- [ ] **Step 1: Write slug tests**

```ts
// src/lib/exercises/__tests__/publicExerciseSlug.test.ts
import { describe, expect, it } from 'vitest'
import { exerciseSlug } from '../publicExerciseSlug'

describe('exercise slugs', () => {
  it('normalizes accents and punctuation deterministically', () => {
    expect(exerciseSlug('Press de banca con mancuernas')).toBe('press-de-banca-con-mancuernas')
    expect(exerciseSlug('Barbell Back Squat')).toBe('barbell-back-squat')
  })

  it('retains a stable id suffix when names collide', () => {
    expect(exerciseSlug('Remo', 'abc123')).toBe('remo-abc123')
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/lib/exercises/__tests__/publicExerciseSlug.test.ts`

Expected: FAIL because the slug helper is absent.

- [ ] **Step 3: Implement stable slugs and server-only repository**

```ts
export function exerciseSlug(name: string, suffix?: string): string {
  const base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return suffix ? `${base}-${suffix.slice(0, 6).toLowerCase()}` : base
}
```

The repository selects only id, localized name/description/instructions, images, equipment, level, primary muscles, secondary muscles, category, and source attribution. It must not select user ids, logs, generation metadata, or admin-only fields. Cache list results and return `null` for unknown or untranslated slugs.

- [ ] **Step 4: Build list and detail pages**

The list offers crawlable category/equipment links without generating arbitrary query-index combinations. Filter query URLs emit canonical to the base list and `noindex,follow`. The detail renders one H1, image, instructions, equipment, difficulty, muscles, alternatives, source attribution, safety copy, and CTA to `/register?locale=${locale}&source=exercise`.

If an English translation is absent, do not generate the English page or `hreflang` link; never expose Spanish content under an English URL.

- [ ] **Step 5: Verify exercise pages**

Run: `pnpm test -- src/lib/exercises && pnpm type-check && pnpm build`

Expected: PASS; generated static params contain only translated, public catalog entries.

- [ ] **Step 6: Commit**

```bash
git add src/lib/exercises src/components/exercises/public src/app/'[locale]'/exercises
git commit -m "feat(seo): publish localized exercise library"
```

### Task 4: Structured data, scalable sitemaps, and SEO operations

**Files:**
- Create: `src/lib/seo/structuredData.ts`
- Create: `src/lib/seo/__tests__/structuredData.test.ts`
- Create: `src/components/seo/JsonLd.tsx`
- Create: `docs/seo/operations.md`
- Create: `scripts/validate-seo.mjs`
- Modify: `src/app/sitemap.ts`
- Modify: `src/app/[locale]/page.tsx`
- Modify: `src/app/[locale]/guides/[slug]/page.tsx`
- Modify: `src/app/[locale]/exercises/[slug]/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces: safe JSON-LD builders, complete localized sitemap, and `pnpm validate:seo`.
- Consumes: content repository, exercise repository, metadata helpers, and `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.

- [ ] **Step 1: Write structured-data tests**

```ts
// src/lib/seo/__tests__/structuredData.test.ts
import { describe, expect, it } from 'vitest'
import { articleJsonLd, breadcrumbJsonLd, softwareApplicationJsonLd } from '../structuredData'

describe('structured data', () => {
  it('uses only supplied visible values', () => {
    expect(articleJsonLd({ headline: 'Progressive overload', description: 'Guide', url: 'https://vekira.test/en/guides/progressive-overload', image: 'https://vekira.test/og.png', datePublished: '2026-07-05', dateModified: '2026-07-05', author: 'Vekira' }))
      .toMatchObject({ '@type': 'Article', headline: 'Progressive overload' })
  })

  it('represents the current free offer without invented ratings', () => {
    const data = softwareApplicationJsonLd('es')
    expect(data.offers).toMatchObject({ price: '0', priceCurrency: 'USD' })
    expect(data).not.toHaveProperty('aggregateRating')
  })

  it('creates ordered breadcrumbs', () => {
    expect(breadcrumbJsonLd([{ name: 'Inicio', url: '/' }, { name: 'Guía', url: '/guide' }]).itemListElement).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/lib/seo/__tests__/structuredData.test.ts`

Expected: FAIL because builders are absent.

- [ ] **Step 3: Implement and render JSON-LD safely**

Builders return plain serializable objects. `JsonLd` escapes `<` as `\u003c` before `dangerouslySetInnerHTML`. Landing renders `SoftwareApplication`; articles render `Article` and `BreadcrumbList`; FAQ schema appears only when every question and answer is visible; exercise pages use breadcrumbs and no unsupported Google type.

- [ ] **Step 4: Extend sitemap and verification metadata**

Sitemap includes indexable commercial documents, guides, and exercises with `lastModified` and reciprocal language alternates. It excludes `index: false`, filtered URLs, auth, product routes, and untranslated exercises. Root metadata reads `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` into `verification.google` only when defined.

- [ ] **Step 5: Add executable SEO validation**

`scripts/validate-seo.mjs` requests the built site and validates: 200 status, one canonical, reciprocal `hreflang`, one H1, index/noindex expectation, JSON-LD parseability, and sitemap membership for a fixed sample of landing, commercial, guide, and exercise routes. Add:

```json
"validate:seo": "node scripts/validate-seo.mjs"
```

`docs/seo/operations.md` documents Search Console property setup, sitemap submission, weekly CTR/indexing review, translation review gate, content refresh cadence, redirect procedure, and removal procedure.

- [ ] **Step 6: Run the final program acceptance suite**

Run: `pnpm type-check && pnpm lint && pnpm test && pnpm test:e2e && pnpm build && pnpm start`

In a second terminal run: `pnpm validate:seo`

Expected: all checks pass; validator reports zero missing canonicals, reciprocal alternates, invalid schemas, or sitemap mismatches.

- [ ] **Step 7: Commit**

```bash
git add src/lib/seo src/components/seo src/app/sitemap.ts src/app/'[locale]' src/app/layout.tsx scripts/validate-seo.mjs docs/seo/operations.md package.json
git commit -m "feat(seo): complete structured organic growth foundation"
```
