import { Info } from 'lucide-react'
import { PLAN_COMPARISON } from '@/lib/marketing/planComparison'
import { PricingAnalytics } from './PricingAnalytics'
import { ProInterestCta } from './ProInterestCta'

type EarlyAccessPlansProps = {
  isAuthenticated: boolean
}

export function EarlyAccessPlans({ isAuthenticated }: EarlyAccessPlansProps) {
  return (
    <section aria-labelledby="plan-comparison-title">
      <PricingAnalytics isAuthenticated={isAuthenticated} />
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold text-violet-300">Free y Pro</p>
        <h2
          id="plan-comparison-title"
          className="mt-3 font-display text-3xl font-black tracking-tight text-foreground sm:text-4xl"
        >
          Compara lo que incluye cada plan
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          Empieza con las funciones esenciales de Vekira y consulta con claridad qué amplía Pro.
        </p>
      </div>

      <div
        id="pro-availability"
        className="mx-auto mt-8 flex max-w-3xl items-start gap-3 rounded-2xl border border-violet-400/35 bg-violet-500/10 p-4 text-left sm:p-5"
        role="note"
      >
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" aria-hidden="true" />
        <div>
          <p className="font-bold text-foreground">Pro está en beta</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/80">
            Pro está en beta, sin cobros todavía: puedes registrar tu interés sin pagos activos.
          </p>
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-3xl overflow-hidden rounded-2xl border border-border/80 bg-card/70 shadow-xl shadow-black/10">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Comparación de funciones entre los planes Free y Pro</caption>
          <thead>
            <tr className="border-b border-border/80 bg-muted/25">
              <th scope="col" className="w-1/2 px-3 py-5 text-sm font-semibold text-muted-foreground sm:px-7">
                Función
              </th>
              <th scope="col" className="w-1/4 px-2 py-5 text-sm font-black text-foreground sm:px-6">
                Free
              </th>
              <th scope="col" className="w-1/4 bg-violet-500/10 px-2 py-5 text-sm font-black text-violet-200 sm:px-6">
                Pro
              </th>
            </tr>
          </thead>
          <tbody>
            {PLAN_COMPARISON.map(row => (
              <tr key={row.key} className="border-b border-border/60 last:border-b-0">
                <th
                  scope="row"
                  className="break-words px-3 py-4 text-sm font-semibold leading-snug text-foreground sm:px-7"
                >
                  {row.label}
                </th>
                <td className="break-words px-2 py-4 text-sm font-medium text-foreground/80 sm:px-6">
                  {row.free}
                </td>
                <td className="break-words bg-violet-500/[0.06] px-2 py-4 text-sm font-bold text-violet-100 sm:px-6">
                  {row.pro}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-7 flex justify-center">
        <ProInterestCta isAuthenticated={isAuthenticated} />
      </div>
    </section>
  )
}
