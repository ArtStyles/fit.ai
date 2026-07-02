// src/components/social/UserSearch.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import type { SuggestedUser } from '@/lib/social/types'
import { searchUsers } from '@/app/actions/users'
import { UserRow } from './UserRow'
import { useI18n } from '@/components/i18n/I18nProvider'

export function UserSearch({ suggested }: { suggested: SuggestedUser[] }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SuggestedUser[]>([])
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults([]); setLoading(false); return }
    setLoading(true)
    const id = ++reqId.current
    const timeoutId = setTimeout(async () => {
      const res = await searchUsers(q)
      // Ignora respuestas obsoletas (la última petición gana).
      if (id === reqId.current) { setResults(res); setLoading(false) }
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [query])

  const showingSearch = query.trim().length > 0

  return (
    <div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('Buscar usuarios')}
            aria-label={t('Buscar usuarios')}
            maxLength={100}
            className="h-11 flex-1 bg-transparent text-sm outline-none"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {showingSearch ? (
        results.length === 0 && !loading
          ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('Sin resultados.')}</p>
          : results.map(u => <UserRow key={u.id} user={u} />)
      ) : (
        <>
          <p className="px-4 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('Sugeridos')}
          </p>
          {suggested.length === 0
            ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('No hay sugerencias por ahora.')}</p>
            : suggested.map(u => <UserRow key={u.id} user={u} />)}
        </>
      )}
    </div>
  )
}
