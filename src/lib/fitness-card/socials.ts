import type { FitnessSocialLinks } from './types'

const reserved = new Set(['login','logout','signup','signin','share','sharing','sharer','sharer.php','intent','home','explore','p','reel','reels','stories','accounts','account','direct','settings','search','i','compose','messages','notifications','hashtag','watch','marketplace','groups','events','pages','plugins','dialog','dialogs','l.php','business','developers','help','privacy','terms','about','legal','oauth','tos'])
const invalid = (): never => { throw new Error('FITNESS_CARD_INVALID_SOCIAL_LINKS') }

/** Accept only provider profile destinations; output has no arbitrary query data. */
export function normalizeFitnessSocialLinks(input: unknown): FitnessSocialLinks {
  if (input === undefined) return {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid()
  const result: FitnessSocialLinks = {}
  for (const [key, value] of Object.entries(input)) {
    if (key !== 'instagram' && key !== 'x' && key !== 'facebook') return invalid()
    if (typeof value !== 'string' || value.length > 300) return invalid()
    const raw = value.trim()
    if (!raw) continue
    let handle = raw.replace(/^@/, '')
    if (raw.includes('/') || raw.includes(':')) {
      if (/[\s%\\#]/.test(raw)) return invalid()
      let url: URL
      try { url = new URL(raw.includes('://') ? raw : `https://${raw}`) } catch { return invalid() }
      const authority = (raw.includes('://') ? raw : `https://${raw}`).split('/')[2]
      if (url.protocol !== 'https:' || url.username || url.password || url.port || authority.includes(':')) return invalid()
      const host = url.hostname.toLowerCase().replace(/^www\./, '')
      if (!(key === 'x' ? host === 'x.com' || host === 'twitter.com' : host === `${key}.com`)) return invalid()
      if (key === 'facebook' && url.pathname === '/profile.php' && /^\?id=[0-9]{1,20}$/.test(url.search)) {
        result.facebook = `https://facebook.com/profile.php${url.search}`
        continue
      }
      if (raw.includes('?')) return invalid()
      handle = url.pathname.replace(/^\//, '').replace(/\/$/, '')
    }
    handle = handle.toLowerCase()
    const pattern = key === 'instagram' ? /^[a-z0-9_](?:[a-z0-9_.]{0,28}[a-z0-9_])?$/ : key === 'x' ? /^[a-z0-9_]{1,15}$/ : /^[a-z0-9](?:[a-z0-9.]{0,98}[a-z0-9])?$/
    if (!pattern.test(handle) || handle.includes('..') || reserved.has(handle) || (key === 'facebook' && handle.endsWith('.php'))) return invalid()
    result[key] = `https://${key === 'x' ? 'x' : key}.com/${handle}`
  }
  return result
}
