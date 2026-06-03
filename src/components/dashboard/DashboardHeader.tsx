'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dumbbell, LogOut, Ruler, Settings, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DevModeBanner } from '@/components/DevModeBanner'
import { PendingLink } from '@/components/navigation/PendingLink'
import { signOut } from '@/app/(auth)/actions'

interface Props {
  greeting:      string
  firstName:     string
  avatarUrl:     string | null
  momentumScore: number
}

// ─── Momentum chip ────────────────────────────────────────────────────────────

function getMomentumStyle(score: number) {
  if (score >= 91) return { label: 'Imparable',  classes: 'border-orange-500/30 bg-orange-500/10 text-orange-400' }
  if (score >= 76) return { label: 'Al máximo',  classes: 'border-violet-500/30 bg-violet-500/10 text-violet-400' }
  if (score >= 51) return { label: 'En forma',   classes: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400' }
  if (score >= 26) return { label: 'Construyendo', classes: 'border-blue-500/30 bg-blue-500/10 text-blue-400'    }
  return                  { label: 'Arrancando', classes: 'border-border/40 bg-muted/20 text-muted-foreground'   }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardHeader({ greeting, firstName, avatarUrl, momentumScore }: Props) {
  const initials      = firstName.slice(0, 2).toUpperCase()
  const momentum      = getMomentumStyle(momentumScore)

  return (
    <header className="sticky top-0 z-20 border-b border-border/40 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">

        {/* Logo + greeting */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 shadow-md shadow-violet-500/30">
            <Dumbbell className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base leading-none">
              <span className="font-normal text-muted-foreground">{greeting}, </span>
              <span className="font-semibold text-foreground">{firstName}</span>
            </p>
            {/* Momentum chip */}
            <div className="mt-1 flex items-center gap-1.5">
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                momentum.classes,
              )}>
                <Zap className="h-2.5 w-2.5" />
                {momentumScore}
                <span className="font-semibold normal-case tracking-normal opacity-70">
                  · {momentum.label}
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DevModeBanner />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full ring-offset-background transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Abrir menu de usuario"
              >
                <Avatar className="h-10 w-10">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={firstName} />}
                  <AvatarFallback className="bg-gradient-to-br from-violet-500 to-violet-700 text-sm font-semibold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={10}
              className="w-48 border-border/70 bg-popover/95 p-1.5 shadow-lg shadow-black/30 backdrop-blur-md"
            >
              <DropdownMenuItem asChild className="cursor-pointer gap-2 rounded-md px-3 py-2">
                <PendingLink href="/medidas" showSpinner={false}>
                  <Ruler className="h-4 w-4 text-violet-300" />
                  Medidas
                </PendingLink>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer gap-2 rounded-md px-3 py-2">
                <PendingLink href="/settings" showSpinner={false}>
                  <Settings className="h-4 w-4 text-violet-300" />
                  Ajustes
                </PendingLink>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 bg-border/70" />
              <form action={signOut}>
                <DropdownMenuItem asChild className="cursor-pointer gap-2 rounded-md px-3 py-2 text-red-300 focus:bg-red-500/10 focus:text-red-200">
                  <button type="submit" className="w-full">
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

      </div>
    </header>
  )
}
