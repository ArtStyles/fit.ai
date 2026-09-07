import { BarChart3, ClipboardList, Dumbbell, Home, LayoutDashboard, Play, Users, type LucideIcon } from 'lucide-react'

export type AppNavItem = {
  href: '/dashboard' | '/plan' | '/entrenar' | '/progress' | '/feed' | '/trainers'
    | '/coach' | '/coach/clients' | '/coach/programs' | '/coach/requests'
  label: 'Inicio' | 'Plan' | 'Entrenar' | 'Progreso' | 'Comunidad' | 'Entrenadores'
    | 'Resumen' | 'Clientes' | 'Rutinas' | 'Solicitudes'
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

const COACH_NAV_ITEMS: readonly AppNavItem[] = [
  { href: '/coach', label: 'Resumen' },
  { href: '/coach/clients', label: 'Clientes' },
  { href: '/coach/programs', label: 'Rutinas' },
  { href: '/coach/requests', label: 'Solicitudes' },
]

export function getCoachNavItems(): readonly AppNavItem[] {
  return COACH_NAV_ITEMS
}

const APP_NAV_ICONS: Record<AppNavItem['href'], LucideIcon> = {
  '/dashboard': Home,
  '/plan': Dumbbell,
  '/entrenar': Play,
  '/progress': BarChart3,
  '/feed': Users,
  '/trainers': Users,
  '/coach': LayoutDashboard,
  '/coach/clients': Users,
  '/coach/programs': Dumbbell,
  '/coach/requests': ClipboardList,
}

export function getAppNavIcon(href: AppNavItem['href']): LucideIcon {
  return APP_NAV_ICONS[href]
}

export function isAppNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/dashboard' || href === '/entrenar' || href === '/coach') return false
  return pathname.startsWith(href + '/')
}
