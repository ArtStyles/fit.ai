'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AccountWorkspaceMenu } from '@/components/navigation/AccountWorkspaceMenu'
import { useOptionalAccountWorkspace } from '@/components/navigation/AccountWorkspaceContext'
import { cn } from '@/lib/utils'

export type FixedTopBarAccountSlot = 'default' | 'hidden' | 'custom'

interface FixedTopBarProps {
  children: ReactNode
  actions?: ReactNode
  className?: string
  contentClassName?: string
  initialHeight?: number
  accountSlot?: FixedTopBarAccountSlot
}

export function FixedTopBar({
  children,
  actions,
  className,
  contentClassName,
  initialHeight = 68,
  accountSlot = 'default',
}: FixedTopBarProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [contentHeight, setContentHeight] = useState(initialHeight)
  const accountContext = useOptionalAccountWorkspace()

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

  const account = accountSlot === 'default'
    && accountContext
    && !accountContext.immersiveRoute
    ? <AccountWorkspaceMenu surface="topbar" />
    : null

  const topBar = (
    <header className={cn(
      'fixed inset-x-0 top-0 z-30 border-b border-border/30 bg-[hsl(var(--surface-1)/0.95)] pt-[var(--app-safe-area-top)] shadow-sm backdrop-blur-md',
      className,
    )}>
      <div
        ref={contentRef}
        className={cn('mx-auto flex max-w-lg items-center gap-3 px-4 py-3', contentClassName)}
      >
        {children}
        {(actions || account) ? (
          <div
            data-fixed-topbar-actions
            className="ml-auto flex shrink-0 items-center gap-2"
          >
            {actions}
            {account ? <span data-account-workspace-slot>{account}</span> : null}
          </div>
        ) : null}
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
