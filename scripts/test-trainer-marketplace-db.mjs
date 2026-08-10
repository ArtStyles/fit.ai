import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const commands = [
  { args: ['scripts/test-trainer-verification-db.mjs'], label: 'application, changes, interview and approval' },
  { args: ['scripts/test-trainer-security-db.mjs'], label: 'relationships, programming, evidence, revocation and concurrency' },
  { args: ['--import', 'tsx', 'scripts/audit-trainer-marketplace.ts'], label: 'query and privacy release audit' },
]

for (const command of commands) {
  process.stdout.write(`\n[trainer-marketplace-db] ${command.label}\n`)
  const result = spawnSync(process.execPath, command.args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 40 * 1024 * 1024,
    env: { ...process.env, SECURITY_RACE_REPEATS: process.env.SECURITY_RACE_REPEATS ?? '1' },
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${path.basename(command.args.at(-1) ?? command.args[0])} failed with exit code ${result.status}`)
  }
}

process.stdout.write('\n[trainer-marketplace-db] PASS: the complete local persisted marketplace contract executed against fresh Docker databases\n')
