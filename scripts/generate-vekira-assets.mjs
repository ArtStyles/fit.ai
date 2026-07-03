import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const capacitorAssetsPackage = fs.realpathSync(
  path.join(projectRoot, 'node_modules', '@capacitor', 'assets', 'package.json'),
)
const requireFromCapacitorAssets = createRequire(capacitorAssetsPackage)
const sharp = requireFromCapacitorAssets('sharp')

const sourceMark = path.join(projectRoot, 'assets', 'vekira', 'logo.svg')
const sourceIcon = path.join(projectRoot, 'public', 'icon.svg')
const outputDir = path.join(projectRoot, 'assets')
const background = '#0d0d14'

async function renderCenteredMark(size, markSize) {
  const mark = await sharp(sourceMark)
    .resize(markSize, markSize, { fit: 'contain' })
    .png()
    .toBuffer()

  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: mark, left: Math.round((size - markSize) / 2), top: Math.round((size - markSize) / 2) }])
    .png()
}

await sharp(sourceIcon).resize(1024, 1024).png().toFile(path.join(outputDir, 'icon-only.png'))

const foreground = await sharp(sourceMark)
  .resize(620, 620, { fit: 'contain' })
  .png()
  .toBuffer()

await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: foreground, left: 202, top: 202 }])
  .png()
  .toFile(path.join(outputDir, 'icon-foreground.png'))

await sharp({ create: { width: 1024, height: 1024, channels: 4, background } })
  .png()
  .toFile(path.join(outputDir, 'icon-background.png'))

await (await renderCenteredMark(2732, 560)).toFile(path.join(outputDir, 'splash.png'))
await (await renderCenteredMark(2732, 560)).toFile(path.join(outputDir, 'splash-dark.png'))

console.log('Vekira source assets generated.')
