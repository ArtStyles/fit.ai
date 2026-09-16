import { useEffect } from 'react'
import { useToast } from '@/components/feedback/ToastProvider'
import { useSearchParams } from './router'
import { useI18n } from '@/components/i18n/I18nProvider'

const deletionErrors: Record<string, [string, string]> = {
  account_delete_not_configured: ['El servicio de eliminación todavía no está configurado en esta versión. Tus datos se conservan.', 'The deletion service is not configured in this version yet. Your data is preserved.'],
  account_delete_offline: ['Conecta a internet para eliminar tu cuenta. Tus datos se conservan.', 'Connect to the internet to delete your account. Your data is preserved.'],
  account_delete_login_required: ['Vuelve a iniciar sesión con esta cuenta para eliminarla. Tus datos se conservan.', 'Sign in again with this account to delete it. Your data is preserved.'],
  cuenta_changed: ['La cuenta o la sesión cambió. No se ha borrado ningún perfil de este dispositivo. Revisa la cuenta antes de continuar.', 'The account or session changed. No profile was removed from this device. Check the account before continuing.'],
  account_delete_unconfirmed: ['No se pudo confirmar la eliminación en el servidor. Tus datos locales se conservan. Comprueba el acceso a tu cuenta antes de intentarlo de nuevo.', 'Server deletion could not be confirmed. Your local data is preserved. Check account access before trying again.'],
  account_delete_local_pending: ['El servidor confirmó la eliminación, pero no se pudo borrar la copia de este dispositivo. Conserva esta pantalla y contacta con soporte para completar la limpieza local.', 'The server confirmed deletion, but the copy on this device could not be removed. Keep this screen and contact support to complete local cleanup.'],
}

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
  const { language } = useI18n()
  const params = useSearchParams()
  const { showToast } = useToast()
  useEffect(() => {
    const error = errors[params.get('error') ?? '']
    const deletionError = deletionErrors[params.get('error') ?? '']
    const notice = notices[params.get('notice') ?? '']
    if (error) showToast({ ...error, variant: 'error' })
    if (deletionError) showToast({ title: language === 'en' ? 'Account deletion' : 'Eliminación de cuenta', description: deletionError[language === 'en' ? 1 : 0], variant: 'error' })
    if (notice) showToast({ title: notice, variant: 'success' })
  }, [params, showToast, language])
  return null
}
