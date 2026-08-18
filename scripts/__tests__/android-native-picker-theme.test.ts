import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesPath = fileURLToPath(
  new URL('../../android/app/src/main/res/values/styles.xml', import.meta.url),
)

function launchThemeBody(styles: string): string {
  const match = styles.match(
    /<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/,
  )

  if (!match) throw new Error('No se encontr\u00f3 el tema Android de arranque.')
  return match[0]
}

describe('Android native picker theme', () => {
  it('keeps the splash on the launch window without applying it to every picker view', () => {
    const theme = launchThemeBody(readFileSync(stylesPath, 'utf8'))

    expect(theme).toContain(
      '<item name="android:windowBackground">@drawable/splash</item>',
    )
    expect(theme).not.toContain(
      '<item name="android:background">@drawable/splash</item>',
    )
  })
})
