'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PlanTab = 'week' | 'info'

export function PlanViewTabs({
  weekLabel,
  infoLabel,
  ariaLabel = 'Plan',
  weekContent,
  infoContent,
}: {
  weekLabel: string
  infoLabel: string
  ariaLabel?: string
  weekContent: ReactNode
  infoContent: ReactNode
}) {
  const [activeTab, setActiveTab] = useState<PlanTab>('week')
  const id = useId()
  const tabRefs = useRef<Record<PlanTab, HTMLButtonElement | null>>({ week: null, info: null })

  const tabs: Array<{ id: PlanTab; label: string }> = [
    { id: 'week', label: weekLabel },
    { id: 'info', label: infoLabel },
  ]

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: PlanTab) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return

    event.preventDefault()
    const currentIndex = tabs.findIndex(tab => tab.id === currentTab)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : event.key === 'ArrowRight'
          ? (currentIndex + 1) % tabs.length
          : (currentIndex - 1 + tabs.length) % tabs.length
    const nextTab = tabs[nextIndex].id

    setActiveTab(nextTab)
    tabRefs.current[nextTab]?.focus()
  }

  return (
    <div className="mt-6">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="grid grid-cols-2 rounded-xl border border-border/60 bg-muted/20 p-1"
      >
        {tabs.map(tab => {
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              ref={node => { tabRefs.current[tab.id] = node }}
              id={`${id}-${tab.id}-tab`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`${id}-${tab.id}-panel`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={event => handleKeyDown(event, tab.id)}
              className={cn(
                'h-11 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <section
        id={`${id}-week-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-week-tab`}
        hidden={activeTab !== 'week'}
      >
        {weekContent}
      </section>

      <section
        id={`${id}-info-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-info-tab`}
        hidden={activeTab !== 'info'}
      >
        {infoContent}
      </section>
    </div>
  )
}
