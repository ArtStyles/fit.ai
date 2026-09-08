import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { chromium, expect, type Browser, type Page } from '@playwright/test'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import tailwindConfig from '../../tailwind.config'
import { DEMO_NOW, makeDemoData } from './fixture-data'

const root = resolve(import.meta.dirname, '../..')
const require = createRequire(import.meta.url)
// pnpm keeps esbuild alongside its existing Vite/tsx dependencies.
const { build } = require(require.resolve('esbuild', { paths: [root, resolve(root, 'node_modules/.pnpm/node_modules')] })) as typeof import('../../node_modules/.pnpm/node_modules/esbuild')
const artifacts = resolve(root, '.artifacts/marketing-demo')
const fontDirectory = resolve(process.env.MARKETING_DEMO_FONT_DIR ?? resolve(root, '.artifacts/auth-ui'))
const boundaryPath = resolve(import.meta.dirname, 'runtime-boundaries.tsx')
const outputDirectory = resolve(root, 'public/marketing')
const remoteActions = new Set([
  '@/app/actions/authorizeSession', '@/app/actions/saveSession', '@/app/actions/posts',
  '@/app/actions/workspace', '@/app/actions/exerciseCatalog', '@/app/(auth)/actions', '@/hooks/useWakeLock',
])

async function bundle() {
  const result = await build({
    absWorkingDir: root, entryPoints: [resolve(import.meta.dirname, 'fixture.tsx')],
    bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic',
    target: 'es2022', minify: true, metafile: true,
    tsconfig: resolve(root, 'tsconfig.json'),
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'local-marketing-runtime-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /^(next\/(navigation|link|image)|@\/app\/.*actions|@\/hooks\/useWakeLock)/ }, args => {
          if (args.path === 'next/link' || args.path === 'next/image') return { path: args.path, namespace: 'marketing-framework' }
          if (args.path === 'next/navigation' || remoteActions.has(args.path)) return { path: boundaryPath }
          throw new Error(`Unmocked remote boundary: ${args.path}`)
        })
        builder.onLoad({ filter: /.*/, namespace: 'marketing-framework' }, args => ({
          contents: `export { ${args.path === 'next/link' ? 'DemoLink' : 'DemoImage'} as default } from ${JSON.stringify(boundaryPath)};`,
          resolveDir: root, loader: 'tsx',
        }))
      },
    }],
  })
  const forbidden = Object.keys(result.metafile.inputs).filter(path => /(?:lib\/supabase|seed-e2e|app\/actions\/|app\/\(auth\)\/actions)/.test(path.replaceAll('\\', '/')))
  if (forbidden.length) throw new Error(`Remote application code entered the demo bundle: ${forbidden.join(', ')}`)
  const stylesheet = await postcss([
    tailwindcss({ ...tailwindConfig, content: [...(tailwindConfig.content as string[]), './scripts/marketing-demo/*.{ts,tsx}'] }),
    autoprefixer(),
  ]).process(await readFile(resolve(root, 'src/styles/globals.css'), 'utf8'), { from: resolve(root, 'src/styles/globals.css') })
  const fonts = await readFile(resolve(fontDirectory, 'local-fonts.css'), 'utf8')
  const css = `${fonts}\n${stylesheet.css}\n:root{--font-sans:'Plus Jakarta Sans';--font-display:'Barlow Condensed'}html,body{margin:0}*{scroll-behavior:auto!important}`
  return { javascript: result.outputFiles[0].contents, css, inputs: Object.keys(result.metafile.inputs) }
}

function safeLocalPath(base: string, path: string): string {
  const resolved = resolve(base, path)
  const within = relative(base, resolved)
  if (within.startsWith(`..${sep}`) || within === '..' || isAbsolute(within)) throw new Error('Invalid local asset path')
  return resolved
}

async function webpFromPng(page: Page, png: Buffer) {
  const base64 = await page.evaluate(async value => {
    const image = new Image()
    image.src = `data:image/png;base64,${value}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No screenshot conversion context')
    context.drawImage(image, 0, 0)
    return canvas.toDataURL('image/webp', 0.94).split(',')[1]
  }, png.toString('base64'))
  if (!base64) throw new Error('Empty WebP conversion')
  return Buffer.from(base64, 'base64')
}

async function main() {
  await mkdir(artifacts, { recursive: true })
  await mkdir(outputDirectory, { recursive: true })
  const compiled = await bundle()
  const html = '<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
  const contentTypes: Record<string, string> = { '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' }
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return }
      if (path === '/app.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(compiled.javascript); return }
      if (path === '/app.css') { response.setHeader('Content-Type', 'text/css'); response.end(compiled.css); return }
      const localFile = path.startsWith('/auth-fonts/')
        ? safeLocalPath(fontDirectory, path.slice('/auth-fonts/'.length))
        : safeLocalPath(resolve(root, 'public'), path.slice(1))
      response.setHeader('Content-Type', contentTypes[extname(localFile)] ?? 'application/octet-stream')
      response.end(await readFile(localFile))
    } catch { response.writeHead(404); response.end('Local asset unavailable') }
  })
  await new Promise<void>(resolveListening => server.listen(0, '127.0.0.1', resolveListening))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Local capture server did not start')
  const origin = `http://127.0.0.1:${address.port}`
  const manifest: Array<Record<string, unknown>> = []
  let browser: Browser | undefined
  try {
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
    for (const locale of ['es', 'en'] as const) {
      for (const surface of ['session', 'dashboard', 'progress'] as const) {
        const viewport = surface === 'progress' ? { width: 760, height: 1100 } : { width: 390, height: 760 }
        const context = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: locale === 'es' ? 'es-ES' : 'en-US', timezoneId: 'America/Havana', reducedMotion: 'reduce' })
        const page = await context.newPage()
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        const blocked: string[] = []
        await context.route('**/*', route => {
          const url = route.request().url()
          if (url.startsWith(`${origin}/`) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue()
          blocked.push(url)
          return route.abort('blockedbyclient')
        })
        await page.clock.setFixedTime(new Date(DEMO_NOW))
        await page.goto(`${origin}/?locale=${locale}&surface=${surface}`, { waitUntil: 'networkidle' })
        await expect(page.locator('html')).toHaveAttribute('data-demo-ready', 'true')
        await page.evaluate(() => document.fonts.ready)
        const fontsReady = await page.evaluate(() => document.fonts.check('400 16px "Plus Jakarta Sans"') && document.fonts.check('700 24px "Barlow Condensed"'))
        if (!fontsReady) throw new Error(`Local app fonts are unavailable in ${surface}/${locale}`)
        await expect(page.locator(`[data-marketing-capture="${surface}"]`)).toBeVisible()
        let captureHeight = viewport.height
        if (surface === 'session') {
          const activeSet = page.getByRole('group', { name: locale === 'es' ? 'Serie actual' : 'Current set', exact: true })
          await expect(activeSet).toBeVisible()
          const dock = page.locator('[data-exercise-id="demo-exercise-1"]')
          const setBox = await activeSet.boundingBox()
          const dockBox = await dock.boundingBox()
          if (!setBox || !dockBox) throw new Error('Missing real session card or action dock')
          // Grow only the viewport when the actual mobile set card would be cut.
          captureHeight = Math.max(760, Math.ceil(setBox.y + setBox.height + dockBox.height + 12))
          await page.setViewportSize({ width: 390, height: captureHeight })
          await expect(page.getByRole('button', { name: locale === 'es' ? 'Completar serie 3' : 'Complete set 3', exact: true })).toBeVisible()
          const finalSet = await activeSet.boundingBox()
          const finalDock = await dock.boundingBox()
          if (!finalSet || !finalDock || finalSet.y + finalSet.height > finalDock.y) throw new Error('The session action dock obscures the active set')
        } else if (surface === 'progress') {
          await page.getByRole('button', { name: locale === 'es' ? '4 semanas' : '4 weeks', exact: true }).click()
          const chart = page.getByRole('group', { name: locale === 'es' ? 'Carga semanal de entrenamiento' : 'Weekly training load', exact: true })
          await expect(chart.getByRole('button')).toHaveCount(4)
          const chartFits = await chart.evaluate(element => element.getBoundingClientRect().right <= window.innerWidth)
          if (!chartFits) throw new Error('The weekly chart is clipped horizontally')
          const card = page.locator('section[aria-labelledby="training-load-title"]')
          const box = await card.boundingBox()
          if (!box) throw new Error('Missing real training-load card')
          captureHeight = Math.ceil(box.y + box.height + 24)
        } else {
          const today = page.locator('section[aria-labelledby="today-title"]')
          await expect(today).toBeVisible()
          const box = await today.boundingBox()
          if (!box || box.y + box.height > viewport.height) throw new Error('Today’s workout card does not fit in the dashboard capture')
          const nextWorkout = page.getByRole('button').filter({ hasText: makeDemoData(locale).workouts[1].name }).first()
          const nextBox = await nextWorkout.boundingBox()
          if (!nextBox) throw new Error('The next scheduled workout is missing from the dashboard')
          // Stop in the natural gap after Wednesday; never cut Thursday's card.
          captureHeight = Math.ceil(nextBox.y + nextBox.height + 10)
        }
        const visibleText = await page.locator('body').innerText()
        if (/\bE2E\b|\btest\b|Preparando sesión|Preparing session/.test(visibleText)) throw new Error(`Unfinished fixture content in ${surface}/${locale}`)
        if (await page.locator('.animate-spin:visible').count()) throw new Error(`Visible loading spinner in ${surface}/${locale}`)
        const imagesReady = await page.locator('img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))
        if (!imagesReady) throw new Error(`Missing local image in ${surface}/${locale}`)
        if (errors.length || blocked.length) throw new Error(JSON.stringify({ errors, blocked }))
        const name = `demo-${surface}-${locale}`
        const png = await page.screenshot({ type: 'png', animations: 'disabled', clip: { x: 0, y: 0, width: viewport.width, height: captureHeight } })
        await writeFile(resolve(artifacts, `${name}.png`), png)
        const output = resolve(outputDirectory, `${name}.webp`)
        await writeFile(output, await webpFromPng(page, png))
        manifest.push({ surface, locale, width: viewport.width * 2, height: captureHeight * 2, viewport: { width: viewport.width, height: captureHeight }, deviceScaleFactor: 2, path: relative(root, output).replaceAll('\\', '/'), fictional: true, blockedRequests: blocked.length, browserErrors: errors.length })
        console.log(`${name}: ${viewport.width * 2}x${captureHeight * 2} pixels (${viewport.width}x${captureHeight} viewport)`)
        await context.close()
      }
    }
    await writeFile(resolve(artifacts, 'manifest.json'), JSON.stringify({ generatedFrom: 'existing React product components', date: DEMO_NOW, assets: manifest, bundledInputs: compiled.inputs }, null, 2))
  } finally {
    await browser?.close()
    await new Promise<void>((resolveClosed, reject) => server.close(error => error ? reject(error) : resolveClosed()))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
