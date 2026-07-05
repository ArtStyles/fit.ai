import { BarChart3, Circle, Dumbbell, LayoutDashboard } from 'lucide-react'
import type { HomeContent } from '@/lib/marketing/homeContent'

type Preview = HomeContent['previews'][number]

type ProductPreviewSectionProps = {
  previews: HomeContent['previews']
}

function PreviewFrame({ screen }: { screen: Preview['screen'] }) {
  return (
    <div
      aria-hidden
      className="aspect-[4/3] w-full overflow-hidden rounded-card border border-border bg-background p-3 shadow-2xl shadow-black/30 sm:p-5"
    >
      <div className="flex h-full overflow-hidden rounded-control border border-border bg-surface-1">
        <div className="hidden w-16 shrink-0 flex-col items-center gap-4 border-r border-border p-3 sm:flex">
          <span className="h-7 w-7 rounded-lg bg-primary/20" />
          <span className="mt-3 h-5 w-5 rounded-md bg-primary/50" />
          <span className="h-5 w-5 rounded-md bg-surface-3" />
          <span className="h-5 w-5 rounded-md bg-surface-3" />
        </div>
        <div className="min-w-0 flex-1 p-4 sm:p-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <span className="h-3 w-24 rounded-full bg-foreground/15" />
            <span className="h-8 w-8 rounded-full border border-border bg-surface-2" />
          </div>
          {screen === 'dashboard' && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-control border border-primary/30 bg-primary/10 p-4 sm:col-span-2">
                <LayoutDashboard className="h-5 w-5 text-primary" />
                <span className="mt-7 block h-3 w-2/3 rounded-full bg-foreground/20" />
                <span className="mt-3 block h-10 w-32 rounded-control bg-primary/70" />
              </div>
              <span className="h-20 rounded-control border border-border bg-surface-2" />
              <span className="h-20 rounded-control border border-border bg-surface-2" />
            </div>
          )}
          {screen === 'session' && (
            <div className="mt-5 space-y-3">
              {[0, 1, 2].map(row => (
                <div key={row} className="flex items-center gap-3 rounded-control border border-border bg-surface-2 p-3">
                  <Dumbbell className="h-5 w-5 shrink-0 text-primary" />
                  <span className="h-3 flex-1 rounded-full bg-foreground/15" />
                  <span className="h-9 w-12 rounded-md border border-border bg-background" />
                  <Circle className="h-8 w-8 text-primary/70" />
                </div>
              ))}
            </div>
          )}
          {screen === 'progress' && (
            <div className="mt-5 grid gap-3 sm:grid-cols-[1.35fr_0.65fr]">
              <div className="flex min-h-40 items-end gap-3 rounded-control border border-border bg-surface-2 p-4">
                {[35, 55, 44, 72, 64, 86].map(height => (
                  <span key={height} className="flex-1 rounded-t-sm bg-primary/60" style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="rounded-control border border-border bg-surface-2 p-4">
                <BarChart3 className="h-5 w-5 text-primary" />
                <span className="mt-8 block h-3 w-full rounded-full bg-foreground/15" />
                <span className="mt-3 block h-3 w-3/4 rounded-full bg-foreground/10" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ProductPreviewSection({ previews }: ProductPreviewSectionProps) {
  return (
    <div>
      {previews.map((preview, index) => (
        <section
          key={preview.screen}
          className="border-b border-border/60 px-5 py-20 sm:px-8 sm:py-24 lg:px-12"
        >
          <div className="mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-20">
            <div className={index % 2 === 1 ? 'lg:order-2' : undefined}>
              <h2 className="max-w-xl font-display text-4xl font-black leading-none tracking-[-0.025em] text-foreground sm:text-5xl">
                {preview.title}
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                {preview.body}
              </p>
            </div>
            <div className={index % 2 === 1 ? 'lg:order-1' : undefined}>
              <PreviewFrame screen={preview.screen} />
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
