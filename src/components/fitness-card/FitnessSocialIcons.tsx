'use client'

import { Facebook, Instagram } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import styles from './fitness-card.module.css'

type Network = 'instagram' | 'x' | 'facebook'
const labels: Record<Network, string> = { instagram: 'Instagram', x: 'X', facebook: 'Facebook' }
const hosts: Record<Network, string[]> = { instagram: ['instagram.com', 'www.instagram.com'], x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'], facebook: ['facebook.com', 'www.facebook.com'] }

export function FitnessSocialIcons({ links, name }: { links?: Partial<Record<Network, string>>; name: string }) {
  const { language } = useI18n()
  const configured = (Object.keys(labels) as Network[]).flatMap(network => {
    const value = links?.[network]
    if (!value) return []
    try { const url = new URL(value); return url.protocol === 'https:' && hosts[network].includes(url.hostname) && !url.username && !url.password ? [{ network, href: url.href }] : [] } catch { return [] }
  })
  if (!configured.length) return null
  return <div className={styles.coverSocials}>{configured.map(({ network, href }) => <a key={network} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${labels[network]} ${language === 'es' ? 'de' : 'for'} ${name} (${language === 'es' ? 'abre otra pestaña' : 'opens a new tab'})`}>
    {network === 'instagram' ? <Instagram aria-hidden="true" /> : network === 'facebook' ? <Facebook aria-hidden="true" /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-7.4L5.59 22H2.46l7.14-8.17L1.96 2h6.4l4.42 6.75L18.9 2Zm-1.1 18h1.73L7.42 3.88H5.56L17.8 20Z" /></svg>}
  </a>)}</div>
}
