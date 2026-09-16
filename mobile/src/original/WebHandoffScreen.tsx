import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { useI18n } from '@/components/i18n/I18nProvider'
import { configuredWebHandoff, type WebHandoffPath } from './web-handoff'

const content: Record<WebHandoffPath, { title: [string, string]; detail: [string, string] }> = {
  '/coach/apply': { title: ['Solicitud de entrenador', 'Trainer application'], detail: ['Completa tu solicitud y gestiona tus credenciales privadas en la web de Vekira.', 'Complete your application and manage your private credentials on the Vekira website.'] },
  '/coach/profile': { title: ['Foto profesional', 'Professional photo'], detail: ['Cambia la foto de tu perfil profesional en la web de Vekira. Aquí puedes seguir editando el resto de tu perfil.', 'Change your professional profile photo on the Vekira website. You can continue editing the rest of your profile here.'] },
  '/chat': { title: ['Coach IA', 'AI coach'], detail: ['Abre el chat del coach en la web de Vekira. Necesitas conexión para continuar allí.', 'Open coach chat on the Vekira website. You need an internet connection to continue there.'] },
  '/admin': { title: ['Administración', 'Administration'], detail: ['Gestiona las funciones administrativas desde la web de Vekira con una cuenta autorizada.', 'Manage administrative features on the Vekira website with an authorized account.'] },
}

export function WebHandoffCard({ destination }: { destination: WebHandoffPath }) {
  const { language } = useI18n(), index = language === 'en' ? 1 : 0
  const copy = (es: string, en: string) => index ? en : es
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) } }, [])
  const url = configuredWebHandoff(destination)
  return <section className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-5" aria-label={content[destination].title[index]}>
    <p className="text-sm leading-6 text-muted-foreground">{content[destination].detail[index]}</p>
    <p className="text-sm leading-6 text-muted-foreground">{copy('Se abrirá el navegador. Inicia sesión allí con tu cuenta; la sesión de Android no se transfiere.', 'Your browser will open. Sign in there with your account; the Android session is not transferred.')}</p>
    {!url ? <p role="status" className="text-sm leading-6">{copy('El acceso web todavía no está configurado en esta versión.', 'Web access is not configured in this version yet.')}</p>
      : !online ? <p role="status" className="text-sm leading-6">{copy('Conecta a internet para abrir Vekira en la web.', 'Connect to the internet to open Vekira on the web.')}</p>
        : <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><ExternalLink aria-hidden="true" className="h-4 w-4" />{copy('Abrir en la web', 'Open on the web')}</a>}
  </section>
}

function WebHandoffScreen({ destination }: { destination: WebHandoffPath }) {
  const { language } = useI18n(), en = language === 'en'
  return <div className="min-h-screen bg-background pb-24"><PageTopBar title={content[destination].title[en ? 1 : 0]} backHref={destination === '/admin' ? '/settings' : destination === '/coach/apply' ? '/trainers' : '/dashboard'} backLabel={en ? 'Back' : 'Volver'} /><main className="mx-auto max-w-lg px-4 py-8"><WebHandoffCard destination={destination} /></main></div>
}

export function TrainerApplicationHandoff() { return <WebHandoffScreen destination="/coach/apply" /> }
export function ChatHandoff() { return <WebHandoffScreen destination="/chat" /> }
export function AdminHandoff() { return <WebHandoffScreen destination="/admin" /> }
