type FixtureWindow = Window & typeof globalThis & {
  __COMPANION_ACTIONS__: Record<string, (...args: unknown[]) => Promise<unknown>>
  __COMPANION_CALLS__: { name: string; args: unknown[] }[]
}
async function run(name: string, ...args: unknown[]) {
  const fixture = window as FixtureWindow
  fixture.__COMPANION_CALLS__.push({ name, args })
  return fixture.__COMPANION_ACTIONS__[name](...args)
}
export const loadCompanion = () => run('loadCompanion')
export const getCompanionCode = () => run('getCompanionCode')
export const previewCompanionCode = (code: string) => run('previewCompanionCode', code)
export const sendCompanionInvitation = (code: string) => run('sendCompanionInvitation', code)
export const respondCompanionInvitation = (id: string, accept: boolean) => run('respondCompanionInvitation', id, accept)
export const cancelCompanionInvitation = (id: string) => run('cancelCompanionInvitation', id)
export const leaveCompanion = (id: string) => run('leaveCompanion', id)
export const sendCompanionGreeting = (id: string, message: string, requestId: string) => run('sendCompanionGreeting', id, message, requestId)
