'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { getProfileConnections } from '@/app/actions/users'
import type { SuggestedUser } from '@/lib/social/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UserRow } from './UserRow'

type ConnectionType = 'followers' | 'following'

export function ProfileConnectionsStats({
  username,
  postCount,
  followerCount,
  followingCount,
  canViewConnections,
}: {
  username: string
  postCount: number
  followerCount: number
  followingCount: number
  canViewConnections: boolean
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<ConnectionType>('followers')
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<SuggestedUser[]>([])
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    if (!open || !canViewConnections) {
      setUsers([])
      setLoading(false)
      return
    }

    setLoading(true)
    const id = ++reqId.current
    const timeout = setTimeout(async () => {
      const result = await getProfileConnections(username, active, query)
      if (id === reqId.current) {
        setUsers(result)
        setLoading(false)
      }
    }, query.trim() ? 250 : 0)

    return () => clearTimeout(timeout)
  }, [active, canViewConnections, open, query, username])

  function openConnections(type: ConnectionType) {
    setActive(type)
    setQuery('')
    setUsers([])
    setOpen(true)
  }

  const title = active === 'followers' ? 'Seguidores' : 'Siguiendo'
  const emptyText = query.trim()
    ? 'Sin resultados.'
    : active === 'followers'
      ? 'No hay seguidores todavía.'
      : 'No sigue a nadie todavía.'

  return (
    <>
      <div className="flex flex-1 justify-around text-center">
        <div className="min-w-0 flex-1 py-1">
          <div className="text-lg font-bold">{postCount}</div>
          <div className="text-xs text-muted-foreground">publicaciones</div>
        </div>
        <button
          type="button"
          onClick={() => openConnections('followers')}
          className="min-w-0 flex-1 rounded-md py-1 transition-colors hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        >
          <div className="text-lg font-bold">{followerCount}</div>
          <div className="text-xs text-muted-foreground">seguidores</div>
        </button>
        <button
          type="button"
          onClick={() => openConnections('following')}
          className="min-w-0 flex-1 rounded-md py-1 transition-colors hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        >
          <div className="text-lg font-bold">{followingCount}</div>
          <div className="text-xs text-muted-foreground">siguiendo</div>
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[82vh] gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border/40 px-4 py-4 text-left">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">
              Lista de {title.toLowerCase()} con buscador.
            </DialogDescription>
          </DialogHeader>

          {canViewConnections ? (
            <>
              <div className="border-b border-border/40 px-4 py-3">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Buscar"
                    aria-label={`Buscar en ${title.toLowerCase()}`}
                    maxLength={100}
                    className="h-11 flex-1 bg-transparent text-sm outline-none"
                  />
                  {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </div>

              <div className="max-h-[56vh] overflow-y-auto py-1">
                {users.length === 0 && loading ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando
                  </div>
                ) : users.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
                ) : (
                  users.map(user => <UserRow key={user.id} user={user} />)
                )}
              </div>
            </>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Esta cuenta es privada.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
