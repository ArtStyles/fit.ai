'use client'

import { createPortal } from 'react-dom'
import {
  useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { hapticImpact } from '@/lib/native/haptics'
import { cn } from '@/lib/utils'
import { computeMenuPosition, movedBeyondTolerance, type Rect } from './long-press-menu.logic'

const HINT_KEY = 'fitai:lpm-hint-seen'
const HOLD_MS = 400
const MOVE_TOLERANCE = 10
const MENU_WIDTH = 224

export type LongPressAction = {
  id: string
  label: string
  icon: LucideIcon
  onSelect: () => void | Promise<void>
  variant?: 'default' | 'danger'
  disabled?: boolean
}

type Position = { top: number; left: number; placement: 'above' | 'below' }

export function LongPressMenu({
  actions,
  label,
  disabled = false,
  className,
  children,
}: {
  actions: LongPressAction[]
  label: string
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const liftRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)
  const srButtonRef = useRef<HTMLButtonElement>(null)

  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<Rect | null>(null)
  const [pos, setPos] = useState<Position | null>(null)
  const [pressing, setPressing] = useState(false)

  const menuId = useId()

  useEffect(() => { setMounted(true) }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    startRef.current = null
    setPressing(false)
  }, [])

  const openMenu = useCallback(() => {
    const el = wrapperRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    setPos(null)
    setOpen(true)
    suppressClickRef.current = true
    void hapticImpact('medium')
    if (typeof window !== 'undefined' && !localStorage.getItem(HINT_KEY)) {
      localStorage.setItem(HINT_KEY, '1')
    }
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setRect(null)
    setPos(null)
    srButtonRef.current?.focus()
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || e.button === 2) return
    startRef.current = { x: e.clientX, y: e.clientY }
    setPressing(true)
    timerRef.current = setTimeout(() => { setPressing(false); openMenu() }, HOLD_MS)
  }, [disabled, openMenu])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startRef.current) return
    if (movedBeyondTolerance(startRef.current, { x: e.clientX, y: e.clientY }, MOVE_TOLERANCE)) {
      clearTimer()
    }
  }, [clearTimer])

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (disabled) return
    e.preventDefault()
    clearTimer()
    openMenu()
  }, [disabled, clearTimer, openMenu])

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      e.preventDefault(); e.stopPropagation()
      suppressClickRef.current = false
    }
  }, [])

  useLayoutEffect(() => {
    if (!open || !rect || !menuRef.current) return
    const menuH = menuRef.current.offsetHeight
    setPos(computeMenuPosition({
      trigger: rect,
      menuWidth: MENU_WIDTH,
      menuHeight: menuH,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }))
  }, [open, rect])

  useEffect(() => {
    if (!open || !rect || !liftRef.current || !wrapperRef.current) return
    const node = liftRef.current
    const clone = wrapperRef.current.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[data-lpm-clone-hide]').forEach(n => n.remove())
    node.appendChild(clone)
    return () => { node.replaceChildren() }
  }, [open, rect])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    const first = menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')
    first?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const onMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') { e.preventDefault(); close(); return }
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
    )
    if (items.length === 0) return
    const idx = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length].focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus() }
  }, [close])

  async function runAction(a: LongPressAction) {
    close()
    await a.onSelect()
  }

  const overlay = open && rect ? (
    <motion.div key="lpm-overlay" role="presentation"
      className="fixed inset-0 z-[60]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onClick={close}
      onContextMenu={(e) => { e.preventDefault(); close() }}>
      <div className="absolute inset-0 bg-black/55" />

      <motion.div
        ref={liftRef}
        className="absolute origin-center rounded-2xl"
        style={{ top: rect.top, left: rect.left, width: rect.width }}
        initial={{ scale: 1 }} animate={{ scale: 1.03 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        onClick={(e) => { e.stopPropagation(); close() }} />

      <motion.div
        ref={menuRef}
        key={pos?.placement ?? 'pending'}
        role="menu"
        id={menuId}
        aria-label={label}
        onKeyDown={onMenuKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="absolute flex flex-col gap-0.5 rounded-2xl border border-white/10 bg-popover/95 p-1.5 shadow-xl backdrop-blur-md"
        style={{
          width: MENU_WIDTH,
          top: pos?.top ?? rect.top + rect.height + 10,
          left: pos?.left ?? rect.left,
          visibility: pos ? 'visible' : 'hidden',
        }}
        initial={{ opacity: 0, y: pos?.placement === 'above' ? 6 : -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16 }}>
        {actions.map(a => {
          const Icon = a.icon
          return (
            <button key={a.id} type="button" role="menuitem" disabled={a.disabled}
              onClick={() => runAction(a)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-40',
                a.variant === 'danger'
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-foreground hover:bg-white/10',
              )}>
              <Icon className="h-4 w-4 shrink-0" />
              <span>{a.label}</span>
            </button>
          )
        })}
      </motion.div>
    </motion.div>
  ) : null

  return (
    <>
      <div
        ref={wrapperRef}
        tabIndex={-1}
        className={cn('relative outline-none', pressing && 'scale-[0.975] transition-transform', className)}
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onPointerCancel={clearTimer}
        onContextMenu={onContextMenu}
        onClickCapture={onClickCapture}>
        {children}
        <span
          data-lpm-clone-hide
          className={cn(
            'pointer-events-none absolute bottom-0 left-0 h-0.5 bg-violet-500 transition-[width] duration-[400ms] ease-linear',
            pressing ? 'w-full' : 'w-0',
          )} />
        <button
          ref={srButtonRef}
          data-lpm-clone-hide
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={openMenu}
          className="sr-only"
        >Más opciones: {label}</button>
      </div>

      {mounted && createPortal(<AnimatePresence>{overlay}</AnimatePresence>, document.body)}
    </>
  )
}
