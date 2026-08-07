import { BarChart3, Dumbbell, Home, Play, Users, type LucideIcon } from 'lucide-react'

export type AppNavItem = {
  href: '/dashboard' | '/plan' | '/entrenar' | '/progress' | '/feed' | '/trainers'
  label: 'Inicio' | 'Plan' | 'Entrenar' | 'Progreso' | 'Comunidad' | 'Entrenadores'
}

const PERSONAL_NAV_ITEMS: readonly AppNavItem[] = [
  { href: '/dashboard', label: 'Inicio' },
  { href: '/plan', label: 'Plan' },
  { href: '/entrenar', label: 'Entrenar' },
  { href: '/progress', label: 'Progreso' },
]

export function getPersonalNavItems({ communityEnabled }: { communityEnabled: boolean }): readonly AppNavItem[] {
  return [
    ...PERSONAL_NAV_ITEMS,
    communityEnabled
      ? { href: '/feed', label: 'Comunidad' }
      : { href: '/trainers', label: 'Entrenadores' },
  ]
}

const APP_NAV_ICONS: Record<AppNavItem['href'], LucideIcon> = {
  '/dashboard': Home,
  '/plan': Dumbbell,
  '/entrenar': Play,
  '/progress': BarChart3,
  '/feed': Users,
  '/trainers': Users,
}

export function getAppNavIcon(href: AppNavItem['href']): LucideIcon {
  return APP_NAV_ICONS[href]
}

export function isAppNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/dashboard' || href === '/entrenar') return false
  return pathname.startsWith(`${href}/`)
}
