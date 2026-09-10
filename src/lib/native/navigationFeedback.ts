import { Capacitor, registerPlugin } from '@capacitor/core'
import { hapticImpact } from './haptics'

const NavigationFeedback = registerPlugin<{ tap(): Promise<void> }>('VekiraNavigationFeedback')
const MIN_TAP_INTERVAL_MS = 120
let lastTapAt = -Infinity

/** Navigation uses a subtle native selection tick and the system touch sound. */
export async function navigationTapFeedback(): Promise<void> {
  const now = performance.now()
  if (now - lastTapAt < MIN_TAP_INTERVAL_MS) return
  lastTapAt = now

  try {
    if (Capacitor.getPlatform() === 'android') {
      if (Capacitor.isPluginAvailable('VekiraNavigationFeedback')) {
        await NavigationFeedback.tap()
      }
      // An older container or disabled feedback must not restore the long buzz.
      return
    }
    await hapticImpact('light')
  } catch {
    // Optional feedback must never block navigation or trigger a second effect.
  }
}
