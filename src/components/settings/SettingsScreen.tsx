import { ArrowLeft } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'

type Props = {
  title: string
  subtitle?: string
  backHref: string
  backLabel: string
  icon: React.ReactNode
  children: React.ReactNode
}

// Standard shell for the settings panel and every settings sub-page:
// container + back link + header (icon bubble + title/subtitle).
export function SettingsScreen({ title, subtitle, backHref, backLabel, icon, children }: Props) {
  return (
    <div className="min-h-screen bg-background pb-16">
      <main className="mx-auto max-w-lg px-4 py-8">
        <PendingLink
          href={backHref}
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
          showSpinner={false}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backLabel}
        </PendingLink>

        <header className="mt-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
            {icon}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </header>

        <div className="mt-8">{children}</div>
      </main>
    </div>
  )
}
