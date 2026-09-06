import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react'

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string
  children: ReactNode
}

const NextLinkFixture = forwardRef<HTMLAnchorElement, Props>(function NextLinkFixture({
  href,
  children,
  onClick,
  ...props
}, ref) {
  return (
    <a
      ref={ref}
      href={href}
      {...props}
      onClick={event => {
        onClick?.(event)
        const navigate = (window as Window & {
          __NEXT_LINK_NAVIGATE__?: (next: string) => void
        }).__NEXT_LINK_NAVIGATE__
        if (!event.defaultPrevented && navigate) {
          event.preventDefault()
          navigate(href)
        }
      }}
    >
      {children}
    </a>
  )
})

export default NextLinkFixture
