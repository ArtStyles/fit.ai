'use client'

import {
  ArrowLeft,
  Bell,
  CalendarRange,
  Dumbbell,
  History,
  Languages,
  PlusCircle,
  Ruler,
  Search,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FixedTopBar } from '@/components/navigation/FixedTopBar'
import { useI18n } from '@/components/i18n/I18nProvider'

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
    <FixedTopBar contentClassName="justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
          <span className="sr-only">{backLabel}</span>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
            <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-bold leading-tight text-foreground">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {right}
    </FixedTopBar>
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
      <FixedTopBar initialHeight={104} contentClassName="max-w-3xl sm:px-6">
        <div className="relative h-20 w-20 shrink-0 rounded-full">
          <Shimmer className="h-20 w-20 rounded-full bg-violet-500/15" />
          <Shimmer
            data-loading-slot="dashboard-avatar-badge"
            className="absolute bottom-0 right-0 h-6 w-6 rounded-full border-2 border-background bg-violet-500/30"
          />
        </div>

        <div className="min-w-0 flex-1">
          <Shimmer className="h-4 w-24 rounded bg-muted/40" />
          <Shimmer className="mt-2 h-8 w-36 rounded" />
        </div>
      </FixedTopBar>

      <main className="mx-auto max-w-3xl px-4 sm:px-6">
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
      <BackHeader title="Plan" subtitle="Cargando plan activo" icon={Dumbbell} right={<Shimmer className="h-10 w-10 rounded-full bg-muted/30" />} />

      <section className="mt-5 flex min-h-16 items-center gap-3 rounded-2xl border border-border/60 bg-muted/10 px-4 py-3" aria-label="Cargando selector de planes">
        <Shimmer className="h-10 w-10 shrink-0 rounded-xl bg-violet-500/15" />
        <div className="min-w-0 flex-1">
          <Shimmer className="h-4 w-40 rounded" />
          <Shimmer className="mt-2 h-3 w-24 rounded bg-muted/40" />
        </div>
        <Shimmer className="h-4 w-4 rounded bg-muted/40" />
      </section>

      <Shimmer className="mt-6 h-4 w-2/5 rounded bg-muted/40" />

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
    <div className="min-h-screen bg-background pb-20">
      <BackHeader
        title="Historial"
        subtitle="Ultimas sesiones completadas"
        icon={History}
        right={<p className="text-sm font-medium text-violet-400">Calendario</p>}
      />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <section className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.06] p-5 sm:p-6">
          <Shimmer className="h-3 w-36 rounded bg-violet-500/15" />
          <Shimmer className="mt-4 h-10 w-64 rounded-lg" />
          <Shimmer className="mt-3 h-4 w-full max-w-xl rounded bg-muted/40" />
          <MetricStripSkeleton labels={['Sesiones', 'Volumen', 'Records personales']} />
        </section>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <section>
            <Shimmer className="h-8 w-56 rounded" />
            <Shimmer className="mt-5 h-28 rounded-2xl bg-muted/30" />
            <RowSkeletons count={4} avatar={false} className="mt-5" />
          </section>
          <section className="rounded-3xl border border-amber-500/15 bg-amber-500/[0.035] p-5">
            <Shimmer className="h-8 w-40 rounded" />
            <RowSkeletons count={3} avatar={false} className="mt-4" />
          </section>
        </div>
      </main>
    </div>
  )
}

export function CalendarLoading() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <BackHeader
        title="Calendario"
        subtitle="Tu historial de entrenamiento mes a mes"
        icon={CalendarRange}
      />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <section className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.06] p-5 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-300">Ritmo de entrenamiento</p>
          <Shimmer className="mt-3 h-10 w-52 rounded-lg" />
          <Shimmer className="mt-3 h-4 w-72 max-w-full rounded bg-muted/40" />
          <MetricStripSkeleton labels={['Días este mes', 'Racha actual', 'Sesiones por semana']} />
        </section>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,.8fr)] lg:items-start">
          <section className="rounded-3xl border border-border/60 bg-muted/[0.06] p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <Shimmer className="h-11 w-11 rounded-xl bg-muted/40" />
              <Shimmer className="h-7 w-40 rounded-lg" />
              <Shimmer className="h-11 w-11 rounded-xl bg-muted/40" />
            </div>
            <div className="mt-5 grid grid-cols-7 gap-1.5">
              {Array.from({ length: 35 }).map((_, index) => (
                <Shimmer
                  key={index}
                  className="aspect-square min-h-11 rounded-xl bg-muted/40"
                  style={{ animationDelay: `${(index % 7) * 45}ms` } as React.CSSProperties}
                />
              ))}
            </div>
          </section>
          <section className="rounded-3xl border border-border/60 bg-muted/[0.06] p-5">
            <Shimmer className="h-3 w-28 rounded bg-violet-500/15" />
            <Shimmer className="mt-3 h-8 w-48 rounded" />
            <RowSkeletons count={2} avatar={false} className="mt-5" />
          </section>
        </div>
      </main>
    </div>
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
      <FixedTopBar contentClassName="justify-between">
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
      </FixedTopBar>
      <main className="mx-auto max-w-lg px-4 pt-6">
        <RowSkeletons count={4} avatar />
      </main>
    </div>
  )
}

export function SocialFeedLoading() {
  return (
    <div className="mx-auto max-w-lg pb-24">
      <FixedTopBar contentClassName="justify-between">
        <h1 className="text-lg font-bold">Comunidad</h1>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Bell className="h-5 w-5" />
          <Search className="h-5 w-5" />
          <div className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-primary">
            <PlusCircle className="h-5 w-5" />
            Publicar
          </div>
        </div>
      </FixedTopBar>
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
      <FixedTopBar>
        <div className="flex h-9 w-9 items-center justify-center rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-bold">{title}</h1>
      </FixedTopBar>
      <div className="px-4">
        <RowSkeletons count={5} avatar />
      </div>
    </div>
  )
}

export function PostDetailLoading() {
  return (
    <div className="mx-auto max-w-lg pb-32">
      <FixedTopBar>
        <div className="flex h-9 w-9 items-center justify-center rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-bold">Publicacion</h1>
      </FixedTopBar>
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
      <BackHeader
        backLabel="Comunidad"
        title="Perfil"
        icon={UserRound}
        right={<Shimmer data-loading-slot="profile-action" className="h-11 w-11 rounded-xl bg-muted/40" />}
      />
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

function SettingsFieldSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <Shimmer className="h-10 rounded-md bg-muted/40" />
    </div>
  )
}

function SettingsSaveSkeleton() {
  return <Shimmer className="h-11 w-full rounded-md bg-violet-500/20" />
}

function SettingsDetailShell({
  title,
  icon,
  view,
  children,
}: {
  title: string
  icon: IconComponent
  view: string
  children: React.ReactNode
}) {
  const { t } = useI18n()

  return (
    <AppLoadingShell className="pb-16">
      <BackHeader backLabel={t('Ajustes')} title={title} icon={icon} />
      <section
        data-loading-view={view}
        className="mt-8 space-y-6"
        aria-label={t('Cargando {title}', { title })}
      >
        {children}
      </section>
    </AppLoadingShell>
  )
}

export function ProfileSettingsLoading() {
  const { t } = useI18n()

  return (
    <SettingsDetailShell title={t('Perfil')} icon={UserRound} view="settings-profile">
      <div className="flex flex-col items-center rounded-2xl border border-border/60 bg-muted/10 p-6">
        <p className="sr-only">{t('Avatar')}</p>
        <Shimmer className="h-24 w-24 rounded-full bg-violet-500/15" />
        <Shimmer className="mt-4 h-9 w-36 rounded-md bg-muted/40" />
      </div>
      <div className="rounded-2xl border border-border/60 bg-muted/10 p-5">
        <SettingsFieldSkeleton label={t('Nombre')} />
      </div>
      <SettingsSaveSkeleton />
    </SettingsDetailShell>
  )
}

export function PersonalDataSettingsLoading() {
  return (
    <SettingsDetailShell title="Datos personales" icon={UserRound} view="settings-personal-data">
      <div className="rounded-2xl border border-border/60 bg-muted/10 p-5">
        <div className="grid grid-cols-2 gap-3">
          <SettingsFieldSkeleton label="Altura cm" />
          <SettingsFieldSkeleton label="Peso kg" />
          <SettingsFieldSkeleton label="Nacimiento" />
          <SettingsFieldSkeleton label="Género" />
        </div>
      </div>
      <SettingsSaveSkeleton />
    </SettingsDetailShell>
  )
}

export function TrainingSettingsLoading() {
  const { t } = useI18n()
  const sections = [
    { title: t('Objetivo y experiencia'), rows: 2 },
    { title: t('Disponibilidad'), rows: 3 },
    { title: t('Espacio y equipo'), rows: 2 },
    { title: t('Seguridad'), rows: 2 },
  ]

  return (
    <SettingsDetailShell title={t('Entrenamiento')} icon={Dumbbell} view="settings-training">
      {sections.map(({ title, rows }) => (
        <section
          key={title}
          data-loading-section="training"
          className="rounded-2xl border border-border/60 bg-muted/10 p-5"
        >
          <p className="text-base font-semibold text-foreground">{title}</p>
          <div className="mt-4 space-y-3">
            {Array.from({ length: rows }).map((_, index) => (
              <Shimmer key={index} className="h-11 rounded-xl bg-muted/40" />
            ))}
          </div>
        </section>
      ))}
      <SettingsSaveSkeleton />
    </SettingsDetailShell>
  )
}

export function NotificationsSettingsLoading() {
  const { t } = useI18n()

  return (
    <SettingsDetailShell title={t('Notificaciones')} icon={Bell} view="settings-notifications">
      <div className="rounded-2xl border border-border/60 bg-muted/10 p-5">
        <p className="text-sm font-semibold text-foreground">{t('Recordatorios')}</p>
        <div className="mt-4 space-y-3">
          <SettingsFieldSkeleton label={t('Hora preferida')} />
          <SettingsFieldSkeleton label={t('Días activos')} />
        </div>
      </div>
      <div className="rounded-2xl border border-border/60 bg-muted/10 p-5">
        <p className="text-sm font-semibold text-foreground">{t('Avisos de Vekira')}</p>
        <div className="mt-4 space-y-3">
          <Shimmer className="h-12 rounded-xl bg-muted/40" />
          <Shimmer className="h-12 rounded-xl bg-muted/40" />
        </div>
      </div>
    </SettingsDetailShell>
  )
}

export function AccountSettingsLoading() {
  const { t } = useI18n()

  return (
    <SettingsDetailShell title={t('Cuenta')} icon={UserRound} view="settings-account">
      <div className="rounded-2xl border border-border/60 bg-muted/10 p-5">
        <p className="text-base font-semibold text-foreground">{t('Cuenta de acceso')}</p>
        <SettingsFieldSkeleton label={t('Correo electrónico')} className="mt-4" />
      </div>
      <div className="rounded-2xl border border-border/60 bg-muted/10 p-5">
        <p className="text-base font-semibold text-foreground">{t('Sesión')}</p>
        <SettingsSaveSkeleton />
      </div>
      <div className="rounded-2xl border border-border/60 bg-muted/10 p-5">
        <p className="text-base font-semibold text-foreground">{t('Documentos')}</p>
        <Shimmer className="mt-4 h-11 w-full rounded-md bg-muted/40" />
        <Shimmer className="mt-2 h-11 w-full rounded-md bg-muted/40" />
      </div>
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
        <p className="text-base font-semibold text-red-200">{t('Zona peligrosa')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('Eliminar cuenta')}</p>
        <Shimmer className="mt-4 h-10 rounded-md bg-red-500/15" />
      </div>
    </SettingsDetailShell>
  )
}

export function SettingsLoading() {
  const { t } = useI18n()
  const groups = [
    { title: t('Tu perfil'), rows: 3 },
    { title: t('Tu entrenamiento'), rows: 1 },
    { title: t('Aplicación'), rows: 2 },
    { title: t('Acceso y seguridad'), rows: 1 },
  ]

  return (
    <AppLoadingShell className="pb-16">
      <BackHeader title={t('Ajustes')} subtitle={t('Preferencias de tu cuenta')} icon={UserRound} />
      <section className="mt-8 space-y-6">
        {groups.map(({ title, rows }) => (
          <section
            key={title}
            data-loading-group={title}
            className="rounded-2xl border border-border/60 bg-muted/10 p-5"
          >
            <h2 className="mb-4 text-base font-semibold text-foreground">{title}</h2>
            <div className="space-y-3">
              {Array.from({ length: rows }).map((_, index) => (
                <div
                  key={index}
                  data-loading-row="true"
                  className="flex min-h-11 items-center gap-3 rounded-xl border border-border/40 px-3 py-2.5"
                >
                  <Shimmer className="h-9 w-9 rounded-lg bg-violet-500/15" />
                  <div className="min-w-0 flex-1">
                    <Shimmer className="h-4 w-2/3 rounded" />
                    <Shimmer className="mt-2 h-3 w-1/2 rounded bg-muted/40" />
                  </div>
                  <Shimmer className="h-4 w-4 rounded bg-muted/40" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </section>
    </AppLoadingShell>
  )
}

export function LanguageSettingsLoading() {
  const { t } = useI18n()

  return (
    <AppLoadingShell className="pb-16">
      <BackHeader
        backLabel={t('Ajustes')}
        title={t('Idioma')}
        icon={Languages}
      />

      <section className="mt-8 space-y-5" aria-label={t('Cargando ajustes de idioma')}>
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
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <Shimmer className="mt-2 h-3 w-1/2 rounded bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
        <Shimmer data-loading-slot="language-save-status" className="h-10 rounded-xl bg-muted/40" />
      </section>
    </AppLoadingShell>
  )
}

export function SessionLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background pb-24">
      <FixedTopBar contentClassName="justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-300/80">
              Sesion en curso
            </p>
            <h1 className="mt-1 truncate font-display text-xl font-bold text-foreground">
              Cargando rutina
            </h1>
          </div>
          <Shimmer className="h-10 w-20 rounded-lg bg-violet-500/15" />
      </FixedTopBar>
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
      <FixedTopBar
        className="border-zinc-800/50 bg-[#0e0e10]/95"
        contentClassName="mx-auto block max-w-7xl px-4 py-4 sm:px-6"
        initialHeight={116}
      >
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
      </FixedTopBar>

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
