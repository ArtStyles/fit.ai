import { forwardRef, useMemo, useSyncExternalStore, type AnchorHTMLAttributes } from 'react'

export const ROUTE_EVENT = 'vekira:route-change'
let revision = 0
const notify = () => { revision++; window.dispatchEvent(new Event(ROUTE_EVENT)) }
export function navigate(href: string, replace = false) {
  const url = new URL(href, window.location.href)
  if (url.origin !== window.location.origin) { window.location.assign(url.href); return }
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search + url.hash)
  notify()
}
export function refresh() { notify() }
const subscribe = (listener: () => void) => {
  window.addEventListener(ROUTE_EVENT, listener)
  window.addEventListener('popstate', listener)
  return () => { window.removeEventListener(ROUTE_EVENT, listener); window.removeEventListener('popstate', listener) }
}
export function useLocationKey() {
  return useSyncExternalStore(subscribe, () => `${window.location.pathname}${window.location.search}#${revision}`)
}
export function usePathname() { useLocationKey(); return window.location.pathname }
export function useSearchParams() { useLocationKey(); const search = window.location.search; return useMemo(() => new URLSearchParams(search), [search]) }
export function useParams() { return {} }
type NavigationOptions = { scroll?: boolean }
const router = {
  push: (href: string, options?: NavigationOptions) => { navigate(href); if (options?.scroll !== false) window.scrollTo(0, 0) },
  replace: (href: string, options?: NavigationOptions) => { navigate(href, true); if (options?.scroll !== false) window.scrollTo(0, 0) },
  refresh, back: () => history.back(), forward: () => history.forward(), prefetch: async () => {},
}
export function useRouter() { return router }
export class RouteRedirect extends Error { constructor(public href: string) { super(href) } }
export function redirect(href: string): never { throw new RouteRedirect(href) }
export const permanentRedirect = redirect
export function notFound(): never { throw new Error('No se encontró esta página o este registro.') }

type LinkProperties = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string | { pathname?: string; query?: Record<string, string> }; replace?: boolean; scroll?: boolean; prefetch?: boolean | null; onNavigate?: (event: { preventDefault(): void }) => void }
const Link = forwardRef<HTMLAnchorElement, LinkProperties>(function Link({ href, replace, scroll, prefetch: _prefetch, onNavigate, onClick, children, ...props }, ref) {
  const target = typeof href === 'string' ? href : `${href.pathname ?? ''}${href.query ? `?${new URLSearchParams(href.query)}` : ''}`
  return <a ref={ref} {...props} href={target} onClick={event => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || props.download || (props.target && props.target !== '_self')) return
    const url = new URL(target, location.href)
    if (url.origin !== location.origin) return
    let prevented = false
    onNavigate?.({ preventDefault: () => { prevented = true } })
    if (prevented) return
    event.preventDefault(); router[replace ? 'replace' : 'push'](target, { scroll })
  }}>{children}</a>
})
export default Link
