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
        backHref="/dashboard"
        backLabel="Dashboard"
        icon={<BarChart3 className="h-5 w-5" />}
      />

      <main aria-busy="true" className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6">
        <Pulse className="h-[54px] w-full rounded-2xl" />
        <div className="flex items-center justify-between gap-4">
          <Pulse className="h-3 w-28 rounded" />
          <Pulse className="h-11 w-36 rounded-xl" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map(item => <Pulse key={item} className="h-20 rounded-xl" />)}
        </div>
        <section className="rounded-3xl border border-border/60 p-4 sm:p-6">
          <Pulse className="h-6 w-48 rounded" />
          <div className="mt-5 flex justify-center gap-4">
            <Pulse className="h-52 w-28 rounded-3xl" />
            <Pulse className="h-52 w-28 rounded-3xl" />
          </div>
          <Pulse className="mt-4 h-11 w-full rounded-xl" />
        </section>
        <Pulse className="h-24 rounded-3xl" />
      </main>
    </div>
  )
}
