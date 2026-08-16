import { ChevronRight, type LucideIcon } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { SettingsSection } from './SettingsSection'

type SettingsNavEntry = {
  href: string
  label: string
  description: string
  icon: LucideIcon
}

export function SettingsNavGroup({ title, entries }: { title: string; entries: SettingsNavEntry[] }) {
  return (
    <SettingsSection title={title}>
      <nav aria-label={title} className="space-y-3">
        {entries.map(({ href, label, description, icon: Icon }) => (
          <PendingLink
            key={href}
            href={href}
            showSpinner={false}
            className="flex min-h-11 items-center gap-3 rounded-xl border border-border/40 px-3 py-2.5 transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{label}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </PendingLink>
        ))}
      </nav>
    </SettingsSection>
  )
}
