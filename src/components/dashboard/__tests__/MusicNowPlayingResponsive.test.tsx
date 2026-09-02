import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium, expect as pwExpect, type Browser } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { MusicPlaybackSnapshot } from '@/lib/native/musicSession'

describe('MusicNowPlaying responsive composition', () => {
  let browser: Browser
  let viteServer: {
    listen: () => Promise<void>
    close: () => Promise<void>
    httpServer: { address: () => string | { port: number } | null }
  }
  let baseUrl = ''

  beforeAll(async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const viteEntry = path.join(repoRoot, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')
    const { createServer } = await import(pathToFileURL(viteEntry).href)
    viteServer = await createServer({
      configFile: false,
      root: repoRoot,
      appType: 'spa',
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-music-now-playing-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'react-dom/client',
          'react/jsx-dev-runtime',
          'lucide-react',
        ],
      },
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: [
          {
            find: 'next/image',
            replacement: path.join(repoRoot, 'src/components/dashboard/__tests__/fixtures/musicNowPlayingNextImage.fixture.tsx'),
          },
          { find: '@', replacement: path.join(repoRoot, 'src') },
        ],
      },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Music fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    await viteServer?.close()
  }, 30_000)

  async function openFixture(viewportWidth: number, reducedMotion: 'no-preference' | 'reduce' = 'no-preference') {
    const page = await browser.newPage({ viewport: { width: viewportWidth, height: 800 } })
    await page.emulateMedia({ reducedMotion })
    await page.goto(`${baseUrl}/src/components/dashboard/__tests__/fixtures/musicNowPlaying.html`)
    await page.waitForFunction(() => Boolean(window.__MUSIC_NOW_PLAYING_READY__))
    await page.locator('[data-music-card="true"]').waitFor()
    return page
  }

  it.each([320, 360, 390, 412, 430])(
    'contains one vertically centered compact card and its web inside %ipx',
    async viewportWidth => {
      const page = await openFixture(viewportWidth)
      try {
        const geometry = await page.evaluate(() => {
          const slot = document.querySelector<HTMLElement>('[data-music-now-playing-slot="true"]')
          const halo = document.querySelector<SVGElement>('svg[viewBox="0 0 760 143"]')
          const card = document.querySelector<HTMLElement>('[data-music-card="true"]')
          const cardLayer = document.querySelector<HTMLElement>('[data-music-card-layer="true"]')
          const fallback = document.querySelector<HTMLElement>('[data-music-artwork="fallback"]')
          const transport = card?.querySelector<HTMLElement>('[data-music-transport="true"]')
          const buttons = transport ? Array.from(transport.querySelectorAll<HTMLButtonElement>('button')) : []
          const copy = transport?.previousElementSibling as HTMLElement | null
          const contentRow = card?.querySelector<HTMLElement>(':scope > div')
          const labels = card ? Array.from(card.querySelectorAll<HTMLElement>('p, [data-source-label="true"]')) : []
          const slider = card?.querySelector<HTMLInputElement>('input[type="range"]')
          if (!slot || !halo || !card || !cardLayer || !fallback || !transport || !copy || !contentRow || !slider) {
            throw new Error('The active music composition is incomplete.')
          }

          const slotBounds = slot.getBoundingClientRect()
          const haloBounds = halo.getBoundingClientRect()
          const cardBounds = card.getBoundingClientRect()
          const copyBounds = copy.getBoundingClientRect()
          const transportBounds = transport.getBoundingClientRect()
          const sliderBounds = slider.getBoundingClientRect()
          const rowBounds = contentRow.getBoundingClientRect()
          const slotStyle = getComputedStyle(slot)
          const haloStyle = getComputedStyle(halo)

          return {
            viewportWidth: window.innerWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
            slotTop: slotBounds.top,
            slotBottom: slotBounds.bottom,
            slotHeight: slotBounds.height,
            slotOverflow: slotStyle.overflow,
            haloTop: haloBounds.top,
            haloBottom: haloBounds.bottom,
            haloOverflow: haloStyle.overflow,
            cardHeight: cardBounds.height,
            cardCenterDelta: Math.abs(
              (cardBounds.top + cardBounds.bottom) / 2 - (slotBounds.top + slotBounds.bottom) / 2,
            ),
            rowCenterDelta: Math.abs(
              (rowBounds.top + rowBounds.bottom) / 2 - (cardBounds.top + cardBounds.bottom) / 2,
            ),
            copyRight: copyBounds.right,
            transportLeft: transportBounds.left,
            transportRight: transportBounds.right,
            cardRight: cardBounds.right,
            sliderLeft: sliderBounds.left,
            sliderRight: sliderBounds.right,
            buttonWidths: buttons.map(button => button.getBoundingClientRect().width),
            haloCount: document.querySelectorAll('svg[viewBox="0 0 760 143"]').length,
            cardCount: document.querySelectorAll('[data-music-card="true"]').length,
            fallbackCount: document.querySelectorAll('[data-music-artwork="fallback"]').length,
            labels: labels.map(label => {
              const style = getComputedStyle(label)
              return {
                source: label.hasAttribute('data-source-label'),
                clientWidth: label.clientWidth,
                scrollWidth: label.scrollWidth,
                display: style.display,
                overflowX: style.overflowX,
                textOverflow: style.textOverflow,
                whiteSpace: style.whiteSpace,
              }
            }),
          }
        })

        expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.viewportWidth)
        expect(geometry.slotHeight).toBe(143)
        expect(geometry.slotOverflow).toBe('hidden')
        expect(geometry.haloTop).toBeGreaterThanOrEqual(geometry.slotTop)
        expect(geometry.haloBottom).toBeLessThanOrEqual(geometry.slotBottom)
        expect(geometry.haloOverflow).toBe('hidden')
        expect(geometry.cardHeight).toBeGreaterThanOrEqual(89)
        expect(geometry.cardHeight).toBeLessThanOrEqual(92)
        expect(geometry.cardCenterDelta).toBeLessThanOrEqual(0.5)
        expect(geometry.rowCenterDelta).toBeLessThanOrEqual(0.5)
        expect(geometry.copyRight).toBeLessThanOrEqual(geometry.transportLeft)
        expect(geometry.transportRight).toBeLessThanOrEqual(geometry.cardRight)
        expect(geometry.sliderLeft).toBeGreaterThanOrEqual(0)
        expect(geometry.sliderRight).toBeLessThanOrEqual(geometry.viewportWidth)
        expect(geometry.buttonWidths).toHaveLength(3)
        expect(geometry.buttonWidths.every(width => width >= 44)).toBe(true)
        expect(geometry.haloCount).toBe(1)
        expect(geometry.cardCount).toBe(1)
        expect(geometry.fallbackCount).toBe(1)
        expect(geometry.labels).toHaveLength(3)
        for (const label of geometry.labels) {
          if (geometry.viewportWidth === 320 && label.source) {
            expect(label.display).toBe('none')
            continue
          }
          expect(label.clientWidth).toBeGreaterThan(0)
          expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)
          expect(label.overflowX).toBe('hidden')
          expect(label.textOverflow).toBe('ellipsis')
          expect(label.whiteSpace).toBe('nowrap')
        }
      } finally {
        await page.close()
      }
    },
    40_000,
  )

  it('removes bar and accent-thread animation when reduced motion is requested', async () => {
    const page = await openFixture(390, 'reduce')
    try {
      const animations = await page.evaluate(() => ({
        bars: Array.from(document.querySelectorAll<HTMLElement>('[data-music-bar="true"]'))
          .map(bar => getComputedStyle(bar).animationName),
        accents: Array.from(document.querySelectorAll<SVGElement>('.vekira-music-web-accent'))
          .map(thread => getComputedStyle(thread).animationName),
      }))

      expect(animations.bars).toHaveLength(4)
      expect(animations.accents.length).toBeGreaterThan(0)
      expect(animations.bars.every(name => name === 'none')).toBe(true)
      expect(animations.accents.every(name => name === 'none')).toBe(true)
    } finally {
      await page.close()
    }
  }, 40_000)

  it('invokes only the confirmed dynamic action and never toggles the label optimistically', async () => {
    const page = await openFixture(390)
    try {
      const play = page.getByRole('button', { name: /Reproducir/ })
      await play.click()
      expect(await page.evaluate(() => window.__musicControlCalls)).toEqual({
        play: 1, pause: 0, previous: 0, next: 0, seekTo: [],
      })
      await pwExpect(play).toBeVisible()

      await page.evaluate(() => window.__setMusicFixture?.({ state: 'playing' }))
      const pause = page.getByRole('button', { name: /Pausar/ })
      await pwExpect(pause).toBeVisible()
      await pause.click()
      expect(await page.evaluate(() => window.__musicControlCalls)).toEqual({
        play: 1, pause: 1, previous: 0, next: 0, seekTo: [],
      })
      await pwExpect(pause).toBeVisible()

      await page.evaluate(() => window.__setMusicFixture?.({ state: 'paused', canPlay: false }))
      await pwExpect(play).toBeDisabled()
      await play.evaluate(button => (button as HTMLButtonElement).click())
      expect(await page.evaluate(() => window.__musicControlCalls)).toEqual({
        play: 1, pause: 1, previous: 0, next: 0, seekTo: [],
      })

      await page.evaluate(() => window.__setMusicFixture?.({ canPlay: true, controlPending: true }))
      await pwExpect(play).toBeDisabled()
      await play.evaluate(button => (button as HTMLButtonElement).click())
      expect(await page.evaluate(() => window.__musicControlCalls)).toEqual({
        play: 1, pause: 1, previous: 0, next: 0, seekTo: [],
      })
    } finally {
      await page.close()
    }
  }, 40_000)

  it('dispatches previous and next, then seeks once when a slider drag is released', async () => {
    const page = await openFixture(390)
    try {
      await page.getByRole('button', { name: 'Anterior' }).click()
      await page.getByRole('button', { name: 'Siguiente' }).click()

      const slider = page.getByRole('slider', { name: /Posici.n de/ })
      const bounds = await slider.boundingBox()
      if (!bounds) throw new Error('The music seek slider is not measurable.')

      await page.mouse.move(bounds.x + bounds.width * 0.35, bounds.y + bounds.height / 2)
      await page.mouse.down()
      await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + bounds.height / 2)

      expect(await page.evaluate(() => window.__musicControlCalls.seekTo)).toEqual([])

      await page.mouse.up()
      await page.keyboard.press('Tab')
      const calls = await page.evaluate(() => window.__musicControlCalls)
      expect(calls.previous).toBe(1)
      expect(calls.next).toBe(1)
      expect(calls.seekTo).toHaveLength(1)
      expect(calls.seekTo[0]).toBeGreaterThan(125_000)
      expect(calls.seekTo[0]).toBeLessThan(145_000)
      expect(await page.evaluate(() => window.__musicControlSessionIds)).toEqual([
        'fixture-session',
        'fixture-session',
        'fixture-session',
      ])
    } finally {
      await page.close()
    }
  }, 40_000)

  it('keeps unavailable transport controls visible and blocks their commands', async () => {
    const page = await openFixture(390)
    try {
      await page.evaluate(() => window.__setMusicFixture?.({
        canSkipPrevious: false,
        canSkipNext: false,
        canSeek: false,
      }))

      const previous = page.getByRole('button', { name: 'Anterior' })
      const next = page.getByRole('button', { name: 'Siguiente' })
      const slider = page.getByRole('slider', { name: /Posici.n de/ })
      await pwExpect(previous).toBeDisabled()
      await pwExpect(next).toBeDisabled()
      await pwExpect(slider).toBeDisabled()

      await previous.evaluate(button => (button as HTMLButtonElement).click())
      await next.evaluate(button => (button as HTMLButtonElement).click())
      expect(await page.evaluate(() => window.__musicControlCalls)).toEqual({
        play: 0, pause: 0, previous: 0, next: 0, seekTo: [],
      })
    } finally {
      await page.close()
    }
  }, 40_000)

  it('cancels an in-flight seek when Android replaces the confirmed session', async () => {
    const page = await openFixture(390)
    try {
      const slider = page.getByRole('slider', { name: /Posici.n de/ })
      const bounds = await slider.boundingBox()
      if (!bounds) throw new Error('The music seek slider is not measurable.')

      await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height / 2)
      await page.mouse.down()
      await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height / 2)
      await page.evaluate(() => window.__setMusicFixture?.({
        sessionId: 'fixture-session-b',
        title: 'Canción confirmada B',
        durationMs: 240_000,
      }))
      await pwExpect(page.getByRole('slider', { name: /Canción confirmada B/ })).toBeVisible()
      await page.mouse.up()

      expect(await page.evaluate(() => window.__musicControlCalls.seekTo)).toEqual([])
    } finally {
      await page.close()
    }
  }, 40_000)

  it('keeps the confirmed card and briefly announces a rejected Android control without an unhandled promise', async () => {
    const page = await openFixture(390)
    try {
      await page.clock.install()
      await page.evaluate(() => { window.__rejectNextMusicControl = true })
      const play = page.getByRole('button', { name: /Reproducir/ })
      await play.click()

      const announcement = page.locator('[aria-live="polite"]')
      await pwExpect(announcement).toHaveText('No se pudo controlar la reproducción.')
      await pwExpect(page.locator('[data-music-card="true"]')).toBeVisible()
      await pwExpect(play).toBeVisible()
      expect(await page.evaluate(() => window.__unhandledMusicRejections)).toBe(0)

      await play.click()
      await pwExpect(announcement).toHaveCount(0)

      await page.evaluate(() => { window.__rejectNextMusicControl = true })
      await play.click()
      await pwExpect(announcement).toHaveText('No se pudo controlar la reproducción.')
      await page.clock.fastForward(3_100)
      await pwExpect(announcement).toHaveCount(0)
      expect(await page.evaluate(() => window.__unhandledMusicRejections)).toBe(0)
    } finally {
      await page.close()
    }
  }, 40_000)

  it('does not announce a late control failure after the confirmed session changes', async () => {
    const page = await openFixture(390)
    try {
      await page.evaluate(() => { window.__deferNextMusicControl = true })
      await page.getByRole('button', { name: /Reproducir/ }).click()
      expect(await page.evaluate(() => window.__musicControlCalls)).toEqual({
        play: 1, pause: 0, previous: 0, next: 0, seekTo: [],
      })

      await page.evaluate(() => window.__setMusicFixture?.({
        sessionId: 'fixture-session-b',
        title: 'Canción confirmada B',
      }))
      await pwExpect(page.getByRole('button', { name: 'Reproducir Canción confirmada B' })).toBeVisible()

      await page.evaluate(() => window.__rejectDeferredMusicControl?.())
      await page.waitForFunction(() => window.__deferredMusicControlSettled)
      await page.evaluate(() => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }))

      await pwExpect(page.locator('[aria-live="polite"]')).toHaveCount(0)
      await pwExpect(page.locator('[data-music-card="true"]')).toContainText('Canción confirmada B')
      expect(await page.evaluate(() => window.__unhandledMusicRejections)).toBe(0)
    } finally {
      await page.close()
    }
  }, 40_000)

  it('keeps the committed session eligible when a replacement render suspends', async () => {
    const page = await openFixture(390)
    try {
      await page.evaluate(() => { window.__deferNextMusicControl = true })
      const committedPlay = page.getByRole('button', { name: /Reproducir/ })
      await committedPlay.click()
      expect(await page.evaluate(() => window.__musicControlCalls)).toEqual({
        play: 1, pause: 0, previous: 0, next: 0, seekTo: [],
      })

      await page.evaluate(() => window.__startSuspendedMusicSessionTransition?.({
        sessionId: 'fixture-session-suspended-b',
        title: 'Canción suspendida B',
      }))
      await page.waitForFunction(() => window.__musicSuspendedGateReached)

      await pwExpect(committedPlay).toBeVisible()
      await pwExpect(page.locator('[data-music-card="true"]')).not.toContainText('Canción suspendida B')

      await page.evaluate(() => window.__rejectDeferredMusicControl?.())
      await page.waitForFunction(() => window.__deferredMusicControlSettled)

      await pwExpect(page.locator('[aria-live="polite"]'))
        .toHaveText('No se pudo controlar la reproducción.')
      await pwExpect(committedPlay).toBeVisible()
      expect(await page.evaluate(() => window.__unhandledMusicRejections)).toBe(0)
    } finally {
      await page.close()
    }
  }, 40_000)

  it('announces a deferred control failure while its confirmed session remains current', async () => {
    const page = await openFixture(390)
    try {
      await page.evaluate(() => { window.__deferNextMusicControl = true })
      await page.getByRole('button', { name: /Reproducir/ }).click()
      await page.evaluate(() => window.__rejectDeferredMusicControl?.())
      await page.waitForFunction(() => window.__deferredMusicControlSettled)

      await pwExpect(page.locator('[aria-live="polite"]'))
        .toHaveText('No se pudo controlar la reproducción.')
    } finally {
      await page.close()
    }
  }, 40_000)

  it('consumes English music copy for fallback, controls and rejected-control announcements', async () => {
    const page = await openFixture(390)
    try {
      await page.evaluate(() => {
        window.__setMusicFixtureLanguage?.('en')
        window.__setMusicFixture?.({ artist: null, album: null })
      })

      const play = page.getByRole('button', { name: 'Play CanciónConUnTítuloExtremadamenteLargoSinEspaciosQueDebeQuedarRecortado' })
      await pwExpect(play).toBeVisible()
      await pwExpect(page.locator('[data-music-card="true"]')).toContainText('Unknown artist')

      await page.evaluate(() => { window.__rejectNextMusicControl = true })
      await play.click()
      await pwExpect(page.locator('[aria-live="polite"]')).toHaveText('Could not control playback.')

      await page.evaluate(() => window.__setMusicFixture?.({ state: 'playing' }))
      await pwExpect(page.getByRole('button', { name: 'Pause CanciónConUnTítuloExtremadamenteLargoSinEspaciosQueDebeQuedarRecortado' })).toBeVisible()
      expect(await page.locator('[data-music-now-playing-slot="true"]').innerText()).not.toMatch(/Artista desconocido|Pausar|Reproducir|No se pudo controlar/)
    } finally {
      await page.close()
    }
  }, 40_000)
})

declare global {
  interface Window {
    __MUSIC_NOW_PLAYING_READY__?: boolean
    __deferNextMusicControl: boolean
    __deferredMusicControlSettled: boolean
    __musicControlCalls: {
      play: number
      pause: number
      previous: number
      next: number
      seekTo: number[]
    }
    __musicControlSessionIds: string[]
    __musicSuspendedGateReached: boolean
    __rejectDeferredMusicControl?: () => void
    __rejectNextMusicControl: boolean
    __setMusicFixture?: (patch: Partial<MusicPlaybackSnapshot> & {
      controlPending?: boolean
    }) => void
    __setMusicFixtureLanguage?: (language: 'es' | 'en') => void
    __startSuspendedMusicSessionTransition?: (patch: Partial<MusicPlaybackSnapshot> & {
      controlPending?: boolean
    }) => void
    __unhandledMusicRejections: number
  }
}
