import { BarChart3 } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse bg-muted/40 ${className}`} />
}

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

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <section className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.06] p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:justify-between">
            <div className="flex-1">
              <Pulse className="h-3 w-32 rounded" />
              <Pulse className="mt-4 h-10 w-72 max-w-full rounded-lg" />
              <Pulse className="mt-3 h-4 w-full max-w-xl rounded" />
            </div>
            <Pulse className="h-12 w-full rounded-2xl sm:w-72" />
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map(item => <Pulse key={item} className="h-20 rounded-xl" />)}
          </div>
        </section>

        <section className="rounded-3xl border border-border/60 bg-muted/[0.05] p-5 sm:p-6">
          <Pulse className="h-3 w-28 rounded" />
          <Pulse className="mt-3 h-8 w-56 rounded" />
          <div className="mt-6 flex h-44 items-end gap-2">
            {Array.from({ length: 12 }).map((_, index) => (
              <Pulse key={index} className="w-full rounded-t-lg" />
            ))}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,.8fr)]">
          <Pulse className="h-64 rounded-3xl border border-border/50" />
          <Pulse className="h-64 rounded-3xl border border-border/50" />
        </div>
      </main>
    </div>
  )
}
