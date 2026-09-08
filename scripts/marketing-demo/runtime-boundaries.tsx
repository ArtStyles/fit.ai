import { forwardRef, type AnchorHTMLAttributes, type ImgHTMLAttributes } from 'react'

// Only framework/remote/hardware boundaries are replaced. All visible product
// components, their state, calculations, translations, and styles stay real.
export const router = {
  back() {}, push() {}, replace() {}, refresh() {}, prefetch: async () => {},
}
export function useRouter() { return router }
export function usePathname() {
  const surface = new URLSearchParams(window.location.search).get('surface')
  return surface === 'session' ? '/session/demo-upper' : `/${surface ?? 'dashboard'}`
}
export function useSearchParams() { return new URLSearchParams(window.location.search) }
export function useParams() { return {} }

export const DemoLink = forwardRef<HTMLAnchorElement, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string | { pathname?: string }; prefetch?: boolean }>(function DemoLink({ href, prefetch: _prefetch, ...props }, ref) {
  return <a {...props} ref={ref} href={typeof href === 'string' ? href : href.pathname} />
})

export function DemoImage({ src, alt, fill, priority: _priority, quality: _quality, unoptimized: _unoptimized, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string | { src: string }; fill?: boolean; priority?: boolean; quality?: number; unoptimized?: boolean }) {
  return <img {...props} alt={alt ?? ''} src={typeof src === 'string' ? src : src.src} style={fill ? { position: 'absolute', inset: 0, height: '100%', width: '100%', ...props.style } : props.style} />
}

export async function authorizeSessionStart() { return { success: true as const } }
export async function verifySessionBackupOwner() { return '00000000-0000-4000-8000-000000000001' }
export async function releaseSessionAuthorization() { return { success: true as const } }
export async function saveSession() { throw new Error('Saving is unavailable in the local marketing demo') }
export async function createPostFromSession() { throw new Error('Sharing is unavailable in the local marketing demo') }
export async function loadExerciseCatalogPage() { throw new Error('Remote catalog access is unavailable in the local marketing demo') }
export async function setWorkspace() { return undefined }
export async function signOut() { return undefined }
export function useWakeLock() {}
