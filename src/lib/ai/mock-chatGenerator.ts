import 'server-only'

type ChatContext = 'general' | 'workout_plan' | 'nutrition' | 'progress'

export interface MockChatResponse {
  content: string
  isMock: true
}

const RESPONSES: Record<ChatContext, string[]> = {
  workout_plan: [
    `Para optimizar tu plan, lo más importante es la sobrecarga progresiva: cada semana intenta añadir una repetición o subir el peso ligeramente en los ejercicios principales. Si llevas 4-6 semanas sin progresar, es señal de que el estímulo necesita cambiar. ¿Qué parte del plan quieres ajustar?`,
    `Un buen plan equilibra trabajo de empuje y tirón para evitar desequilibrios. Si notas que la espalda se queda atrás respecto al pecho, podemos redistribuir los ejercicios. ¿Cuál es tu split actual?`,
    `La consistencia supera a la perfección del plan. Completar el 80% de las sesiones semana tras semana produce más resultados que un plan "perfecto" que abandonas al mes. ¿Tienes algún día concreto con el que necesitas ayuda?`,
    `Para un plan efectivo: prioriza los ejercicios compuestos (sentadilla, press, remo, peso muerto) al inicio de cada sesión cuando tienes más energía. Los ejercicios de aislamiento van al final. ¿Quieres que revise la estructura de algún día?`,
    `Si llevas más de 8 semanas con el mismo plan sin cambios, considera añadir una semana de descarga (50-60% del volumen habitual). Después vuelve al plan con energías renovadas y normalmente se rompen marcas. ¿Cuándo fue tu última descarga?`,
  ],
  progress: [
    `Los primeros 4-6 semanas de progreso son principalmente neurológicos: tu sistema nervioso aprende a reclutar los músculos correctamente. El crecimiento muscular real viene después. No te desanimes si el peso no sube rápido al principio.`,
    `La mejor señal de progreso en fuerza es poder añadir peso o repeticiones semana a semana en los ejercicios principales. Si llevas 2+ semanas sin avanzar en un movimiento, prueba a bajar el peso un 10% y reconstruir con más margen.`,
    `Los PRs son motivadores, pero mira también el volumen total (series × reps × peso). Es normal que algunos días no alcances tu máximo — el sueño, el estrés y la alimentación afectan mucho al rendimiento. Un día malo no borra semanas de trabajo.`,
    `Para maximizar el progreso: duerme 7-9 horas (el músculo crece durante el descanso, no en el gym), mantén suficiente ingesta de proteína, y gestiona el estrés. El entrenamiento es el estímulo, la recuperación es donde ocurre la adaptación.`,
    `Registrar cada sesión es una de las herramientas más poderosas. Ver la tendencia de 3-4 semanas es más útil que comparar dos días aislados. ¿Qué ejercicio quieres analizar?`,
  ],
  nutrition: [
    `Para ganar músculo necesitas un superávit calórico moderado (200-300 kcal extra) y suficiente proteína. El rango respaldado por evidencia es 1.6-2.2g de proteína por kg de peso corporal. Distribuirla en 3-4 comidas maximiza la síntesis muscular.`,
    `El timing de los nutrientes importa menos que el total del día. Dicho esto, tener una comida con proteína y carbohidratos 1-2h antes de entrenar y otra dentro de las 2h posteriores es una buena práctica si puedes organizarlo.`,
    `Los suplementos con mayor evidencia científica: creatina monohidrato (3-5g/día, sin necesidad de carga), proteína en polvo si no llegas a tu meta de proteína con comida normal, y vitamina D si tienes déficit. El resto es mayormente marketing.`,
    `Para perder grasa manteniendo músculo: déficit moderado (300-500 kcal), ingesta alta de proteína (2-2.2g/kg), mantener la intensidad del entreno aunque reduzcas el volumen, y priorizar el sueño. La pérdida de fuerza en déficit es señal de perder músculo.`,
    `La hidratación afecta más al rendimiento de lo que parece. Con solo un 2% de deshidratación la fuerza y resistencia caen notablemente. Bebe agua consistentemente durante el día, no solo antes y después de entrenar.`,
  ],
  general: [
    `La constancia supera a la intensidad. Tres sesiones moderadas a la semana durante un año producen resultados infinitamente mejores que tres meses entrenando muy duro y luego abandonar. ¿En qué aspecto necesitas más apoyo?`,
    `Uno de los errores más comunes es cambiar el programa demasiado pronto. Dale al menos 8-12 semanas a un plan antes de modificarlo. El progreso no es lineal y el cuerpo necesita tiempo para adaptarse.`,
    `La técnica siempre va primero. Un peso menor con buena forma produce mejores resultados a largo plazo y evita lesiones que te dejarían semanas parado. ¿Hay algún ejercicio con el que tengas dudas técnicas?`,
    `El calentamiento específico marca la diferencia: empieza cada ejercicio principal con 1-2 series al 40-50% del peso de trabajo antes de llegar a tu peso objetivo. Prepara el músculo y el sistema nervioso y normalmente llegas más lejos.`,
    `El estrés crónico y el sueño insuficiente sabotean los resultados igual que no entrenar. Si notas que tus marcas bajan sin razón aparente o que la recuperación es lenta, revisa esas dos variables antes de cambiar el programa.`,
  ],
}

const PLAN_KEYWORDS = ['plan', 'rutina', 'ejercicio', 'entrenamiento', 'serie', 'rep', 'volumen', 'split', 'día', 'semana', 'descanso']
const PROGRESS_KEYWORDS = ['progreso', 'peso', 'récord', 'record', 'pr', 'fuerza', 'avance', 'plateau', 'estancado', 'marca', 'mejora']
const NUTRITION_KEYWORDS = ['nutrición', 'nutricion', 'dieta', 'comer', 'proteína', 'proteina', 'caloría', 'caloria', 'suplemento', 'creatina', 'comida', 'macros']

function detectContext(message: string): ChatContext {
  const lower = message.toLowerCase()
  if (NUTRITION_KEYWORDS.some(k => lower.includes(k))) return 'nutrition'
  if (PROGRESS_KEYWORDS.some(k => lower.includes(k))) return 'progress'
  if (PLAN_KEYWORDS.some(k => lower.includes(k))) return 'workout_plan'
  return 'general'
}

export async function mockChatResponse(
  message: string,
  conversationContext: ChatContext,
): Promise<MockChatResponse> {
  await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 1300))

  const effectiveContext = conversationContext === 'general'
    ? detectContext(message)
    : conversationContext

  const pool = RESPONSES[effectiveContext]
  const index = message.length % pool.length
  return { content: pool[index]!, isMock: true }
}
