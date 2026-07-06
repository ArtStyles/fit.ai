import type { PublicLocale } from '@/lib/i18n/routing'

export type LegalDocumentKind = 'privacy' | 'terms'

type LegalSection = {
  title: string
  paragraphs?: string[]
  items?: string[]
}

type LegalCopy = {
  title: string
  description: string
  lastUpdated: string
  backLabel: string
  intro: string
  sections: LegalSection[]
  contactTitle: string
  contactLead: string
}

export const LEGAL_COPY: Record<PublicLocale, Record<LegalDocumentKind, LegalCopy>> = {
  es: {
    privacy: {
      title: 'Política de privacidad',
      description: 'Cómo Vekira recopila, usa y protege tus datos.',
      lastUpdated: '6 de julio de 2026',
      backLabel: 'Volver al inicio',
      intro:
        'En Vekira tratamos tus datos con cuidado. Esta política explica qué información recopilamos, para qué la usamos, con quién la compartimos y qué opciones tienes sobre ella.',
      sections: [
        {
          title: '1. Información que recopilamos',
          items: [
            'Cuenta: tu dirección de correo electrónico y credenciales de acceso.',
            'Perfil: los datos que decidas aportar, como nombre, altura, peso, fecha de nacimiento, nivel, objetivos, equipamiento y lesiones o limitaciones.',
            'Entrenamiento: rutinas, ejercicios, series, repeticiones, cargas, esfuerzo percibido, estado de ánimo e historial de sesiones.',
            'Medidas corporales: los valores que registres voluntariamente, como peso, porcentaje de grasa, masa muscular y circunferencias.',
            'Coach con IA: los mensajes que intercambias con el coach y el contexto necesario para responderte.',
            'Comunidad: el contenido, perfil e interacciones que decidas publicar o compartir.',
          ],
        },
        {
          title: '2. Cómo usamos tu información',
          paragraphs: ['Usamos tus datos para operar, proteger y mejorar las funciones que solicitas.'],
          items: [
            'Generar y adaptar planes de entrenamiento según tu perfil y tus registros.',
            'Guardar sesiones y mostrar tu historial, progresión y medidas.',
            'Responder a tus consultas en el coach con IA.',
            'Mantener tu sesión, atender solicitudes y proteger la seguridad de tu cuenta.',
            'Mostrar el contenido que publicas a la audiencia que eliges en las funciones de comunidad.',
          ],
        },
        {
          title: '3. Inteligencia artificial',
          paragraphs: [
            'Para generar planes y respuestas del coach, enviamos a nuestro proveedor de modelos de IA la información relevante para la solicitud. Estos datos se procesan para ofrecer la función que has pedido.',
          ],
        },
        {
          title: '4. Proveedores de servicio',
          paragraphs: ['Trabajamos con proveedores que procesan datos para prestar Vekira:'],
          items: [
            'Supabase, para base de datos y autenticación.',
            'Anthropic, para las funciones de inteligencia artificial.',
            'Vercel, para el alojamiento y la entrega de la aplicación.',
          ],
        },
        {
          title: '5. Conservación de los datos',
          paragraphs: [
            'Conservamos tu información mientras tu cuenta esté activa o durante el tiempo necesario para prestar el servicio y cumplir obligaciones aplicables. Si eliminas tu cuenta, iniciaremos la eliminación de tus datos personales, salvo la información que debamos conservar por motivos legales o de seguridad.',
          ],
        },
        {
          title: '6. Tus opciones y derechos',
          paragraphs: [
            'Puedes consultar y corregir datos desde Ajustes, controlar la privacidad de tu cuenta y solicitar la eliminación de la cuenta. Según tu ubicación, también puedes tener derechos de acceso, portabilidad, oposición o supresión.',
          ],
        },
        {
          title: '7. Seguridad',
          paragraphs: [
            'Aplicamos medidas técnicas y organizativas para proteger la información, como cifrado en tránsito y controles de acceso. Ningún sistema ofrece seguridad absoluta, por lo que también recomendamos proteger tus credenciales.',
          ],
        },
        {
          title: '8. Notificaciones',
          paragraphs: [
            'Si activas recordatorios locales, tu dispositivo gestiona su programación. Las notificaciones sociales pueden requerir un identificador técnico del dispositivo para poder entregarse.',
          ],
        },
        {
          title: '9. Menores de edad',
          paragraphs: [
            'Vekira no está dirigida a menores de 16 años. Si crees que un menor nos ha facilitado datos, escríbenos para que podamos revisarlo y tomar las medidas correspondientes.',
          ],
        },
        {
          title: '10. Cambios en esta política',
          paragraphs: [
            'Podemos actualizar esta política para reflejar cambios en Vekira o en los requisitos aplicables. Publicaremos aquí la versión vigente y su fecha de actualización.',
          ],
        },
      ],
      contactTitle: '11. Contacto',
      contactLead: 'Para consultas o solicitudes relacionadas con privacidad, escríbenos a',
    },
    terms: {
      title: 'Términos de uso',
      description: 'Condiciones para crear una cuenta y usar Vekira.',
      lastUpdated: '6 de julio de 2026',
      backLabel: 'Volver al inicio',
      intro:
        'Estos términos describen las reglas para usar Vekira. Al crear una cuenta o utilizar el servicio, aceptas cumplirlos.',
      sections: [
        {
          title: '1. Cuenta y acceso',
          paragraphs: [
            'Debes proporcionar información válida, mantener tus credenciales seguras y usar tu cuenta de forma personal. Eres responsable de la actividad realizada desde tu cuenta y debes avisarnos si sospechas de un acceso no autorizado.',
          ],
        },
        {
          title: '2. Conducta aceptable',
          paragraphs: ['No puedes usar Vekira para:'],
          items: [
            'Infringir leyes, derechos de terceros o medidas de seguridad.',
            'Acosar, amenazar, engañar o publicar contenido ilícito o dañino.',
            'Interferir con el servicio, automatizar accesos abusivos o intentar acceder a cuentas o sistemas ajenos.',
          ],
        },
        {
          title: '3. Fitness y limitación médica',
          paragraphs: [
            'Vekira ofrece herramientas generales de entrenamiento y organización; no presta atención médica ni sustituye el diagnóstico, tratamiento o consejo de un profesional sanitario. Consulta a un profesional antes de iniciar o modificar actividad física, especialmente si tienes lesiones, síntomas o condiciones médicas. Detén el ejercicio y busca ayuda adecuada si sientes dolor, mareo u otros síntomas preocupantes.',
          ],
        },
        {
          title: '4. Tu contenido',
          paragraphs: [
            'Conservas los derechos sobre el contenido que aportas. Nos autorizas a alojarlo, procesarlo y mostrarlo únicamente en la medida necesaria para operar las funciones que utilizas. Debes contar con los derechos necesarios sobre lo que publicas y respetar la privacidad de otras personas.',
          ],
        },
        {
          title: '5. Disponibilidad y cambios',
          paragraphs: [
            'Podemos corregir, actualizar, suspender o retirar funciones por motivos técnicos, legales o de seguridad. Intentaremos comunicar los cambios relevantes cuando sea razonablemente posible.',
          ],
        },
        {
          title: '6. Terminación',
          paragraphs: [
            'Puedes dejar de usar Vekira y eliminar tu cuenta desde Ajustes. Podemos limitar o terminar el acceso cuando exista una infracción de estos términos, un riesgo para otras personas o una obligación legal. Las disposiciones que por su naturaleza deban continuar seguirán vigentes tras la terminación.',
          ],
        },
      ],
      contactTitle: '7. Contacto',
      contactLead: 'Si tienes preguntas sobre estos términos, escríbenos a',
    },
  },
  en: {
    privacy: {
      title: 'Privacy policy',
      description: 'How Vekira collects, uses, and protects your data.',
      lastUpdated: 'July 6, 2026',
      backLabel: 'Back to home',
      intro:
        'Vekira handles your data with care. This policy explains what information we collect, why we use it, who we share it with, and the choices available to you.',
      sections: [
        {
          title: '1. Information we collect',
          items: [
            'Account: your email address and sign-in credentials.',
            'Profile: information you choose to provide, such as your name, height, weight, date of birth, level, goals, equipment, and injuries or limitations.',
            'Training: workouts, exercises, sets, repetitions, loads, perceived effort, mood, and session history.',
            'Body measurements: values you voluntarily record, such as weight, body-fat percentage, muscle mass, and circumferences.',
            'AI coach: messages you exchange with the coach and the context needed to answer you.',
            'Community: content, profile information, and interactions you choose to publish or share.',
          ],
        },
        {
          title: '2. How we use information',
          paragraphs: ['We use your data to operate, protect, and improve the features you request.'],
          items: [
            'Generate and adapt training plans based on your profile and logs.',
            'Save sessions and show your history, progression, and measurements.',
            'Respond to your requests in the AI coach.',
            'Maintain your session, handle requests, and protect account security.',
            'Show content you publish to the audience you select in community features.',
          ],
        },
        {
          title: '3. Artificial intelligence',
          paragraphs: [
            'To generate plans and coach responses, we send our AI model provider the information relevant to your request. That data is processed to provide the feature you asked for.',
          ],
        },
        {
          title: '4. Service providers',
          paragraphs: ['We work with providers that process data to deliver Vekira:'],
          items: [
            'Supabase, for database and authentication services.',
            'Anthropic, for artificial-intelligence features.',
            'Vercel, for application hosting and delivery.',
          ],
        },
        {
          title: '5. Data retention',
          paragraphs: [
            'We keep information while your account is active or as needed to provide the service and meet applicable obligations. If you delete your account, we will begin deleting personal data except information we must retain for legal or security reasons.',
          ],
        },
        {
          title: '6. Your choices and rights',
          paragraphs: [
            'You can review and correct information in Settings, control account privacy, and request account deletion. Depending on your location, you may also have rights to access, portability, objection, or erasure.',
          ],
        },
        {
          title: '7. Security',
          paragraphs: [
            'We use technical and organizational measures to protect information, including encryption in transit and access controls. No system provides absolute security, so we also recommend protecting your credentials.',
          ],
        },
        {
          title: '8. Notifications',
          paragraphs: [
            'If you enable local reminders, your device manages their schedule. Social notifications may require a technical device identifier so they can be delivered.',
          ],
        },
        {
          title: '9. Children',
          paragraphs: [
            'Vekira is not directed to children under 16. If you believe a child has provided data to us, contact us so we can review the situation and take appropriate action.',
          ],
        },
        {
          title: '10. Changes to this policy',
          paragraphs: [
            'We may update this policy to reflect changes to Vekira or applicable requirements. We will publish the current version and its update date here.',
          ],
        },
      ],
      contactTitle: '11. Contact',
      contactLead: 'For privacy questions or requests, email us at',
    },
    terms: {
      title: 'Terms of use',
      description: 'Terms for creating an account and using Vekira.',
      lastUpdated: 'July 6, 2026',
      backLabel: 'Back to home',
      intro:
        'These terms describe the rules for using Vekira. By creating an account or using the service, you agree to follow them.',
      sections: [
        {
          title: '1. Account and access',
          paragraphs: [
            'You must provide valid information, keep your credentials secure, and use your account personally. You are responsible for activity through your account and should tell us if you suspect unauthorized access.',
          ],
        },
        {
          title: '2. Acceptable conduct',
          paragraphs: ['You may not use Vekira to:'],
          items: [
            'Break laws, violate third-party rights, or bypass security measures.',
            'Harass, threaten, deceive, or publish unlawful or harmful content.',
            'Interfere with the service, automate abusive access, or attempt to access other accounts or systems.',
          ],
        },
        {
          title: '3. Fitness and medical limitation',
          paragraphs: [
            'Vekira provides general training and organization tools; it does not provide medical care or replace diagnosis, treatment, or advice from a healthcare professional. Consult a professional before starting or changing physical activity, especially if you have injuries, symptoms, or medical conditions. Stop exercising and seek appropriate help if you experience pain, dizziness, or other concerning symptoms.',
          ],
        },
        {
          title: '4. Your content',
          paragraphs: [
            'You retain your rights in content you provide. You allow us to host, process, and display it only as needed to operate the features you use. You must have the necessary rights to anything you publish and respect other people’s privacy.',
          ],
        },
        {
          title: '5. Availability and changes',
          paragraphs: [
            'We may correct, update, suspend, or remove features for technical, legal, or security reasons. We will try to communicate material changes when reasonably possible.',
          ],
        },
        {
          title: '6. Termination',
          paragraphs: [
            'You may stop using Vekira and delete your account in Settings. We may limit or terminate access when these terms are violated, when there is a risk to others, or when required by law. Provisions that should continue by their nature will survive termination.',
          ],
        },
      ],
      contactTitle: '7. Contact',
      contactLead: 'If you have questions about these terms, email us at',
    },
  },
}
