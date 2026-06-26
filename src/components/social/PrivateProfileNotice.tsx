// src/components/social/PrivateProfileNotice.tsx
import { Lock } from 'lucide-react'

export function PrivateProfileNotice() {
  return (
    <div className="flex flex-col items-center gap-3 border-t border-border/40 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-border">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold">Esta cuenta es privada</p>
      <p className="max-w-xs text-sm text-muted-foreground">Sigue esta cuenta para ver sus publicaciones.</p>
    </div>
  )
}
