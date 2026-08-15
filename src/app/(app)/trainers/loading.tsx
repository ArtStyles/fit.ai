export default function TrainersLoading() {
  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 pb-24 pt-6 sm:px-6 lg:px-8" aria-label="Cargando entrenadores" aria-busy="true">
      <div className="h-16 animate-pulse rounded-2xl bg-muted" />
      <div className="h-52 animate-pulse rounded-2xl bg-muted" />
      <div className="h-28 animate-pulse rounded-2xl bg-muted" />
      <div className="h-28 animate-pulse rounded-2xl bg-muted" />
    </main>
  )
}
