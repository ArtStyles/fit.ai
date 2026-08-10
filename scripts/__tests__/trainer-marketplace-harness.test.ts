import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('destructive trainer marketplace browser harness', () => {
  it('uses a dedicated fresh application server instead of reusing ambient UI state', () => {
    const config = source('playwright.trainer-marketplace.config.ts')
    const packageJson = JSON.parse(source('package.json')) as { scripts: Record<string, string> }

    expect(config).toContain("testMatch: 'trainer-marketplace.spec.ts'")
    expect(config).toContain('reuseExistingServer: false')
    expect(config).toContain('...process.env')
    expect(packageJson.scripts['test:e2e:trainer-marketplace'])
      .toBe('playwright test --config=playwright.trainer-marketplace.config.ts')
  })
})
