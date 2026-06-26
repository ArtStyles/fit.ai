// src/app/(app)/solicitudes/page.tsx
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getFollowRequests } from '@/app/actions/follows'
import { RequestRow } from '@/components/social/RequestRow'

export default async function SolicitudesPage() {
  const requests = await getFollowRequests()

  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <Link href="/feed" aria-label="Volver" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold">Solicitudes</h1>
      </header>
      {requests.length === 0
        ? <p className="px-4 py-16 text-center text-sm text-muted-foreground">No tienes solicitudes pendientes.</p>
        : requests.map(u => <RequestRow key={u.id} user={u} />)}
    </div>
  )
}
