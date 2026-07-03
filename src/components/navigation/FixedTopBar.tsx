'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface FixedTopBarProps {
  children: ReactNode
  className?: string
  contentClassName?: string
  initialHeight?: number
}

export function FixedTopBar({
  children,
  className,
  contentClassName,
  initialHeight = 68,
}: FixedTopBarProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [contentHeight, setContentHeight] = useState(initialHeight)

  useEffect(() => {
    setPortalTarget(document.body)
  }, [])

  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    const updateHeight = () => setContentHeight(content.getBoundingClientRect().height)
    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(content)
    return () => observer.disconnect()
  }, [portalTarget])

  const topBar = (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-30 border-b border-border/30 bg-background/90 pt-[var(--app-safe-area-top)] shadow-sm backdrop-blur-md',
        className,
      )}
    >
      <div
        ref={contentRef}
        className={cn('mx-auto flex max-w-lg items-center gap-3 px-4 py-3', contentClassName)}
      >
        {children}
      </div>
    </header>
  )

  return (
    <>
      {portalTarget ? createPortal(topBar, portalTarget) : topBar}
      <div aria-hidden className="shrink-0" style={{ height: contentHeight }} />
    </>
  )
}
