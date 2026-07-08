'use client'

import Link from 'next/link'
import { AvatarUploader } from '@/components/profile/AvatarUploader'
import { FixedTopBar } from '@/components/navigation/FixedTopBar'

interface Props {
  greeting: string
  firstName: string
  avatarUrl: string | null
  username: string | null
}

export function DashboardHeader({ greeting, firstName, avatarUrl, username }: Props) {
  const initials = firstName.slice(0, 2).toUpperCase()

  return (
    <FixedTopBar initialHeight={104} contentClassName="max-w-3xl sm:px-6">
      <AvatarUploader avatarUrl={avatarUrl} initials={initials} size="header" />
      <div className="min-w-0 flex-1">
        <div className="text-balance font-display text-2xl font-bold leading-tight text-foreground">
          <span className="block text-base font-medium text-muted-foreground">{greeting},</span>
          {username ? (
            <Link data-marketing-private href={`/u/${username}`} className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
              {firstName}
            </Link>
          ) : <span data-marketing-private>{firstName}</span>}
        </div>
      </div>
    </FixedTopBar>
  )
}
