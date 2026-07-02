import type { Difficulty, ExerciseType } from '@/types/exercise'

export type TypeCfg = {
  label:    string
  emoji:    string
  iconBg:   string   // icon square background
  pillBg:   string   // solid type badge
  pillText: string
  dot:      string   // small colour indicator
  sectionBg: string  // modal header tint
}

export const TYPE_CFG: Record<ExerciseType, TypeCfg> = {
  strength:    { label: 'Fuerza',      emoji: '🏋️', iconBg: 'bg-orange-500/20',  pillBg: 'bg-orange-500',  pillText: 'text-white', dot: 'bg-orange-500',  sectionBg: 'from-orange-500/10'  },
  cardio:      { label: 'Cardio',      emoji: '🏃',  iconBg: 'bg-red-500/20',     pillBg: 'bg-red-500',     pillText: 'text-white', dot: 'bg-red-500',     sectionBg: 'from-red-500/10'     },
  flexibility: { label: 'Flexibilidad',emoji: '🤸',  iconBg: 'bg-emerald-500/20', pillBg: 'bg-emerald-500', pillText: 'text-white', dot: 'bg-emerald-500', sectionBg: 'from-emerald-500/10' },
  balance:     { label: 'Equilibrio',  emoji: '🧘',  iconBg: 'bg-sky-500/20',     pillBg: 'bg-sky-500',     pillText: 'text-white', dot: 'bg-sky-500',     sectionBg: 'from-sky-500/10'     },
  hiit:        { label: 'HIIT',        emoji: '⚡',  iconBg: 'bg-violet-500/20',  pillBg: 'bg-violet-500',  pillText: 'text-white', dot: 'bg-violet-500',  sectionBg: 'from-violet-500/10'  },
}

export const DIFF_CFG: Record<Difficulty, { label: string; color: string }> = {
  beginner:     { label: 'Principiante', color: 'text-zinc-400'  },
  intermediate: { label: 'Intermedio',    color: 'text-amber-400' },
  advanced:     { label: 'Avanzado',     color: 'text-red-400'   },
}
