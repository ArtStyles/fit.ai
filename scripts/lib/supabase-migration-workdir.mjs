import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ACTIVE_SUPABASE_WORKDIR = 'infra'
export const SUPABASE_CLI_PACKAGE = 'supabase@2.101.0'

const MIGRATION_NAME = /^(?<version>\d{14})_(?<name>[a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/
const FORBIDDEN_NAME = /(?:rollback|reset|test_accounts)/i
const MANAGED_DEFAULT_PRIVILEGES = /\bALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+supabase_admin\b/i

export function validateMigrationNames(fileNames) {
  const versions = new Set()

  return fileNames.map(fileName => {
    const match = MIGRATION_NAME.exec(fileName)
    if (!match) {
      throw new Error(`Migration name must match YYYYMMDDHHMMSS_nombre.sql: ${fileName}`)
    }

    if (FORBIDDEN_NAME.test(match.groups.name)) {
      throw new Error(`Migration name contains a forbidden term: ${fileName}`)
    }

    const { version } = match.groups
    if (versions.has(version)) {
      throw new Error(`Duplicate migration version: ${version}`)
    }

    versions.add(version)
    return version
  })
}

export function validateMigrationSql(sql, fileName) {
  if (MANAGED_DEFAULT_PRIVILEGES.test(sql)) {
    throw new Error(`Migration must not change supabase_admin default privileges: ${fileName}`)
  }
}

export function buildSupabaseCliArguments(argumentsWithoutWorkdir) {
  if (argumentsWithoutWorkdir.some(argument => argument === '--workdir' || argument.startsWith('--workdir='))) {
    throw new Error('Supabase command arguments must not include --workdir')
  }

  return [...argumentsWithoutWorkdir, '--workdir', ACTIVE_SUPABASE_WORKDIR]
}

export function buildNpxSupabaseArguments(argumentsWithoutWorkdir) {
  return ['--yes', SUPABASE_CLI_PACKAGE, ...buildSupabaseCliArguments(argumentsWithoutWorkdir)]
}

export function buildNpxInvocation(platform, nodeExecutable) {
  if (platform === 'win32') {
    return {
      command: nodeExecutable,
      prefixArguments: [path.win32.join(path.win32.dirname(nodeExecutable), 'node_modules', 'npm', 'bin', 'npx-cli.js')],
    }
  }

  return { command: 'npx', prefixArguments: [] }
}

export function runSupabaseCommand(argumentsWithoutWorkdir) {
  const invocation = buildNpxInvocation(process.platform, process.execPath)
  const result = spawnSync(
    invocation.command,
    [...invocation.prefixArguments, ...buildNpxSupabaseArguments(argumentsWithoutWorkdir)],
    { stdio: 'inherit' },
  )

  if (result.error) {
    throw result.error
  }

  return result.status ?? 1
}

export function validateActiveMigrationDirectory(repoRoot) {
  const migrationDirectory = path.join(repoRoot, ACTIVE_SUPABASE_WORKDIR, 'supabase', 'migrations')
  const migrationFiles = readdirSync(migrationDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)

  const versions = validateMigrationNames(migrationFiles)

  for (const fileName of migrationFiles) {
    const migrationPath = path.join(migrationDirectory, fileName)
    validateMigrationSql(readFileSync(migrationPath, 'utf8'), fileName)
  }

  return versions
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isMainModule()) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const commandArguments = process.argv.slice(2)

  try {
    if (commandArguments[0] === '--run') {
      const exitCode = runSupabaseCommand(commandArguments.slice(1))
      if (exitCode !== 0) {
        process.exitCode = exitCode
      }
    } else {
      const versions = validateActiveMigrationDirectory(repoRoot)
      process.stdout.write(`Validated ${versions.length} active Supabase migration(s) in ${ACTIVE_SUPABASE_WORKDIR}.\n`)
    }
  } catch (error) {
    process.stderr.write(`Supabase migration contract failed: ${error.message}\n`)
    process.exitCode = 1
  }
}
