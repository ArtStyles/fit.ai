import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationNames = [
  '040_trainer_foundations.sql',
  '041_trainer_verification.sql',
  '042_trainer_relationships.sql',
  '043_trainer_programming.sql',
  '044_trainer_insights.sql',
  '045_trainer_hardening.sql',
] as const

const migrations = new Map(
  migrationNames.map((name) => {
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', name)
    return [name, existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '']
  }),
)

const history = Array.from(migrations.values()).join('\n')
const hardening = migrations.get('045_trainer_hardening.sql') ?? ''

const createdSensitiveTables = Array.from(history.matchAll(/CREATE TABLE IF NOT EXISTS public\.(trainer_[a-z_]+|coaching_[a-z_]+|product_notifications|product_push_tokens|product_notification_preferences|professional_audit_logs)\s*\(/g))
  .map((match) => match[1])

const legacySensitiveTables = [
  'profiles',
  'workout_plans',
  'workouts',
  'workout_exercises',
  'progress_logs',
  'exercise_logs',
  'measurements',
  'session_authorizations',
] as const

const sensitiveTables = Array.from(new Set([...createdSensitiveTables, ...legacySensitiveTables])).sort()

function tableSecurityStatements(sql: string) {
  return Array.from(sql.matchAll(/ALTER TABLE public\.([a-z_]+)\s+(ENABLE|FORCE) ROW LEVEL SECURITY\s*;/g))
    .map((match) => ({ table: match[1], mode: match[2] }))
}

function tableAclStatements(sql: string) {
  return Array.from(sql.matchAll(/^(GRANT|REVOKE)\s+([^\n]+?)\s+ON TABLE public\.([a-z_]+)\s+(?:TO|FROM)\s+([^;]+);/gm))
    .map((match) => ({ verb: match[1], privileges: match[2].replace(/\s+/g, ' ').trim(), table: match[3], roles: match[4].replace(/\s+/g, ' ').trim() }))
}

function securityDefinerFunctions(sql: string) {
  return Array.from(sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\s*\(([^)]*)\)([\s\S]*?)(?=\nCREATE OR REPLACE FUNCTION|\nALTER FUNCTION|$)/g))
    .filter((match) => /SECURITY DEFINER/.test(match[3]))
    .map((match) => ({ name: match[1], body: match[3] }))
}

describe('trainer authorization migration contracts', () => {
  it('derives every sensitive table and enforces ENABLE plus FORCE RLS', () => {
    expect(sensitiveTables.length).toBeGreaterThanOrEqual(25)
    const security = tableSecurityStatements(history)

    for (const table of sensitiveTables) {
      expect(security, `${table} must enable RLS`).toContainEqual({ table, mode: 'ENABLE' })
      expect(security, `${table} must force RLS`).toContainEqual({ table, mode: 'FORCE' })
    }
  })

  it('uses an explicit deny-first ACL contract for every sensitive table', () => {
    const acl = tableAclStatements(history)

    for (const table of sensitiveTables) {
      const statements = acl.filter((entry) => entry.table === table)
      expect(
        statements.some((entry) => entry.verb === 'REVOKE' && entry.privileges === 'ALL' && /PUBLIC/.test(entry.roles)),
        `${table} must revoke ambient PUBLIC privileges`,
      ).toBe(true)
      expect(
        statements.some((entry) => entry.verb === 'REVOKE' && entry.privileges === 'ALL' && /authenticated/.test(entry.roles)),
        `${table} must revoke ambient authenticated privileges before allowlisting`,
      ).toBe(true)
    }

    for (const table of ['trainer_plan_assignments', 'trainer_assignment_versions', 'professional_audit_logs']) {
      const trainerWrites = acl.filter((entry) => entry.table === table && entry.verb === 'GRANT' && /authenticated/.test(entry.roles) && /(?:INSERT|UPDATE|DELETE|ALL)/.test(entry.privileges))
      expect(trainerWrites, `${table} must not expose trainer/client-data writes through broad authenticated grants`).toEqual([])
    }
  })

  it('pins every SECURITY DEFINER function to a fixed non-user schema path', () => {
    const functions = securityDefinerFunctions(history)
    expect(functions.length).toBeGreaterThanOrEqual(25)

    for (const fn of functions) {
      const pathMatch = fn.body.match(/SET search_path\s*=\s*([^\n]+)/)
      expect(pathMatch, `${fn.name} must declare search_path`).not.toBeNull()
      expect(pathMatch?.[1], `${fn.name} search_path must not contain user or current-user schemas`).not.toMatch(/\$user|current_user/i)
      expect(pathMatch?.[1], `${fn.name} search_path must terminate in a trusted schema`).toMatch(/^(?:public|storage)(?:, (?:public|storage))*?, pg_temp\s*$/)
    }
  })

  it('hardens participant reads without granting trainer access to evidence tables', () => {
    expect(hardening).toMatch(/CREATE POLICY\s+"trainer_plan_assignments: consent-bound participants"[\s\S]*?has_active_coaching_scope/)
    expect(hardening).toMatch(/CREATE POLICY\s+"trainer_assignment_versions: consent-bound participants"[\s\S]*?has_active_coaching_scope/)
    const evidencePolicies = Array.from(hardening.matchAll(/CREATE POLICY\s+"[^"]+"\s+ON public\.(workout_plans|workouts|workout_exercises|progress_logs|exercise_logs|measurements)([\s\S]*?);/g))
    expect(evidencePolicies.filter((match) => /trainer_user_id|has_active_coaching_scope/.test(match[2]))).toEqual([])
  })
})
