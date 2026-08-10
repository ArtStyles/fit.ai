import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const repeats = Number.parseInt(process.env.SECURITY_RACE_REPEATS ?? '3', 10)
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) {
  throw new Error('SECURITY_RACE_REPEATS must be an integer between 1 and 10')
}

const runners = [
  ['scripts/test-trainer-relationships-db.mjs'],
  ['scripts/test-trainer-programming-db.mjs', '--authorization', '--security'],
]

for (let iteration = 1; iteration <= repeats; iteration += 1) {
  process.stdout.write(`\n[trainer-security-db] repeat ${iteration}/${repeats}\n`)
  for (const args of runners) {
    const result = spawnSync(process.execPath, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 30 * 1024 * 1024,
    })
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    if (result.error) throw result.error
    if (result.status !== 0) {
      throw new Error(`${path.basename(args[0])} failed on repeat ${iteration} with exit code ${result.status}`)
    }
  }
}

process.stdout.write(`\n[trainer-security-db] PASS: ${repeats} fresh-database repetitions completed\n`)
