export default function TrainerApplicationLoading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse space-y-6 px-4 pb-24 pt-24" aria-label="Cargando solicitud de entrenador" role="status">
      <div className="h-44 rounded-3xl bg-muted/30" />
      <div className="h-72 rounded-3xl bg-muted/30" />
      <div className="h-96 rounded-3xl bg-muted/30" />
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
