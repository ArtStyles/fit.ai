import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { chromium, expect as pwExpect, type Browser, type Page } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { expectActionTargetsAtLeast44 } from '../../../../tests/e2e/helpers/acceptance'

const VIEWPORTS = [320, 360, 390, 412, 1280] as const
const IMPORTANT_COPY = [
  'Tu entrenador',
  'Acompañamiento activo',
  'Seguimiento de fuerza integral',
  'Falta autorizar tus datos de entrenamiento',
  'Rutina pendiente de revisión',
  'Falta un paso para recibir tu rutina',
  'Autorizar datos de entrenamiento',
  'Medidas corporales — Opcional',
  'Listo para recibir rutina',
  'Propuesta pendiente',
  'Rutina activa',
  'El cliente ya tiene una propuesta pendiente de revisión.',
  'El cliente ya tiene una rutina profesional activa.',
] as const

type MeasuredRect = {
  bottom: number
  label: string
  left: number
  right: number
  top: number
}

function rectanglesOverlap(first: MeasuredRect, second: MeasuredRect): boolean {
  const horizontalIntersection = Math.min(first.right, second.right) - Math.max(first.left, second.left)
  const verticalIntersection = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)
  return horizontalIntersection > 0.5 && verticalIntersection > 0.5
}

describe('coaching context cross-flow acceptance', () => {
  let artifactDirectory = ''
  let baseUrl = ''
  let browser: Browser
  let viteServer: {
    close: () => Promise<void>
    httpServer: { address: () => string | { port: number } | null }
    listen: () => Promise<void>
  }

  beforeAll(async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const viteEntry = path.join(repoRoot, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')
    const { createServer } = await import(pathToFileURL(viteEntry).href)
    artifactDirectory = path.join(repoRoot, 'artifacts', 'coaching-context-acceptance')
    await mkdir(artifactDirectory, { recursive: true })
    viteServer = await createServer({
      appType: 'spa',
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-coaching-context-acceptance-test'),
      configFile: false,
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'react-dom/client',
          'react/jsx-dev-runtime',
          'lucide-react',
          '@radix-ui/react-avatar',
          '@radix-ui/react-select',
          'clsx',
          'tailwind-merge',
        ],
      },
      oxc: { jsx: { runtime: 'automatic' } },
      resolve: {
        alias: [
          {
            find: '@/app/actions/coachingRelationships',
            replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/consentActions.fixture.ts'),
          },
          {
            find: '@/app/actions/trainerAssignments',
            replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/trainerAssignments.fixture.ts'),
          },
          {
            find: 'next/navigation',
            replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/nextNavigation.fixture.ts'),
          },
          {
            find: 'next/link',
            replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/nextLink.fixture.tsx'),
          },
          { find: '@', replacement: path.join(repoRoot, 'src') },
        ],
        dedupe: ['react', 'react-dom'],
      },
      root: repoRoot,
      server: { hmr: false, host: '127.0.0.1', port: 0, strictPort: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') {
      throw new Error('Coaching context acceptance fixture did not bind a TCP port.')
    }
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 45_000)

  afterAll(async () => {
    await browser?.close()
    await viteServer?.close()
  }, 30_000)

  async function openFixture(viewportWidth: number): Promise<Page> {
    const context = await browser.newContext({ viewport: { height: 900, width: viewportWidth } })
    const page = await context.newPage()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const response = await page.goto(
      `${baseUrl}/src/components/coaching/__tests__/fixtures/coachingContextAcceptance.html`,
    )
    expect(response?.ok(), 'the coaching context acceptance fixture must be served').toBe(true)
    await page.waitForFunction(() => Boolean(window.__COACHING_CONTEXT_ACCEPTANCE_READY__))
    await page.evaluate(async () => {
      await document.fonts?.ready
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    })
    await page.getByRole('button', { name: 'Enviar a un cliente' }).click()
    await pwExpect(page.getByRole('button', { name: 'Cerrar' })).toBeVisible()
    return page
  }

  it.each(VIEWPORTS)(
    'keeps every coaching state readable and operable at %ipx',
    async viewportWidth => {
      const page = await openFixture(viewportWidth)
      try {
        for (const copy of IMPORTANT_COPY) {
          await pwExpect(page.getByText(copy, { exact: false }).first(), copy).toBeVisible()
        }

        const geometry = await page.evaluate(() => {
          const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-acceptance-surface]'))
          if (sections.length !== 4) {
            throw new Error(`Expected four acceptance surfaces, received ${sections.length}.`)
          }

          return {
            document: {
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
            },
            sections: sections.map(section => ({
              clientWidth: section.clientWidth,
              name: section.dataset.acceptanceSurface ?? 'unknown',
              scrollWidth: section.scrollWidth,
            })),
            ctas: sections.map(section => ({
              name: section.dataset.acceptanceSurface ?? 'unknown',
              rectangles: Array.from(section.querySelectorAll<HTMLElement>('a[href], button'))
                .flatMap(element => {
                  const rectangle = element.getBoundingClientRect()
                  const style = getComputedStyle(element)
                  if (
                    rectangle.width <= 0
                    || rectangle.height <= 0
                    || style.display === 'none'
                    || style.visibility === 'hidden'
                    || element.closest('details:not([open])')
                  ) return []
                  return [{
                    bottom: rectangle.bottom,
                    label: element.getAttribute('aria-label') ?? element.textContent?.trim().replace(/\s+/g, ' ') ?? element.tagName,
                    left: rectangle.left,
                    right: rectangle.right,
                    top: rectangle.top,
                  }]
                }),
            })),
          }
        })

        expect(geometry.document.scrollWidth).toBeLessThanOrEqual(geometry.document.clientWidth)
        for (const section of geometry.sections) {
          expect(
            section.scrollWidth,
            `${section.name} scrollWidth ${section.scrollWidth}px exceeds clientWidth ${section.clientWidth}px`,
          ).toBeLessThanOrEqual(section.clientWidth)
        }

        const overlapFailures = geometry.ctas.flatMap(group => group.rectangles.flatMap((rectangle, index) => (
          group.rectangles.slice(index + 1)
            .filter(candidate => rectanglesOverlap(rectangle, candidate))
            .map(candidate => `${group.name}: ${rectangle.label} overlaps ${candidate.label}`)
        )))
        expect(overlapFailures, 'visible coaching CTAs overlap').toEqual([])

        await expectActionTargetsAtLeast44(page)

        const axeResult = await new AxeBuilder({ page }).analyze()
        expect(
          axeResult.violations.map(violation => ({
            help: violation.help,
            id: violation.id,
            impact: violation.impact,
            targets: violation.nodes.map(node => node.target),
          })),
          'the rendered coaching acceptance surface has Axe violations',
        ).toEqual([])

        if (viewportWidth === 320 || viewportWidth === 1280) {
          const captureHeight = await page.evaluate(() => Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight,
          ))
          await page.setViewportSize({ height: captureHeight, width: viewportWidth })
          await page.evaluate(() => {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
            document.scrollingElement?.scrollTo(0, 0)
            document.documentElement.scrollTop = 0
            document.body.scrollTop = 0
            window.scrollTo(0, 0)
          })
          await page.waitForFunction(() => (
            window.scrollY === 0
            && document.documentElement.scrollTop === 0
            && document.body.scrollTop === 0
          ))
          await pwExpect(page.getByRole('heading', { name: 'Encuentra tu entrenador' })).toBeInViewport()
          await page.screenshot({
            fullPage: true,
            path: path.join(artifactDirectory, `coaching-context-${viewportWidth}.png`),
          })
        }
      } finally {
        await page.context().close()
      }
    },
    45_000,
  )
})

declare global {
  interface Window {
    __COACHING_CONTEXT_ACCEPTANCE_READY__?: boolean
  }
}
