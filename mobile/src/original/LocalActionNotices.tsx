import { useEffect } from 'react'
import { useToast } from '@/components/feedback/ToastProvider'
import { useSearchParams } from './router'

const errors: Record<string, { title: string; description: string }> = {
  connection_required: { title: 'Conecta tu cuenta para continuar', description: 'La retirada de una rutina profesional necesita internet y la cuenta que la recibió. La rutina descargada se conserva.' },
  assignment_refresh_pending: { title: 'Retirada confirmada; descarga pendiente', description: 'El servidor confirmó el cambio. Vuelve a sincronizar para actualizar la copia de este dispositivo.' },
  plan_locked: { title: 'Rutina profesional protegida', description: 'La prescripción de tu entrenador conserva sus ejercicios y series originales.' },
  plan_limit: { title: 'Límite de planes alcanzado', description: 'Retira un plan personal o reemplaza uno existente para guardar otro.' },
  account_delete_online_required: { title: 'Eliminación de cuenta no disponible en este APK', description: 'Esta operación necesita el servicio de cuenta en línea. Tus datos se conservan.' },
}
const notices: Record<string, string> = { plan_activated: 'Plan principal actualizado', manual_plan_created: 'Plan manual guardado', plan_retired: 'Plan retirado' }

/** Adds mobile-specific outcomes to the existing toast UI; ActionNotice cleans the URL. */
export function LocalActionNotices() {
  const params = useSearchParams()
  const { showToast } = useToast()
  useEffect(() => {
    const error = errors[params.get('error') ?? '']
    const notice = notices[params.get('notice') ?? '']
    if (error) showToast({ ...error, variant: 'error' })
    if (notice) showToast({ title: notice, variant: 'success' })
  }, [params, showToast])
  return null
}
