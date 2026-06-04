/**
 * Genera las imágenes de origen para @capacitor/assets a partir de public/icon.svg.
 *
 * Salida en assets/:
 *   - icon-only.png        (1024) logo completo (fondo + rayo)
 *   - icon-background.png  (1024) fondo sólido del adaptive icon
 *   - icon-foreground.png  (1024) solo el rayo, centrado en la safe zone
 *   - splash.png           (2732) rayo centrado sobre fondo
 *   - splash-dark.png      (2732) idéntico (la app es dark siempre)
 *
 * Tras ejecutarlo: `npx capacitor-assets generate --android`
 * Uso: `node scripts/generate-source-assets.mjs`
 */
import { createRequire } from 'node:module'
import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

// sharp es dependencia transitiva (vía @capacitor/assets); con pnpm vive en .pnpm
function resolveSharp() {
  try {
    return require('sharp')
  } catch {
    const pnpmDir = join(process.cwd(), 'node_modules', '.pnpm')
    const entry = readdirSync(pnpmDir).find(d => d.startsWith('sharp@'))
    if (!entry) throw new Error('No se encontró sharp en node_modules/.pnpm')
    return require(join(pnpmDir, entry, 'node_modules', 'sharp'))
  }
}

const sharp = resolveSharp()
const ROOT = process.cwd()
const ASSETS = join(ROOT, 'assets')
mkdirSync(ASSETS, { recursive: true })

const BG = '#0d0d14'
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

// Logo completo (fondo redondeado + rayo)
const fullSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs><linearGradient id="b" x1="10%" y1="0%" x2="90%" y2="100%">
      <stop offset="0%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#6d28d9"/>
    </linearGradient></defs>
    <rect width="512" height="512" rx="96" fill="${BG}"/>
    <polygon points="295,72 182,268 255,268 208,440 332,244 258,244 330,72" fill="url(#b)"/>
  </svg>`,
)

// Solo el rayo, sin fondo (para foreground del adaptive icon y para el splash)
const boltSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs><linearGradient id="b" x1="10%" y1="0%" x2="90%" y2="100%">
      <stop offset="0%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#6d28d9"/>
    </linearGradient></defs>
    <polygon points="295,72 182,268 255,268 208,440 332,244 258,244 330,72" fill="url(#b)"/>
  </svg>`,
)

const flatCanvas = (size, background) =>
  sharp({ create: { width: size, height: size, channels: 4, background } })

// 1) icon-only — logo completo a 1024
await sharp(fullSvg, { density: 384 }).resize(1024, 1024).png().toFile(join(ASSETS, 'icon-only.png'))

// 2) icon-background — fondo sólido
await flatCanvas(1024, BG).png().toFile(join(ASSETS, 'icon-background.png'))

// 3) icon-foreground — rayo dentro de la safe zone (~53% del lienzo), resto transparente
const fgBolt = await sharp(boltSvg, { density: 384 })
  .resize(540, 540, { fit: 'contain', background: TRANSPARENT })
  .png()
  .toBuffer()
await flatCanvas(1024, TRANSPARENT)
  .composite([{ input: fgBolt, gravity: 'center' }])
  .png()
  .toFile(join(ASSETS, 'icon-foreground.png'))

// 4) splash + splash-dark — rayo centrado (~26%) sobre fondo
const splashBolt = await sharp(boltSvg, { density: 512 })
  .resize(720, 720, { fit: 'contain', background: TRANSPARENT })
  .png()
  .toBuffer()
for (const name of ['splash.png', 'splash-dark.png']) {
  await flatCanvas(2732, BG)
    .composite([{ input: splashBolt, gravity: 'center' }])
    .png()
    .toFile(join(ASSETS, name))
}

console.log('✓ Imágenes de origen generadas en assets/')
