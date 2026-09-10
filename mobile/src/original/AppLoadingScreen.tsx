import { useI18n } from '@/components/i18n/I18nProvider'
import './AppLoadingScreen.css'

const DUMBBELL_OUTLINE = 'M-49-13H-42V-21H-31V-4H31V-21H42V-13H49V13H42V21H31V4H-31V21H-42V13H-49Z'

export function AppLoadingScreen() {
  const { language } = useI18n()
  const english = language === 'en'

  return (
    <main
      className="mx-auto flex min-h-[calc(100svh-10rem)] w-full max-w-lg items-center justify-center px-6 py-12"
      aria-busy="true"
    >
      <div className="vekira-contour-status flex flex-col items-center gap-4 text-center" role="status" aria-live="polite" aria-atomic="true">
        <svg aria-hidden="true" focusable="false" viewBox="-58 -32 116 64" className="h-16 w-28" fill="none" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d={DUMBBELL_OUTLINE} pathLength="100" className="stroke-foreground/20" />
          <path d={DUMBBELL_OUTLINE} pathLength="100" data-contour-trail className="vekira-contour-trail stroke-violet-600 dark:stroke-violet-400" />
        </svg>
        <p className="text-xs leading-5 tracking-wide text-muted-foreground">{english ? 'Just a moment…' : 'Un momento…'}</p>
      </div>
    </main>
  )
}
