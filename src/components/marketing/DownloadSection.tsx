import { Download, Smartphone } from 'lucide-react'
import { ANDROID_RELEASE } from '@/lib/marketing/androidRelease'
import type { HomeContent } from '@/lib/marketing/homeContent'

type DownloadSectionProps = {
  content: HomeContent['download']
}

export function DownloadSection({ content }: DownloadSectionProps) {
  return (
    <section id="descargar" aria-labelledby="download-title" className="landing-download px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
      <div data-reveal className="landing-download-panel mx-auto grid w-full max-w-6xl gap-9 p-6 sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div className="min-w-0">
          <p className="landing-eyebrow flex items-center gap-2">
            <Smartphone className="h-5 w-5 shrink-0" aria-hidden />
            {content.eyebrow}
          </p>
          <h2 id="download-title" className="mt-5 max-w-xl text-balance font-display text-4xl font-black leading-[1.02] tracking-[-0.015em] text-foreground sm:text-5xl lg:text-6xl">
            {content.title}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">{content.body}</p>
          <a
            href={ANDROID_RELEASE.href}
            download
            data-download-cta="apk"
            className="landing-button mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-control bg-primary px-7 font-bold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
          >
            <Download className="h-5 w-5 shrink-0" aria-hidden />
            {content.cta}
          </a>
          <dl className="mt-7 flex flex-wrap gap-x-6 gap-y-3 border-t border-white/10 pt-5 text-xs leading-6 sm:text-sm">
            <div>
              <dt className="text-muted-foreground">{content.versionLabel}</dt>
              <dd className="mt-1 font-semibold text-foreground">{ANDROID_RELEASE.version}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{content.sizeLabel}</dt>
              <dd className="mt-1 font-semibold text-foreground">{ANDROID_RELEASE.sizeLabel}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{content.compatibilityLabel}</dt>
              <dd className="mt-1 font-semibold text-foreground">{ANDROID_RELEASE.minAndroid}</dd>
            </div>
          </dl>
          <details className="mt-4 text-xs leading-5 text-muted-foreground">
            <summary className="min-h-11 cursor-pointer rounded-control py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {content.checksumLabel}
            </summary>
            <code className="block break-all rounded-control border border-border bg-background p-3">{ANDROID_RELEASE.sha256}</code>
          </details>
        </div>
        <div className="min-w-0 border-t border-white/10 pt-7 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
          <h3 className="font-display text-2xl font-bold leading-tight text-foreground">{content.stepsTitle}</h3>
          <ol className="landing-install-steps mt-7 space-y-6">
            {content.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                <span aria-hidden className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-300/30 bg-[#211533] text-xs font-bold text-violet-200">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 rounded-control border border-border bg-background/60 p-4 text-sm leading-6 text-muted-foreground">{content.update}</p>
        </div>
      </div>
    </section>
  )
}
