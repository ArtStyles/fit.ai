import type { Browser } from '@playwright/test'

// Compile the actual fixture once before timing its interactions. A fresh context
// keeps this bootstrap's cookies, storage and application state out of the tests.
export async function warmupFixture(browser: Browser, url: string, readyKey: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 } })
  const page = await context.newPage()
  const errors: Error[] = []
  const diagnostics: string[] = []
  page.on('pageerror', error => errors.push(error))
  page.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()) })
  page.on('requestfailed', request => diagnostics.push(`${request.url()}: ${request.failure()?.errorText}`))
  const deadline = Date.now() + 60_000

  try {
    const response = await page.goto(url, { timeout: 60_000 })
    if (!response?.ok()) throw new Error(`Fixture bootstrap failed: ${response?.status()} ${url}`)
    await page.waitForFunction(
      key => Boolean((window as unknown as Record<string, unknown>)[key]),
      readyKey,
      { timeout: Math.max(1, deadline - Date.now()) },
    )
    if (errors.length) throw errors[0]
  } catch (error) {
    if (errors.length) throw errors[0]
    if (diagnostics.length) throw new Error(`Fixture bootstrap: ${diagnostics.join('\n')}`, { cause: error })
    throw error
  } finally {
    await context.close()
  }
}
