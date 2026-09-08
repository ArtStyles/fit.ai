import type { PublicLocale } from '@/lib/i18n/routing'

export type HomeContent = {
  hero: { eyebrow: string; title: string; titleAccent: string; body: string; cta: string; secondary: string; hint: string; highlights: string[] }
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
      eyebrow: 'Tu semana de entrenamiento, organizada',
      title: 'Entrena con un plan claro. Sigue tu progreso.',
      titleAccent: 'Sigue tu progreso.',
      body: 'Organiza tu semana según tu tiempo y equipo, registra cada sesión y consulta cómo avanzas.',
      cta: 'Crear tu cuenta',
      secondary: 'Ver cómo funciona',
      hint: 'Después, completa tu perfil y prepara tu primera semana.',
      highlights: ['Plan para tu semana', 'Registro de tus sesiones', 'Progreso a la vista'],
    },
    problem: {
      title: 'De tu plan al progreso, en tres pasos.',
      body: 'Prepara tu semana, registra cada sesión y vuelve a tu historial para ver cómo avanzas.',
    },
    loop: [
      { title: 'Prepara tu semana', body: 'Organiza tus sesiones según tu objetivo, tiempo y equipo.' },
      { title: 'Entrena y registra', body: 'Peso, repeticiones, esfuerzo y descansos en una sola vista.' },
      { title: 'Revisa tu progreso', body: 'Consulta tu constancia, volumen y marcas personales.' },
    ],
    previews: [
      { title: 'Sabe qué toca hoy', body: 'Encuentra tu próxima sesión y consulta tu semana de entrenamiento.', screen: 'dashboard', alt: 'Vista móvil del dashboard de Vekira con el entrenamiento de hoy y el estado semanal.' },
      { title: 'Registra tu sesión', body: 'Anota peso y repeticiones, controla el descanso y consulta tu sesión anterior.', screen: 'session', alt: 'Vista móvil de una sesión activa en Vekira con campos para peso, repeticiones y sincronización.' },
      { title: 'Ve cómo avanzas', body: 'Revisa tu constancia, el volumen de tus sesiones y tus marcas personales.', screen: 'progress', alt: 'Vista de progreso en Vekira con constancia, volumen y marcas personales.' },
    ],
    demoCaption: 'Vistas de la app con datos de ejemplo.',
    safety: {
      title: 'Un plan debe respetar tu contexto.',
      body: 'Vekira combina progresión, historial, carga registrada y restricciones declaradas. Pro está en beta, sin cobros todavía. No sustituye orientación médica.',
    },
    faqTitle: 'Preguntas frecuentes',
    faq: [
      { question: '¿Necesito gimnasio?', answer: 'No. El plan usa el lugar y el equipo que declares.' },
      { question: '¿Sirve si estoy empezando?', answer: 'Sí. La experiencia modifica volumen, selección y progresión.' },
      { question: '¿Puedo cambiar ejercicios?', answer: 'Sí. Puedes reemplazar movimientos y ajustar tu plan.' },
      { question: '¿Cómo usa mi progreso?', answer: 'Tus sesiones completadas aportan contexto para futuras cargas y ajustes.' },
      { question: '¿Vekira reemplaza a un profesional?', answer: 'No. Es una herramienta de planificación y registro, no un servicio médico.' },
    ],
    finalCta: {
      title: 'Empieza por tu próxima sesión.',
      body: 'Crea tu cuenta, completa tu perfil y prepara tu primera semana.',
      cta: 'Crear tu cuenta',
    },
  },
  en: {
    hero: {
      eyebrow: 'Your training week, organized',
      title: 'Train with a clear plan. Track your progress.',
      titleAccent: 'Track your progress.',
      body: 'Plan your week around your time and equipment, log each workout, and see how you progress.',
      cta: 'Create your account',
      secondary: 'See how it works',
      hint: 'Next, complete your profile and plan your first week.',
      highlights: ['Your weekly plan', 'Your workout log', 'Your progress at a glance'],
    },
    problem: {
      title: 'From plan to progress in three steps.',
      body: 'Plan your week, log each workout, and check your history to see how you progress.',
    },
    loop: [
      { title: 'Plan your week', body: 'Organize your sessions around your goal, time, and equipment.' },
      { title: 'Train and log', body: 'Weight, reps, effort, and rest in one view.' },
      { title: 'Review your progress', body: 'Check your consistency, training volume, and personal records.' },
    ],
    previews: [
      { title: 'Know what’s next today', body: 'Find your next session and see your training week.', screen: 'dashboard', alt: 'Mobile Vekira dashboard showing today’s workout and weekly training status.' },
      { title: 'Log your workout', body: 'Enter weight and reps, track rest, and check your previous session.', screen: 'session', alt: 'Mobile active workout in Vekira with weight, reps, and sync feedback controls.' },
      { title: 'See your progress', body: 'Review your consistency, training volume, and personal records.', screen: 'progress', alt: 'Vekira progress view showing consistency, volume, and personal records.' },
    ],
    demoCaption: 'App views with sample data.',
    safety: {
      title: 'A plan should respect your context.',
      body: 'Vekira combines progression, history, logged load, and declared restrictions. Pro is in beta, with no charges yet. It does not replace medical guidance.',
    },
    faqTitle: 'Frequently asked questions',
    faq: [
      { question: 'Do I need a gym?', answer: 'No. Your plan uses the location and equipment you declare.' },
      { question: 'Is it suitable for beginners?', answer: 'Yes. Experience changes volume, exercise selection, and progression.' },
      { question: 'Can I replace exercises?', answer: 'Yes. You can replace movements and adjust your plan.' },
      { question: 'How does it use my progress?', answer: 'Completed sessions provide context for future loads and adjustments.' },
      { question: 'Does Vekira replace a professional?', answer: 'No. It is a planning and logging tool, not a medical service.' },
    ],
    finalCta: {
      title: 'Start with your next session.',
      body: 'Create your account, complete your profile, and plan your first week.',
      cta: 'Create your account',
    },
  },
}
