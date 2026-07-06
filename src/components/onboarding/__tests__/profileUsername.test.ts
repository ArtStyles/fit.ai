import { describe, expect, it } from 'vitest'
import { checkUsernameAvailability, commitUsername } from '../profileUsername'

describe('profile username orchestration', () => {
  it('ignores an availability response for a stale normalized username', async () => {
    let current = 'ada_lovelace'
    let resolveCheck!: (value: { available: boolean }) => void
    const check = () => new Promise<{ available: boolean }>(resolve => { resolveCheck = resolve })

    const pending = checkUsernameAvailability({
      raw: current,
      check,
      getCurrentRaw: () => current,
    })
    current = 'grace_hopper'
    resolveCheck({ available: true })

    await expect(pending).resolves.toEqual({ status: 'stale' })
  })

  it('converts an availability rejection into a localized error', async () => {
    await expect(checkUsernameAvailability({
      raw: 'ada_lovelace',
      check: async () => { throw new Error('network down') },
      getCurrentRaw: () => 'ada_lovelace',
    })).resolves.toEqual({
      status: 'error',
      error: 'No pudimos comprobar la disponibilidad. Inténtalo de nuevo.',
    })
  })

  it('converts an update rejection without advancing', async () => {
    let advanced = false
    await expect(commitUsername({
      raw: 'ada_lovelace',
      update: async () => { throw new Error('network down') },
      getCurrentRaw: () => 'ada_lovelace',
      onSuccess: () => { advanced = true },
    })).resolves.toEqual({
      status: 'error',
      error: 'No pudimos guardar el nombre de usuario. Inténtalo de nuevo.',
    })
    expect(advanced).toBe(false)
  })

  it('checks the resolved normalized username before advancing in order', async () => {
    const calls: string[] = []
    const outcome = await commitUsername({
      raw: 'Ada_Lovelace',
      update: async normalized => {
        calls.push(`update:${normalized}`)
        return { ok: true as const }
      },
      getCurrentRaw: () => {
        calls.push('verify-current')
        return 'ada_lovelace'
      },
      onSuccess: () => { calls.push('advance') },
    })

    expect(outcome).toEqual({ status: 'saved', normalized: 'ada_lovelace' })
    expect(calls).toEqual(['update:ada_lovelace', 'verify-current', 'advance'])
  })

  it('does not advance when the username changes during update', async () => {
    let current = 'ada_lovelace'
    let resolveUpdate!: (value: { ok: true }) => void
    let advanced = false
    const pending = commitUsername({
      raw: current,
      update: () => new Promise<{ ok: true }>(resolve => { resolveUpdate = resolve }),
      getCurrentRaw: () => current,
      onSuccess: () => { advanced = true },
    })

    current = 'grace_hopper'
    resolveUpdate({ ok: true })

    await expect(pending).resolves.toEqual({ status: 'stale' })
    expect(advanced).toBe(false)
  })
})
