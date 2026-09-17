'use client'

import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { ArrowUpRight, CalendarDays, ChartNoAxesCombined } from 'lucide-react'
import { ProductScreenshot } from '@/components/marketing/ProductScreenshot'
import type { PublicLocale } from '@/lib/i18n/routing'
import type { HomeContent } from '@/lib/marketing/homeContent'
import styles from './ProductExperience.module.css'

type ProductPreviewSectionProps = {
  previews: HomeContent['previews']
  locale: PublicLocale
  demoCaption: string
}

const subscribeToHydration = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false

export function ProductPreviewSection({ previews, locale, demoCaption }: ProductPreviewSectionProps) {
  const id = useId()
  const items = previews.filter(preview => preview.screen !== 'session')
  const [activeIndex, setActiveIndex] = useState(0)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const interactive = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot)
  useLayoutEffect(() => {
    if (!interactive || !window.location.hash) return
    // Collapsing the no-JS panels changes the height above public anchor targets.
    // Restore that destination before paint once the tabs have been enhanced.
    let targetId: string
    try { targetId = decodeURIComponent(window.location.hash.slice(1)) } catch { return }
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }, [interactive])
  const copy = locale === 'es'
    ? {
        eyebrow: 'Dentro de Vekira',
        title: 'Tu esfuerzo tiene una historia.',
        body: 'De lo que entrenas hoy a lo que consigues con el tiempo.',
        tabs: 'Explora Vekira',
        dashboard: 'Tu semana',
        progress: 'Tu progreso',
        detail: 'Así se ve en la app',
      }
    : {
        eyebrow: 'Inside Vekira',
        title: 'Your effort tells a story.',
        body: 'From what you train today to what you achieve over time.',
        tabs: 'Explore Vekira',
        dashboard: 'Your week',
        progress: 'Your progress',
        detail: 'A look inside the app',
      }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % items.length
        break
      case 'ArrowLeft':
        nextIndex = (index - 1 + items.length) % items.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = items.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    setActiveIndex(nextIndex)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <section id="experiencia" aria-labelledby={`${id}-title`} className="scroll-mt-28 px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
      <div className="mx-auto w-full max-w-6xl">
        <div data-reveal className="mb-8 max-w-2xl sm:mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{copy.eyebrow}</p>
          <h2 id={`${id}-title`} className="mt-4 text-balance font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-foreground sm:text-5xl">
            {copy.title}
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">{copy.body}</p>
        </div>

        <div data-reveal className={styles.showcase}>
          <div role="tablist" aria-label={copy.tabs} aria-orientation="horizontal" className={styles.tabList} hidden={!interactive}>
            {items.map((preview, index) => {
              const Icon = preview.screen === 'dashboard' ? CalendarDays : ChartNoAxesCombined

              return (
                <button
                  key={preview.screen}
                  ref={element => { tabRefs.current[index] = element }}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${preview.screen}`}
                  aria-controls={`${id}-panel-${preview.screen}`}
                  aria-selected={activeIndex === index}
                  tabIndex={activeIndex === index ? 0 : -1}
                  onClick={() => setActiveIndex(index)}
                  onKeyDown={event => handleTabKeyDown(event, index)}
                  className={styles.tab}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {preview.screen === 'dashboard' ? copy.dashboard : copy.progress}
                </button>
              )
            })}
          </div>

          {items.map((preview, index) => (
            <div
              key={preview.screen}
              role={interactive ? 'tabpanel' : undefined}
              id={`${id}-panel-${preview.screen}`}
              aria-labelledby={interactive ? `${id}-tab-${preview.screen}` : `preview-${preview.screen}-title`}
              hidden={interactive && activeIndex !== index}
              tabIndex={interactive ? 0 : undefined}
              className={styles.panel}
              data-interactive={interactive || undefined}
            >
              <div className={styles.panelCopy}>
                <span aria-hidden className={styles.panelNumber}>{String(index + 1).padStart(2, '0')}</span>
                <h3 id={`preview-${preview.screen}-title`} className="mt-4 text-balance font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-foreground sm:text-4xl">
                  {preview.title}
                </h3>
                <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{preview.body}</p>
                <p className="mt-6 hidden items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-violet-300 lg:flex">
                  {copy.detail}<ArrowUpRight className="h-4 w-4" aria-hidden />
                </p>
              </div>
              <div className={`${styles.visualStage} ${preview.screen === 'progress' ? styles.progress : styles.dashboard}`}>
                <ProductScreenshot preview={preview} locale={locale} caption={demoCaption} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
