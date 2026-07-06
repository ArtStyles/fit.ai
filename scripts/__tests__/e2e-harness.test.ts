import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('E2E harness security', () => {
  it('installs analytics isolation through the shared fixture before every spec can navigate', () => {
    const specs = readdirSync(resolve(root, 'tests/e2e'))
      .filter(name => name.endsWith('.spec.ts'))
    expect(specs.length).toBeGreaterThan(0)

    for (const spec of specs) {
      expect(source(`tests/e2e/${spec}`), spec).toMatch(/from ['"]\.\/fixtures['"]/)
    }

    const fixture = source('tests/e2e/fixtures.ts')
    expect(fixture).toContain("page.route('**/api/analytics'")
    expect(fixture).toContain('status: 202')
    expect(fixture.indexOf("page.route('**/api/analytics'")).toBeLessThan(fixture.indexOf('use(page)'))
  })

  it('registers an account-deleting global teardown', () => {
    expect(source('playwright.config.ts')).toContain("globalSetup: './tests/e2e/global-setup.ts'")
    expect(source('playwright.config.ts')).toContain("globalTeardown: './tests/e2e/global-teardown.ts'")
    expect(source('tests/e2e/global-setup.ts')).toContain('requireE2EConfig(process.env)')
    expect(source('tests/e2e/global-teardown.ts')).toContain('cleanupE2EAccountFromEnvironment')
  })
})
