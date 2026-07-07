import { ShieldCheck } from 'lucide-react'

export function AppliedConstraints({
  labels,
  t,
}: {
  labels: string[]
  t: (source: string) => string
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-muted/10 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{t('Contexto aplicado')}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t('Resumen seguro de ubicación, equipo, duración y restricciones autorizadas.')}
          </p>
        </div>
      </div>

      {labels.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {labels.map(label => (
            <span
              key={label}
              className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-100"
            >
              {label}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-border/50 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          {t('Sin contexto adicional del perfil.')}
        </p>
      )}
    </section>
  )
}
