import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

type SignupRequest = {
  method(): string
  postDataJSON(): unknown
}

type ExpectedSignup = {
  locale: 'es' | 'en'
  email: string
  password: string
}

export function assertRegistrationSignupRequest(
  request: SignupRequest,
  expected: ExpectedSignup,
): void {
  assert.equal(request.method(), 'POST', 'Supabase signup must use POST')
  const body = request.postDataJSON() as Record<string, unknown>
  assert.deepEqual(Object.keys(body).sort(), [
    'code_challenge',
    'code_challenge_method',
    'data',
    'email',
    'gotrue_meta_security',
    'password',
  ])
  assert.equal(body.email, expected.email)
  assert.equal(body.password, expected.password)
  assert.deepEqual(body.data, { preferred_language: expected.locale })
  assert.deepEqual(body.gotrue_meta_security, {})
  assert.match(String(body.code_challenge), /^[A-Za-z0-9_-]{32,128}$/)
  assert.equal(body.code_challenge_method, 's256')
}

export async function mockRegistrationEmailBoundary(
  page: Page,
  expected: ExpectedSignup,
): Promise<{ assertRequest(): Promise<void> }> {
  // Supabase email delivery is external and its OTP cannot be observed by the
  // browser test. Intercept only the signup boundary and return the normal
  // unconfirmed-user shape; all form and verification UI behavior stays real.
  let requestFailure: unknown
  let markRequestHandled!: () => void
  const requestHandled = new Promise<void>(resolve => { markRequestHandled = resolve })

  await page.route('**/auth/v1/signup**', async route => {
    const now = new Date().toISOString()
    try {
      assertRegistrationSignupRequest(route.request(), expected)
    } catch (error) {
      requestFailure = error
      markRequestHandled()
      await route.abort('failed')
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: '00000000-0000-4000-8000-000000000006',
          aud: 'authenticated',
          role: 'authenticated',
          email: expected.email,
          phone: '',
          confirmation_sent_at: now,
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: { preferred_language: expected.locale },
          identities: [{
            identity_id: '00000000-0000-4000-8000-000000000006',
            id: '00000000-0000-4000-8000-000000000006',
            user_id: '00000000-0000-4000-8000-000000000006',
            identity_data: { email: expected.email },
            provider: 'email',
            created_at: now,
            updated_at: now,
          }],
          created_at: now,
          updated_at: now,
        },
      }),
    })
    markRequestHandled()
  })

  return {
    async assertRequest() {
      await requestHandled
      if (requestFailure) throw requestFailure
    },
  }
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }))
  expect(geometry.documentWidth, `document width ${geometry.documentWidth}px exceeds ${geometry.viewportWidth}px`)
    .toBeLessThanOrEqual(geometry.viewportWidth + 1)
}

export async function auditCriticalAndSeriousAccessibility(page: Page): Promise<void> {
  await expect(page.locator('main')).toBeVisible()
  const result = await new AxeBuilder({ page }).analyze()
  const blocking = result.violations
    .filter(violation => violation.impact === 'critical' || violation.impact === 'serious')
    .map(violation => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map(node => node.target),
    }))
  expect(blocking).toEqual([])
}

type ActionTargetFailure = {
  name: string
  tag: string
  width: number
  height: number
}

/** Runs dependency-ordered teardown steps without letting one failed deletion
 * prevent the remaining exact-scope cleanup from being attempted. */
export async function runAllCleanupSteps(steps: Array<() => Promise<void>>): Promise<void> {
  const errors: unknown[] = []
  for (const step of steps) {
    try {
      await step()
    } catch (error) {
      errors.push(error)
    }
  }

  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) {
    const messages = errors.map(error => error instanceof Error ? error.message : String(error))
    throw new Error(`Multiple cleanup steps failed: ${messages.join('; ')}`)
  }
}

/** WCAG 2.2 permits inline text links to follow line-height instead of a
 * 44px box. Every other enabled, rendered action uses the product's stricter
 * 44px mobile target contract. Checkbox/radio targets use their associated
 * label because that is the actual clickable hit area in the browser. */
export async function expectActionTargetsAtLeast44(page: Page): Promise<void> {
  const failures = await page.evaluate((): ActionTargetFailure[] => {
    const selector = [
      'button',
      'a[href]',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'summary',
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
    ].join(',')

    return Array.from(document.querySelectorAll<HTMLElement>(selector)).flatMap(element => {
      const style = window.getComputedStyle(element)
      const ownRect = element.getBoundingClientRect()
      if (
        style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity) === 0
        || ownRect.width <= 0
        || ownRect.height <= 0
        || element.matches(':disabled,[aria-disabled="true"]')
        || element.closest('[aria-hidden="true"], [inert]')
      ) return []

      const proseContainer = element.closest('p, li, dd, dt, figcaption')
      const hasSurroundingText = proseContainer
        ? Array.from(proseContainer.querySelectorAll('*')).concat(proseContainer)
          .flatMap(node => Array.from(node.childNodes))
          .some(node => node.nodeType === Node.TEXT_NODE && !element.contains(node) && Boolean(node.textContent?.trim()))
        : false
      const inlineTextLink = element instanceof HTMLAnchorElement
        && style.display === 'inline'
        && hasSurroundingText
      if (inlineTextLink) return []

      let targetRect = ownRect
      if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) {
        const label = element.labels?.[0]
        if (label) targetRect = label.getBoundingClientRect()
      }

      if (targetRect.width >= 43.5 && targetRect.height >= 43.5) return []
      const explicitName = element.getAttribute('aria-label')
        ?? element.getAttribute('name')
        ?? element.textContent?.trim().replace(/\s+/g, ' ')
        ?? element.tagName
      return [{
        name: explicitName.slice(0, 100),
        tag: element.tagName.toLowerCase(),
        width: Math.round(targetRect.width * 10) / 10,
        height: Math.round(targetRect.height * 10) / 10,
      }]
    })
  })

  expect(failures, 'enabled action targets smaller than 44px').toEqual([])
}

export async function expectResponsiveGeometry(page: Page): Promise<void> {
  await expectNoHorizontalOverflow(page)
  const failures = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth
    const candidates = Array.from(new Set(document.querySelectorAll<HTMLElement>('main, main *')))
    return candidates.flatMap(element => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      if (
        style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity) === 0
        || rect.width <= 0
        || rect.height <= 0
        || element.closest('[aria-hidden="true"], [inert]')
      ) return []

      const overflowLeft = Math.max(0, -rect.left)
      const overflowRight = Math.max(0, rect.right - viewportWidth)
      if (overflowLeft <= 1 && overflowRight <= 1) return []

      // Wide content may exceed the viewport only when a contained ancestor
      // explicitly owns horizontal scrolling (for example a responsive table).
      let ancestor = element.parentElement
      while (ancestor && ancestor !== document.body) {
        const ancestorStyle = window.getComputedStyle(ancestor)
        if (ancestorStyle.overflowX === 'auto' || ancestorStyle.overflowX === 'scroll') {
          const ancestorRect = ancestor.getBoundingClientRect()
          if (ancestorRect.left >= -1 && ancestorRect.right <= viewportWidth + 1) return []
          break
        }
        ancestor = ancestor.parentElement
      }

      return [{
        tag: element.tagName.toLowerCase(),
        label: element.getAttribute('aria-label') ?? element.getAttribute('aria-labelledby') ?? '',
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        viewportWidth,
      }]
    })
  })
  expect(failures, 'main/table/timeline geometry escapes the viewport').toEqual([])
}

export async function expectReducedMotionAndSafeArea(page: Page): Promise<void> {
  const contract = await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-area-inset-top', '7px')
    document.documentElement.style.setProperty('--safe-area-inset-right', '11px')
    document.documentElement.style.setProperty('--safe-area-inset-bottom', '13px')
    document.documentElement.style.setProperty('--safe-area-inset-left', '17px')

    const body = window.getComputedStyle(document.body)
    const bottomProbe = document.createElement('div')
    bottomProbe.style.paddingBottom = 'var(--app-safe-area-bottom)'
    document.body.append(bottomProbe)
    const paddingBottom = window.getComputedStyle(bottomProbe).paddingBottom
    bottomProbe.remove()
    const motionFailures = Array.from(document.querySelectorAll<HTMLElement>('body *')).flatMap(element => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return []
      const durations = `${style.animationDuration},${style.transitionDuration}`
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000)
      return durations.some(duration => Number.isFinite(duration) && duration > 1)
        ? [{ tag: element.tagName.toLowerCase(), className: element.className.toString(), durations }]
        : []
    })

    return {
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      paddingTop: body.paddingTop,
      paddingRight: body.paddingRight,
      paddingBottom,
      paddingLeft: body.paddingLeft,
      motionFailures,
    }
  })

  expect(contract.reducedMotion).toBe(true)
  expect(contract.paddingTop).toBe('7px')
  expect(contract.paddingRight).toBe('11px')
  expect(contract.paddingBottom).toBe('13px')
  expect(contract.paddingLeft).toBe('17px')
  expect(contract.motionFailures, 'visible elements retain long animation/transition under reduced motion').toEqual([])
  await expectNoHorizontalOverflow(page)
}

/** Verifies the customer sees a professional prescription as read-only. */
export async function expectProfessionalPlanReadOnly(page: Page): Promise<void> {
  await expect(page.getByText('Asignada por entrenador', { exact: false })).toBeVisible()
  await expect(page.getByLabel('Acciones del plan')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ajustar plan', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Regenerar semana', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Compartir rutina', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Editar estructura', exact: true })).toHaveCount(0)
  await expect(page.getByText('Agregar ejercicio', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Empezar entrenamiento', exact: true })).toBeVisible()
  await expect(page.getByText(/solo lectura/i)).toBeVisible()
}

export async function expectLandingContract(
  page: Page,
  landing: { locale: 'es' | 'en'; h1: string; cta: string },
): Promise<void> {
  const h1 = page.locator('h1')
  await expect(h1).toHaveCount(1)
  await expect(h1).toHaveText(landing.h1)
  await expect(page.getByRole('link', { name: landing.cta, exact: true }).first())
    .toHaveAttribute('href', `/register?locale=${landing.locale}`)
  await expect(page.locator('link[rel="canonical"]'))
    .toHaveAttribute('href', new RegExp(`/${landing.locale}$`))
}
