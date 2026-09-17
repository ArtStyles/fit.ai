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
      highlights: ['Tu propia rutina', 'Registro de tus sesiones', 'Progreso a la vista'],
    },
    download: {
      eyebrow: 'Vekira para Android',
      title: 'Tu próxima sesión empieza en la app.',
      body: 'Descarga el APK e instala Vekira en tu teléfono. Aquí encontrarás la app y las instrucciones; tus entrenamientos y tu progreso se gestionan dentro de Vekira.',
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
    safety: {
      title: 'Entrena con tu contexto a la vista.',
      body: 'Consulta tu historial y la carga registrada para decidir cómo avanzar. Si usas un plan, ajusta los ejercicios a tu equipo y tus necesidades. Vekira no sustituye orientación médica ni profesional.',
    },
    faqTitle: 'Preguntas frecuentes',
    faq: [
      { question: '¿Dónde registro mis entrenamientos?', answer: 'En la app de Vekira para Android. Esta web presenta Vekira y permite descargarla; el registro de sesiones, los planes y el progreso están en la app.' },
      { question: '¿Puedo usar mi propia rutina?', answer: 'Sí. Puedes registrar tu entrenamiento y seguir tu progreso. Los planes son una opción cuando quieres organizar tus sesiones con más ayuda.' },
      { question: '¿Funciona sin internet?', answer: 'El entrenamiento personal funciona sin conexión en Android. La sincronización y las funciones con entrenadores necesitan conexión a internet.' },
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
      highlights: ['Your own routine', 'Your workout log', 'Your progress at a glance'],
    },
    download: {
      eyebrow: 'Vekira for Android',
      title: 'Your next workout starts in the app.',
      body: 'Download the APK and install Vekira on your phone. This page provides the app and installation steps; your workouts and progress are managed inside Vekira.',
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
    safety: {
      title: 'Keep your context in view.',
      body: 'Review your history and logged load to decide how to progress. If you use a plan, adjust the exercises to your equipment and needs. Vekira does not replace medical or professional guidance.',
    },
    faqTitle: 'Frequently asked questions',
    faq: [
      { question: 'Where do I log my workouts?', answer: 'In the Vekira app for Android. This website introduces Vekira and lets you download it; workout logging, plans, and progress are available in the app.' },
      { question: 'Can I use my own routine?', answer: 'Yes. You can log your training and track your progress. Plans are an option when you want more help organizing your workouts.' },
      { question: 'Does it work offline?', answer: 'Personal training works offline on Android. Syncing and trainer features require an internet connection.' },
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
