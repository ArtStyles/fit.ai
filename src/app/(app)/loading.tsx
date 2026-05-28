import { Loader2 } from 'lucide-react'

export default function AppRouteLoading() {
  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="sticky top-0 z-20 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="animate-in fade-in slide-in-from-left-2 flex items-center gap-2.5 duration-300">
            <div className="fitai-shimmer h-8 w-8 rounded-lg bg-violet-500/15" />
            <div className="fitai-shimmer h-4 w-36 rounded bg-muted/60" />
          </div>
          <div className="fitai-shimmer h-10 w-10 rounded-full bg-violet-500/30" />
        </div>
      </div>

      <main className="mx-auto max-w-lg px-4">
        <div className="animate-in fade-in slide-in-from-bottom-2 mt-8 flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/5 px-4 py-3 text-sm font-medium text-violet-200 duration-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando vista
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-3 mt-8 rounded-2xl border border-border/60 bg-muted/10 p-5 duration-500">
          <div className="fitai-shimmer h-5 w-14 rounded-full bg-muted/70" />
          <div className="fitai-shimmer mt-8 h-7 w-3/4 rounded bg-muted/70" />
          <div className="fitai-shimmer mt-3 h-4 w-1/2 rounded bg-muted/50" />
          <div className="fitai-shimmer mt-8 h-14 rounded-md bg-muted/60" />
        </div>

        <div className="mt-12 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={index}
              className="fitai-shimmer h-[78px] rounded-xl border border-border/40 bg-muted/10"
              style={{ animationDelay: `${index * 70}ms` }}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
