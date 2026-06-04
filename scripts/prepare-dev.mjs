import { readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')
const cleanNext = process.argv.includes('--clean')

const generatedPwaFile = (name) =>
  name === 'sw.js' ||
  /^workbox-.*\.js$/.test(name) ||
  /^swe-worker-.*\.js$/.test(name)

const files = await readdir(publicDir)
await Promise.all(
  files
    .filter(generatedPwaFile)
    .map((name) => rm(join(publicDir, name), { force: true })),
)

// A production PWA previously served from localhost can keep controlling
// next dev and cache its unversioned webpack runtime. This worker replaces the
// production worker, clears its caches, unregisters itself, and reloads clients.
const developmentResetWorker = `self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map((name) => caches.delete(name)))
    await self.registration.unregister()

    const windows = await self.clients.matchAll({ type: 'window' })
    await Promise.all(
      windows.map((client) => client.navigate(client.url).catch(() => undefined)),
    )
  })())
})
`

await writeFile(join(publicDir, 'sw.js'), developmentResetWorker)

if (cleanNext) {
  await rm(join(root, '.next'), { recursive: true, force: true })
}

console.log(
  cleanNext
    ? 'Prepared development mode and removed the Next.js cache.'
    : 'Prepared development mode and reset stale PWA caches.',
)
