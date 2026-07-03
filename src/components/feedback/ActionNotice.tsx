'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'

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
  account_deleted: {
    title: 'Cuenta eliminada',
    description: 'Tu cuenta y todos tus datos se borraron de forma permanente.',
  },
  admin_pro_granted: {
    title: 'Plan Pro activado',
    description: 'La cuenta ya tiene acceso a las funciones Pro.',
  },
  admin_subscription_cancelled: {
    title: 'Suscripción cancelada',
    description: 'La cuenta volvió al plan Free.',
  },
  admin_user_suspended: {
    title: 'Cuenta suspendida',
    description: 'El acceso quedó bloqueado con el motivo indicado.',
  },
  admin_user_reactivated: {
    title: 'Cuenta reactivada',
    description: 'El usuario puede volver a acceder a la aplicación.',
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
    description: 'Solo puedes iniciar la rutina de hoy o recuperar una sesión perdida reciente, con máximo una sesión por día.',
  },
  delete_confirm: {
    title: 'Confirmación incorrecta',
    description: 'Escribe ELIMINAR exactamente para borrar tu cuenta.',
  },
  delete_failed: {
    title: 'No se pudo eliminar la cuenta',
    description: 'Hubo un problema al borrar tus datos. Intenta de nuevo.',
  },
  admin_invalid_user: {
    title: 'Usuario no válido',
    description: 'No se encontró la cuenta indicada.',
  },
  admin_owner_protected: {
    title: 'Cuenta protegida',
    description: 'La cuenta propietaria no puede degradarse, suspenderse ni eliminarse.',
  },
  admin_invalid_action: {
    title: 'Acción no válida',
    description: 'La operación administrativa solicitada no está permitida.',
  },
  admin_suspension_fields: {
    title: 'Faltan datos de suspensión',
    description: 'Indica un motivo y una duración válidos.',
  },
  admin_update_failed: {
    title: 'No se pudo actualizar la cuenta',
    description: 'La operación administrativa falló. Intenta nuevamente.',
  },
}

export function ActionNotice() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const { showToast } = useToast()
  const { t } = useI18n()

  useEffect(() => {
    const notice = searchParams.get('notice')
    const error = searchParams.get('error')

    if (!notice && !error) return

    if (notice && NOTICES[notice]) {
      const message = NOTICES[notice]
      showToast({ title: t(message.title), description: message.description ? t(message.description) : undefined, variant: 'success' })
    }

    if (error && ERRORS[error]) {
      const message = ERRORS[error]
      showToast({ title: t(message.title), description: message.description ? t(message.description) : undefined, variant: 'error' })
    }

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete('notice')
    nextParams.delete('error')
    const query = nextParams.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [pathname, router, searchParams, showToast, t])

  return null
}
