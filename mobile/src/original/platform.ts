import { refresh } from './router'
export async function cookies() {
  return {
    get(name: string) { const part = document.cookie.split('; ').find(item => item.startsWith(`${name}=`)); return part ? { name, value: decodeURIComponent(part.slice(name.length + 1)) } : undefined },
    set(name: string, value: string) { document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax` },
    delete(name: string) { document.cookie = `${name}=; max-age=0; path=/` },
    getAll() { return document.cookie.split('; ').filter(Boolean).map(item => { const [name, ...value] = item.split('='); return { name, value: decodeURIComponent(value.join('=')) } }) },
  }
}
export async function headers() { return new Headers() }
export function revalidatePath() { refresh() }
export function revalidateTag() { refresh() }
export function unstable_noStore() {}
export function unstable_cache<T>(fn: T): T { return fn }
export function cacheLife() {}
export function cacheTag() {}
