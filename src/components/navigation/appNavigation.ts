import { BarChart3, Dumbbell, Home, Play, Users, type LucideIcon } from 'lucide-react'

export type AppNavItem = {
  href: '/dashboard' | '/plan' | '/entrenar' | '/progress' | '/feed'
  label: 'Inicio' | 'Plan' | 'Entrenar' | 'Progreso' | 'Comunidad'
  icon: LucideIcon
}

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: Home },
  { href: '/plan', label: 'Plan', icon: Dumbbell },
  { href: '/entrenar', label: 'Entrenar', icon: Play },
  { href: '/progress', label: 'Progreso', icon: BarChart3 },
  { href: '/feed', label: 'Comunidad', icon: Users },
]

export function isAppNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/dashboard' || href === '/entrenar') return false
  return pathname.startsWith(`${href}/`)
}
