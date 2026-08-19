import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  service: undefined as unknown,
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) },
}))
vi.mock('@/lib/auth/admin', () => ({
  requireAdminUserContext: async () => ({
    user: { id: 'admin-user' },
    service: mocks.service,
  }),
}))

import { saveDashboardBanner } from '../dashboardBanner'

function bannerForm(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

function serviceForBanner() {
  return {
    from(table: string) {
      if (table === 'dashboard_banners') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: { image_url: null }, error: null }
                  },
                }
              },
            }
          },
          async upsert() {
            return { error: null }
          },
        }
      }
      if (table === 'admin_audit_logs') {
        return {
          async insert() {
            return { error: null }
          },
        }
      }
      throw new Error(`Unexpected banner table: ${table}`)
    },
    storage: {
      from() {
        return {
          async upload() {
            return { error: null }
          },
          getPublicUrl() {
            return { data: { publicUrl: 'https://cdn.example.test/banner' } }
          },
          async remove() {
            return { error: null }
          },
        }
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.service = serviceForBanner()
})

it('keeps validation and success feedback in the Content route', async () => {
  await expect(saveDashboardBanner(bannerForm({
    title: 'x',
    kind: 'announcement',
    status: 'draft',
  }))).rejects.toThrow('REDIRECT:/admin/content?error=admin_banner_invalid')

  await expect(saveDashboardBanner(bannerForm({
    title: 'Aviso',
    kind: 'announcement',
    status: 'draft',
  }))).rejects.toThrow('REDIRECT:/admin/content?notice=admin_banner_saved')

  expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/content')
  expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin')
  expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard')
})
