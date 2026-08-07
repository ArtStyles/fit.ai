import { FixedTopBar } from '@/components/navigation/FixedTopBar'

export default function TrainersPage() {
  return (
    <div className="mx-auto max-w-lg px-4 pb-24">
      <FixedTopBar>
        <h1 className="text-lg font-bold">Entrenadores</h1>
      </FixedTopBar>
      <main className="pt-24">
        <p className="text-muted-foreground">
          Encuentra entrenadores que te ayuden a alcanzar tus objetivos.
        </p>
        <button
          type="button"
          disabled
          className="mt-6 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground opacity-50"
        >
          Próximamente
        </button>
      </main>
    </div>
  )
}
