export default function TrainersLoading() {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pb-24 pt-6" aria-label="Cargando entrenadores" aria-busy="true">
      <div className="h-16 animate-pulse rounded-2xl bg-muted" />
      <div className="h-52 animate-pulse rounded-2xl bg-muted" />
      <div className="h-28 animate-pulse rounded-2xl bg-muted" />
      <div className="h-28 animate-pulse rounded-2xl bg-muted" />
    </main>
  )
}
