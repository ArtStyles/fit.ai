import type { PublicLocale } from '@/lib/i18n/routing'

export type HomeContent = {
  hero: { eyebrow: string; title: string; body: string; cta: string; secondary: string }
  problem: { title: string; body: string }
  loop: Array<{ title: string; body: string }>
  previews: Array<{ title: string; body: string; screen: 'dashboard' | 'session' | 'progress' }>
  safety: { title: string; body: string }
  faq: Array<{ question: string; answer: string }>
  finalCta: { title: string; body: string; cta: string }
}

export const HOME_CONTENT: Record<PublicLocale, HomeContent> = {
  es: {
    hero: {
      eyebrow: 'Entrenamiento con dirección',
      title: 'Convierte cada entrenamiento en el siguiente paso de tu progresión.',
      body: 'Vekira adapta tu semana a tu nivel, tiempo, equipo y rendimiento real.',
      cta: 'Crear mi plan gratis',
      secondary: 'Ver cómo funciona',
    },
    problem: {
      title: 'Deja de improvisar tu progreso.',
      body: 'Sigue una estructura clara, registra lo que haces y recibe el siguiente ajuste con contexto.',
    },
    loop: [
      { title: 'Define tu contexto', body: 'Objetivo, experiencia, días, tiempo y equipo.' },
      { title: 'Recibe una semana viable', body: 'Sesiones construidas alrededor de tu disponibilidad.' },
      { title: 'Entrena y registra', body: 'Peso, repeticiones, esfuerzo y descansos en una sola vista.' },
      { title: 'Progresa con evidencia', body: 'Tu historial orienta la siguiente recomendación.' },
    ],
    previews: [
      { title: 'Tu día, sin ruido', body: 'Ve la sesión de hoy y la acción siguiente.', screen: 'dashboard' },
      { title: 'Registra mientras entrenas', body: 'Controles grandes, descanso y referencia anterior.', screen: 'session' },
      { title: 'Entiende el avance', body: 'Constancia, volumen y marcas en contexto.', screen: 'progress' },
    ],
    safety: {
      title: 'Un plan debe respetar tu contexto.',
      body: 'Vekira considera equipo, duración y restricciones declaradas. No sustituye orientación médica.',
    },
    faq: [
      { question: '¿Necesito gimnasio?', answer: 'No. El plan usa el lugar y el equipo que declares.' },
      { question: '¿Sirve si estoy empezando?', answer: 'Sí. La experiencia modifica volumen, selección y progresión.' },
      { question: '¿Puedo cambiar ejercicios?', answer: 'Sí. Puedes reemplazar movimientos y ajustar tu plan.' },
      { question: '¿Cómo usa mi progreso?', answer: 'Tus sesiones completadas aportan contexto para futuras cargas y ajustes.' },
      { question: '¿Vekira reemplaza a un profesional?', answer: 'No. Es una herramienta de planificación y registro, no un servicio médico.' },
    ],
    finalCta: {
      title: 'Tu próxima sesión puede tener dirección.',
      body: 'Crea tu perfil y recibe una primera semana adaptada.',
      cta: 'Crear mi plan gratis',
    },
  },
  en: {
    hero: {
      eyebrow: 'Training with direction',
      title: 'Turn every workout into the next step in your progression.',
      body: 'Vekira adapts your week to your level, time, equipment, and actual performance.',
      cta: 'Create my free plan',
      secondary: 'See how it works',
    },
    problem: {
      title: 'Stop guessing your way forward.',
      body: 'Follow a clear structure, log your work, and get the next adjustment with context.',
    },
    loop: [
      { title: 'Define your context', body: 'Goal, experience, days, time, and equipment.' },
      { title: 'Get a realistic week', body: 'Sessions built around your availability.' },
      { title: 'Train and log', body: 'Weight, reps, effort, and rest in one view.' },
      { title: 'Progress with evidence', body: 'Your history guides the next recommendation.' },
    ],
    previews: [
      { title: 'Your day, without noise', body: 'See today’s session and the next action.', screen: 'dashboard' },
      { title: 'Log while you train', body: 'Large controls, rest, and previous-session reference.', screen: 'session' },
      { title: 'Understand progress', body: 'Consistency, volume, and records in context.', screen: 'progress' },
    ],
    safety: {
      title: 'A plan should respect your context.',
      body: 'Vekira considers equipment, duration, and declared restrictions. It does not replace medical guidance.',
    },
    faq: [
      { question: 'Do I need a gym?', answer: 'No. Your plan uses the location and equipment you declare.' },
      { question: 'Is it suitable for beginners?', answer: 'Yes. Experience changes volume, exercise selection, and progression.' },
      { question: 'Can I replace exercises?', answer: 'Yes. You can replace movements and adjust your plan.' },
      { question: 'How does it use my progress?', answer: 'Completed sessions provide context for future loads and adjustments.' },
      { question: 'Does Vekira replace a professional?', answer: 'No. It is a planning and logging tool, not a medical service.' },
    ],
    finalCta: {
      title: 'Your next session can have direction.',
      body: 'Create your profile and get an adapted first week.',
      cta: 'Create my free plan',
    },
  },
}
