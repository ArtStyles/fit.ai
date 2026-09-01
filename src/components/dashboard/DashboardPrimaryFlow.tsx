import type { ReactNode } from 'react'

type DashboardPrimaryFlowProps = {
  header: ReactNode
  mainLabel: string
  mainClassName: string
  title: ReactNode
  music: ReactNode
  notice: ReactNode
  journey: ReactNode
}

export function DashboardPrimaryFlow({
  header,
  mainLabel,
  mainClassName,
  title,
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
        {music}
        {notice}
        {journey}
      </main>
    </>
  )
}
