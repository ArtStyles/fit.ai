import { Loader2 } from 'lucide-react'

export default function CompanionLoading() {
  return <main aria-busy="true" className="mx-auto flex min-h-80 max-w-lg flex-col items-center justify-center gap-4 px-6 py-16 text-center">
    <Loader2 className="h-7 w-7 animate-spin text-violet-400 motion-reduce:animate-none" aria-hidden="true" />
    <p role="status" className="text-sm text-muted-foreground">Cargando tu compañero de constancia…</p>
  </main>
}
