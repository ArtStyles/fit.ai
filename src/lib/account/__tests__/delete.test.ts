import { describe, expect, it, vi } from 'vitest'
import { deleteVerifiedAccount } from '../delete'

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
function fixture() {
  const removed: string[] = [], deletedRows: string[] = []
  const bucket = { list: vi.fn(async (prefix: string) => ({ data: prefix === id ? [{ id: 'object', name: 'avatar.webp' }] : [], error: null })), remove: vi.fn(async (paths: string[]) => { removed.push(...paths); return { error: null } }) }
  const admin = { rpc: vi.fn(async () => ({ error: null })), storage: { from: vi.fn(() => bucket) }, from: vi.fn((table: string) => ({ delete: () => ({ eq: async (key: string, value: string) => { deletedRows.push(`${table}:${key}:${value}`); return { error: null } } }) })), auth: { admin: { deleteUser: vi.fn(async () => ({ error: null })) } } }
  const verifyUser = vi.fn(async () => ({ id, email: 'account@example.invalid' }))
  const createAdmin = vi.fn(() => admin)
  return { removed, deletedRows, bucket, admin, verifyUser, createAdmin }
}
describe('verified account deletion service', () => {
  it('rejects absent identity, confirmation and protected owner before privileged access', async () => {
    const f = fixture()
    expect(await deleteVerifiedAccount('', f)).toMatchObject({ ok: false, code: 'delete_confirm' })
    f.verifyUser.mockResolvedValueOnce(null as never)
    expect(await deleteVerifiedAccount('DELETE', f)).toMatchObject({ ok: false, code: 'auth_required' })
    f.verifyUser.mockResolvedValueOnce({ id, email: 'FEJAMES07@gmail.com' })
    expect(await deleteVerifiedAccount('ELIMINAR', f)).toMatchObject({ ok: false, code: 'admin_owner_protected' })
    expect(f.createAdmin).not.toHaveBeenCalled()
  })
  it('cleans owned uploads and non-cascading personal records before deleting verified identity', async () => {
    const f = fixture(); expect(await deleteVerifiedAccount('DELETE', f)).toEqual({ ok: true, accountId: id })
    expect(f.admin.auth.admin.deleteUser).toHaveBeenCalledWith(id)
    expect(f.removed.every(path => path.startsWith(`${id}/`))).toBe(true)
    expect(f.admin.rpc).toHaveBeenCalledWith('prepare_verified_account_deletion', { p_user_id: id })
    expect(f.admin.rpc.mock.invocationCallOrder[0]).toBeLessThan(f.admin.auth.admin.deleteUser.mock.invocationCallOrder[0])
    expect(f.deletedRows).toEqual([])
  })
  it('does not delete Auth if the transactional professional cleanup is unavailable or rejected', async () => {
    const f = fixture()
    f.admin.rpc.mockResolvedValueOnce({ error: { message: 'migration unavailable' } } as never)
    expect(await deleteVerifiedAccount('DELETE', f)).toMatchObject({ ok: false, code: 'delete_failed' })
    expect(f.admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })
  it('fails closed on cleanup failure and never acknowledges an unsuccessful auth delete', async () => {
    const f = fixture(); f.bucket.remove.mockResolvedValueOnce({ error: { message: 'storage unavailable' } } as never)
    expect(await deleteVerifiedAccount('DELETE', f)).toMatchObject({ ok: false, code: 'delete_failed' })
    expect(f.admin.auth.admin.deleteUser).not.toHaveBeenCalled()
    f.admin.auth.admin.deleteUser.mockResolvedValueOnce({ error: { message: 'blocked' } } as never)
    expect(await deleteVerifiedAccount('DELETE', f)).toMatchObject({ ok: false, code: 'delete_failed' })
  })
  it('collects every nested page before removal without crossing the owner prefix', async () => {
    const f = fixture(), calls: string[] = []
    f.bucket.list.mockImplementation(async (prefix: string, options?: { offset: number }) => {
      calls.push(`list:${prefix}:${options?.offset}`)
      if (prefix === id) return { data: [{ id: null, name: 'folder' }], error: null } as never
      const offset = options?.offset ?? 0
      return { data: Array.from({ length: offset === 0 ? 100 : 5 }, (_, index) => ({ id: String(offset + index), name: `photo-${offset + index}` })), error: null }
    })
    f.bucket.remove.mockImplementation(async paths => { calls.push(`remove:${paths.length}`); f.removed.push(...paths); return { error: null } })
    expect(await deleteVerifiedAccount('DELETE', f)).toEqual({ ok: true, accountId: id })
    expect(f.removed).toHaveLength(420)
    expect(calls.slice(0, 5)).toEqual([`list:${id}:0`, `list:${id}/folder:0`, `list:${id}/folder:100`, 'remove:100', 'remove:5'])
    expect(f.removed.every(path => path.startsWith(`${id}/folder/`))).toBe(true)
  })
})
