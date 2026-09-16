import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { preview } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)
const suites = [
  'original-journey', 'auth-scroll-regression', 'login-loading-regression', 'logout-regression',
  'auth-compiled-regression', 'account-lifecycle-regression', 'profile-regression', 'avatar-regression',
  'session-readiness-regression', 'free-training-regression', 'guided-free-regression', 'progress-goals-regression',
  'measurement-weight-regression', 'notification-session-state-regression', 'exercise-detail-regression',
  'muscle-catalog-regression', 'muscle-details-regression', 'opengym-regression',
  'contour-loading-regression', 'navigation-feedback-regression', 'coaching-regression',
  'companion-regression', 'fitness-card-regression', 'catalog-accessibility-regression', 'connected-boundaries-regression', 'route-a11y-regression',
]
const selected = process.argv.slice(2)
if (selected.some(suite => !suites.includes(suite))) throw new Error(`Unknown suite. Available: ${suites.join(', ')}`)
const output = resolve(root, '.artifacts/mobile-e2e')
await mkdir(output, { recursive: true })
const runStartedAt = new Date().toISOString()
const saveResults = (status, results, extra = {}) => writeFile(resolve(output, 'results.json'), JSON.stringify({ runStartedAt, status, fixtureBuild: true, results, ...extra }, null, 2))
await saveResults('preparing', [])
// The build uses a non-production endpoint and public fixture value. Every suite
// intercepts its backend; an accidental network request cannot alter a real account.
const env = {
  ...process.env,
  VITE_SUPABASE_URL: 'https://mobile-e2e.supabase.invalid',
  VITE_SUPABASE_ANON_KEY: 'synthetic-public-e2e-key',
  VITE_ACCOUNT_API_URL: 'https://mobile-e2e-api.invalid',
  VITE_WEB_APP_URL: 'https://mobile-e2e-web.invalid',
  FITNESS_FIXTURE_BACKEND: 'https://mobile-e2e.supabase.invalid',
  MOBILE_PREVIEW_URL: 'http://127.0.0.1:4178',
}
async function run(args, name, timeoutMs = 360_000) {
  const logPath = resolve(output, `${name}.log`)
  const stream = createWriteStream(logPath)
  const startedAt = new Date().toISOString()
  let timedOut = false
  const exitCode = await new Promise(resolveCode => {
    const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true })
    const timer = setTimeout(() => {
      timedOut = true
      if (process.platform === 'win32' && child.pid && child.exitCode === null) {
        // This PID is the child created above. Close its Chromium descendants too.
        const cleanup = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        cleanup.on('error', () => child.kill())
      } else child.kill()
    }, timeoutMs)
    child.stdout.pipe(stream, { end: false })
    child.stderr.pipe(stream, { end: false })
    child.on('error', error => { stream.write(String(error)); clearTimeout(timer); resolveCode(-1) })
    child.on('close', code => { clearTimeout(timer); resolveCode(code) })
  })
  await new Promise(resolveEnd => stream.end(resolveEnd))
  const result = { suite: name, passed: exitCode === 0 && !timedOut, exitCode, timedOut, startedAt, finishedAt: new Date().toISOString(), log: logPath }
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${name} (${logPath})`)
  return result
}
for (const [name, args] of [
  ['prepare', ['scripts/prepare-mobile.mjs']],
  ['build', ['node_modules/vite/bin/vite.js', 'build', '--config', 'mobile/vite.config.ts']],
]) {
  const result = await run(args, name)
  if (!result.passed) { await saveResults('failed', [], { preparationFailure: result }); process.exit(1) }
}
const server = await preview({ configFile: resolve(root, 'mobile/vite.config.ts'), preview: { host: '127.0.0.1', port: 4178, strictPort: true } })
const results = []
try {
  for (const suite of selected.length ? selected : suites) {
    results.push(await run([`mobile/tests/${suite}.mjs`], suite, suite === 'route-a11y-regression' ? 720_000 : 360_000))
    await saveResults('running', results)
  }
} finally {
  await new Promise((resolveClose, reject) => server.httpServer.close(error => error ? reject(error) : resolveClose()))
}
console.log(JSON.stringify({ passed: results.filter(row => row.passed).length, failed: results.filter(row => !row.passed).length, total: results.length }))
await saveResults(results.some(row => !row.passed) ? 'failed' : 'passed', results)
process.exitCode = results.some(row => !row.passed) ? 1 : 0
