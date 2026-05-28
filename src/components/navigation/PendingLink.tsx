'use client'

import Link, { type LinkProps } from 'next/link'
import { usePathname } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import {
  type AnchorHTMLAttributes,
  forwardRef,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useState,
} from 'react'
import { cn } from '@/lib/utils'

type PendingLinkProps = LinkProps
  & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | 'href'>
  & {
    children: ReactNode
    showSpinner?: boolean
    spinnerClassName?: string
  }

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0
}

function shouldTrack(event: MouseEvent<HTMLAnchorElement>, href: PendingLinkProps['href']) {
  if (event.defaultPrevented || isModifiedClick(event)) return false
  if (event.currentTarget.target && event.currentTarget.target !== '_self') return false

  const nextUrl = new URL(String(href), window.location.href)
  const currentUrl = new URL(window.location.href)

  return nextUrl.origin === currentUrl.origin
    && (nextUrl.pathname !== currentUrl.pathname || nextUrl.search !== currentUrl.search)
}

export const PendingLink = forwardRef<HTMLAnchorElement, PendingLinkProps>(function PendingLink({
  children,
  className,
  href,
  onClick,
  showSpinner = true,
  spinnerClassName,
  ...props
}: PendingLinkProps, ref) {
  const pathname = usePathname()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setPending(false)
  }, [pathname])

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)

    if (shouldTrack(event, href)) {
      setPending(true)
      window.dispatchEvent(new Event('fitai:navigation-start'))
    }
  }

  return (
    <Link
      href={href}
      ref={ref}
      className={cn(pending && 'pointer-events-none opacity-80', className)}
      aria-busy={pending || undefined}
      onClick={handleClick}
      {...props}
    >
      {showSpinner && pending && (
        <Loader2 className={cn('mr-2 h-4 w-4 animate-spin', spinnerClassName)} />
      )}
      {children}
    </Link>
  )
})
