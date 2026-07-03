import {
  ArrowLeft,
  Bell,
  CalendarRange,
  History,
  Languages,
  PlusCircle,
  Ruler,
  Search,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type IconComponent = React.ComponentType<{ className?: string }>

type AppShellProps = {
  children: React.ReactNode
  className?: string
}

type BackHeaderProps = {
  backLabel?: string
  title: string
  subtitle?: string
  icon: IconComponent
  right?: React.ReactNode
}

type RowSkeletonsProps = {
  count?: number
  avatar?: boolean
  className?: string
}

type CardSkeletonsProps = {
  count?: number
  className?: string
}

export function Shimmer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('fitai-shimmer bg-muted/60', className)} {...props} />
}

export function AppLoadingShell({ children, className }: AppShellProps) {
  return (
    <div className={cn('min-h-screen bg-background pb-24', className)}>
      <main className="mx-auto max-w-lg px-4 py-8">{children}</main>
    </div>
  )
}

export function BackHeader({
  backLabel = 'Dashboard',
  title,
  subtitle,
  icon: Icon,
  right,
}: BackHeaderProps) {
  return (
    <>
      <div className="inline-flex items-center text-sm font-medium text-muted-foreground">
        <ArrowLeft className="mr-2 h-4 w-4" />
        {backLabel}
      </div>

      <header className="mt-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {right}
      </header>
    </>
  )
}

export function MetricStripSkeleton({ labels }: { labels: string[] }) {
  return (
    <div className="mt-5 grid grid-cols-3 gap-2">
      {labels.map((label, index) => (
        <div
          key={label}
          className="rounded-xl border border-border/60 bg-muted/10 p-3"
          style={{ animationDelay: `${index * 70}ms` }}
        >
          <p className="text-xs text-muted-foreground">{label}</p>
          <Shimmer className="mt-2 h-7 w-14 rounded-md" />
        </div>
      ))}
    </div>
  )
}

export function RowSkeletons({ count = 3, avatar = true, className }: RowSkeletonsProps) {
  return (
    <div className={cn('mt-6 space-y-3', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-border/60 bg-muted/10 p-4"
          style={{ animationDelay: `${index * 70}ms` }}
        >
          <div className="flex items-center gap-3">
            {avatar && <Shimmer className="h-11 w-11 shrink-0 rounded-xl bg-violet-500/15" />}
            <div className="min-w-0 flex-1">
              <Shimmer className="h-4 w-2/3 rounded" />
              <Shimmer className="mt-2 h-3 w-1/2 rounded bg-muted/40" />
            </div>
            <Shimmer className="h-8 w-12 rounded-lg bg-muted/40" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CardSkeletons({ count = 3, className }: CardSkeletonsProps) {
  return (
    <div className={cn('mt-6 space-y-4', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <section
          key={index}
          className="rounded-2xl border border-border/60 bg-muted/10 p-5"
          style={{ animationDelay: `${index * 80}ms` }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <Shimmer className="h-4 w-24 rounded-full bg-violet-500/15" />
              <Shimmer className="mt-4 h-6 w-3/4 rounded" />
              <Shimmer className="mt-2 h-3 w-1/2 rounded bg-muted/40" />
            </div>
            <Shimmer className="h-10 w-10 rounded-xl bg-muted/40" />
          </div>
        </section>
      ))}
    </div>
  )
}

export function DashboardLoading() {
  const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  return (
    <div className="min-h-screen bg-background pb-28">
      <header
        className="mx-auto flex max-w-lg items-center gap-3 px-4 pb-2 pt-6"
        aria-label="Cargando perfil y suscripción"
      >
        <Shimmer className="h-20 w-20 shrink-0 rounded-full bg-violet-500/15" />

        <div className="min-w-0 flex-1">
          <Shimmer className="h-3 w-16 rounded bg-muted/40" />
          <Shimmer className="mt-2 h-5 w-24 rounded" />
          <Shimmer className="mt-2 h-5 w-20 rounded-full bg-violet-500/15" />
        </div>

        <div className="flex h-11 w-[8.5rem] shrink-0 items-center gap-2 rounded-full border border-border/60 bg-card/50 p-1.5 pr-3 shadow-sm">
          <Shimmer className="h-8 w-8 shrink-0 rounded-full bg-violet-500/20" />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Shimmer className="h-3 w-6 shrink-0 rounded bg-muted/40" />
            <span aria-hidden className="h-3.5 w-px shrink-0 bg-border/80" />
            <Shimmer className="h-3 min-w-0 flex-1 rounded" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4">
        <section className="mt-6 rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-300/80">
            Hoy
          </p>
          <Shimmer className="mt-5 h-8 w-3/4 rounded" />
          <Shimmer className="mt-3 h-4 w-1/2 rounded bg-muted/40" />
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Shimmer className="h-11 rounded-lg bg-violet-500/20" />
            <Shimmer className="h-11 rounded-lg bg-muted/40" />
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Semana actual</p>
            <p className="text-xs text-violet-300">Ver calendario</p>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map((day, index) => (
              <div key={day} className="rounded-xl border border-border/40 bg-muted/10 p-2 text-center">
                <p className="text-[11px] font-semibold text-muted-foreground">{day}</p>
                <Shimmer
                  className="mx-auto mt-3 h-9 w-full rounded-lg bg-muted/50"
                  style={{ animationDelay: `${index * 60}ms` } as React.CSSProperties}
                />
              </div>
            ))}
          </div>
        </section>

        <MetricStripSkeleton labels={['Racha', 'Sesiones', 'Volumen']} />
        <CardSkeletons count={1} className="mt-8" />
      </main>
    </div>
  )
}

export function PlanLoading() {
  return (
    <AppLoadingShell className="pb-16">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex h-10 items-center text-sm font-medium text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Dashboard
        </div>
        <Shimmer className="h-10 w-10 rounded-full bg-muted/30" />
      </div>

      <section className="mt-5 flex min-h-16 items-center gap-3 rounded-2xl border border-border/60 bg-muted/10 px-4 py-3" aria-label="Cargando selector de planes">
        <Shimmer className="h-10 w-10 shrink-0 rounded-xl bg-violet-500/15" />
        <div className="min-w-0 flex-1">
          <Shimmer className="h-4 w-40 rounded" />
          <Shimmer className="mt-2 h-3 w-24 rounded bg-muted/40" />
        </div>
        <Shimmer className="h-4 w-4 rounded bg-muted/40" />
      </section>

      <header className="mt-6">
        <Shimmer className="h-3 w-20 rounded bg-violet-500/20" />
        <Shimmer className="mt-3 h-8 w-3/4 rounded" />
        <Shimmer className="mt-3 h-4 w-2/5 rounded bg-muted/40" />
      </header>

      <section className="mt-6 rounded-2xl border border-violet-500/25 bg-violet-500/[0.08] p-5" aria-label="Cargando entrenamiento de hoy">
        <Shimmer className="h-3 w-32 rounded bg-violet-500/20" />
        <Shimmer className="mt-4 h-6 w-2/3 rounded" />
        <div className="mt-3 flex gap-4">
          <Shimmer className="h-3 w-24 rounded bg-muted/40" />
          <Shimmer className="h-3 w-16 rounded bg-muted/40" />
        </div>
        <Shimmer className="mt-5 h-11 w-full rounded-xl bg-violet-500/20" />
      </section>

      <div className="mt-6 grid grid-cols-2 rounded-xl border border-border/60 bg-muted/20 p-1">
        <Shimmer className="h-10 rounded-lg bg-background/70" />
        <div className="h-10" />
      </div>

      <div className="mt-4 space-y-3" aria-label="Cargando semana de entrenamiento">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex min-h-20 items-center gap-3 rounded-2xl border border-border/60 bg-muted/10 px-4 py-3"
          >
            <Shimmer
              className={cn(
                'h-11 w-11 shrink-0 rounded-xl bg-muted/40',
                index === 0 && 'bg-violet-500/15',
              )}
              style={{ animationDelay: `${index * 70}ms` } as React.CSSProperties}
            />
            <div className="min-w-0 flex-1">
              <Shimmer className="h-4 w-2/3 rounded" />
              <Shimmer className="mt-2 h-3 w-1/2 rounded bg-muted/40" />
            </div>
            <Shimmer className="h-4 w-4 rounded bg-muted/40" />
          </div>
        ))}
      </div>
    </AppLoadingShell>
  )
}

export function HistoryLoading() {
  return (
    <AppLoadingShell className="pb-16">
      <BackHeader
        title="Historial"
        subtitle="Ultimas sesiones completadas"
        icon={History}
        right={<p className="text-sm font-medium text-violet-400">Calendario</p>}
      />
      <MetricStripSkeleton labels={['Sesiones', 'Tiempo', 'Volumen']} />
      <CardSkeletons count={1} className="mt-8" />
      <RowSkeletons count={4} />
    </AppLoadingShell>
  )
}

export function CalendarLoading() {
  return (
    <AppLoadingShell>
      <BackHeader
        title="Calendario"
        subtitle="Tu historial de entrenamiento mes a mes"
        icon={CalendarRange}
      />
      <section className="mt-8 rounded-2xl border border-border/60 bg-muted/10 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Actividad mensual</p>
          <Shimmer className="h-7 w-24 rounded-full bg-muted/40" />
        </div>
        <div className="mt-5 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }).map((_, index) => (
            <Shimmer
              key={index}
              className="aspect-square rounded-md bg-muted/40"
              style={{ animationDelay: `${(index % 7) * 45}ms` } as React.CSSProperties}
            />
          ))}
        </div>
      </section>
    </AppLoadingShell>
  )
}

export function MeasurementsLoading() {
  return (
    <AppLoadingShell>
      <BackHeader title="Medidas" subtitle="Peso y composicion corporal" icon={Ruler} />
      <section className="mt-8 rounded-2xl border border-border/60 bg-muted/10 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Evolucion</p>
          <Shimmer className="h-9 w-24 rounded-lg bg-violet-500/15" />
        </div>
        <Shimmer className="mt-5 h-40 rounded-xl bg-muted/40" />
      </section>
      <MetricStripSkeleton labels={['Peso', 'Cintura', 'Grasa']} />
      <RowSkeletons count={3} />
    </AppLoadingShell>
  )
}

export function ChatLoading() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground">
              <ArrowLeft className="h-5 w-5" />
            </div>
            <h1 className="font-display text-xl font-bold text-foreground">Coach IA</h1>
          </div>
          <div className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-violet-600/70 px-4 py-2 text-sm font-medium text-white">
            <PlusCircle className="h-4 w-4" />
            Nueva
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 pt-6">
        <RowSkeletons count={4} avatar />
      </main>
    </div>
  )
}

export function SocialFeedLoading() {
  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <h1 className="text-lg font-bold">Comunidad</h1>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Bell className="h-5 w-5" />
          <Search className="h-5 w-5" />
          <div className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-primary">
            <PlusCircle className="h-5 w-5" />
            Publicar
          </div>
        </div>
      </header>
      <div className="grid grid-cols-2 border-b border-border/40">
        <p className="py-3 text-center text-sm font-semibold text-foreground">Descubrir</p>
        <p className="py-3 text-center text-sm font-semibold text-muted-foreground">Siguiendo</p>
      </div>
      <PostSkeletons count={3} />
    </div>
  )
}

export function SocialListLoading({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <div className="flex h-9 w-9 items-center justify-center rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-bold">{title}</h1>
      </header>
      <div className="px-4">
        <RowSkeletons count={5} avatar />
      </div>
    </div>
  )
}

export function PostDetailLoading() {
  return (
    <div className="mx-auto max-w-lg pb-32">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <div className="flex h-9 w-9 items-center justify-center rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-bold">Publicacion</h1>
      </header>
      <PostSkeletons count={1} />
      <div className="px-4">
        <p className="mt-6 text-sm font-semibold text-foreground">Comentarios</p>
        <RowSkeletons count={3} avatar />
      </div>
    </div>
  )
}

export function ProfileLoading() {
  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="border-b border-border/40 px-4 py-6">
        <div className="flex items-center gap-5">
          <Shimmer className="h-20 w-20 shrink-0 rounded-full bg-violet-500/15" />
          <div className="grid flex-1 grid-cols-3 gap-2 text-center">
            {['publicaciones', 'seguidores', 'siguiendo'].map(label => (
              <div key={label}>
                <Shimmer className="mx-auto h-6 w-8 rounded" />
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <Shimmer className="mt-4 h-4 w-32 rounded" />
        <Shimmer className="mt-2 h-4 w-24 rounded bg-muted/40" />
        <Shimmer className="mt-4 h-10 w-full rounded-lg bg-muted/40" />
      </header>
      <div className="grid grid-cols-3 gap-px">
        {Array.from({ length: 9 }).map((_, index) => (
          <Shimmer key={index} className="aspect-square bg-muted/30" />
        ))}
      </div>
    </div>
  )
}

export function SettingsLoading() {
  return (
    <AppLoadingShell className="pb-16">
      <BackHeader title="Ajustes" subtitle="Preferencias de tu cuenta" icon={UserRound} />
      <section className="mt-8 overflow-hidden rounded-2xl border border-border/60 bg-muted/10">
        {['Perfil', 'Datos personales', 'Entrenamiento', 'Medidas', 'Notificaciones', 'Idioma', 'Cuenta'].map((label, index) => (
          <div
            key={label}
            className={cn(
              'flex items-center gap-3 px-4 py-3.5',
              index > 0 && 'border-t border-border/40',
            )}
          >
            <Shimmer className="h-9 w-9 rounded-lg bg-violet-500/15" />
            <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
            <Shimmer className="h-4 w-4 rounded bg-muted/40" />
          </div>
        ))}
      </section>
    </AppLoadingShell>
  )
}

export function LanguageSettingsLoading() {
  return (
    <AppLoadingShell className="pb-16">
      <BackHeader
        backLabel="Ajustes"
        title="Idioma"
        icon={Languages}
      />

      <section className="mt-8 space-y-5" aria-label="Cargando ajustes de idioma">
        <div className="space-y-3">
          {['Español', 'English'].map((label, index) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/10 p-4"
            >
              <Shimmer
                className="h-4 w-4 shrink-0 rounded-full bg-violet-500/20"
                style={{ animationDelay: `${index * 80}ms` } as React.CSSProperties}
              />
              <p className="text-sm font-semibold text-foreground">{label}</p>
            </div>
          ))}
        </div>
      </section>
    </AppLoadingShell>
  )
}

export function SessionLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-300/80">
              Sesion en curso
            </p>
            <h1 className="mt-1 truncate font-display text-xl font-bold text-foreground">
              Cargando rutina
            </h1>
          </div>
          <Shimmer className="h-10 w-20 rounded-lg bg-violet-500/15" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 py-5">
        <section className="rounded-2xl border border-border/60 bg-muted/10 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Ejercicios</p>
            <p className="text-xs text-muted-foreground">Series y pesos</p>
          </div>
          <RowSkeletons count={5} avatar={false} className="mt-4" />
        </section>
      </main>
    </div>
  )
}

export function ExercisesLoading() {
  return (
    <div className="min-h-screen bg-[#0e0e10] text-white">
      <div className="sticky top-0 z-10 border-b border-zinc-800/50 bg-[#0e0e10]/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <h1 className="shrink-0 text-xl font-bold tracking-tight">Exercise Library</h1>
            <div className="flex items-center gap-5">
              <div className="text-center">
                <Shimmer className="mx-auto h-7 w-14 rounded bg-zinc-800" />
                <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">Exercises</div>
              </div>
              <div className="h-8 w-px bg-zinc-800" />
              <div className="text-center">
                <Shimmer className="mx-auto h-7 w-12 rounded bg-zinc-800" />
                <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">Page</div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2 overflow-hidden">
            <Shimmer className="h-10 w-48 rounded-xl bg-zinc-800" />
            <Shimmer className="h-10 w-32 rounded-xl bg-zinc-800" />
            <Shimmer className="h-10 w-32 rounded-xl bg-zinc-800" />
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <Shimmer className="aspect-[4/3] rounded-xl bg-zinc-800" />
            <Shimmer className="mt-4 h-5 w-3/4 rounded bg-zinc-800" />
            <Shimmer className="mt-2 h-3 w-1/2 rounded bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}

function PostSkeletons({ count }: { count: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, index) => (
        <article key={index} className="border-b border-border/40 px-4 py-4">
          <div className="flex items-center gap-3">
            <Shimmer className="h-10 w-10 rounded-full bg-violet-500/15" />
            <div className="min-w-0 flex-1">
              <Shimmer className="h-4 w-32 rounded" />
              <Shimmer className="mt-2 h-3 w-20 rounded bg-muted/40" />
            </div>
          </div>
          <Shimmer className="mt-4 h-4 w-full rounded bg-muted/40" />
          <Shimmer className="mt-2 h-4 w-4/5 rounded bg-muted/40" />
          <Shimmer className="mt-4 aspect-square rounded-2xl bg-muted/30" />
        </article>
      ))}
    </div>
  )
}
