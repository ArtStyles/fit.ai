import { FileText, LayoutDashboard, UserRoundSearch, UsersRound, type LucideIcon } from 'lucide-react'

export type AdminNavHref = '/admin' | '/admin/users' | '/admin/trainers' | '/admin/content'
export type AdminNavItem = { href: AdminNavHref; label: string; icon: LucideIcon }

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: '/admin', label: 'Resumen', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Usuarios', icon: UsersRound },
  { href: '/admin/trainers', label: 'Entrenadores', icon: UserRoundSearch },
  { href: '/admin/content', label: 'Contenido', icon: FileText },
]

export function isAdminNavItemActive(pathname: string, href: AdminNavHref): boolean {
  if (href === '/admin') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
