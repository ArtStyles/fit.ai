import Link from 'next/link'
import { VekiraLogo } from '@/components/branding/VekiraLogo'
import { FixedTopBar } from '@/components/navigation/FixedTopBar'

interface BrandTopBarProps {
  right?: React.ReactNode
  homeHref?: string
  className?: string
}

export function BrandTopBar({ right, homeHref = '/', className }: BrandTopBarProps) {
  return (
    <FixedTopBar className={className} contentClassName="justify-between">
      <Link href={homeHref} aria-label="Ir al inicio" className="shrink-0">
        <VekiraLogo markClassName="h-9 w-9" />
      </Link>
      {right ?? <span aria-hidden className="h-11" />}
    </FixedTopBar>
  )
}
