'use client'

import {
  ArrowLeft,
  BellRing,
  Briefcase,
  ChevronRight,
  Contact as ContactRound,
  Dumbbell,
  Languages,
  Ruler,
  ShieldCheck,
  UserCog,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

const ICONS = {
  'arrow-left': ArrowLeft,
  'bell-ring': BellRing,
  briefcase: Briefcase,
  'chevron-right': ChevronRight,
  'contact-round': ContactRound,
  dumbbell: Dumbbell,
  languages: Languages,
  ruler: Ruler,
  'shield-check': ShieldCheck,
  'user-cog': UserCog,
  'user-round': UserRound,
} satisfies Record<string, LucideIcon>

export type PendingLinkIconName = keyof typeof ICONS

export function PendingLinkIcon({
  name,
  className,
}: {
  name: PendingLinkIconName
  className?: string
}) {
  const Icon = ICONS[name]
  return <Icon aria-hidden="true" className={className} />
}
