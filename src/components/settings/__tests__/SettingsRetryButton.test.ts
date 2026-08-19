import { expect, it, vi } from 'vitest'
import { refreshSettingsRoute } from '../SettingsRetryButton'

it('refreshes the current route when retrying a failed settings read', () => {
  const refresh = vi.fn()

  refreshSettingsRoute({ refresh })

  expect(refresh).toHaveBeenCalledOnce()
})
