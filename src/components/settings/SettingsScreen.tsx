import { PageTopBar } from '@/components/navigation/PageTopBar'
import {
  PendingLinkIcon,
  type PendingLinkIconName,
} from '@/components/navigation/PendingLinkIcon'

type Props = {
  title: string
  subtitle?: string
  eyebrow?: string
  description?: string
  backHref: string
  backLabel: string
  icon: PendingLinkIconName
  children: React.ReactNode
}

// Standard shell for the settings panel and every settings sub-page:
// container + back link + header (icon bubble + title/subtitle).
export function SettingsScreen({
  title,
  subtitle,
  eyebrow,
  description,
  backHref,
  backLabel,
  icon,
  children,
}: Props) {
  return (
    <div className="min-h-screen bg-background pb-16">
      <PageTopBar
        title={title}
        subtitle={subtitle}
        backHref={backHref}
        backLabel={backLabel}
        icon={<PendingLinkIcon name={icon} className="h-5 w-5" />}
      />

      <main aria-label={title} className="mx-auto max-w-lg px-4 py-8">
        {eyebrow || description ? (
          <div className="mb-6">
            {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">{eyebrow}</p> : null}
            {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
        ) : null}
        {children}
      </main>
    </div>
  )
}
