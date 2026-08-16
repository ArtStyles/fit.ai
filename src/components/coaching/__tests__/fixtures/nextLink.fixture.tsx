import type { AnchorHTMLAttributes, ReactNode } from 'react'

type NextLinkFixtureProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string
  children: ReactNode
}

export default function NextLinkFixture({ href, children, ...props }: NextLinkFixtureProps) {
  return <a
    href={href}
    {...props}
    onClick={event => {
      props.onClick?.(event)
      const navigate = (window as Window & { __NEXT_LINK_NAVIGATE__?: (href: string) => void }).__NEXT_LINK_NAVIGATE__
      if (!event.defaultPrevented && navigate) {
        event.preventDefault()
        navigate(href)
      }
    }}
  >{children}</a>
}
