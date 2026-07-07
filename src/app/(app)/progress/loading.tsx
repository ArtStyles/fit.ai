import { BarChart3 } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'

export default function ProgressLoading() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <PageTopBar
        title="Progreso"
        subtitle="Constancia, volumen, marcas y medidas en un solo lugar"
        backHref="/dashboard"
        backLabel="Dashboard"
        icon={<BarChart3 className="h-5 w-5" />}
      />

      <main className="mx-auto max-w-lg px-4 py-8">
        <div className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.06] p-5">
          <div className="h-3 w-28 animate-pulse rounded-full bg-violet-300/30" />
          <div className="mt-4 h-8 w-56 animate-pulse rounded-full bg-muted/50" />
          <div className="mt-3 h-4 w-full animate-pulse rounded-full bg-muted/40" />
          <div className="mt-2 h-4 w-3/4 animate-pulse rounded-full bg-muted/40" />
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[0, 1, 2].map(item => (
              <div key={item} className="h-20 animate-pulse rounded-2xl border border-border/50 bg-muted/20" />
            ))}
          </div>
        </div>

        <div className="mt-8 space-y-5">
          {[0, 1, 2, 3, 4].map(item => (
            <div key={item} className="h-44 animate-pulse rounded-3xl border border-border/50 bg-card/50" />
          ))}
        </div>
      </main>
    </div>
  )
}
