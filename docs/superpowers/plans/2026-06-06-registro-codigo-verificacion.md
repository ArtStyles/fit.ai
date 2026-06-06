# Registro con código de verificación (OTP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el enlace de verificación del registro por un código de 6 dígitos (10 min de validez) que el usuario escribe en la misma pantalla, usando el OTP nativo de Supabase.

**Architecture:** La lógica pura (normalización/validación del código y mapeo de errores) se extrae a un módulo testeable con vitest. La UI se divide en dos: `RegisterForm.tsx` (formulario + cambio de paso) y un nuevo `VerifyCodeStep.tsx` (casilla del código, `verifyOtp`, reenvío con contador). No hay tablas, endpoints ni infraestructura nueva.

**Tech Stack:** Next.js 14 (App Router, client components), React 18, Supabase Auth (`@supabase/ssr`), Tailwind, lucide-react, vitest (entorno node).

**Spec:** `docs/superpowers/specs/2026-06-06-registro-codigo-verificacion-design.md`

---

## Requisito previo (configuración manual en Supabase — fuera de código)

> ⚠️ Sin estos ajustes el correo seguirá llegando como enlace y el código no funcionará. Los realiza la persona dueña del proyecto en el dashboard de Supabase. No bloquean la escritura del código, pero **sí** la prueba manual de la Task 4.

- **Auth → Email Templates → "Confirm signup":** reemplazar `{{ .ConfirmationURL }}` por un texto con `{{ .Token }}` (código de 6 dígitos).
- **Auth → Email OTP expiry:** poner `600` (segundos = 10 min).
- Mantener **"Confirm email" activado**.

---

## File Structure

- **Create** `src/app/(auth)/register/verification.ts` — funciones puras: `normalizeCode`, `validateCode`, `getVerifyErrorMessage`, `getResendErrorMessage`. Sin dependencias de React ni de Supabase.
- **Create** `src/app/(auth)/register/__tests__/verification.test.ts` — tests unitarios de las funciones puras (vitest, entorno node).
- **Create** `src/app/(auth)/register/VerifyCodeStep.tsx` — componente cliente del paso de verificación: casilla del código, botón Verificar (`verifyOtp`), botón Reenviar con contador, navegación a `/onboarding`.
- **Modify** `src/app/(auth)/register/RegisterForm.tsx` — quitar `emailRedirectTo`, reemplazar el estado/rama `check_email` por un paso `verify` que renderiza `VerifyCodeStep`.

---

## Task 1: Funciones puras de verificación (TDD)

**Files:**
- Create: `src/app/(auth)/register/verification.ts`
- Test: `src/app/(auth)/register/__tests__/verification.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/app/(auth)/register/__tests__/verification.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  normalizeCode,
  validateCode,
  getVerifyErrorMessage,
  getResendErrorMessage,
} from '../verification'

describe('normalizeCode', () => {
  it('keeps only digits and caps at 6', () => {
    expect(normalizeCode('12 34-56')).toBe('123456')
    expect(normalizeCode('1234567')).toBe('123456')
    expect(normalizeCode('abc12')).toBe('12')
    expect(normalizeCode('')).toBe('')
  })
})

describe('validateCode', () => {
  it('returns null for exactly 6 digits', () => {
    expect(validateCode('123456')).toBeNull()
  })

  it('returns an error message for wrong length or non-digits', () => {
    expect(validateCode('123')).toBe('Ingresa el código de 6 dígitos.')
    expect(validateCode('12345a')).toBe('Ingresa el código de 6 dígitos.')
    expect(validateCode('')).toBe('Ingresa el código de 6 dígitos.')
  })
})

describe('getVerifyErrorMessage', () => {
  it('maps expired/invalid tokens to a resend hint', () => {
    expect(getVerifyErrorMessage('Token has expired or is invalid')).toBe(
      'El código expiró o no es válido. Reenvía uno nuevo.',
    )
    expect(getVerifyErrorMessage('Invalid token')).toBe(
      'El código expiró o no es válido. Reenvía uno nuevo.',
    )
  })

  it('maps rate limit errors', () => {
    expect(getVerifyErrorMessage('Too many requests')).toBe(
      'Demasiados intentos. Espera un momento e intenta de nuevo.',
    )
  })

  it('falls back to a generic message', () => {
    expect(getVerifyErrorMessage('boom')).toBe(
      'No se pudo verificar el código. Intenta nuevamente.',
    )
  })
})

describe('getResendErrorMessage', () => {
  it('maps rate limit / security cooldown errors', () => {
    expect(
      getResendErrorMessage('For security purposes, you can only request this after 41 seconds.'),
    ).toBe('Espera un momento antes de pedir otro código.')
    expect(getResendErrorMessage('rate limit exceeded')).toBe(
      'Espera un momento antes de pedir otro código.',
    )
  })

  it('falls back to a generic message', () => {
    expect(getResendErrorMessage('boom')).toBe(
      'No se pudo reenviar el código. Intenta nuevamente.',
    )
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test -- verification`
Expected: FAIL — "Failed to resolve import '../verification'" (el módulo no existe todavía).

- [ ] **Step 3: Escribir la implementación mínima**

Crear `src/app/(auth)/register/verification.ts`:

```ts
/** Deja solo dígitos y recorta a 6 caracteres. */
export function normalizeCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6)
}

/** Devuelve un mensaje de error si el código no son exactamente 6 dígitos, o null si es válido. */
export function validateCode(code: string): string | null {
  return /^\d{6}$/.test(code) ? null : 'Ingresa el código de 6 dígitos.'
}

/** Traduce el error de `verifyOtp` a un mensaje para el usuario. */
export function getVerifyErrorMessage(message: string): string {
  const normalized = message.toLowerCase()

  if (normalized.includes('expired') || normalized.includes('invalid')) {
    return 'El código expiró o no es válido. Reenvía uno nuevo.'
  }

  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return 'Demasiados intentos. Espera un momento e intenta de nuevo.'
  }

  return 'No se pudo verificar el código. Intenta nuevamente.'
}

/** Traduce el error de `resend` a un mensaje para el usuario. */
export function getResendErrorMessage(message: string): string {
  const normalized = message.toLowerCase()

  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many') ||
    normalized.includes('security purposes')
  ) {
    return 'Espera un momento antes de pedir otro código.'
  }

  return 'No se pudo reenviar el código. Intenta nuevamente.'
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm test -- verification`
Expected: PASS (4 describe blocks, todos verdes).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/register/verification.ts" "src/app/(auth)/register/__tests__/verification.test.ts"
git commit -m "feat(auth): pure helpers for OTP code validation and error mapping"
```

---

## Task 2: Componente VerifyCodeStep

> No hay test automatizado: vitest corre en entorno `node` (sin DOM) y el repo no testea componentes React. La lógica pura ya quedó cubierta en la Task 1; este componente se valida con type-check (Task 4 / Step 1) y prueba manual (Task 4 / Step 4).

**Files:**
- Create: `src/app/(auth)/register/VerifyCodeStep.tsx`

- [ ] **Step 1: Crear el componente**

Crear `src/app/(auth)/register/VerifyCodeStep.tsx`:

```tsx
'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/feedback/ToastProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import {
  normalizeCode,
  validateCode,
  getVerifyErrorMessage,
  getResendErrorMessage,
} from './verification'

const RESEND_COOLDOWN_SECONDS = 45

export function VerifyCodeStep({ email }: { email: string }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown(current => (current <= 1 ? 0 : current - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  async function handleVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const validationError = validateCode(code)
    if (validationError) {
      setError(validationError)
      return
    }

    setVerifying(true)
    const supabase = createClient()
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'signup',
    })

    if (verifyError) {
      const message = getVerifyErrorMessage(verifyError.message)
      setError(message)
      showToast({ title: 'No se pudo verificar', description: message, variant: 'error' })
      setVerifying(false)
      return
    }

    showToast({
      title: 'Cuenta verificada',
      description: 'Completa tu perfil para generar tu primer plan.',
      variant: 'success',
    })
    window.dispatchEvent(new Event('fitai:navigation-start'))
    router.push('/onboarding')
    router.refresh()
  }

  async function handleResend() {
    if (cooldown > 0) return
    setError(null)

    const supabase = createClient()
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email })

    if (resendError) {
      const message = getResendErrorMessage(resendError.message)
      showToast({ title: 'No se pudo reenviar', description: message, variant: 'error' })
      return
    }

    setCooldown(RESEND_COOLDOWN_SECONDS)
    showToast({
      title: 'Código reenviado',
      description: `Enviamos un nuevo código a ${email}.`,
      variant: 'success',
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-indigo-300" />
        <div>
          <p className="text-sm font-semibold text-foreground">Verifica tu correo</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Enviamos un código de 6 dígitos a <span className="font-medium text-foreground">{email}</span>.
            Caduca en 10 minutos.
          </p>
        </div>
      </div>

      <form onSubmit={handleVerify} noValidate className="space-y-4">
        {error && (
          <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="otp_code"
            className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            Código de verificación
          </label>
          <input
            id="otp_code"
            name="otp_code"
            type="text"
            required
            autoFocus
            disabled={verifying}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={e => setCode(normalizeCode(e.target.value))}
            aria-invalid={Boolean(error)}
            className="flex h-11 w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-center text-lg font-semibold tracking-[0.5em] text-foreground placeholder:tracking-[0.5em] placeholder:text-muted-foreground/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70"
          />
        </div>

        <button
          type="submit"
          disabled={verifying}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-indigo-600 text-sm font-semibold text-white tracking-wide transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
          {verifying ? 'Verificando...' : 'Verificar y continuar'}
        </button>
      </form>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0}
          className="font-semibold text-indigo-400 transition-colors hover:text-indigo-300 disabled:cursor-not-allowed disabled:text-muted-foreground/60"
        >
          {cooldown > 0 ? `Reenviar código en ${cooldown}s` : 'Reenviar código'}
        </button>

        <PendingLink
          href="/login"
          className="inline-flex items-center font-semibold text-muted-foreground transition-colors hover:text-foreground"
          spinnerClassName="h-3.5 w-3.5"
        >
          Volver a iniciar sesión
        </PendingLink>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar que compila (type-check)**

Run: `pnpm type-check`
Expected: PASS — sin errores de tipos. (Verifica que `verifyOtp` y `resend` aceptan los argumentos usados y que `showToast` recibe las props correctas.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(auth)/register/VerifyCodeStep.tsx"
git commit -m "feat(auth): add VerifyCodeStep with OTP entry and resend cooldown"
```

---

## Task 3: Conectar el paso de verificación en RegisterForm

**Files:**
- Modify: `src/app/(auth)/register/RegisterForm.tsx`

- [ ] **Step 1: Importar VerifyCodeStep y quitar el tipo `SuccessState`**

En `src/app/(auth)/register/RegisterForm.tsx`, reemplazar el bloque de imports superior y la definición de `SuccessState`.

Buscar:

```tsx
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/feedback/ToastProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import { cn } from '@/lib/utils'

type RegisterFieldErrors = {
  fullName?: string
  email?: string
  password?: string
  confirmPassword?: string
}

type SuccessState =
  | { type: 'created'; email: string }
  | { type: 'check_email'; email: string }
```

Reemplazar por:

```tsx
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/feedback/ToastProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import { cn } from '@/lib/utils'
import { VerifyCodeStep } from './VerifyCodeStep'

type RegisterFieldErrors = {
  fullName?: string
  email?: string
  password?: string
  confirmPassword?: string
}
```

- [ ] **Step 2: Reemplazar el estado `success` por un estado de paso**

Buscar:

```tsx
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({})
  const [success, setSuccess] = useState<SuccessState | null>(null)
  const [loading, setLoading] = useState(false)
```

Reemplazar por:

```tsx
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({})
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
```

- [ ] **Step 3: Quitar `emailRedirectTo` del `signUp`**

Buscar:

```tsx
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/onboarding`,
      },
    })
```

Reemplazar por:

```tsx
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })
```

- [ ] **Step 4: Cambiar la rama "sin sesión" para pasar al paso de verificación**

Buscar:

```tsx
    if (!data.session) {
      setSuccess({ type: 'check_email', email })
      showToast({
        title: 'Revisa tu correo',
        description: 'Te enviamos un enlace para confirmar tu cuenta.',
        variant: 'success',
      })
      setLoading(false)
      return
    }

    setSuccess({ type: 'created', email })
    showToast({
      title: 'Cuenta creada',
      description: 'Completa tu perfil para generar tu primer plan.',
      variant: 'success',
    })
    window.dispatchEvent(new Event('fitai:navigation-start'))
    router.push('/onboarding')
    router.refresh()
  }
```

Reemplazar por:

```tsx
    if (!data.session) {
      setVerifyEmail(email)
      showToast({
        title: 'Revisa tu correo',
        description: 'Te enviamos un código de 6 dígitos para confirmar tu cuenta.',
        variant: 'success',
      })
      setLoading(false)
      return
    }

    showToast({
      title: 'Cuenta creada',
      description: 'Completa tu perfil para generar tu primer plan.',
      variant: 'success',
    })
    window.dispatchEvent(new Event('fitai:navigation-start'))
    router.push('/onboarding')
    router.refresh()
  }
```

- [ ] **Step 5: Reemplazar el bloque de render `if (success)` por el paso de verificación**

Buscar:

```tsx
  if (success) {
    return (
      <div role="status" className="space-y-4 rounded-xl border border-green-500/30 bg-green-500/10 px-5 py-4 text-sm text-green-300">
        <div>
          <p className="font-semibold">
            {success.type === 'check_email' ? 'Revisa tu correo' : 'Cuenta creada'}
          </p>
          <p className="mt-1 text-green-300/75">
            {success.type === 'check_email'
              ? `Enviamos un enlace de confirmación a ${success.email}.`
              : 'Te llevamos al onboarding para completar tu perfil.'}
          </p>
        </div>
        {success.type === 'check_email' && (
          <PendingLink
            href="/login"
            className="inline-flex items-center text-xs font-semibold text-green-200 underline underline-offset-4 hover:text-white"
            spinnerClassName="h-3.5 w-3.5"
          >
            Ya confirmé mi correo
          </PendingLink>
        )}
      </div>
    )
  }
```

Reemplazar por:

```tsx
  if (verifyEmail) {
    return <VerifyCodeStep email={verifyEmail} />
  }
```

- [ ] **Step 6: Verificar tipos y lint**

Run: `pnpm type-check`
Expected: PASS — sin errores. En particular, no debe quedar ninguna referencia a `success` ni a `SuccessState` (provocaría "Cannot find name").

Run: `pnpm lint`
Expected: PASS — sin warnings de variables/imports sin usar. `PendingLink` y `CheckCircle2` siguen usándose (en el footer del formulario y en `PasswordChecklist` respectivamente), así que sus imports se conservan.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(auth)/register/RegisterForm.tsx"
git commit -m "feat(auth): switch registration to OTP code step instead of email link"
```

---

## Task 4: Verificación final (tipos, tests, prueba manual)

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Type-check completo**

Run: `pnpm type-check`
Expected: PASS sin errores.

- [ ] **Step 2: Tests completos**

Run: `pnpm test`
Expected: PASS — todos los tests existentes verdes + los nuevos de `verification.test.ts`.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: PASS sin errores.

- [ ] **Step 4: Prueba manual end-to-end**

> Requiere los ajustes del dashboard de Supabase descritos al inicio del plan (plantilla con `{{ .Token }}` y expiración 600s). Sin ellos llegará un enlace, no un código.

Run: `pnpm dev` y abrir `/register`.

Verificar:
1. **Registro feliz:** llenar el formulario → "Crear cuenta" → aparece el paso "Verifica tu correo" en la misma pantalla → llega el correo con un código de 6 dígitos → escribir el código → "Verificar y continuar" → redirige a `/onboarding`.
2. **Código incorrecto:** escribir 6 dígitos al azar → muestra "El código expiró o no es válido. Reenvía uno nuevo."
3. **Validación de formato:** escribir menos de 6 dígitos → "Verificar" muestra "Ingresa el código de 6 dígitos." (sin llamar a Supabase). El input solo acepta dígitos y máximo 6.
4. **Reenvío:** el botón "Reenviar código" arranca en cuenta regresiva (`Reenviar código en 45s`) y se habilita al llegar a 0; al reenviar llega un nuevo correo y el contador reinicia.
5. **Expiración:** esperar >10 min y verificar un código viejo → muestra el mensaje de expirado.
6. **Cuenta existente:** registrarse con un correo ya registrado → "Ya existe una cuenta con este correo. Intenta iniciar sesión."

- [ ] **Step 5: Decidir integración**

Una vez verificado, usar la skill `superpowers:finishing-a-development-branch` para decidir entre merge, PR o limpieza.

---

## Self-Review

- **Cobertura del spec:**
  - "Código de 6 dígitos por correo" → config Supabase (prerequisito) + Task 3 Step 3/4.
  - "Misma pantalla" → Task 3 Step 5 (`<VerifyCodeStep />` reemplaza el formulario in-place).
  - "Expira a los 10 min" → config Supabase (`Email OTP expiry = 600`).
  - "Reenviar con contador anti-spam" → Task 2 (`RESEND_COOLDOWN_SECONDS = 45`, `resend`).
  - "Solo el código (sin enlace)" → config Supabase (plantilla sin `{{ .ConfirmationURL }}`) + Task 3 Step 3 (quita `emailRedirectTo`).
  - "Conservar cuenta existente y sesión directa" → no se tocan esas ramas; verificadas en Task 4 Step 4.
  - "Eliminar rama check_email y PendingLink 'Ya confirmé'" → Task 3 Step 5.
  - "Manejo de errores (expirado/incorrecto, formato, rate limit)" → Task 1 (`getVerifyErrorMessage`, `validateCode`, `getResendErrorMessage`).
  - "Pruebas: manual e2e + unitario de validador y mapeo" → Task 1 (unitario) + Task 4 Step 4 (manual).
- **Placeholder scan:** sin TBD/TODO; todos los pasos tienen código o comando concreto.
- **Type consistency:** `normalizeCode`/`validateCode`/`getVerifyErrorMessage`/`getResendErrorMessage` definidas en Task 1 y consumidas con esos mismos nombres en Task 2. `VerifyCodeStep({ email })` definido en Task 2 y usado igual en Task 3. `verifyEmail` (estado) reemplaza coherentemente a `success` en toda la Task 3.
