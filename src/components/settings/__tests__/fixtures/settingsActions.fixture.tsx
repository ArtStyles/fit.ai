import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { PersonalDataForm } from '../../PersonalDataForm'
import { ProfileNameForm } from '../../ProfileNameForm'
import '@/styles/globals.css'

function Fixture() {
  useEffect(() => { window.__SETTINGS_ACTIONS_READY__ = true }, [])
  const personal = new URLSearchParams(location.search).get('form') === 'personal'
  return (
    <I18nProvider language="es" syncDocumentLanguage={false}>
      {personal
        ? <PersonalDataForm initial={{ heightCm: 170, dateOfBirth: '1990-01-01', gender: 'other' }} currentWeightKg={72} />
        : <ProfileNameForm initialName="Ana" />}
    </I18nProvider>
  )
}

window.__SETTINGS_ATTEMPTS__ = []
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>)
