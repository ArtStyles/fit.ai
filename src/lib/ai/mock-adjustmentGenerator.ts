import 'server-only'

export interface AdjustmentContext {
  workoutName: string
  workoutFocus: string | null
  exercises: { name: string; sets: number | null; reps: number | null; targetRpe: number | null }[]
}

export interface MockAdjustmentResponse {
  suggestion: string
  isMock: true
}

// ─── Detección de intención ────────────────────────────────────────────────────

type Intent = 'harder' | 'easier' | 'shorter' | 'injury' | 'muscle_focus' | 'general'

const INTENT_MAP: [RegExp, Intent][] = [
  [/más (duro|difícil|intenso|pesado|fuerte)|aumentar|subir|progresar/i, 'harder'],
  [/más fácil|menos (intenso|duro|pesado)|bajar|reducir|descanso|deload/i, 'easier'],
  [/corto|rápido|menos tiempo|sin tiempo|poco tiempo/i, 'shorter'],
  [/dolor|lesión|molestia|inflamad|lastim|lesion/i, 'injury'],
  [/pecho|espalda|pierna|hombro|bícep|trícep|glúteo|core|abdomen/i, 'muscle_focus'],
]

function detectIntent(request: string): Intent {
  for (const [pattern, intent] of INTENT_MAP) {
    if (pattern.test(request)) return intent
  }
  return 'general'
}

// ─── Generadores de respuesta por intención ────────────────────────────────────

function buildHarder(ctx: AdjustmentContext, request: string): string {
  const ex = ctx.exercises[0]?.name ?? 'los ejercicios principales'
  const currentRpe = ctx.exercises.find(e => e.targetRpe !== null)?.targetRpe ?? 7
  const newRpe = Math.min(10, currentRpe + 1)
  return `Para aumentar la intensidad en "${ctx.workoutName}", te sugiero:

1. **Sube el RPE objetivo a ${newRpe}/10** en los ejercicios compuestos principales (${ex} y similares). Esto significa que deberías terminar cada serie sintiéndote a ${newRpe} de 10 en esfuerzo.

2. **Añade una serie extra** a los 2-3 ejercicios que más trabajes. Si ahora haces 3 series, pasa a 4. No en todos los ejercicios — elige los más importantes del día.

3. **Reduce el descanso** entre series en 15-20 segundos para aumentar la densidad del entrenamiento.

Aplica estos cambios solo si llevas al menos 3-4 semanas con el volumen actual. El cuerpo necesita tiempo para adaptarse.`
}

function buildEasier(ctx: AdjustmentContext): string {
  const ex = ctx.exercises.slice(0, 2).map(e => e.name).join(' y ') || 'los ejercicios'
  return `Para aligerar "${ctx.workoutName}" te propongo estos ajustes:

1. **Baja el RPE objetivo a 6-7/10** en todos los ejercicios. Terminar cada serie sintiéndote cómodo es perfectamente válido, especialmente en semanas de acumulación de fatiga.

2. **Reduce el volumen** eliminando la última serie de cada ejercicio. En vez de 4×10, haz 3×10. Mantienes el estímulo con menos carga total.

3. **Aumenta los descansos** entre series en 30-60 segundos. Más recuperación = mejor técnica y menos fatiga acumulada.

Considera si esto es una semana de descarga planificada (recomendable cada 4-6 semanas) o si es fatiga puntual. Si es lo segundo, revisa el sueño y la alimentación.`
}

function buildShorter(ctx: AdjustmentContext): string {
  const toRemove = ctx.exercises.slice(-2).map(e => e.name)
  const removeStr = toRemove.length > 0 ? toRemove.map(n => `"${n}"`).join(' y ') : 'los últimos ejercicios'
  return `Para hacer "${ctx.workoutName}" más corto sin perder efectividad:

1. **Elimina los ejercicios de aislamiento al final**: ${removeStr} son buenas candidatas a quitar. Los compuestos al inicio dan el 80% de los resultados.

2. **Usa superseries**: empareja ejercicios no competitivos (ej. pecho + espalda, o cuádriceps + isquios) para reducir el tiempo total un 30-40% sin sacrificar volumen.

3. **Descansos más cortos**: reduce a 60-90 segundos en ejercicios de aislamiento y 90-120 en compuestos.

Con estos cambios puedes completar la sesión en 30-40 minutos manteniendo la mayor parte del estímulo.`
}

function buildInjury(ctx: AdjustmentContext, request: string): string {
  const area = /hombro|shoulder/i.test(request) ? 'hombros'
    : /rodill|knee/i.test(request)  ? 'rodillas'
    : /lumbar|espalda baja|lower back/i.test(request) ? 'zona lumbar'
    : /codo|elbow/i.test(request)   ? 'codos'
    : 'la zona afectada'

  return `Para adaptar "${ctx.workoutName}" respetando la molestia en ${area}:

1. **Sustituye ejercicios que involucren ${area}**: busca variantes que no carguen esa zona directamente. Usa el botón "Cambiar ejercicio" en cada uno para encontrar alternativas.

2. **Reduce el rango de movimiento** si el ejercicio es tolerable: evita la posición de máximo estiramiento donde sientes más tensión.

3. **Prioriza la recuperación**: si el dolor es agudo o mayor de 4/10, omite esos ejercicios esta semana. Un músculo no entrenado una semana pierde menos que una lesión te deja semanas parado.

⚠️ Si el dolor persiste o empeora, consulta con un fisioterapeuta antes de continuar entrenando esa área.`
}

function buildMuscleFocus(ctx: AdjustmentContext, request: string): string {
  const muscle = /pecho/i.test(request) ? 'pecho' : /espalda/i.test(request) ? 'espalda'
    : /pierna/i.test(request) ? 'piernas' : /hombro/i.test(request) ? 'hombros'
    : /bícep/i.test(request) ? 'bíceps' : /trícep/i.test(request) ? 'tríceps'
    : /glúteo/i.test(request) ? 'glúteos' : 'ese grupo muscular'

  return `Para potenciar el trabajo de ${muscle} en "${ctx.workoutName}":

1. **Coloca el ejercicio principal de ${muscle} al inicio** de la sesión cuando tienes más energía y fuerza disponible. El orden de los ejercicios tiene impacto real en el rendimiento.

2. **Añade una serie extra o un ejercicio de aislamiento** específico de ${muscle} al final. Por ejemplo, un ejercicio de contracción máxima (tipo concentración o cable) complementa bien el trabajo compuesto.

3. **Prioriza la conexión mente-músculo**: en los ejercicios de ${muscle}, enfócate en sentir el músculo trabajar más que en mover el peso. Reduce el ego del peso si es necesario.

Usa el botón "Añadir ejercicio" al final de la lista para incorporar el nuevo movimiento.`
}

function buildGeneral(ctx: AdjustmentContext): string {
  const exCount = ctx.exercises.length
  const hasGoodVolume = exCount >= 4
  return `Analizando "${ctx.workoutName}" (${exCount} ejercicios${ctx.workoutFocus ? ` · ${ctx.workoutFocus}` : ''}):

${hasGoodVolume
  ? `El volumen parece adecuado. Las principales palancas para mejorar son:`
  : `El volumen es moderado. Podrías añadir 1-2 ejercicios complementarios, pero prioriza la calidad sobre la cantidad.`}

1. **Progresión sistemática**: si llevas 2+ semanas sin subir peso o repeticiones en algún ejercicio, es señal de estancamiento. Intenta añadir 1 repetición por serie o 2.5 kg antes de cambiar el ejercicio.

2. **Técnica antes que carga**: grábate de vez en cuando para verificar que la forma es correcta, especialmente en los compuestos pesados.

3. **Orden de ejercicios**: los movimientos más demandantes (compuestos pesados) deben ir al inicio. Los de aislamiento y accesorios, al final.

¿Tienes algo más específico que quieras ajustar?`
}

// ─── Función principal ─────────────────────────────────────────────────────────

export async function mockAdjustmentSuggestion(
  request: string,
  context: AdjustmentContext,
): Promise<MockAdjustmentResponse> {
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1200))

  const intent = detectIntent(request)
  let suggestion: string

  switch (intent) {
    case 'harder':       suggestion = buildHarder(context, request); break
    case 'easier':       suggestion = buildEasier(context); break
    case 'shorter':      suggestion = buildShorter(context); break
    case 'injury':       suggestion = buildInjury(context, request); break
    case 'muscle_focus': suggestion = buildMuscleFocus(context, request); break
    default:             suggestion = buildGeneral(context)
  }

  return { suggestion, isMock: true }
}
