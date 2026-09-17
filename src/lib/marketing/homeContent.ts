import type { PublicLocale } from '@/lib/i18n/routing'

export type HomeContent = {
  hero: { eyebrow: string; title: string; titleAccent: string; body: string; cta: string; secondary: string; hint: string; highlights: string[] }
  download: {
    eyebrow: string
    title: string
    body: string
    cta: string
    versionLabel: string
    sizeLabel: string
    compatibilityLabel: string
    stepsTitle: string
    steps: string[]
    update: string
    checksumLabel: string
  }
  problem: { title: string; body: string }
  loop: Array<{ title: string; body: string }>
  previews: Array<{ title: string; body: string; screen: 'dashboard' | 'session' | 'progress'; alt: string }>
  demoCaption: string
  sharing: {
    eyebrow: string
    title: string
    body: string
    fitnessCard: { label: string; title: string; body: string; steps: string[]; privacy: string }
    companion: { label: string; title: string; body: string; details: string[]; privacy: string }
    connection: string
  }
  safety: { title: string; body: string }
  faqTitle: string
  faq: Array<{ question: string; answer: string }>
  finalCta: { title: string; body: string; cta: string }
}

export const HOME_CONTENT: Record<PublicLocale, HomeContent> = {
  es: {
    hero: {
      eyebrow: 'Tu entrenamiento, a tu manera',
      title: 'Registra tu rutina. Sigue tu progreso.',
      titleAccent: 'Sigue tu progreso.',
      body: 'Lleva tu rutina al gimnasio, registra cada sesión y consulta cómo avanzas en la app de Vekira para Android. Usa un plan cuando lo necesites.',
      cta: 'Descargar para Android',
      secondary: 'Ver cómo funciona',
      hint: 'Descarga directa del APK. Entrenamiento personal sin conexión.',
      highlights: ['Tu propia rutina', 'Tu Fitness Card', 'Constancia con un amigo'],
    },
    download: {
      eyebrow: 'Vekira para Android',
      title: 'Tu próxima sesión empieza en la app.',
      body: 'Lleva tu rutina, tus sesiones y tu progreso en el bolsillo. Descarga Vekira e instálala en tu teléfono Android.',
      cta: 'Descargar APK',
      versionLabel: 'Versión',
      sizeLabel: 'Tamaño',
      compatibilityLabel: 'Requiere',
      stepsTitle: 'Cómo instalar',
      steps: [
        'Descarga el archivo APK en tu teléfono Android y ábrelo desde Descargas.',
        'Si Android lo solicita, permite instalar aplicaciones desde el navegador o gestor de archivos que estés usando.',
        'Pulsa Instalar y abre Vekira para empezar. Después puedes desactivar ese permiso.',
      ],
      update: '¿Ya tienes Vekira? Instala esta versión sobre la existente para conservar tus datos. No desinstales la app antes de actualizar.',
      checksumLabel: 'Ver huella del archivo (SHA-256)',
    },
    problem: {
      title: 'De tu rutina al progreso, en tres pasos.',
      body: 'Entrena a tu manera, registra cada sesión y vuelve a tu historial para ver cómo avanzas.',
    },
    loop: [
      { title: 'Elige cómo entrenar', body: 'Sigue tu propia rutina o prepara un plan según tu objetivo, tiempo y equipo.' },
      { title: 'Entrena y registra', body: 'Peso, repeticiones, esfuerzo y descansos en una sola vista.' },
      { title: 'Revisa tu progreso', body: 'Consulta tu constancia, volumen y marcas personales.' },
    ],
    previews: [
      { title: 'Tu entrenamiento, organizado', body: 'Encuentra tu próxima sesión y consulta tu semana de entrenamiento en la app.', screen: 'dashboard', alt: 'Vista móvil del dashboard de Vekira con el entrenamiento de hoy y el estado semanal.' },
      { title: 'Registra tu sesión', body: 'Anota peso y repeticiones, controla el descanso y consulta tu sesión anterior.', screen: 'session', alt: 'Vista móvil de una sesión activa en Vekira con campos para peso, repeticiones y sincronización.' },
      { title: 'Ve cómo avanzas', body: 'Revisa tu constancia, el volumen de tus sesiones y tus marcas personales.', screen: 'progress', alt: 'Vista de progreso en Vekira con constancia, volumen y marcas personales.' },
    ],
    demoCaption: 'Vistas de la app con datos de ejemplo.',
    sharing: {
      eyebrow: 'Progreso que se comparte',
      title: 'Tu esfuerzo también puede inspirar.',
      body: 'Una tarjeta para mostrar tu recorrido. Un amigo para acompañar tu constancia. Tú decides con quién.',
      fitnessCard: {
        label: 'Fitness Card',
        title: 'Tu historia, en una tarjeta.',
        body: 'Reúne tus mejores marcas, tu mapa muscular y las fotos que elijas en una tarjeta con tu identidad.',
        steps: ['Comparte tu QR', 'Recibe una solicitud', 'Decide quién entra'],
        privacy: 'El QR permite solicitar acceso. El contenido de tu tarjeta se comparte cuando tú aceptas.',
      },
      companion: {
        label: 'Compañero de constancia',
        title: 'Cada uno a su ritmo. Juntos en el camino.',
        body: 'Invita a un amigo, sigan su constancia semanal y celebren cada paso, cada uno con su propio plan.',
        details: ['Sesiones completadas y meta semanal de cada uno.', 'Un saludo al día para darse ánimo.', 'Un compañero por persona, con invitación aceptada.'],
        privacy: 'Tu rutina, tus medidas y tus datos de salud siguen siendo privados.',
      },
      connection: 'Estas funciones están en la app Android y requieren una cuenta conectada e internet para compartir y actualizar los avances.',
    },
    safety: {
      title: 'Entrena con tu contexto a la vista.',
      body: 'Consulta tu historial y la carga registrada para decidir cómo avanzar. Si usas un plan, ajusta los ejercicios a tu equipo y tus necesidades. Vekira no sustituye orientación médica ni profesional.',
    },
    faqTitle: 'Preguntas frecuentes',
    faq: [
      { question: '¿Dónde registro mis entrenamientos?', answer: 'En la app de Vekira para Android. Esta web presenta Vekira y permite descargarla; el registro de sesiones, los planes y el progreso están en la app.' },
      { question: '¿Puedo usar mi propia rutina?', answer: 'Sí. Puedes registrar tu entrenamiento y seguir tu progreso. Los planes son una opción cuando quieres organizar tus sesiones con más ayuda.' },
      { question: '¿Funciona sin internet?', answer: 'El entrenamiento personal funciona sin conexión en Android. La sincronización, las funciones con entrenadores y compartir avances con otras personas necesitan conexión a internet.' },
      { question: '¿Cómo comparto mi Fitness Card?', answer: 'Desde la app, comparte tu QR para que otra persona solicite acceso. Tú decides si aceptas. La tarjeta reúne tus marcas, tu mapa muscular y las fotos que hayas elegido; escanear el QR no da acceso automático a ese contenido.' },
      { question: '¿Qué ve mi compañero de constancia?', answer: 'Tu nombre, foto de perfil, sesiones completadas y meta semanal, además de los saludos que envíes. Tu rutina, medidas y datos de salud siguen siendo privados. Cada persona puede tener un compañero y dejar de compartir cuando quiera.' },
      { question: '¿Cómo instalo el APK?', answer: 'Descárgalo en tu teléfono Android, abre el archivo y sigue los pasos de instalación. Si Android solicita permiso para instalar desde el navegador o gestor de archivos, concédelo para completar la instalación; después puedes desactivarlo.' },
      { question: '¿Cómo actualizo sin perder mis datos?', answer: 'Descarga la nueva versión desde esta página e instálala sobre Vekira, sin desinstalar antes la app. Si Android no permite actualizar, contacta con soporte antes de borrar la instalación o sus datos.' },
      { question: '¿Vekira reemplaza a un profesional?', answer: 'No. Es una herramienta de planificación y registro, no un servicio médico.' },
    ],
    finalCta: {
      title: 'Empieza por tu próxima sesión.',
      body: 'Descarga Vekira para Android y lleva el registro de tu entrenamiento contigo.',
      cta: 'Descargar para Android',
    },
  },
  en: {
    hero: {
      eyebrow: 'Your training, your way',
      title: 'Log your routine. Track your progress.',
      titleAccent: 'Track your progress.',
      body: 'Take your routine to the gym, log each workout, and see your progress in the Vekira app for Android. Use a plan when you need one.',
      cta: 'Download for Android',
      secondary: 'See how it works',
      hint: 'Direct APK download. Personal training works offline.',
      highlights: ['Your own routine', 'Your Fitness Card', 'Consistency with a friend'],
    },
    download: {
      eyebrow: 'Vekira for Android',
      title: 'Your next workout starts in the app.',
      body: 'Keep your routine, workouts, and progress in your pocket. Download Vekira and install it on your Android phone.',
      cta: 'Download APK',
      versionLabel: 'Version',
      sizeLabel: 'Size',
      compatibilityLabel: 'Requires',
      stepsTitle: 'How to install',
      steps: [
        'Download the APK file on your Android phone and open it from Downloads.',
        'If Android asks, allow installations from the browser or file manager you are using.',
        'Tap Install and open Vekira to get started. You can turn that permission off afterward.',
      ],
      update: 'Already have Vekira? Install this version over the existing app to keep your data. Do not uninstall the app before updating.',
      checksumLabel: 'View file fingerprint (SHA-256)',
    },
    problem: {
      title: 'From routine to progress in three steps.',
      body: 'Train your way, log each workout, and check your history to see how you progress.',
    },
    loop: [
      { title: 'Choose how to train', body: 'Follow your own routine or create a plan around your goal, time, and equipment.' },
      { title: 'Train and log', body: 'Weight, reps, effort, and rest in one view.' },
      { title: 'Review your progress', body: 'Check your consistency, training volume, and personal records.' },
    ],
    previews: [
      { title: 'Your training, organized', body: 'Find your next session and see your training week in the app.', screen: 'dashboard', alt: 'Mobile Vekira dashboard showing today’s workout and weekly training status.' },
      { title: 'Log your workout', body: 'Enter weight and reps, track rest, and check your previous session.', screen: 'session', alt: 'Mobile active workout in Vekira with weight, reps, and sync feedback controls.' },
      { title: 'See your progress', body: 'Review your consistency, training volume, and personal records.', screen: 'progress', alt: 'Vekira progress view showing consistency, volume, and personal records.' },
    ],
    demoCaption: 'App views with sample data.',
    sharing: {
      eyebrow: 'Progress worth sharing',
      title: 'Your effort can inspire someone, too.',
      body: 'A card to share your journey. A friend to keep you company along the way. You choose who to share with.',
      fitnessCard: {
        label: 'Fitness Card',
        title: 'Your story, in a card.',
        body: 'Bring your personal records, muscle map, and chosen photos together in a card that reflects you.',
        steps: ['Share your QR', 'Receive a request', 'Choose who gets access'],
        privacy: 'The QR lets someone request access. Your card’s content is shared once you accept.',
      },
      companion: {
        label: 'Consistency companion',
        title: 'Your own pace. A shared journey.',
        body: 'Invite a friend, follow your weekly consistency, and celebrate each step while following your own plans.',
        details: ['Completed workouts and each person’s weekly goal.', 'One greeting a day to encourage each other.', 'One companion per person, with an accepted invitation.'],
        privacy: 'Your routine, measurements, and health information stay private.',
      },
      connection: 'These features are in the Android app and require a connected account and internet access to share and update progress.',
    },
    safety: {
      title: 'Keep your context in view.',
      body: 'Review your history and logged load to decide how to progress. If you use a plan, adjust the exercises to your equipment and needs. Vekira does not replace medical or professional guidance.',
    },
    faqTitle: 'Frequently asked questions',
    faq: [
      { question: 'Where do I log my workouts?', answer: 'In the Vekira app for Android. This website introduces Vekira and lets you download it; workout logging, plans, and progress are available in the app.' },
      { question: 'Can I use my own routine?', answer: 'Yes. You can log your training and track your progress. Plans are an option when you want more help organizing your workouts.' },
      { question: 'Does it work offline?', answer: 'Personal training works offline on Android. Syncing, trainer features, and sharing progress with other people require an internet connection.' },
      { question: 'How do I share my Fitness Card?', answer: 'Share your QR from the app so someone can request access. You decide whether to accept. Your card brings together your records, muscle map, and chosen photos; scanning the QR does not automatically grant access to that content.' },
      { question: 'What can my consistency companion see?', answer: 'Your name, profile photo, completed workouts, and weekly goal, along with the greetings you send. Your routine, measurements, and health information stay private. Each person can have one companion and stop sharing at any time.' },
      { question: 'How do I install the APK?', answer: 'Download it on your Android phone, open the file, and follow the installation steps. If Android asks for permission to install from your browser or file manager, allow it to complete the installation; you can turn it off afterward.' },
      { question: 'How do I update without losing my data?', answer: 'Download the new version from this page and install it over Vekira without uninstalling the app first. If Android will not allow the update, contact support before removing the installation or its data.' },
      { question: 'Does Vekira replace a professional?', answer: 'No. It is a planning and logging tool, not a medical service.' },
    ],
    finalCta: {
      title: 'Start with your next session.',
      body: 'Download Vekira for Android and take your workout log with you.',
      cta: 'Download for Android',
    },
  },
}
