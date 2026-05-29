'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dumbbell, LogOut, Ruler, Settings } from 'lucide-react'
import { DevModeBanner } from '@/components/DevModeBanner'
import { PendingLink } from '@/components/navigation/PendingLink'
import { signOut } from '@/app/(auth)/actions'

interface Props {
  greeting:  string
  firstName: string
  avatarUrl: string | null
}

export function DashboardHeader({ greeting, firstName, avatarUrl }: Props) {
  const initials = firstName.slice(0, 2).toUpperCase()

  return (
    <header className="sticky top-0 z-20 border-b border-border/40 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">

        {/* Logo + saludo */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
            <Dumbbell className="h-4 w-4" />
          </div>
          <p className="truncate text-base leading-none">
            <span className="font-normal text-gray-400">{greeting}, </span>
            <span className="font-semibold text-white">{firstName}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <DevModeBanner />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="cursor-pointer rounded-full ring-offset-background transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
