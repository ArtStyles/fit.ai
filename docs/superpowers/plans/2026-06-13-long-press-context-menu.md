# Menú contextual de "mantener pulsado" — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un patrón global de "mantener pulsado" que abre un menú contextual realzado (estilo iOS) con las acciones de cada elemento (editar, eliminar, etc.), aplicado a medidas, ejercicios del plan y conversaciones del chat.

**Architecture:** Un primitivo cliente `LongPressMenu` reutilizable (gesto + háptica + scrim + clon elevado + menú anclado vía portal, con tip de una vez y accesibilidad por teclado). La lógica pura (posicionado, tolerancia de movimiento, orden) se extrae a módulos sin React, testeados con vitest en entorno `node`. Cada vista declara solo sus acciones. En el plan, el reordenado pasa a arrastrar-y-soltar con `Reorder` de framer-motion.

**Tech Stack:** React 19 / Next.js (App Router), framer-motion 12 (`motion`, `AnimatePresence`, `Reorder`), `@capacitor/haptics` (vía `src/lib/native/haptics.ts`), Radix `Dialog`, Tailwind, vitest.

---

## Estructura de archivos

Nuevos:
- `src/components/ui/long-press-menu.logic.ts` — funciones puras: `computeMenuPosition`, `movedBeyondTolerance`. Tipos `Rect`, `MenuPlacement`.
- `src/components/ui/long-press-menu.tsx` — componente `LongPressMenu` + tipo `LongPressAction`.
- `src/components/ui/__tests__/long-press-menu.logic.test.ts` — tests de la lógica pura.
- `src/app/actions/measurements.logic.ts` — `payloadHasValue` (pura, DRY).
- `src/app/actions/__tests__/measurements.logic.test.ts`.
- `src/app/actions/plan.logic.ts` — `orderedIdsToUpdates` (pura).
- `src/app/actions/__tests__/plan.logic.test.ts`.
- `src/components/plan/WorkoutExerciseManager.tsx` — lista cliente reordenable + filas con menú/diálogos.

Modificados:
- `src/components/ui/index.ts` — exporta `LongPressMenu` y `LongPressAction`.
- `src/app/actions/measurements.ts` — `updateMeasurement`; usa `payloadHasValue`.
- `src/app/actions/plan.ts` — `reorderWorkoutExercises`; usa `orderedIdsToUpdates`.
- `src/components/measurements/MeasurementsClient.tsx` — `HistoryRow` con menú; `LogForm` crear/editar.
- `src/components/plan/WorkoutExerciseList.tsx` — delega en `WorkoutExerciseManager`.
- `src/components/chat/ChatContainer.tsx` — `ConversationItem` con menú.

**Convención de commits:** Conventional Commits en español, terminando con el footer:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 1: Lógica pura del menú (posicionado + tolerancia)

**Files:**
- Create: `src/components/ui/long-press-menu.logic.ts`
- Test: `src/components/ui/__tests__/long-press-menu.logic.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`src/components/ui/__tests__/long-press-menu.logic.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeMenuPosition, movedBeyondTolerance } from '../long-press-menu.logic'

const trigger = { top: 100, left: 50, width: 200, height: 60 }
const viewport = { viewportWidth: 390, viewportHeight: 800 }

describe('computeMenuPosition', () => {
  it('coloca el menú debajo cuando cabe', () => {
    const r = computeMenuPosition({ trigger, menuWidth: 220, menuHeight: 160, ...viewport })
    expect(r.placement).toBe('below')
    expect(r.top).toBe(100 + 60 + 10) // top + height + gap
  })

  it('voltea encima cuando no cabe debajo', () => {
    const low = { top: 720, left: 50, width: 200, height: 60 }
    const r = computeMenuPosition({ trigger: low, menuWidth: 220, menuHeight: 160, ...viewport })
    expect(r.placement).toBe('above')
    expect(r.top).toBe(720 - 10 - 160) // top - gap - menuHeight
  })

  it('centra horizontalmente sobre el disparador', () => {
    const r = computeMenuPosition({ trigger, menuWidth: 100, menuHeight: 120, ...viewport })
    expect(r.left).toBe(50 + 200 / 2 - 100 / 2) // 100
  })

  it('hace clamp a la izquierda cuando el disparador está pegado al borde', () => {
    const edge = { top: 100, left: 0, width: 40, height: 40 }
    const r = computeMenuPosition({ trigger: edge, menuWidth: 220, menuHeight: 120, ...viewport })
    expect(r.left).toBe(8) // margin
  })

  it('hace clamp a la derecha cuando se sale por el borde derecho', () => {
    const edge = { top: 100, left: 360, width: 40, height: 40 }
    const r = computeMenuPosition({ trigger: edge, menuWidth: 220, menuHeight: 120, ...viewport })
    expect(r.left).toBe(390 - 220 - 8) // viewportWidth - menuWidth - margin
  })

  it('nunca coloca el menú por encima del margen superior', () => {
    const top = { top: 5, left: 50, width: 200, height: 30 }
    const r = computeMenuPosition({ trigger: top, menuWidth: 220, menuHeight: 700, ...viewport })
    expect(r.top).toBeGreaterThanOrEqual(8)
  })
})

describe('movedBeyondTolerance', () => {
  it('es false dentro de la tolerancia', () => {
    expect(movedBeyondTolerance({ x: 0, y: 0 }, { x: 5, y: 5 }, 10)).toBe(false)
  })
  it('es true al superar la tolerancia en X', () => {
    expect(movedBeyondTolerance({ x: 0, y: 0 }, { x: 15, y: 0 }, 10)).toBe(true)
  })
  it('es true al superar la tolerancia en Y', () => {
    expect(movedBeyondTolerance({ x: 0, y: 0 }, { x: 0, y: 12 }, 10)).toBe(true)
  })
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm test src/components/ui/__tests__/long-press-menu.logic.test.ts`
Expected: FAIL — `Failed to resolve import "../long-press-menu.logic"`.

- [ ] **Step 3: Implementar la lógica pura**

`src/components/ui/long-press-menu.logic.ts`:

```ts
export type Rect = { top: number; left: number; width: number; height: number }
export type MenuPlacement = 'above' | 'below'

export function movedBeyondTolerance(
  start: { x: number; y: number },
  current: { x: number; y: number },
  tolerance: number,
): boolean {
  return Math.abs(current.x - start.x) > tolerance || Math.abs(current.y - start.y) > tolerance
}

export function computeMenuPosition(args: {
  trigger: Rect
  menuWidth: number
  menuHeight: number
  viewportWidth: number
  viewportHeight: number
  gap?: number
  margin?: number
}): { top: number; left: number; placement: MenuPlacement } {
  const { trigger, menuWidth, menuHeight, viewportWidth, viewportHeight } = args
  const gap = args.gap ?? 10
  const margin = args.margin ?? 8

  const belowTop = trigger.top + trigger.height + gap
  const fitsBelow = belowTop + menuHeight <= viewportHeight - margin
  const placement: MenuPlacement = fitsBelow ? 'below' : 'above'
  const top = placement === 'below'
    ? belowTop
    : Math.max(margin, trigger.top - gap - menuHeight)

  const centered = trigger.left + trigger.width / 2 - menuWidth / 2
  const left = Math.max(margin, Math.min(centered, viewportWidth - menuWidth - margin))

  return { top, left, placement }
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm test src/components/ui/__tests__/long-press-menu.logic.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/long-press-menu.logic.ts src/components/ui/__tests__/long-press-menu.logic.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): lógica pura de posicionado del menú long-press

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Componente `LongPressMenu`

**Files:**
- Create: `src/components/ui/long-press-menu.tsx`
- Modify: `src/components/ui/index.ts`

Sin test unitario (la interacción DOM/portal/framer queda fuera del entorno `node`, según el spec). Verificación: `type-check` + `lint` + prueba manual.

- [ ] **Step 1: Implementar el componente**

`src/components/ui/long-press-menu.tsx`:

```tsx
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

  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<Rect | null>(null)
  const [pos, setPos] = useState<Position | null>(null)
  const [pressing, setPressing] = useState(false)
  const [showHint, setShowHint] = useState(false)

  const menuId = useId()

  useEffect(() => { setMounted(true) }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
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
    wrapperRef.current?.focus?.()
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
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
    )
    if (items.length === 0) return
    const idx = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length].focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus() }
  }, [])

  async function runAction(a: LongPressAction) {
    close()
    await a.onSelect()
  }

  const overlay = open && rect ? (
    <div role="presentation"
      className="fixed inset-0 z-[60]"
      onClick={close}
      onContextMenu={(e) => { e.preventDefault(); close() }}>
      <motion.div className="absolute inset-0 bg-black/55"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }} />

      <motion.div
        ref={liftRef}
        className="absolute origin-center rounded-2xl"
        style={{ top: rect.top, left: rect.left, width: rect.width }}
        initial={{ scale: 1 }} animate={{ scale: 1.03 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        onClick={(e) => { e.stopPropagation(); close() }} />

      <motion.div
        ref={menuRef}
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
    </div>
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
```

- [ ] **Step 2: Exportar desde el índice de UI**

En `src/components/ui/index.ts`, añadir:

```ts
export { LongPressMenu, type LongPressAction } from './long-press-menu'
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `pnpm type-check`
Expected: sin errores.

Run: `pnpm lint`
Expected: sin errores nuevos en los archivos tocados.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/long-press-menu.tsx src/components/ui/index.ts
git commit -m "$(cat <<'EOF'
feat(ui): primitivo LongPressMenu (mantener pulsado, estilo realzado)

Menú contextual accesible con scrim, clon elevado, posicionado con
volteo, háptica al abrir, tip de una vez y disparador sr-only.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `payloadHasValue` + server action `updateMeasurement`

**Files:**
- Create: `src/app/actions/measurements.logic.ts`
- Create: `src/app/actions/__tests__/measurements.logic.test.ts`
- Modify: `src/app/actions/measurements.ts`

- [ ] **Step 1: Escribir el test que falla**

`src/app/actions/__tests__/measurements.logic.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { payloadHasValue } from '../measurements.logic'

describe('payloadHasValue', () => {
  it('es true si hay al menos un valor numérico', () => {
    expect(payloadHasValue({ weight_kg: 74.2 })).toBe(true)
  })
  it('es false con todo null/undefined', () => {
    expect(payloadHasValue({ weight_kg: null, notes: null })).toBe(false)
    expect(payloadHasValue({})).toBe(false)
  })
  it('trata la cadena vacía como sin valor', () => {
    expect(payloadHasValue({ notes: '' })).toBe(false)
  })
  it('es true con una nota no vacía', () => {
    expect(payloadHasValue({ notes: 'ok' })).toBe(true)
  })
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test src/app/actions/__tests__/measurements.logic.test.ts`
Expected: FAIL — no se resuelve `../measurements.logic`.

- [ ] **Step 3: Implementar la lógica pura**

`src/app/actions/measurements.logic.ts`:

```ts
import type { LogMeasurementPayload } from './measurements'

export function payloadHasValue(payload: LogMeasurementPayload): boolean {
  return Object.values(payload).some(v => v !== null && v !== undefined && v !== '')
}
```

> Nota: importar solo el **tipo** desde `measurements.ts` no arrastra el `'use server'` en tiempo de ejecución.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test src/app/actions/__tests__/measurements.logic.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Añadir `updateMeasurement` y reutilizar `payloadHasValue`**

En `src/app/actions/measurements.ts`, añadir el import al principio (junto a los existentes):

```ts
import { payloadHasValue } from './measurements.logic'
```

Sustituir, dentro de `logMeasurement`, la línea:

```ts
  const hasValue = Object.values(payload).some(v => v !== null && v !== undefined && v !== '')
  if (!hasValue) return { success: false, error: 'Introduce al menos un valor' }
```

por:

```ts
  if (!payloadHasValue(payload)) return { success: false, error: 'Introduce al menos un valor' }
```

Y añadir al final del archivo:

```ts
export async function updateMeasurement(
  id: string,
  payload: LogMeasurementPayload,
): Promise<LogMeasurementResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  if (!payloadHasValue(payload)) return { success: false, error: 'Introduce al menos un valor' }

  const { error } = await (supabase
    .from('measurements') as any)
    .update(payload)
    .eq('id', id)
    .eq('user_id', user.id) as { error: { message: string } | null }

  if (error) return { success: false, error: error.message }

  revalidatePath('/medidas')
  return { success: true, id }
}
```

- [ ] **Step 6: Verificar tipos y suite completa**

Run: `pnpm type-check`
Expected: sin errores.

Run: `pnpm test`
Expected: PASS (toda la suite, incluida la nueva).

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/measurements.ts src/app/actions/measurements.logic.ts src/app/actions/__tests__/measurements.logic.test.ts
git commit -m "$(cat <<'EOF'
feat(measurements): server action updateMeasurement + payloadHasValue

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Medidas — `LogForm` crear/editar + menú en `HistoryRow`

**Files:**
- Modify: `src/components/measurements/MeasurementsClient.tsx`

Verificación: `type-check` + `lint` + manual.

- [ ] **Step 1: Generalizar `LogForm` para crear/editar**

En `src/components/measurements/MeasurementsClient.tsx`, sustituir el bloque de imports de `@/app/actions/measurements` para incluir `updateMeasurement`:

```tsx
import {
  logMeasurement,
  updateMeasurement,
  deleteMeasurement,
  type MeasurementRow,
  type LogMeasurementPayload,
} from '@/app/actions/measurements'
```

Añadir al import de `lucide-react` los iconos `Pencil` y `Trash2` (este último ya está) y `MoreVertical` no hace falta. Asegurar que `Pencil` está importado:

```tsx
import {
  ArrowLeft, Plus, Scale, Trash2, ChevronDown, ChevronUp,
  TrendingDown, TrendingUp, Minus, Pencil,
} from 'lucide-react'
```

Importar el primitivo:

```tsx
import { LongPressMenu, type LongPressAction } from '@/components/ui'
```

Reemplazar la firma y el cuerpo de `LogForm` por una versión que acepte `initial`:

```tsx
function LogForm({
  initial,
  onSaved,
  onClose,
}: {
  initial?: MeasurementRow
  onSaved: (row: MeasurementRow) => void
  onClose: () => void
}) {
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [extra, setExtra]     = useState(
    Boolean(initial && (initial.chest_cm ?? initial.hips_cm ?? initial.arms_cm ?? initial.legs_cm)),
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const fd  = new FormData(e.currentTarget)
    const num = (k: string) => { const v = fd.get(k); return v ? parseFloat(String(v)) || null : null }

    const payload: LogMeasurementPayload = {
      weight_kg:           num('weight_kg'),
      body_fat_percentage: num('body_fat_percentage'),
      muscle_mass_kg:      num('muscle_mass_kg'),
      waist_cm:            num('waist_cm'),
      chest_cm:            num('chest_cm'),
      hips_cm:             num('hips_cm'),
      arms_cm:             num('arms_cm'),
      legs_cm:             num('legs_cm'),
      notes:               String(fd.get('notes') ?? '').trim() || null,
    }

    const result = initial
      ? await updateMeasurement(initial.id, payload)
      : await logMeasurement(payload)
    setSaving(false)

    if (!result.success) { setError(result.error ?? 'Error al guardar'); return }

    onSaved({
      id: result.id!,
      recorded_at: initial?.recorded_at ?? new Date().toISOString(),
      ...payload,
    } as MeasurementRow)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <InputField name="weight_kg"           label="Peso (kg)"          step="0.1" defaultValue={initial?.weight_kg} />
        <InputField name="body_fat_percentage" label="Grasa corporal (%)" step="0.1" defaultValue={initial?.body_fat_percentage} />
        <InputField name="waist_cm"            label="Cintura (cm)"       step="0.5" defaultValue={initial?.waist_cm} />
        <InputField name="muscle_mass_kg"      label="Masa muscular (kg)" step="0.1" defaultValue={initial?.muscle_mass_kg} />
      </div>

      <button type="button" onClick={() => setExtra(v => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        {extra ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {extra ? 'Menos campos' : 'Más perímetros'}
      </button>

      {extra && (
        <div className="grid grid-cols-2 gap-3">
          <InputField name="chest_cm" label="Pecho (cm)"   step="0.5" defaultValue={initial?.chest_cm} />
          <InputField name="hips_cm"  label="Cadera (cm)"  step="0.5" defaultValue={initial?.hips_cm} />
          <InputField name="arms_cm"  label="Brazos (cm)"  step="0.5" defaultValue={initial?.arms_cm} />
          <InputField name="legs_cm"  label="Piernas (cm)" step="0.5" defaultValue={initial?.legs_cm} />
        </div>
      )}

      <textarea name="notes" rows={2} placeholder="Notas opcionales..." defaultValue={initial?.notes ?? ''}
        className="w-full resize-none rounded-lg border border-border/50 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-violet-500/60" />

      <div className="flex gap-2">
        <button type="button" onClick={onClose}
          className="flex-1 rounded-lg border border-border/50 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50">
          {saving ? 'Guardando…' : (initial ? 'Actualizar' : 'Guardar')}
        </button>
      </div>
    </form>
  )
}
```

Actualizar `InputField` para aceptar `defaultValue`:

```tsx
function InputField({ name, label, step, defaultValue }: {
  name: string; label: string; step?: string; defaultValue?: number | null
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input type="number" name={name} step={step ?? '1'} min="0" placeholder="—"
        defaultValue={defaultValue ?? undefined}
        className="h-9 w-full rounded-lg border border-border/50 bg-white/5 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-violet-500/60" />
    </label>
  )
}
```

- [ ] **Step 2: Estado de edición en `MeasurementsClient`**

Dentro de `MeasurementsClient`, añadir estado y handler de actualización; el `showForm` pasa a guardar opcionalmente la fila en edición.

Reemplazar:

```tsx
  const [showForm, setShowForm]         = useState(false)
```

por:

```tsx
  const [formState, setFormState] = useState<{ open: boolean; editing?: MeasurementRow }>({ open: false })
```

Reemplazar `handleSaved`:

```tsx
  function handleSaved(row: MeasurementRow) {
    setMeasurements(m => {
      const exists = m.some(r => r.id === row.id)
      return exists ? m.map(r => (r.id === row.id ? row : r)) : [row, ...m]
    })
  }
```

Sustituir las dos llamadas a `setShowForm(true)` (botón "Registrar" del header y botón "Primera medida") por `setFormState({ open: true })`.

Reemplazar el `<Dialog>` del final por:

```tsx
      <Dialog open={formState.open} onOpenChange={(o) => setFormState(s => ({ ...s, open: o }))}>
        <DialogContent className="mx-4 max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">
          <DialogHeader className="border-b border-border/40 px-5 py-4">
            <DialogTitle className="text-base text-white">
              {formState.editing ? 'Editar medida' : 'Registrar medidas'}
            </DialogTitle>
          </DialogHeader>
          <LogForm
            initial={formState.editing}
            onSaved={handleSaved}
            onClose={() => setFormState({ open: false })}
          />
        </DialogContent>
      </Dialog>
```

Cambiar la firma del map de historial para pasar `onEdit`:

```tsx
                {visible.map((row, i) => (
                  <HistoryRow key={row.id} row={row} isLatest={i === 0}
                    onDelete={handleDelete}
                    onEdit={() => setFormState({ open: true, editing: row })} />
                ))}
```

- [ ] **Step 3: `HistoryRow` con `LongPressMenu` (sin papelera de hover)**

Reemplazar todo el componente `HistoryRow` por:

```tsx
function HistoryRow({
  row, isLatest, onDelete, onEdit,
}: {
  row: MeasurementRow; isLatest: boolean
  onDelete: (id: string) => void; onEdit: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const extras = [
    row.chest_cm  !== null && `Pecho: ${fmt(row.chest_cm, ' cm')}`,
    row.hips_cm   !== null && `Cadera: ${fmt(row.hips_cm, ' cm')}`,
    row.arms_cm   !== null && `Brazos: ${fmt(row.arms_cm, ' cm')}`,
    row.legs_cm   !== null && `Piernas: ${fmt(row.legs_cm, ' cm')}`,
  ].filter(Boolean) as string[]

  const actions: LongPressAction[] = [
    { id: 'edit', label: 'Editar', icon: Pencil, onSelect: onEdit },
    { id: 'delete', label: 'Eliminar', icon: Trash2, variant: 'danger', onSelect: () => onDelete(row.id) },
  ]

  return (
    <li>
      <LongPressMenu actions={actions} label={`Medida del ${fmtDate(row.recorded_at)}`}>
        <div className="rounded-xl border border-border/40 bg-white/5 p-3.5">
          <button type="button" onClick={() => setExpanded(v => !v)} className="flex w-full min-w-0 items-center gap-3 text-left">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white">{fmtDate(row.recorded_at)}</p>
                {isLatest && <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-300">Última</span>}
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                {[
                  row.weight_kg           !== null && `${fmt(row.weight_kg, ' kg')}`,
                  row.body_fat_percentage !== null && `${fmt(row.body_fat_percentage, '% grasa')}`,
                  row.waist_cm            !== null && `${fmt(row.waist_cm, ' cm cintura')}`,
                ].filter(Boolean).join(' · ') || 'Sin datos principales'}
              </p>
            </div>
            {extras.length > 0 && (
              <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            )}
          </button>

          {expanded && extras.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2 border-t border-border/30 pt-2.5">
              {extras.map(e => (
                <span key={e} className="rounded-md bg-white/5 px-2 py-1 text-xs text-gray-400">{e}</span>
              ))}
              {row.notes && <p className="mt-1 w-full text-xs text-gray-500 italic">"{row.notes}"</p>}
            </div>
          )}
        </div>
      </LongPressMenu>
    </li>
  )
}
```

- [ ] **Step 4: Verificar tipos y lint**

Run: `pnpm type-check`
Expected: sin errores.

Run: `pnpm lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Prueba manual**

Run: `pnpm dev` → abrir `/medidas` en el navegador (responsive/móvil).
Verificar: mantener pulsada una fila abre el menú realzado con Editar/Eliminar; Editar abre la forma prellenada y actualiza; Eliminar borra; el tap normal sigue expandiendo perímetros; ya no hay papelera de hover.

- [ ] **Step 6: Commit**

```bash
git add src/components/measurements/MeasurementsClient.tsx
git commit -m "$(cat <<'EOF'
feat(measurements): menú long-press (editar/eliminar) y edición de medidas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `orderedIdsToUpdates` + server action `reorderWorkoutExercises`

**Files:**
- Create: `src/app/actions/plan.logic.ts`
- Create: `src/app/actions/__tests__/plan.logic.test.ts`
- Modify: `src/app/actions/plan.ts`

- [ ] **Step 1: Escribir el test que falla**

`src/app/actions/__tests__/plan.logic.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { orderedIdsToUpdates } from '../plan.logic'

describe('orderedIdsToUpdates', () => {
  it('asigna order_index 1-based en el orden dado', () => {
    expect(orderedIdsToUpdates(['c', 'a', 'b'])).toEqual([
      { id: 'c', order_index: 1 },
      { id: 'a', order_index: 2 },
      { id: 'b', order_index: 3 },
    ])
  })
  it('devuelve [] con lista vacía', () => {
    expect(orderedIdsToUpdates([])).toEqual([])
  })
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test src/app/actions/__tests__/plan.logic.test.ts`
Expected: FAIL — no se resuelve `../plan.logic`.

- [ ] **Step 3: Implementar la lógica pura**

`src/app/actions/plan.logic.ts`:

```ts
export function orderedIdsToUpdates(orderedIds: string[]): { id: string; order_index: number }[] {
  return orderedIds.map((id, index) => ({ id, order_index: index + 1 }))
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test src/app/actions/__tests__/plan.logic.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Añadir `reorderWorkoutExercises`**

En `src/app/actions/plan.ts`, añadir el import al principio:

```ts
import { orderedIdsToUpdates } from './plan.logic'
```

Añadir al final del archivo (usa los helpers existentes `getOwnedWorkout`, `touchManualPlan`, `revalidatePlanSurfaces`):

```ts
export async function reorderWorkoutExercises(
  planId: string,
  workoutId: string,
  orderedIds: string[],
): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  const workout = await getOwnedWorkout(supabase, workoutId, user.id)
  if (!workout || workout.plan_id !== planId) return { success: false }

  const { data } = await (supabase.from('workout_exercises') as any)
    .select('id')
    .eq('workout_id', workoutId)

  const owned = new Set(((data ?? []) as { id: string }[]).map(r => r.id))
  if (orderedIds.length !== owned.size || !orderedIds.every(id => owned.has(id))) {
    return { success: false }
  }

  await Promise.all(
    orderedIdsToUpdates(orderedIds).map(u =>
      (supabase.from('workout_exercises') as any)
        .update({ order_index: u.order_index })
        .eq('id', u.id)
        .eq('workout_id', workoutId),
    ),
  )

  await touchManualPlan(supabase, planId, user.id)
  revalidatePlanSurfaces(workoutId)
  return { success: true }
}
```

- [ ] **Step 6: Verificar tipos y suite completa**

Run: `pnpm type-check`
Expected: sin errores.

Run: `pnpm test`
Expected: PASS (toda la suite).

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/plan.ts src/app/actions/plan.logic.ts src/app/actions/__tests__/plan.logic.test.ts
git commit -m "$(cat <<'EOF'
feat(plan): server action reorderWorkoutExercises (orden por arrastre)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Plan — `WorkoutExerciseManager` (arrastre + menú + diálogos)

**Files:**
- Create: `src/components/plan/WorkoutExerciseManager.tsx`
- Modify: `src/components/plan/WorkoutExerciseList.tsx`

Verificación: `type-check` + `lint` + `build` + manual.

- [ ] **Step 1: Crear el componente cliente `WorkoutExerciseManager`**

`src/components/plan/WorkoutExerciseManager.tsx`:

```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { GripVertical, PencilLine, Repeat2, Trash2, TrendingUp } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LongPressMenu, type LongPressAction } from '@/components/ui'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import {
  reorderWorkoutExercises,
  removeWorkoutExercise,
  replaceWorkoutExercise,
  updateWorkoutExercise,
} from '@/app/actions/plan'
import type { PlanExerciseOption, PlanWorkoutExerciseRow } from './WorkoutExerciseList'

const inputClass =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500'
const textareaClass =
  'w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500'

function getExercise(row: PlanWorkoutExerciseRow): PlanExerciseOption | null {
  if (Array.isArray(row.exercise)) return row.exercise[0] ?? null
  return row.exercise
}
function normalizeList(values: string[] | null | undefined): string[] {
  return (values ?? []).map(v => v.toLowerCase())
}
function overlapCount(a: string[] | null | undefined, b: string[] | null | undefined): number {
  const bSet = new Set(normalizeList(b))
  return normalizeList(a).filter(v => bSet.has(v)).length
}
function scoreReplacement(current: PlanExerciseOption, candidate: PlanExerciseOption): number {
  let score = overlapCount(current.muscle_groups, candidate.muscle_groups) * 4
  score += overlapCount(current.equipment, candidate.equipment)
  if (current.exercise_type && current.exercise_type === candidate.exercise_type) score += 2
  if (current.is_compound === candidate.is_compound) score += 2
  if (current.difficulty && current.difficulty === candidate.difficulty) score += 1
  return score
}
function getReplacementCandidates(current: PlanExerciseOption | null, options: PlanExerciseOption[]): PlanExerciseOption[] {
  if (!current) return options.slice(0, 4)
  return options
    .filter(o => o.id !== current.id)
    .map(o => ({ o, s: scoreReplacement(current, o) }))
    .filter(i => i.s > 0)
    .sort((a, b) => b.s - a.s || a.o.name.localeCompare(b.o.name))
    .slice(0, 4)
    .map(i => i.o)
}
function formatExerciseDetail(row: PlanWorkoutExerciseRow): string {
  return [
    row.sets && row.reps ? `${row.sets}x${row.reps}` : null,
    row.weight_kg !== null ? `${row.weight_kg} kg` : null,
    row.target_rpe ? `RPE ${row.target_rpe}` : null,
    row.rest_seconds !== null ? `${row.rest_seconds}s descanso` : null,
  ].filter(Boolean).join(' · ')
}
function formatMuscles(groups: string[] | null | undefined): string | null {
  if (!groups || groups.length === 0) return null
  return groups.slice(0, 3).join(' · ')
}

function HiddenFields({ planId, workoutExerciseId }: { planId: string; workoutExerciseId: string }) {
  return (
    <>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="workoutExerciseId" value={workoutExerciseId} />
    </>
  )
}

function PrescriptionFields({ row }: { row?: PlanWorkoutExerciseRow }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Series</span>
        <input name="sets" type="number" min={1} max={12} defaultValue={row?.sets ?? 3} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Reps</span>
        <input name="reps" type="number" min={1} max={100} defaultValue={row?.reps ?? 10} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Peso kg</span>
        <input name="weightKg" type="number" min={0} step={0.25} defaultValue={row?.weight_kg ?? ''} placeholder="Opcional" className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Descanso seg.</span>
        <input name="restSeconds" type="number" min={0} max={600} defaultValue={row?.rest_seconds ?? 60} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">RPE objetivo</span>
        <input name="targetRpe" type="number" min={1} max={10} defaultValue={row?.target_rpe ?? 8} className={inputClass} /></label>
    </div>
  )
}

export function WorkoutExerciseManager({
  planId, exercises, exerciseOptions,
}: {
  planId: string
  exercises: PlanWorkoutExerciseRow[]
  exerciseOptions: PlanExerciseOption[]
}) {
  const [order, setOrder] = useState<PlanWorkoutExerciseRow[]>(
    [...exercises].sort((a, b) => a.order_index - b.order_index),
  )
  const [dialog, setDialog] = useState<{ kind: 'adjust' | 'replace'; row: PlanWorkoutExerciseRow } | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    setOrder([...exercises].sort((a, b) => a.order_index - b.order_index))
  }, [exercises])

  function persistOrder(next: PlanWorkoutExerciseRow[]) {
    const ids = next.map(r => r.id)
    startTransition(() => { void reorderWorkoutExercises(planId, next[0]?.workout_id ?? '', ids) })
  }

  function removeRow(row: PlanWorkoutExerciseRow) {
    const fd = new FormData()
    fd.set('planId', planId)
    fd.set('workoutExerciseId', row.id)
    startTransition(() => { void removeWorkoutExercise(fd) })
  }

  if (order.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
        Este entrenamiento todavía no tiene ejercicios. Agrega el primero desde el catálogo.
      </div>
    )
  }

  return (
    <div className="mt-4">
      <Reorder.Group axis="y" values={order} onReorder={(next) => { setOrder(next); persistOrder(next) }}
        className="flex flex-col gap-2">
        {order.map((row, index) => (
          <ExerciseRow
            key={row.id}
            row={row}
            index={index}
            planId={planId}
            onAdjust={() => setDialog({ kind: 'adjust', row })}
            onReplace={() => setDialog({ kind: 'replace', row })}
            onRemove={() => removeRow(row)}
          />
        ))}
      </Reorder.Group>

      <Dialog open={dialog?.kind === 'adjust'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="mx-4 max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">
          <DialogHeader className="border-b border-border/40 px-5 py-4">
            <DialogTitle className="text-base text-white">Ajustar series y carga</DialogTitle>
          </DialogHeader>
          {dialog?.kind === 'adjust' && (
            <form action={updateWorkoutExercise} className="space-y-3 p-5">
              <HiddenFields planId={planId} workoutExerciseId={dialog.row.id} />
              <PrescriptionFields row={dialog.row} />
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Notas</span>
                <textarea name="notes" defaultValue={dialog.row.notes ?? ''} rows={2}
                  placeholder="Ej. bajar rango si molesta el hombro" className={textareaClass} />
              </label>
              <SubmitButton label="Guardar ajustes" pendingLabel="Guardando ajustes"
                className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600" />
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === 'replace'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="mx-4 max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">
          <DialogHeader className="border-b border-border/40 px-5 py-4">
            <DialogTitle className="text-base text-white">Cambiar ejercicio</DialogTitle>
          </DialogHeader>
          {dialog?.kind === 'replace' && (() => {
            const candidates = getReplacementCandidates(getExercise(dialog.row), exerciseOptions)
            return (
              <div className="grid gap-2 p-5">
                {candidates.length === 0 && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    No encontramos alternativas cercanas. Puedes agregar otro ejercicio y quitar este.
                  </p>
                )}
                {candidates.map(c => (
                  <form key={c.id} action={replaceWorkoutExercise}>
                    <HiddenFields planId={planId} workoutExerciseId={dialog.row.id} />
                    <input type="hidden" name="exerciseId" value={c.id} />
                    <SubmitButton label={c.name} pendingLabel="Cambiando" variant="outline"
                      className="h-auto min-h-10 w-full justify-start whitespace-normal border-border/60 bg-muted/10 px-3 py-2 text-left text-xs text-foreground hover:bg-muted/20">
                      <Repeat2 className="mr-2 h-3.5 w-3.5 shrink-0 text-violet-300" />
                      <span>{c.name}
                        {formatMuscles(c.muscle_groups) && (
                          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{formatMuscles(c.muscle_groups)}</span>
                        )}
                      </span>
                    </SubmitButton>
                  </form>
                ))}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ExerciseRow({
  row, index, planId, onAdjust, onReplace, onRemove,
}: {
  row: PlanWorkoutExerciseRow
  index: number
  planId: string
  onAdjust: () => void
  onReplace: () => void
  onRemove: () => void
}) {
  const dragControls = useDragControls()
  const exercise = getExercise(row)
  const detail = formatExerciseDetail(row)
  const muscleLabel = formatMuscles(exercise?.muscle_groups)

  const actions: LongPressAction[] = [
    { id: 'adjust', label: 'Ajustar series y carga', icon: PencilLine, onSelect: onAdjust },
    { id: 'replace', label: 'Cambiar ejercicio', icon: Repeat2, onSelect: onReplace },
    { id: 'remove', label: 'Quitar', icon: Trash2, variant: 'danger', onSelect: onRemove },
  ]

  return (
    <Reorder.Item value={row} dragListener={false} dragControls={dragControls}>
      <LongPressMenu actions={actions} label={`${exercise?.name ?? 'Ejercicio'}`}>
        <div className="flex items-start gap-2 rounded-xl border border-border/40 bg-background/50 p-3.5">
          <button type="button" aria-label="Arrastrar para reordenar"
            onPointerDown={(e) => dragControls.start(e)}
            className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground/60 hover:text-foreground active:cursor-grabbing">
            <GripVertical className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{index + 1}. {exercise?.name ?? 'Ejercicio'}</p>
                {muscleLabel && <p className="mt-1 text-xs text-muted-foreground">{muscleLabel}</p>}
              </div>
              {detail && <p className="max-w-[46%] shrink-0 text-right text-xs leading-relaxed text-muted-foreground">{detail}</p>}
            </div>
            {row.weight_suggestion_basis === 'based_on_previous_logs' && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200">
                <TrendingUp className="h-3 w-3" />Ajustado por tu progreso
              </div>
            )}
          </div>
        </div>
      </LongPressMenu>
    </Reorder.Item>
  )
}
```

> Nota de arrastre: `dragListener={false}` + `dragControls` hace que el arrastre solo se inicie desde el asa (`GripVertical`), evitando conflicto con el long-press sobre el cuerpo de la fila.

- [ ] **Step 2: Adelgazar `WorkoutExerciseList` para delegar**

Reemplazar el cuerpo de `src/components/plan/WorkoutExerciseList.tsx` manteniendo los tipos exportados (`PlanExerciseOption`, `PlanWorkoutExerciseRow`) y el bloque "Agregar ejercicio", y delegando la lista en el manager. El archivo queda así:

```tsx
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { ExercisePicker } from '@/components/plan/ExercisePicker'
import { WorkoutExerciseManager } from '@/components/plan/WorkoutExerciseManager'
import { addWorkoutExercise } from '@/app/actions/plan'
import { PlusCircle } from 'lucide-react'

export type PlanExerciseOption = {
  id: string
  name: string
  muscle_groups: string[] | null
  equipment: string[] | null
  difficulty: string | null
  exercise_type: string | null
  is_compound: boolean | null
}

export type PlanWorkoutExerciseRow = {
  id: string
  workout_id: string
  order_index: number
  sets: number | null
  reps: number | null
  rest_seconds: number | null
  weight_kg: number | null
  notes: string | null
  target_rpe: number | null
  weight_suggestion_basis: string | null
  exercise: PlanExerciseOption | PlanExerciseOption[] | null
}

type WorkoutExerciseListProps = {
  planId: string
  workoutId: string
  exercises: PlanWorkoutExerciseRow[]
  exerciseOptions: PlanExerciseOption[]
}

const textareaClass =
  'w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500'
const inputClass =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500'

function PrescriptionFields() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Series</span>
        <input name="sets" type="number" min={1} max={12} defaultValue={3} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Reps</span>
        <input name="reps" type="number" min={1} max={100} defaultValue={10} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Peso kg</span>
        <input name="weightKg" type="number" min={0} step={0.25} defaultValue="" placeholder="Opcional" className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Descanso seg.</span>
        <input name="restSeconds" type="number" min={0} max={600} defaultValue={60} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">RPE objetivo</span>
        <input name="targetRpe" type="number" min={1} max={10} defaultValue={8} className={inputClass} /></label>
    </div>
  )
}

export function WorkoutExerciseList({
  planId, workoutId, exercises, exerciseOptions,
}: WorkoutExerciseListProps) {
  const hasExerciseOptions = exerciseOptions.length > 0

  return (
    <div className="mt-4">
      <WorkoutExerciseManager planId={planId} exercises={exercises} exerciseOptions={exerciseOptions} />

      <details className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-violet-200">
          <PlusCircle className="h-4 w-4" />
          Agregar ejercicio
        </summary>

        <form action={addWorkoutExercise} className="mt-4 space-y-3">
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="workoutId" value={workoutId} />
          <ExercisePicker name="exerciseId" label="Ejercicio" options={exerciseOptions}
            disabled={!hasExerciseOptions} placeholder="Busca por nombre, músculo o equipo" />
          <PrescriptionFields />
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Notas</span>
            <textarea name="notes" rows={2} placeholder="Opcional" className={textareaClass} />
          </label>
          <SubmitButton label="Agregar al entrenamiento" pendingLabel="Agregando ejercicio"
            disabled={!hasExerciseOptions} className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600" />
        </form>
      </details>
    </div>
  )
}
```

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `pnpm type-check`
Expected: sin errores.

Run: `pnpm lint`
Expected: sin errores nuevos.

Run: `pnpm build`
Expected: build OK (no falla por componentes cliente/servidor mal marcados).

- [ ] **Step 4: Prueba manual**

`pnpm dev` → `/plan`. Verificar: arrastrar por el asa reordena y persiste tras recargar; mantener pulsada la fila abre el menú con Ajustar/Cambiar/Quitar; Ajustar y Cambiar abren diálogo y guardan; Quitar elimina. Ya no hay flechas ni `<details>` inline por fila.

- [ ] **Step 5: Commit**

```bash
git add src/components/plan/WorkoutExerciseManager.tsx src/components/plan/WorkoutExerciseList.tsx
git commit -m "$(cat <<'EOF'
feat(plan): arrastre para reordenar + menú long-press en ejercicios

Reemplaza las flechas y los <details> inline por arrastre (framer-motion
Reorder, asa GripVertical) y un menú contextual con ajustar/cambiar/quitar
en diálogos.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Chat — menú en conversaciones

**Files:**
- Modify: `src/components/chat/ChatContainer.tsx`

Verificación: `type-check` + `lint` + manual.

- [ ] **Step 1: Importar el primitivo**

En `src/components/chat/ChatContainer.tsx`, añadir junto a los imports de componentes:

```tsx
import { LongPressMenu, type LongPressAction } from '@/components/ui'
```

Asegurar que `Trash2` sigue importado de `lucide-react` (se reutiliza en el menú).

- [ ] **Step 2: Reemplazar `ConversationItem` por una versión con menú (sin papelera inline)**

Reemplazar todo el componente `ConversationItem` por:

```tsx
function ConversationItem({
  conversation,
  onSelect,
  onDelete,
}: {
  conversation: ConversationRow
  onSelect: () => void
  onDelete: () => void
}) {
  const label = conversation.context ? CONTEXT_LABELS[conversation.context] : 'General'
  const date  = new Date(conversation.updated_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

  const actions: LongPressAction[] = [
    { id: 'delete', label: 'Eliminar', icon: Trash2, variant: 'danger', onSelect: onDelete },
  ]

  return (
    <li>
      <LongPressMenu actions={actions} label={conversation.title}>
        <button
          type="button"
          onClick={onSelect}
          className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-border/40 bg-muted/10 p-3.5 text-left transition-colors hover:border-violet-500/30 hover:bg-violet-500/5"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{conversation.title}</p>
            <p className="text-xs text-muted-foreground/70">{label} · {date}</p>
          </div>
        </button>
      </LongPressMenu>
    </li>
  )
}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `pnpm type-check`
Expected: sin errores.

Run: `pnpm lint`
Expected: sin errores nuevos. Si `MessageSquare` quedara sin uso en algún punto, ya se usa aquí; verificar que no haya imports muertos (p.ej. ningún `Trash2` huérfano).

- [ ] **Step 4: Prueba manual**

`pnpm dev` → vista de chat / lista de conversaciones. Verificar: mantener pulsada una conversación abre el menú con Eliminar; el tap normal sigue abriendo la conversación; ya no hay papelera inline.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatContainer.tsx
git commit -m "$(cat <<'EOF'
feat(chat): menú long-press para eliminar conversaciones

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Verificación integral

- [ ] **Step 1: Suite completa**

Run: `pnpm test`
Expected: PASS (incluye logic de menú, medidas y plan).

- [ ] **Step 2: Tipos y lint globales**

Run: `pnpm type-check` → sin errores.
Run: `pnpm lint` → sin errores nuevos.

- [ ] **Step 3: Build de producción**

Run: `pnpm build`
Expected: build OK.

- [ ] **Step 4: Prueba manual en dispositivo (Pixel 7 Pro / APK)**

Verificar en táctil real las tres superficies: gesto de mantener pulsado, háptica al abrir, scrim + clon elevado, volteo del menú cerca del borde inferior, tip de primera vez (una sola vez), y que el scroll no dispara el menú por error. Confirmar arrastre para reordenar en `/plan`.

---

## Self-review (cobertura del spec)

- Primitivo reutilizable `LongPressMenu` → Task 2. ✔
- Gesto + tip + feedback de presión → Task 2 (barra de progreso, `pressing`, `HINT_KEY`). ✔
- Estilo realzado (scrim + clon + anclado con volteo) → Task 2 + lógica Task 1. ✔
- Háptica `hapticImpact('medium')` al abrir → Task 2. ✔
- Accesibilidad (botón sr-only, `role="menu"`, flechas, Escape, retorno de foco) → Task 2. ✔
- Medidas: Editar + Eliminar; `updateMeasurement`; quitar papelera de hover → Tasks 3 y 4. ✔
- Plan: Ajustar/Cambiar/Quitar en menú + arrastre para reordenar; `reorderWorkoutExercises` → Tasks 5 y 6. ✔
- Chat: Eliminar conversación → Task 7. ✔
- Sin dependencias nuevas → solo framer-motion/Radix/haptics existentes. ✔
- Pruebas (entorno node) sobre lógica pura y validación → Tasks 1, 3, 5; interacción DOM por prueba manual → Tasks 4, 6, 7, 8. ✔
