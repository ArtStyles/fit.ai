import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ACTIVE_SUPABASE_WORKDIR,
  buildNpxInvocation,
  buildNpxSupabaseArguments,
  buildSupabaseCliArguments,
  validateActiveMigrationDirectory,
  validateMigrationNames,
} from '../lib/supabase-migration-workdir.mjs'

describe('supabase migration workdir contract', () => {
  it('uses infra as the only supported workdir', () => {
    expect(ACTIVE_SUPABASE_WORKDIR).toBe('infra')
  })

  it('accepts active migration names with a fourteen-digit version', () => {
    expect(validateMigrationNames([
      '20260906010101_create_profiles.sql',
      '20260906010102_add_profile_index.sql',
    ])).toEqual([
      '20260906010101',
      '20260906010102',
    ])
  })

  it('rejects migration names outside YYYYMMDDHHMMSS_nombre.sql', () => {
    expect(() => validateMigrationNames(['060_create_profiles.sql']))
      .toThrow('YYYYMMDDHHMMSS_nombre.sql')
  })

  it('rejects duplicate migration versions', () => {
    expect(() => validateMigrationNames([
      '20260906010101_create_profiles.sql',
      '20260906010101_add_profile_index.sql',
    ])).toThrow('Duplicate migration version: 20260906010101')
  })

  it('rejects an active migration that changes supabase_admin default privileges', () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), 'supabase-migration-workdir-'))
    const migrationDirectory = path.join(repoRoot, 'infra', 'supabase', 'migrations')
    mkdirSync(migrationDirectory, { recursive: true })
    writeFileSync(
      path.join(migrationDirectory, '20260906010101_managed_default_privileges.sql'),
      'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;\n',
    )

    try {
      expect(() => validateActiveMigrationDirectory(repoRoot))
        .toThrow('supabase_admin default privileges')
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it('clears managed table defaults before replaying public tables and restores application defaults', () => {
    const baseline = readFileSync(
      new URL('../../infra/supabase/migrations/20260906233340_remote_schema_baseline.sql', import.meta.url),
      'utf8',
    )
    const schemaPosition = baseline.indexOf('CREATE SCHEMA IF NOT EXISTS public;')
    const revokePosition = baseline.indexOf(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;',
    )
    const firstPublicTablePosition = baseline.indexOf('CREATE TABLE public.')
    const lastPublicTablePosition = baseline.lastIndexOf('CREATE TABLE public.')

    expect(schemaPosition).toBeGreaterThanOrEqual(0)
    expect(revokePosition).toBeGreaterThan(schemaPosition)
    expect(revokePosition).toBeLessThan(firstPublicTablePosition)

    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect(baseline.indexOf(
        `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO ${role};`,
      )).toBeGreaterThan(lastPublicTablePosition)
    }
  })

  it.each(['20260906010101_rollback_profiles.sql', '20260906010101_reset_profiles.sql', '20260906010101_test_accounts.sql'])(
    'rejects forbidden migration name %s',
    fileName => {
      expect(() => validateMigrationNames([fileName])).toThrow('forbidden term')
    },
  )

  it('builds Supabase commands with the active workdir', () => {
    expect(buildSupabaseCliArguments(['migration', 'list', '--linked']))
      .toEqual(['migration', 'list', '--linked', '--workdir', 'infra'])
  })

  it('refuses caller-supplied workdir arguments', () => {
    expect(() => buildSupabaseCliArguments(['migration', 'list', '--workdir', 'other']))
      .toThrow('must not include --workdir')
  })

  it('pins Supabase through npx before adding the active workdir', () => {
    expect(buildNpxSupabaseArguments(['db', 'push', '--linked', '--dry-run']))
      .toEqual([
        '--yes',
        'supabase@2.101.0',
        'db',
        'push',
        '--linked',
        '--dry-run',
        '--workdir',
        'infra',
      ])
  })

  it('runs npx through Node on Windows instead of a command shim', () => {
    expect(buildNpxInvocation('win32', 'C:\\Program Files\\nodejs\\node.exe')).toEqual({
      command: 'C:\\Program Files\\nodejs\\node.exe',
      prefixArguments: ['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js'],
    })
  })

  it('exposes migration commands through the active-workdir runner', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

    expect(packageJson.scripts).toMatchObject({
      'check:supabase-migrations': 'node scripts/lib/supabase-migration-workdir.mjs',
      'supabase:migrations:list': 'node scripts/lib/supabase-migration-workdir.mjs --run migration list --linked',
      'supabase:migrations:dry-run': 'node scripts/lib/supabase-migration-workdir.mjs --run db push --linked --dry-run',
      'supabase:migrations:push': 'node scripts/lib/supabase-migration-workdir.mjs --run db push --linked',
    })
  })
})
