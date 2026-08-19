import { Shimmer } from '@/components/feedback/RouteLoading'

type AdminRouteLoadingProps = {
  title: string
  cards?: number
  rows?: number
}

export function AdminRouteLoading({
  title,
  cards = 4,
  rows = 4,
}: AdminRouteLoadingProps) {
  return (
    <main
      aria-label={`Cargando ${title}`}
      aria-busy="true"
      className="mx-auto w-full max-w-7xl px-4 py-8"
    >
      <Shimmer className="h-9 w-52" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }, (_, index) => (
          <Shimmer
            key={index}
            data-admin-loading-card
            className="h-28 rounded-2xl"
          />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <Shimmer key={index} className="h-16 rounded-xl" />
        ))}
      </div>
    </main>
  )
}
