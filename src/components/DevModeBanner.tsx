'use client'

export function DevModeBanner() {
  if (process.env.NODE_ENV !== 'development') return null

  const tooltip =
    'Modo desarrollo — planes generados con mock. Configura ANTHROPIC_API_KEY y pon USE_AI_MOCK=false para activar IA real.'

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={tooltip}
        className="group rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs font-medium text-yellow-400/80 transition-colors hover:text-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/40"
      >
        🔧 Modo dev
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-50 hidden w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border/70 bg-popover px-3 py-2 text-left text-xs font-normal leading-relaxed text-popover-foreground shadow-lg group-hover:block group-focus:block"
        >
          {tooltip}
        </span>
      </button>
    </div>
  )
}
