import type { AnchorHTMLAttributes, ReactNode } from 'react'

type NextLinkFixtureProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string
  children: ReactNode
}

export default function NextLinkFixture({ href, children, ...props }: NextLinkFixtureProps) {
  return <a href={href} {...props}>{children}</a>
}
