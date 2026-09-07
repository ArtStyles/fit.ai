import { createRequire } from 'node:module'
import path from 'node:path'
import { chromium, type Browser, type Page } from '@playwright/test'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

type FixtureResolveArgs = { path: string }
type FixtureBuildApi = {
  onResolve: (
    options: { filter: RegExp },
    callback: (args: FixtureResolveArgs) => { path: string; namespace: string } | null,
  ) => void
  onLoad: (
    options: { filter: RegExp; namespace: string },
    callback: (args: FixtureResolveArgs) => {
      contents: string | undefined
      loader: 'js' | 'tsx'
      resolveDir: string
    },
  ) => void
}
type Esbuild = {
  build: (options: Record<string, unknown>) => Promise<{
    outputFiles: Array<{ text: string }>
  }>
}

type BrowserHarness = Window & typeof globalThis & {
  __firstMotionPreview?: Element
  __motionLoadCount?: number
  __motionReady?: boolean
  __renderExerciseImagePair?: () => void
  __renderMotionPreview?: (options: {
    motionSrc: string | null
    language?: 'es' | 'en'
    className?: string
  }) => void
}

const motionUrl = 'https://exercise.test/motion-preview.webp'
const replacementMotionUrl = 'https://exercise.test/motion-preview-replacement.webp'

let browser: Browser
let bundle = ''
let motionRequests: string[] = []
let page: Page

async function loadEsbuild(): Promise<Esbuild> {
  const require = createRequire(import.meta.url)
  const vitestEntry = require.resolve('vitest')
  const viteEntry = createRequire(vitestEntry).resolve('vite')
  const esbuildEntry = createRequire(viteEntry).resolve('esbuild')
  return import(esbuildEntry) as unknown as Promise<Esbuild>
}

async function buildBrowserFixture(): Promise<string> {
  const { build } = await loadEsbuild()
  const componentPath = path.join(process.cwd(), 'src/components/exercises/ExerciseMotionPreview.tsx')
  const exerciseImagePath = path.join(process.cwd(), 'src/components/exercises/ExerciseImage.tsx')

  const result = await build({
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    jsx: 'automatic',
    stdin: {
      loader: 'tsx',
      resolveDir: process.cwd(),
      contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { ExerciseMotionPreview } from ${JSON.stringify(componentPath)}
        import { ExerciseImage as RealExerciseImage } from ${JSON.stringify(exerciseImagePath)}

        const root = createRoot(document.getElementById('root'))
        window.__renderMotionPreview = ({ motionSrc, language = 'es', className }) => {
          root.render(
            <ExerciseMotionPreview
              posterSrc="https://exercise.test/poster.webp"
              motionSrc={motionSrc}
              alt="Sentadilla con peso corporal"
              language={language}
              className={className}
            />,
          )
        }
        window.__renderExerciseImagePair = () => {
          root.render(
            <>
              <RealExerciseImage
                src="https://exercise.test/poster.webp"
                alt="Poster contain"
                variant="hero"
                imageFit="contain"
              />
              <RealExerciseImage
                src="https://exercise.test/poster.webp"
                alt="Poster cover predeterminado"
                variant="hero"
              />
            </>,
          )
        }
        window.__renderMotionPreview({ motionSrc: ${JSON.stringify(motionUrl)} })
        requestAnimationFrame(() => { window.__motionReady = true })
      `,
    },
    plugins: [{
      name: 'exercise-motion-preview-browser-fixture-mocks',
      setup(buildApi: FixtureBuildApi) {
        const mocks = new Map<string, string>([
          ['./ExerciseImage', `
            import React from 'react'
            export const ExerciseImage = ({ src, alt, variant, zoomable, className, imageFit }) => (
              <div
                data-poster-preview
                data-src={src || ''}
                data-variant={variant}
                data-zoomable={String(zoomable)}
                data-class-name={className || ''}
                data-image-fit={imageFit || ''}
                aria-label={alt}
              />
            )
          `],
          ['next/image', `
            import React from 'react'
            export default function NextImage({ fill, ...props }) {
              return <img data-real-exercise-image {...props} />
            }
          `],
          ['lucide-react', `
            import React from 'react'
            export const Dumbbell = props => <svg {...props} />
            export const ZoomIn = props => <svg {...props} />
          `],
          ['@/components/ui/dialog', `
            import React from 'react'
            export const Dialog = ({ children }) => <>{children}</>
            export const DialogContent = ({ children }) => <>{children}</>
            export const DialogTitle = ({ children }) => <>{children}</>
            export const DialogTrigger = ({ children }) => <>{children}</>
          `],
          ['@/lib/utils', 'export const cn = (...classes) => classes.filter(Boolean).join(" ")'],
        ])

        buildApi.onResolve({ filter: /.*/ }, args => {
          if (mocks.has(args.path)) return { path: args.path, namespace: 'motion-preview-mock' }
          return null
        })
        buildApi.onLoad({ filter: /.*/, namespace: 'motion-preview-mock' }, args => ({
          contents: mocks.get(args.path),
          loader: 'tsx',
          resolveDir: process.cwd(),
        }))
      },
    }],
  })

  return result.outputFiles[0]?.text ?? ''
}

async function preparePage(options?: { reducedMotion?: boolean; saveData?: boolean }) {
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  motionRequests = []
  page.on('request', request => {
    if (request.url().includes('motion-preview')) motionRequests.push(request.url())
  })
  await page.route(/motion-preview.*\.webp$/, route => route.fulfill({
    path: path.join(process.cwd(), 'public/exercises/pilot/arnold-press-mancuernas/motion-preview.webp'),
  }))
  await page.addInitScript(({ reducedMotion, saveData }) => {
    window.matchMedia = query => ({
      matches: query === '(prefers-reduced-motion: reduce)' && Boolean(reducedMotion),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData },
    })
  }, options ?? {})
  await page.setContent('<main><div id="root"></div></main>')
  await page.evaluate(() => {
    const harness = window as BrowserHarness
    harness.__motionLoadCount = 0
    document.addEventListener('load', event => {
      if (event.target instanceof HTMLImageElement && event.target.matches('[data-motion-preview]')) {
        harness.__motionLoadCount = (harness.__motionLoadCount ?? 0) + 1
      }
    }, true)
  })
  await page.addScriptTag({ content: bundle })
  await page.waitForFunction(() => Boolean((window as BrowserHarness).__motionReady))
}

async function waitForMotionLoad(count: number) {
  await page.waitForFunction(expectedCount => (
    ((window as BrowserHarness).__motionLoadCount ?? 0) === expectedCount
  ), count)
}

beforeAll(async () => {
  bundle = await buildBrowserFixture()
  browser = await chromium.launch({ headless: true })
}, 30_000)

beforeEach(async () => {
  await preparePage()
})

afterEach(async () => {
  await page?.close()
})

afterAll(async () => {
  await browser?.close()
})

describe('ExerciseMotionPreview mounted interaction', () => {
  it('keeps only the poster when no motion source is available', async () => {
    await page.evaluate(() => (window as BrowserHarness).__renderMotionPreview?.({
      motionSrc: null,
      className: 'exercise-detail-motion-layout',
    }))

    await page.locator('[data-poster-preview]').waitFor({ state: 'attached' })
    expect(await page.locator('[data-poster-preview]').getAttribute('data-variant')).toBe('hero')
    expect(await page.locator('[data-poster-preview]').getAttribute('data-zoomable')).toBe('true')
    expect(await page.locator('[data-poster-preview]').getAttribute('data-class-name')).toBe('exercise-detail-motion-layout')
    expect(await page.locator('[data-poster-preview]').getAttribute('data-image-fit')).toBe('contain')
    expect(await page.getByRole('button', { name: 'Ver movimiento' }).count()).toBe(0)
    expect(await page.locator('[data-motion-preview]').count()).toBe(0)
  })

  it('does not mount or request motion before the deliberate play action', async () => {
    await page.waitForTimeout(100)

    expect(await page.locator('[data-poster-preview]').count()).toBe(1)
    expect(await page.locator('[data-poster-preview]').getAttribute('data-image-fit')).toBe('contain')
    expect(await page.locator('[data-motion-preview]').count()).toBe(0)
    expect(motionRequests).toEqual([])
  })

  it('translates contain while keeping cover as the ExerciseImage default', async () => {
    await page.evaluate(() => (window as BrowserHarness).__renderExerciseImagePair?.())

    const containImage = page.getByAltText('Poster contain')
    const defaultImage = page.getByAltText('Poster cover predeterminado')
    await defaultImage.waitFor({ state: 'attached' })
    expect((await containImage.getAttribute('class'))?.split(/\s+/)).toContain('object-contain')
    expect((await containImage.getAttribute('class'))?.split(/\s+/)).not.toContain('object-cover')
    expect((await defaultImage.getAttribute('class'))?.split(/\s+/)).toContain('object-cover')
    expect((await defaultImage.getAttribute('class'))?.split(/\s+/)).not.toContain('object-contain')
  })

  it('mounts the animated WebP after play and restores the poster after pause', async () => {
    const firstRequest = page.waitForEvent('request', request => request.url() === motionUrl)
    await page.getByRole('button', { name: 'Ver movimiento' }).click()

    await firstRequest
    await page.locator('[data-motion-preview]').waitFor()
    await waitForMotionLoad(1)
    expect(motionRequests).toEqual([motionUrl])
    expect(await page.getByRole('button', { name: 'Pausar movimiento' }).getAttribute('aria-pressed')).toBe('true')
    expect(await page.getByText('Demostraci\u00f3n visual').count()).toBe(1)
    expect(await page.locator('[data-poster-preview]').count()).toBe(0)

    await page.getByRole('button', { name: 'Pausar movimiento' }).click()
    await page.locator('[data-poster-preview]').waitFor({ state: 'attached' })
    expect(await page.locator('[data-motion-preview]').count()).toBe(0)
    expect(await page.getByRole('button', { name: 'Ver movimiento' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('creates a fresh motion node when replaying', async () => {
    expect(motionRequests).toEqual([])
    expect(await page.evaluate(() => (window as BrowserHarness).__motionLoadCount)).toBe(0)
    const firstRequest = page.waitForEvent('request', request => request.url() === motionUrl)
    await page.getByRole('button', { name: 'Ver movimiento' }).click()
    await firstRequest
    await page.locator('[data-motion-preview]').waitFor()
    await waitForMotionLoad(1)
    const firstRevision = await page.locator('[data-motion-preview]').getAttribute('data-motion-revision')
    await page.locator('[data-motion-preview]').evaluate(element => {
      const harness = window as BrowserHarness
      harness.__firstMotionPreview = element
    })

    await page.getByRole('button', { name: 'Pausar movimiento' }).click()
    await page.getByRole('button', { name: 'Ver movimiento' }).click()
    await page.locator('[data-motion-preview]').waitFor()
    await waitForMotionLoad(2)

    expect(await page.locator('[data-motion-preview]').evaluate(element => (
      element === (window as BrowserHarness).__firstMotionPreview
    ))).toBe(false)
    expect(await page.locator('[data-motion-preview]').getAttribute('data-motion-revision')).not.toBe(firstRevision)
  })

  it('restores the poster and announces a motion loading error', async () => {
    await page.getByRole('button', { name: 'Ver movimiento' }).click()
    await page.locator('[data-motion-preview]').dispatchEvent('error')

    await page.locator('[data-poster-preview]').waitFor({ state: 'attached' })
    expect(await page.locator('[data-motion-preview]').count()).toBe(0)
    expect(await page.locator('[aria-live="polite"]').textContent()).toContain(
      'No se pudo cargar la demostraci\u00f3n visual.',
    )
  })

  it('keeps motion idle with reduced motion and Save-Data until the user plays it', async () => {
    await page.close()
    await preparePage({ reducedMotion: true, saveData: true })

    await page.waitForTimeout(100)
    expect(motionRequests).toEqual([])
    expect(await page.getByRole('button', { name: 'Ver movimiento' }).count()).toBe(1)

    const deliberateRequest = page.waitForEvent('request', request => request.url() === motionUrl)
    await page.getByRole('button', { name: 'Ver movimiento' }).click()
    await deliberateRequest
    await page.locator('[data-motion-preview]').waitFor()
    await waitForMotionLoad(1)
    expect(motionRequests).toEqual([motionUrl])
  })

  it('requires a new click after the active motion source changes through null', async () => {
    const firstRequest = page.waitForEvent('request', request => request.url() === motionUrl)
    await page.getByRole('button', { name: 'Ver movimiento' }).click()
    await firstRequest
    await waitForMotionLoad(1)

    await page.evaluate(() => (window as BrowserHarness).__renderMotionPreview?.({ motionSrc: null }))
    await page.locator('[data-poster-preview]').waitFor({ state: 'attached' })
    await page.evaluate(replacement => (
      (window as BrowserHarness).__renderMotionPreview?.({ motionSrc: replacement })
    ), replacementMotionUrl)

    await page.locator('[data-poster-preview]').waitFor({ state: 'attached' })
    await page.waitForTimeout(100)
    expect(await page.locator('[data-motion-preview]').count()).toBe(0)
    expect(motionRequests).toEqual([motionUrl])
    expect(await page.getByRole('button', { name: 'Ver movimiento' }).getAttribute('aria-pressed')).toBe('false')

    const replacementRequest = page.waitForEvent('request', request => request.url() === replacementMotionUrl)
    await page.getByRole('button', { name: 'Ver movimiento' }).click()
    await replacementRequest
    await waitForMotionLoad(2)
  })
})
