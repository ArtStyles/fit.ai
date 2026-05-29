'use client'

import { ChevronRight, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ProgressionItem {
  weId:         string
  name:         string
  muscleGroups: string[]
  fromWeightKg: number | null   // peso de la última sesión (null = sin historial)
  toWeightKg:   number          // peso sugerido por el plan
}

interface Props {
  progressions: ProgressionItem[]
  onApply:      (updates: Array<{ weId: string; weightKg: number }>) => void
  onSkip:       () => void
}

export function PreSessionScreen({ progressions, onApply, onSkip }: Props) {
  const count = progressions.length

  return (
    <div className="flex h-dvh flex-col bg-background pb-6">

      {/* Contenido con scroll */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg px-4 pt-14 pb-6 space-y-6">

          {/* Header */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15">
              <TrendingUp className="h-7 w-7 text-violet-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Puedes mejorar hoy</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Tu historial sugiere subir peso en{' '}
                <span className="font-medium text-foreground">
                  {count} {count === 1 ? 'ejercicio' : 'ejercicios'}
                </span>
              </p>
            </div>
          </div>

          {/* Cards de progresión */}
          <div className="space-y-2.5">
            {progressions.map(p => (
              <div
                key={p.weId}
                className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3.5 space-y-2"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{p.name}</p>
                  {p.muscleGroups.length > 0 && (
                    <p className="text-xs text-muted-foreground capitalize">
                      {p.muscleGroups.slice(0, 2).join(' · ')}
                    </p>
                  )}
                </div>

                {/* Comparativa de pesos */}
                <div className="flex items-center gap-2">
                  {p.fromWeightKg != null && (
                    <>
                      <span className="rounded-lg bg-muted/30 px-3 py-1 text-sm font-medium tabular-nums text-muted-foreground">
                        {p.fromWeightKg} kg
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                    </>
                  )}
                  <span className="rounded-lg bg-violet-500/20 px-3 py-1 text-sm font-bold tabular-nums text-violet-300">
                    {p.toWeightKg} kg
                  </span>
                  {p.fromWeightKg != null && (
                    <span className="text-xs font-medium text-violet-400/80">
                      +{Math.round((p.toWeightKg - p.fromWeightKg) * 10) / 10} kg
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Acciones fijas al fondo */}
      <div className="mx-auto w-full max-w-lg space-y-2 px-4">
        <Button
          className="w-full h-14 bg-violet-600 hover:bg-violet-500 text-white font-bold text-base"
          onClick={() =>
            onApply(progressions.map(p => ({ weId: p.weId, weightKg: p.toWeightKg })))
          }
        >
          <TrendingUp className="mr-2 h-5 w-5" />
          Aplicar y empezar
        </Button>
        <Button
          variant="ghost"
          className="w-full h-11 text-muted-foreground hover:text-foreground text-sm"
          onClick={onSkip}
        >
          Empezar sin cambios
        </Button>
      </div>

    </div>
  )
}
