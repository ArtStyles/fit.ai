import { PageTopBar } from '@/components/navigation/PageTopBar'

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
      <PageTopBar
        title={title}
        subtitle={subtitle}
        backHref={backHref}
        backLabel={backLabel}
        icon={icon}
      />

      <main className="mx-auto max-w-lg px-4 py-8">
        {children}
      </main>
    </div>
  )
}
