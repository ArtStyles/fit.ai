import type { ReactNode } from 'react'

type DashboardPrimaryFlowProps = {
  header: ReactNode
  mainLabel: string
  mainClassName: string
  title: ReactNode
  coaching: ReactNode
  music: ReactNode
  notice: ReactNode
  journey: ReactNode
}

export function DashboardPrimaryFlow({
  header,
  mainLabel,
  mainClassName,
  title,
  coaching,
  music,
  notice,
  journey,
}: DashboardPrimaryFlowProps) {
  return (
    <>
      {header}
      <main
        aria-label={mainLabel}
        className={mainClassName}
        data-marketing-capture="dashboard"
      >
        {title}
        {coaching}
        {music}
        {notice}
        {journey}
      </main>
    </>
  )
}
