import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PageTopBar } from '../PageTopBar'
import { PendingLink } from '../PendingLink'
import { SettingsNavGroup } from '@/components/settings/SettingsNavGroup'

function findElementsOfType(node: ReactNode, type: ReactElement['type']): ReactElement[] {
  const matches: ReactElement[] = []

  function visit(current: ReactNode) {
    if (!isValidElement(current)) return
    if (current.type === type) matches.push(current)
    Children.forEach((current.props as { children?: ReactNode }).children, visit)
  }

  visit(node)
  return matches
}

function containsRawForwardRef(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(containsRawForwardRef)
  if (!isValidElement(node)) return false

  const elementType = node.type as unknown
  if (
    typeof elementType === 'object' &&
    elementType !== null &&
    '$$typeof' in elementType &&
    (elementType as { $$typeof?: symbol }).$$typeof === Symbol.for('react.forward_ref')
  ) {
    return true
  }

  return Children.toArray((node.props as { children?: ReactNode }).children)
    .some(containsRawForwardRef)
}

describe('PendingLink RSC boundaries', () => {
  it('keeps the PageTopBar back icon inside a serializable client boundary', () => {
    const output = PageTopBar({
      title: 'Notificaciones',
      backHref: '/dashboard',
      backLabel: 'Dashboard',
    })
    const links = findElementsOfType(output, PendingLink)

    expect(links).toHaveLength(1)
    expect(containsRawForwardRef(links[0]?.props.children)).toBe(false)

    const html = renderToStaticMarkup(output)
    expect(html).toContain('aria-label="Dashboard"')
    expect(html).toContain('h-11 w-11')
    expect(html).toContain('lucide-arrow-left')
    expect(html).toContain('h-5 w-5')
  })

  it('keeps settings entry icons inside serializable client boundaries', () => {
    const output = SettingsNavGroup({
      title: 'Tu perfil',
      entries: [{
        href: '/settings/perfil',
        label: 'Perfil',
        description: 'Foto y nombre',
        icon: 'user-round',
      }],
    })
    const links = findElementsOfType(output, PendingLink)

    expect(links).toHaveLength(1)
    expect(containsRawForwardRef(links[0]?.props.children)).toBe(false)

    const html = renderToStaticMarkup(output)
    expect(html).toContain('aria-label="Tu perfil"')
    expect(html).toContain('href="/settings/perfil"')
    expect(html).toContain('min-h-11')
    expect(html).toContain('lucide-user-round')
    expect(html).toContain('lucide-chevron-right')
  })
})
