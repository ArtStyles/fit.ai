import type { ProfileNameActionState } from '@/app/actions/settings'
import type { PersonalDataActionState } from '@/lib/profile/personalData'

type Attempt = { form: 'name' | 'personal'; values: Record<string, FormDataEntryValue> }

declare global {
  interface Window {
    __SETTINGS_ACTIONS_READY__?: boolean
    __SETTINGS_ATTEMPTS__: Attempt[]
  }
}

async function save(form: Attempt['form'], data: FormData) {
  window.__SETTINGS_ATTEMPTS__.push({ form, values: Object.fromEntries(data) })
  // Cross an async boundary, as a real server action does. The first save fails;
  // a retry succeeds without replacing the component or mocking React hooks.
  await new Promise(resolve => setTimeout(resolve, 50))
  return window.__SETTINGS_ATTEMPTS__.filter(attempt => attempt.form === form).length > 1
}

export async function updateProfileName(_state: ProfileNameActionState, data: FormData): Promise<ProfileNameActionState> {
  const ok = await save('name', data)
  return { ok, message: ok ? 'Nombre guardado.' : 'No se pudo guardar el nombre.', fieldErrors: {} }
}

export async function updatePersonalData(_state: PersonalDataActionState, data: FormData): Promise<PersonalDataActionState> {
  const ok = await save('personal', data)
  return {
    ok,
    message: ok ? 'Datos guardados.' : null,
    formError: ok ? null : 'Revisa los datos personales.',
    fieldErrors: ok ? {} : { dateOfBirth: 'Fecha no válida.' },
  }
}
