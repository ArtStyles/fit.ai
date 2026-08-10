import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('destructive trainer marketplace browser harness', () => {
  it('uses a dedicated fresh application server instead of reusing ambient UI state', () => {
    const config = source('playwright.trainer-marketplace.config.ts')
    const packageJson = JSON.parse(source('package.json')) as { scripts: Record<string, string> }

    expect(config).toContain("'trainer-marketplace.spec.ts'")
    expect(config).toContain("'trainer-security.spec.ts'")
    expect(config).toContain("'trainer-accessibility.spec.ts'")
    expect(config).toContain('reuseExistingServer: false')
    expect(config).toContain('...process.env')
    expect(packageJson.scripts['test:e2e:trainer-marketplace'])
      .toBe('playwright test --config=playwright.trainer-marketplace.config.ts')
  })

  it('drives request, acceptance, and consent through browser controls before programming setup', () => {
    const journey = source('tests/e2e/trainer-marketplace.spec.ts')
    const request = journey.indexOf("getByRole('button', { name: 'Enviar solicitud'")
    const acceptance = journey.indexOf("getByRole('button', { name: 'Aceptar'")
    const consent = journey.indexOf("getByRole('button', { name: 'Autorizar medidas corporales'")
    const programming = journey.indexOf('await seedTrainerProgrammingFixture')

    expect(request).toBeGreaterThan(-1)
    expect(acceptance).toBeGreaterThan(request)
    expect(consent).toBeGreaterThan(acceptance)
    expect(programming).toBeGreaterThan(consent)
    expect(journey).toContain('await requestCoachingThroughBrowser(page, relationships.trainerA.slug')
    expect(journey).toContain('await requestCoachingThroughBrowser(page, relationships.trainerB.slug')
    expect(journey).toContain('existingRelationshipId: persistedRelationship.id')
    expect(journey).not.toContain('exerciseTrainerRelationshipLifecycle')
  })
})
