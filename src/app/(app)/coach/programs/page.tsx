import Link from 'next/link'
import { Dumbbell, Plus } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { requireActiveTrainerContext } from '@/lib/coaching/access'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const metadata = { title: 'Rutinas profesionales · Vekira' }

type TemplateRow = { id: string; name: string; goal: string | null; days_per_week: number; status: 'draft' | 'active' | 'archived'; updated_at: string }

export default async function CoachProgramsPage({ searchParams }: { searchParams?: { clientId?: string | string[] } }) {
  const { user, supabase } = await requireActiveTrainerContext()
  const { data, error } = await (supabase.from('trainer_program_templates') as any)
    .select('id, name, goal, days_per_week, status, updated_at').eq('trainer_user_id', user.id).neq('status', 'archived').order('updated_at', { ascending: false })
  if (error) throw new Error('No se pudieron cargar las rutinas profesionales.')
  const templates = (data ?? []) as TemplateRow[]
  const rawClientId = Array.isArray(searchParams?.clientId) ? searchParams.clientId[0] : searchParams?.clientId
  const validClientId = rawClientId && UUID.test(rawClientId)
  const { data: relationship, error: relationshipError } = validClientId
    ? await (supabase.from('coaching_relationships') as any).select('id').eq('trainer_user_id', user.id).eq('client_user_id', rawClientId).eq('status', 'active').maybeSingle()
    : { data: null, error: null }
  if (relationshipError) throw new Error('No se pudieron cargar las rutinas profesionales.')
  const clientQuery = relationship ? `?clientId=${rawClientId}` : ''
  return <div className="min-h-screen bg-background pb-28"><PageTopBar title="Rutinas" subtitle="Programación para clientes" backHref="/coach" backLabel="Resumen" icon={<Dumbbell className="h-5 w-5" />} /><main className="mx-auto max-w-4xl px-4 py-8"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold text-foreground">Plantillas profesionales</h1><p className="mt-1 text-sm text-muted-foreground">Edita una plantilla sin modificar versiones ya asignadas.</p></div><Link href={`/coach/programs/new${clientQuery}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Nueva rutina</Link></div>{templates.length ? <div className="grid gap-3 sm:grid-cols-2">{templates.map(template => <Link key={template.id} href={`/coach/programs/${template.id}${clientQuery}`} className="rounded-2xl border border-border/70 bg-muted/10 p-5 transition hover:bg-muted/20"><div className="flex justify-between gap-3"><h2 className="font-bold text-foreground">{template.name}</h2><span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{template.status === 'active' ? 'Activa' : 'Borrador'}</span></div><p className="mt-2 text-sm text-muted-foreground">{template.goal ?? 'Sin objetivo definido'}</p><p className="mt-4 text-xs font-semibold text-violet-200">{template.days_per_week} días por semana</p></Link>)}</div> : <section className="rounded-3xl border border-dashed border-border/70 bg-muted/10 p-8 text-center"><Dumbbell className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" /><h2 className="mt-4 text-xl font-bold text-foreground">Todavía no tienes rutinas</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Crea una plantilla ahora. Podrás asignarla a clientes activos en el siguiente paso.</p></section>}</main></div>
}
