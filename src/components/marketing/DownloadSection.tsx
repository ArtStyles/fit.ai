import { Download, Smartphone } from 'lucide-react'
import { ANDROID_RELEASE } from '@/lib/marketing/androidRelease'
import type { HomeContent } from '@/lib/marketing/homeContent'

type DownloadSectionProps = {
  content: HomeContent['download']
}

export function DownloadSection({ content }: DownloadSectionProps) {
  return (
    <section id="descargar" aria-labelledby="download-title" className="scroll-mt-8 border-b border-border/60 px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
      <div className="mx-auto grid w-full max-w-6xl gap-9 rounded-card border border-primary/20 bg-primary/[0.06] p-6 sm:p-8 lg:grid-cols-2 lg:gap-14">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold uppercase leading-6 tracking-[0.16em] text-violet-300 sm:text-sm">
            <Smartphone className="h-5 w-5 shrink-0" aria-hidden />
            {content.eyebrow}
          </p>
          <h2 id="download-title" className="mt-4 max-w-xl text-balance font-display text-3xl font-black leading-tight tracking-[-0.015em] text-foreground sm:text-4xl">
            {content.title}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">{content.body}</p>
          <a
            href={ANDROID_RELEASE.href}
            download
            data-download-cta="apk"
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary px-6 font-bold text-background transition-[filter] duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
          >
            <Download className="h-5 w-5 shrink-0" aria-hidden />
            {content.cta}
          </a>
          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm">
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
        <div className="min-w-0 border-t border-primary/20 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <h3 className="font-display text-2xl font-bold leading-tight text-foreground">{content.stepsTitle}</h3>
          <ol className="mt-5 space-y-5">
            {content.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-bold text-primary">
                  {index + 1}
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
