export type BillingInterval = 'monthly' | 'annual'

export type ProPricingPlan = {
  id: `pro-${BillingInterval}`
  name: string
  interval: BillingInterval
  price: string
  billingLabel: string
  monthlyEquivalent: string
  badge: string | null
  description: string
}

export const PRO_PRICING_PLANS: readonly ProPricingPlan[] = [
  {
    id: 'pro-monthly',
    name: 'Pro mensual',
    interval: 'monthly',
    price: '9.99',
    billingLabel: 'facturado cada mes',
    monthlyEquivalent: 'USD 9.99 al mes',
    badge: null,
    description: 'Flexibilidad total para probar todo el potencial de FitAI Pro.',
  },
  {
    id: 'pro-annual',
    name: 'Pro anual',
    interval: 'annual',
    price: '59.99',
    billingLabel: 'facturado una vez al año',
    monthlyEquivalent: 'Equivale a USD 5.00 al mes',
    badge: 'Ahorra 50%',
    description: 'La mejor opción para mantener la constancia durante todo el año.',
  },
] as const

export const PRO_FEATURES = [
  'Planes de entrenamiento guardados sin límite',
  'Ajustes semanales basados en tu progreso',
  'Coach con IA para resolver dudas y adaptar rutinas',
  'Historial, métricas y progresión por ejercicio',
] as const
