type AppStateListener = (state: { isActive: boolean }) => void

type LifecycleWindow = Window & {
  __appStateAddCalls: number
  __appStateRemoveCalls: number
  __appStateListeners: Set<AppStateListener>
  __rejectAppStateRegistration: boolean
  __rejectAppStateRemoval: boolean
}

function lifecycleWindow(): LifecycleWindow {
  return window as unknown as LifecycleWindow
}

export const App = {
  addListener(_eventName: 'appStateChange', listener: AppStateListener) {
    const fixture = lifecycleWindow()
    fixture.__appStateAddCalls += 1
    if (fixture.__rejectAppStateRegistration) {
      return Promise.reject(new Error('fixture registration rejection'))
    }
    fixture.__appStateListeners.add(listener)
    return Promise.resolve({
      async remove() {
        fixture.__appStateRemoveCalls += 1
        fixture.__appStateListeners.delete(listener)
        if (fixture.__rejectAppStateRemoval) {
          throw new Error('fixture removal rejection')
        }
      },
    })
  },
}
