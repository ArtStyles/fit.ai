'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/components/feedback/ToastProvider'

const NOTICES: Record<string, { title: string; description?: string }> = {
  plan_saved: {
    title: 'Plan guardado',
    description: 'Los cambios del resumen ya están aplicados.',
  },
  workout_saved: {
    title: 'Entrenamiento guardado',
    description: 'El dashboard y el calendario usarán esta versión.',
  },
  exercise_added: {
    title: 'Ejercicio agregado',
    description: 'Ya forma parte de este entrenamiento.',
  },
  exercise_updated: {
    title: 'Ejercicio actualizado',
    description: 'Las series, carga y notas quedaron guardadas.',
  },
  exercise_replaced: {
    title: 'Ejercicio cambiado',
    description: 'Conservamos la estructura del entrenamiento con el nuevo movimiento.',
  },
  exercise_removed: {
    title: 'Ejercicio quitado',
    description: 'El orden del entrenamiento se ajustó automáticamente.',
  },
  exercise_moved: {
    title: 'Orden actualizado',
    description: 'La rutina quedó reordenada.',
  },
  settings_saved: {
    title: 'Ajustes guardados',
    description: 'Tu perfil quedó actualizado.',
  },
}

const ERRORS: Record<string, { title: string; description?: string }> = {
  auth_required: {
    title: 'Sesión requerida',
    description: 'Vuelve a iniciar sesión para continuar.',
  },
  missing_fields: {
    title: 'Faltan datos',
    description: 'Revisa los campos obligatorios e intenta de nuevo.',
  },
  save_failed: {
    title: 'No se pudo guardar',
    description: 'La acción falló. Intenta nuevamente.',
  },
  workout_unavailable: {
    title: 'Rutina no disponible',
    description: 'Solo puedes iniciar la rutina programada para hoy.',
  },
}

export function ActionNotice() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const { showToast } = useToast()

  useEffect(() => {
    const notice = searchParams.get('notice')
    const error = searchParams.get('error')

    if (!notice && !error) return

    if (notice && NOTICES[notice]) {
      showToast({ ...NOTICES[notice], variant: 'success' })
    }

    if (error && ERRORS[error]) {
      showToast({ ...ERRORS[error], variant: 'error' })
    }

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete('notice')
    nextParams.delete('error')
    const query = nextParams.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [pathname, router, searchParams, showToast])

  return null
}
