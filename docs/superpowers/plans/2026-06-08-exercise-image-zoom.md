# Tap-para-ampliar imagen de ejercicio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tocar la imagen de un ejercicio abre un overlay (lightbox) con la imagen ampliada (`object-contain`) y el nombre como pie, disponible en sesión, cuadrícula, selector de reemplazo y ficha.

**Architecture:** Se añade una prop opt-in `zoomable` a `ExerciseImage`. Cuando está activa y hay imagen real (no placeholder, sin error), la imagen se envuelve en un `<button>` que dispara un `Dialog` de Radix con la imagen grande. Una función pura `canZoom` decide la afordancia y se prueba en aislamiento (único nivel testeable en el entorno `node` del proyecto). Los sitios que envuelven la imagen en otro elemento clickeable se ajustan para no anidar `<button>` y para frenar la propagación del tap.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind, Radix Dialog (`@/components/ui/dialog`), `next/image`, lucide-react, Vitest (entorno `node`).

---

## Convenciones del proyecto (leer antes de empezar)

- **Gestor de paquetes: pnpm** (no npm). Comandos: `pnpm test`, `pnpm type-check`, `pnpm lint`, `pnpm build`, `pnpm dev`.
- Los tests existentes son **solo de lógica** (entorno `node`, sin jsdom/testing-library). No se añade infraestructura de testing de componentes; el comportamiento de UI se verifica **corriendo la app**.
- Cambios **solo-web** (UI/componentes): no tocan Capacitor → al desplegar basta Vercel, sin recompilar APK.
- Comentarios y copy en español, igual que el resto del código.

## Estructura de archivos

- **Crear** `src/components/exercises/zoomable.ts` — función pura `canZoom` (decisión de afordancia).
- **Crear** `src/components/exercises/__tests__/zoomable.test.ts` — tests de `canZoom`.
- **Modificar** `src/components/exercises/ExerciseImage.tsx` — prop `zoomable` + overlay; extraer el marco visual a un sub-componente `ImageFrame`.
- **Modificar** `src/app/(app)/exercises/ExerciseGrid.tsx:44` — `zoomable` en la miniatura de la card colapsada.
- **Modificar** `src/components/session/ExerciseCard.tsx:94-173` — separar el botón de expandir del botón de imagen; `zoomable`.
- **Modificar** `src/components/session/SessionExercisePicker.tsx:55-78` — fila de `<button>` a `div[role=button]`; `zoomable`.
- **Modificar** `src/app/(app)/exercises/[exerciseId]/page.tsx:501` — `zoomable` en la hero de la ficha.
- **Modificar** `src/app/(app)/exercises/ExerciseGrid.tsx:153` — `zoomable` en la hero del modal de detalle.

---

## Task 1: Función pura `canZoom` (TDD)

**Files:**
- Create: `src/components/exercises/zoomable.ts`
- Test: `src/components/exercises/__tests__/zoomable.test.ts`

- [ ] **Step 1: Write the failing test**

Crear `src/components/exercises/__tests__/zoomable.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { canZoom } from '../zoomable'

describe('canZoom', () => {
  it('es true con zoomable, imagen real y sin error', () => {
    expect(canZoom({ zoomable: true, kind: 'image', errored: false })).toBe(true)
  })

  it('es false si zoomable no está activo', () => {
    expect(canZoom({ zoomable: false, kind: 'image', errored: false })).toBe(false)
    expect(canZoom({ zoomable: undefined, kind: 'image', errored: false })).toBe(false)
  })

  it('es false con placeholder (sin imagen real)', () => {
    expect(canZoom({ zoomable: true, kind: 'placeholder', errored: false })).toBe(false)
  })

  it('es false si la imagen falló al cargar', () => {
    expect(canZoom({ zoomable: true, kind: 'image', errored: true })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- zoomable`
Expected: FAIL — no se puede resolver `../zoomable` (módulo inexistente).

- [ ] **Step 3: Write minimal implementation**

Crear `src/components/exercises/zoomable.ts`:

```ts
import type { ResolvedExerciseImage } from './resolveExerciseImage'

/**
 * Decide si una imagen debe ser ampliable (mostrar botón de zoom + overlay).
 * Solo cuando se pidió zoomable, hay imagen real y no falló la carga.
 */
export function canZoom(opts: {
  zoomable: boolean | undefined
  kind: ResolvedExerciseImage['kind']
  errored: boolean
}): boolean {
  return opts.zoomable === true && opts.kind === 'image' && !opts.errored
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- zoomable`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/exercises/zoomable.ts src/components/exercises/__tests__/zoomable.test.ts
git commit -m "feat(exercises): canZoom helper for image zoom affordance"
```

---

## Task 2: Prop `zoomable` + overlay en `ExerciseImage`

**Files:**
- Modify: `src/components/exercises/ExerciseImage.tsx`

Sin consumidor todavía: se verifica con `type-check`, `lint` y `build`.

- [ ] **Step 1: Reemplazar el contenido completo de `ExerciseImage.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Dumbbell, ZoomIn } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { resolveExerciseImage, type ResolvedExerciseImage } from './resolveExerciseImage'
import { canZoom } from './zoomable'

type Variant = 'thumb' | 'hero'

type VariantCfg = { aspect: string; icon: string; sizes: string }

const VARIANT_CFG: Record<Variant, VariantCfg> = {
  thumb: { aspect: 'aspect-square', icon: 'h-1/3 w-1/3', sizes: '200px' },
  hero: { aspect: 'aspect-[16/10]', icon: 'h-12 w-12', sizes: '(max-width: 640px) 100vw, 512px' },
}

/** Marco visual de la imagen (imagen real o placeholder). Sin interacción. */
function ImageFrame({
  resolved,
  showImage,
  alt,
  cfg,
  className,
  onError,
}: {
  resolved: ResolvedExerciseImage
  showImage: boolean
  alt: string
  cfg: VariantCfg
  className?: string
  onError: () => void
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-800/60 to-zinc-900',
        cfg.aspect,
        className,
      )}
    >
      {showImage && resolved.kind === 'image' ? (
        <Image
          src={resolved.src}
          alt={alt}
          fill
          sizes={cfg.sizes}
          className="object-cover"
          onError={onError}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
          <Dumbbell className={cfg.icon} aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

export function ExerciseImage({
  src,
  alt,
  variant = 'thumb',
  className,
  zoomable = false,
}: {
  src: string | null | undefined
  alt: string
  variant?: Variant
  className?: string
  zoomable?: boolean
}) {
  const [errored, setErrored] = useState(false)

  // Si cambia el src (instancia reutilizada), olvidar un error previo.
  useEffect(() => {
    setErrored(false)
  }, [src])

  const resolved = resolveExerciseImage(src)
  const cfg = VARIANT_CFG[variant]
  const showImage = resolved.kind === 'image' && !errored
  const zoom = canZoom({ zoomable, kind: resolved.kind, errored })

  const frame = (
    <ImageFrame
      resolved={resolved}
      showImage={showImage}
      alt={alt}
      cfg={cfg}
      className={zoom ? 'h-full w-full' : className}
      onError={() => setErrored(true)}
    />
  )

  // Caso normal (placeholder, sin zoom, o imagen rota): comportamiento idéntico al previo.
  if (!zoom || resolved.kind !== 'image') {
    return frame
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Ampliar imagen de ${alt}`}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
          }}
          className={cn(
            'group relative block cursor-zoom-in rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
            className,
          )}
        >
          {frame}
          <span className="pointer-events-none absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-md bg-black/55 text-white/90 opacity-80 transition-opacity group-hover:opacity-100">
            <ZoomIn className="h-3 w-3" aria-hidden="true" />
          </span>
        </button>
      </DialogTrigger>

      <DialogContent
        aria-describedby={undefined}
        className="grid h-[100dvh] w-screen max-w-none place-items-center border-0 bg-transparent p-0 shadow-none sm:rounded-none"
      >
        <div className="flex w-[92vw] max-w-3xl flex-col items-center">
          <div className="relative h-[78vh] w-full">
            <Image
              src={resolved.src}
              alt={alt}
              fill
              sizes="92vw"
              className="object-contain"
            />
          </div>
          <DialogTitle className="mt-4 text-center text-base font-semibold text-white">
            {alt}
          </DialogTitle>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

Notas:
- En modo zoom el `className` de tamaño (p.ej. `h-10 w-10 shrink-0`) va al `<button>`, y `ImageFrame` rellena con `h-full w-full`, preservando el layout en contenedores flex.
- `aria-describedby={undefined}` silencia el warning de Radix por falta de `DialogDescription`. `DialogTitle` cubre la accesibilidad (es el nombre).
- `stopPropagation` en click y keydown evita disparar la acción del contenedor padre (expandir card / navegar / seleccionar) cuando la imagen está anidada en un elemento clickeable que **no** sea `<button>`.

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: PASS (sin errores).

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: PASS (sin nuevos errores en `ExerciseImage.tsx`).

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: compila sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/exercises/ExerciseImage.tsx
git commit -m "feat(exercises): add zoomable overlay capability to ExerciseImage"
```

---

## Task 3: Activar zoom en la cuadrícula de ejercicios

**Files:**
- Modify: `src/app/(app)/exercises/ExerciseGrid.tsx:44`

Primer consumidor real (parent es un `<article>` clickeable → no hace falta reestructurar, solo `zoomable`).

- [ ] **Step 1: Añadir `zoomable` a la miniatura de la card colapsada**

Reemplazar la línea 44:

```tsx
        <ExerciseImage src={ex.image_url} alt={ex.name} variant="thumb" className="w-full" />
```

por:

```tsx
        <ExerciseImage src={ex.image_url} alt={ex.name} variant="thumb" className="w-full" zoomable />
```

(La hero de la línea 153 se trata aparte en la Task 7.)

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Verificar en la app**

Run: `pnpm dev` y abrir `/exercises` en el navegador/preview.
Comprobar:
1. Las miniaturas con imagen real muestran la lupa en la esquina inferior derecha.
2. Tocar la imagen abre el overlay a pantalla completa, imagen completa (`object-contain`) y el nombre debajo.
3. Tocar la imagen **no** abre el modal de detalle de la card.
4. Cerrar con ✕, tocando el fondo oscuro, o con Escape.
5. Consola sin errores/warnings nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/exercises/ExerciseGrid.tsx
git commit -m "feat(exercises): tap-to-zoom thumbnails in exercise grid"
```

---

## Task 4: Activar zoom en el card de sesión (reestructura de cabecera)

**Files:**
- Modify: `src/components/session/ExerciseCard.tsx:94-173`

Hoy la miniatura está dentro del `<button>` de expandir. Hay que separarlas (no se puede anidar `<button>` en `<button>`).

- [ ] **Step 1: Reemplazar el bloque de cabecera**

Reemplazar todo el bloque actual (desde `{/* ── Cabecera del card ... */}` hasta el cierre del `</button>` de la cabecera, líneas 93-173) por:

```tsx
      {/* ── Cabecera del card ─────────────────────────────────────────────── */}
      <div className="flex w-full items-center gap-3 px-4 py-3.5">
        {/* Indicador de estado lateral */}
        <div className={cn(
          'shrink-0 w-1 h-8 rounded-full',
          isActive    && 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]',
          isCompleted && 'bg-green-500',
          isSkipped   && 'bg-muted-foreground/20',
          !isActive && !isCompleted && !isSkipped && 'bg-border/40',
        )} />

        {/* Miniatura del ejercicio (ampliable) */}
        <ExerciseImage
          src={imageUrl}
          alt={name}
          variant="thumb"
          zoomable
          className="h-10 w-10 shrink-0"
        />

        {/* Zona de expandir/colapsar */}
        <button
          type="button"
          onClick={() => canExpand && toggleExpanded(weId)}
          disabled={!canExpand}
          className={cn(
            'flex flex-1 items-center gap-3 text-left',
            'focus-visible:outline-none',
            canExpand && 'cursor-pointer',
          )}
        >
          {/* Info principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={cn(
                'text-sm font-semibold truncate',
                isActive    && 'text-indigo-200',
                isCompleted && 'text-green-300',
                isSkipped   && 'text-muted-foreground line-through',
                !isActive && !isCompleted && !isSkipped && 'text-foreground/80',
              )}>
                {name}
              </span>
              {isCompound && (
                <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 h-4 border-0 bg-muted/30 text-muted-foreground">
                  compuesto
                </Badge>
              )}
              {source !== 'planned' && (
                <Badge variant="ghost" className="shrink-0 border border-violet-500/20 bg-violet-500/10 px-1.5 py-0 text-[10px] text-violet-200">
                  solo hoy
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {muscleGroups.slice(0, 2).map(g => (
                <span key={g} className="text-[11px] text-muted-foreground capitalize">
                  {g}
                </span>
              ))}
              {muscleGroups.length > 2 && (
                <span className="text-[11px] text-muted-foreground">
                  +{muscleGroups.length - 2}
                </span>
              )}
            </div>
          </div>

          {/* Estado + progreso */}
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={status} />
            {!isSkipped && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {completedSets}/{sets.length}
              </span>
            )}
            {canExpand && (
              expanded
                ? <ChevronUp  className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>
      </div>
```

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 4: Verificar en la app**

Run: `pnpm dev`, iniciar/abrir una sesión con ejercicios (`/session/[workoutId]` con una rutina en curso).
Comprobar:
1. Tocar la imagen del ejercicio abre el overlay (no expande el card).
2. Tocar el resto de la fila (nombre/músculos/chevron) expande/colapsa como antes.
3. La apariencia del card es la misma que antes.
4. Consola **sin** error de hidratación por `<button>` anidado.

Si no hay una sesión activa a mano, confirmar al menos que `pnpm build` compila y revisar visualmente; la lógica de zoom ya quedó verificada en Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/components/session/ExerciseCard.tsx
git commit -m "feat(session): tap exercise image to zoom; split from expand toggle"
```

---

## Task 5: Activar zoom en el selector de reemplazo

**Files:**
- Modify: `src/components/session/SessionExercisePicker.tsx:54-79`

La fila es un `<button>`; se convierte a `div[role=button]` para poder anidar el botón de zoom.

- [ ] **Step 1: Reemplazar la fila de resultados**

Reemplazar el bloque `return ( <button ...> ... </button> )` (líneas 54-79) por:

```tsx
            <div
              key={option.exerciseId}
              role="button"
              tabIndex={0}
              onClick={() => {
                onSelect(option)
                setQuery('')
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(option)
                  setQuery('')
                }
              }}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            >
              <ExerciseImage
                src={option.imageUrl}
                alt={option.name}
                variant="thumb"
                zoomable
                className="h-9 w-9 shrink-0"
              />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{option.name}</span>
                {meta && (
                  <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                    {meta}
                  </span>
                )}
              </span>
            </div>
```

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Verificar en la app**

Run: `pnpm dev`, en una sesión abrir “Cambiar ejercicio solo por hoy” y escribir para listar resultados.
Comprobar:
1. Tocar la imagen de un resultado abre el overlay (no selecciona el reemplazo).
2. Tocar el resto de la fila selecciona el reemplazo como antes.
3. Teclado: Enter/Espacio sobre la fila selecciona; sobre la imagen abre el overlay.

- [ ] **Step 4: Commit**

```bash
git add src/components/session/SessionExercisePicker.tsx
git commit -m "feat(session): zoomable thumbnails in replacement picker"
```

---

## Task 6: Activar zoom en la hero de la ficha de ejercicio

**Files:**
- Modify: `src/app/(app)/exercises/[exerciseId]/page.tsx:501-506`

- [ ] **Step 1: Añadir `zoomable` a la hero**

Reemplazar:

```tsx
        <ExerciseImage
          src={exercise.image_url}
          alt={exercise.name}
          variant="hero"
          className="animate-in fade-in slide-in-from-bottom-3 mt-6 w-full duration-500"
        />
```

por:

```tsx
        <ExerciseImage
          src={exercise.image_url}
          alt={exercise.name}
          variant="hero"
          zoomable
          className="animate-in fade-in slide-in-from-bottom-3 mt-6 w-full duration-500"
        />
```

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Verificar en la app**

Run: `pnpm dev`, abrir una ficha en `/exercises/[id]` (desde Historial o la cuadrícula).
Comprobar: tocar la hero abre el overlay a pantalla completa con la imagen completa y el nombre.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/exercises/[exerciseId]/page.tsx"
git commit -m "feat(exercises): zoomable hero image on exercise detail"
```

---

## Task 7: Activar zoom en la hero del modal de la cuadrícula

**Files:**
- Modify: `src/app/(app)/exercises/ExerciseGrid.tsx:153`

El modal expandido es propio (framer-motion, `role="dialog"`), no Radix. El overlay de zoom (Radix) se monta por encima vía portal; verificar el comportamiento apilado.

- [ ] **Step 1: Añadir `zoomable` a la hero del modal**

Reemplazar la línea 153:

```tsx
        <ExerciseImage src={ex.image_url} alt={ex.name} variant="hero" className="w-full rounded-none border-0" />
```

por:

```tsx
        <ExerciseImage src={ex.image_url} alt={ex.name} variant="hero" zoomable className="w-full rounded-none border-0" />
```

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Verificar en la app**

Run: `pnpm dev`, abrir `/exercises`, abrir el detalle de una card y tocar la hero.
Comprobar:
1. El overlay de zoom aparece **por encima** del modal de detalle.
2. Cerrar el zoom (✕/fondo/Escape) deja el modal de detalle aún abierto.
3. Tras cerrar el zoom, el botón de cerrar del modal de detalle sigue funcionando.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/exercises/ExerciseGrid.tsx
git commit -m "feat(exercises): zoomable hero inside grid detail modal"
```

---

## Task 8: Verificación final

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Suite completa**

Run: `pnpm test`
Expected: PASS (incluye `canZoom`).

- [ ] **Step 2: Type-check + lint + build**

Run: `pnpm type-check && pnpm lint && pnpm build`
Expected: todo PASS.

- [ ] **Step 3: Smoke manual**

Recorrer rápido: cuadrícula `/exercises`, ficha `/exercises/[id]`, y (si hay sesión) card de sesión y selector de reemplazo. En cada uno: abrir overlay desde la imagen, ver imagen completa + nombre, cerrar con ✕/fondo/Escape, y confirmar que la acción del contenedor (navegar/expandir/seleccionar) no se dispara al tocar la imagen.

- [ ] **Step 4: Commit (si quedó algo pendiente) y cerrar**

```bash
git status
```

Si no hay cambios sin commitear, la rama `feat/exercise-image-zoom` está lista para integrar (ver skill `superpowers:finishing-a-development-branch`).
