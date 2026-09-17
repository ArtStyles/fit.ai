import type { FormEvent, ReactNode } from 'react'
import { AdminShell } from '@/components/admin/AdminShell'
import { getAdminShellData } from './auth'
import { navigate } from '../router'

function AdminForms({ children }: { children: ReactNode }) {
  function filter(event: FormEvent<HTMLDivElement>) {
    const form = event.target
    if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== 'get') return
    const url = new URL(form.action || location.href, location.href)
    if (url.origin !== location.origin || !/^\/admin(?:\/|$)/.test(url.pathname)) return
    event.preventDefault()
    url.search = ''
    new FormData(form).forEach((value, key) => {
      if (typeof value === 'string') url.searchParams.append(key, value)
    })
    navigate(`${url.pathname}${url.search}`)
  }
  // Original GET filters must use the app router instead of reloading a local
  // Capacitor asset path. React action forms retain their normal submission.
  return <div onSubmitCapture={filter}>{children}</div>
}

export async function wrapAdminPage(children: ReactNode): Promise<ReactNode> {
  const shell = await getAdminShellData()
  return <AdminShell {...shell}><AdminForms>{children}</AdminForms></AdminShell>
}
