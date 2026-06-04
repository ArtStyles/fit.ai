import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description: 'Cómo FitAI recopila, usa y protege tus datos.',
}

// Fecha de última actualización de esta política.
const LAST_UPDATED = '3 de junio de 2026'
// TODO: reemplaza por tu correo de contacto real antes de publicar.
const CONTACT_EMAIL = 'soporte@fitai.app'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-5 py-10">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Link>

        <header className="mt-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-extrabold text-foreground">Política de privacidad</h1>
            <p className="text-sm text-muted-foreground">Última actualización: {LAST_UPDATED}</p>
          </div>
        </header>

        <div className="mt-8 space-y-8">
          <p className="text-sm leading-relaxed text-muted-foreground">
            En FitAI tratamos tus datos con cuidado. Esta política explica qué información recopilamos, con qué fin,
            con quién la compartimos y qué derechos tienes sobre ella. Al usar FitAI aceptas las prácticas aquí
            descritas.
          </p>

          <Section title="1. Información que recopilamos">
            <ul className="list-disc space-y-1.5 pl-5">
              <li><span className="font-medium text-foreground">Cuenta:</span> tu dirección de correo electrónico y credenciales de acceso.</li>
              <li><span className="font-medium text-foreground">Perfil:</span> nombre, altura, peso, fecha de nacimiento, género, nivel de condición física, objetivo, equipamiento disponible y lesiones o limitaciones que indiques.</li>
              <li><span className="font-medium text-foreground">Datos de entrenamiento:</span> rutinas, ejercicios, series, repeticiones, cargas, esfuerzo percibido (RPE), estado de ánimo e historial de sesiones completadas.</li>
              <li><span className="font-medium text-foreground">Medidas corporales:</span> peso, porcentaje de grasa, masa muscular y circunferencias que registres voluntariamente.</li>
              <li><span className="font-medium text-foreground">Conversaciones con la IA:</span> los mensajes que intercambias con el coach de inteligencia artificial.</li>
            </ul>
          </Section>

          <Section title="2. Cómo usamos tu información">
            <p>Utilizamos tus datos exclusivamente para prestarte el servicio:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Generar y adaptar rutinas de entrenamiento personalizadas.</li>
              <li>Calcular tu progresión y mostrarte tu progreso e historial.</li>
              <li>Elaborar tu resumen diario y las recomendaciones del coach.</li>
              <li>Mantener tu sesión y la seguridad de tu cuenta.</li>
            </ul>
            <p>No vendemos tus datos ni los usamos con fines publicitarios.</p>
          </Section>

          <Section title="3. Inteligencia artificial">
            <p>
              Para generar rutinas y respuestas del coach, enviamos los datos relevantes de tu perfil y entrenamiento
              a <span className="font-medium text-foreground">Anthropic</span>, nuestro proveedor de modelos de IA, que
              los procesa únicamente para devolver el resultado solicitado. No se utilizan para entrenar sus modelos.
            </p>
          </Section>

          <Section title="4. Con quién compartimos tus datos">
            <p>Solo recurrimos a proveedores que actúan como encargados del tratamiento por nuestra cuenta:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li><span className="font-medium text-foreground">Supabase:</span> almacenamiento de la base de datos y autenticación.</li>
              <li><span className="font-medium text-foreground">Anthropic:</span> procesamiento de las funciones de inteligencia artificial.</li>
              <li><span className="font-medium text-foreground">Vercel:</span> alojamiento de la aplicación.</li>
            </ul>
          </Section>

          <Section title="5. Conservación de los datos">
            <p>
              Conservamos tu información mientras tu cuenta esté activa. Si eliminas tu cuenta, borramos tus datos
              personales de forma permanente, salvo registros anonimizados que no permiten identificarte.
            </p>
          </Section>

          <Section title="6. Tus derechos">
            <p>
              Puedes acceder y rectificar tus datos desde la pantalla de <span className="font-medium text-foreground">Ajustes</span>.
              También puedes <span className="font-medium text-foreground">eliminar tu cuenta y todos tus datos</span> en
              cualquier momento desde Ajustes → «Eliminar cuenta». La eliminación es inmediata e irreversible. Según tu
              país, puedes tener derechos adicionales de acceso, portabilidad o supresión; escríbenos para ejercerlos.
            </p>
          </Section>

          <Section title="7. Seguridad">
            <p>
              Aplicamos medidas técnicas para proteger tu información, incluido el cifrado en tránsito y controles de
              acceso por fila para que cada usuario solo acceda a sus propios datos. Ningún sistema es 100 % infalible,
              pero trabajamos para mantener tu información protegida.
            </p>
          </Section>

          <Section title="8. Notificaciones">
            <p>
              Si activas los recordatorios de entrenamiento, se programan como notificaciones locales en tu dispositivo;
              esa programación no envía tus datos a nuestros servidores.
            </p>
          </Section>

          <Section title="9. Menores de edad">
            <p>
              FitAI no está dirigida a menores de 16 años. Si crees que un menor nos ha facilitado datos, contáctanos y
              los eliminaremos.
            </p>
          </Section>

          <Section title="10. Cambios en esta política">
            <p>
              Podemos actualizar esta política. Publicaremos la versión vigente en esta página con su fecha de última
              actualización.
            </p>
          </Section>

          <Section title="11. Contacto">
            <p>
              Para cualquier duda sobre privacidad, escríbenos a{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-violet-300 hover:text-violet-200">
                {CONTACT_EMAIL}
              </a>.
            </p>
          </Section>
        </div>
      </main>
    </div>
  )
}
