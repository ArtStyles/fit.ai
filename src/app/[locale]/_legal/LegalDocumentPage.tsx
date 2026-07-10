import { Scale, ShieldCheck } from 'lucide-react'
import { notFound } from 'next/navigation'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import type { PublicLocale } from '@/lib/i18n/routing'
import { LEGAL_COPY, type LegalDocumentKind } from './legalContent'
import { legalBackTarget } from './legalBackTarget'
import { requiredSupportEmail } from './supportEmail'

type LegalDocumentPageProps = {
  paramsLocale: string
  expectedLocale: PublicLocale
  document: LegalDocumentKind
  returnTo?: string | null
}

export function LegalDocumentPage({
  paramsLocale,
  expectedLocale,
  document,
  returnTo,
}: LegalDocumentPageProps) {
  if (paramsLocale !== expectedLocale) notFound()

  const content = LEGAL_COPY[expectedLocale][document]
  const supportEmail = requiredSupportEmail()
  const backTarget = legalBackTarget(expectedLocale, content.backLabel, returnTo)
  const Icon = document === 'privacy' ? ShieldCheck : Scale

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageTopBar
        title={content.title}
        subtitle={`${expectedLocale === 'es' ? 'Última actualización' : 'Last updated'}: ${content.lastUpdated}`}
        backHref={backTarget.href}
        backLabel={backTarget.label}
        icon={<Icon aria-hidden="true" className="h-5 w-5" />}
      />

      <main id="app-main-content" className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="space-y-9">
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            {content.intro}
          </p>

          {content.sections.map(section => (
            <section key={section.title} className="space-y-3" aria-labelledby={`section-${section.title.split('.')[0]}`}>
              <h2
                id={`section-${section.title.split('.')[0]}`}
                className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl"
              >
                {section.title}
              </h2>
              <div className="space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
                {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                {section.items && (
                  <ul className="list-disc space-y-2 pl-6 marker:text-violet-400">
                    {section.items.map(item => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </div>
            </section>
          ))}

          <section className="space-y-3" aria-labelledby="legal-contact">
            <h2 id="legal-contact" className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {content.contactTitle}
            </h2>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">
              {content.contactLead}{' '}
              <a
                href={`mailto:${supportEmail}`}
                className="inline-flex min-h-11 items-center break-all rounded-md font-semibold text-violet-300 underline decoration-violet-400/60 underline-offset-4 transition-colors hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {supportEmail}
              </a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
