// src/components/social/SessionCard.tsx
import { Dumbbell, Clock, TrendingUp } from 'lucide-react'
import type { SessionSnapshot } from '@/lib/social/snapshots'

export function SessionCard({ snap }: { snap: SessionSnapshot }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Dumbbell className="h-4 w-4 text-primary" />
        {snap.workout_name}
      </div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {snap.duration_minutes != null && (
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{snap.duration_minutes} min</span>
        )}
        <span className="inline-flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />{snap.total_volume_kg.toLocaleString()} kg</span>
      </div>
      <ul className="space-y-1 text-sm">
        {snap.exercises.slice(0, 6).map((ex, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="truncate">{ex.name}{ex.is_pr && <span className="ml-1 text-xs text-primary">PR</span>}</span>
            <span className="shrink-0 text-muted-foreground">{ex.sets.length}×</span>
          </li>
        ))}
        {snap.exercises.length > 6 && (
          <li className="text-xs text-muted-foreground">+{snap.exercises.length - 6} más</li>
        )}
      </ul>
    </div>
  )
}
