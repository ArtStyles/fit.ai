export default function TrainerPublicProfileLoading() {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pb-24 pt-6" aria-label="Cargando perfil" aria-busy="true">
      <div className="h-56 animate-pulse rounded-3xl bg-muted" />
      <div className="h-52 animate-pulse rounded-3xl bg-muted" />
      <div className="h-32 animate-pulse rounded-3xl bg-muted" />
    </main>
  )
}
