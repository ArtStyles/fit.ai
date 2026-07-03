'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, Megaphone, X } from 'lucide-react'
import { saveDashboardBanner } from '@/app/actions/dashboardBanner'
import { DashboardPromoBanner } from '@/components/dashboard/DashboardPromoBanner'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { Card, CardContent } from '@/components/ui/card'
import type {
  DashboardBannerData,
  DashboardBannerKind,
  DashboardBannerStatus,
} from '@/lib/dashboard/banner'

const EMPTY_BANNER: DashboardBannerData = {
  slot: 'dashboard-primary',
  kind: 'announcement',
  title: 'Un anuncio importante para tu comunidad',
  description: 'Añade una descripción breve que explique el evento, la promoción o la novedad.',
  image_url: null,
  cta_label: null,
  cta_href: null,
  status: 'draft',
  starts_on: null,
  ends_on: null,
  updated_at: '',
}

const fieldClass = 'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-violet-500'

export function DashboardBannerEditor({
  initialBanner,
  enabled,
}: {
  initialBanner: DashboardBannerData | null
  enabled: boolean
}) {
  const initial = initialBanner ?? EMPTY_BANNER
  const [kind, setKind] = useState<DashboardBannerKind>(initial.kind)
  const [status, setStatus] = useState<DashboardBannerStatus>(initial.status)
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description ?? '')
  const [ctaLabel, setCtaLabel] = useState(initial.cta_label ?? '')
  const [ctaHref, setCtaHref] = useState(initial.cta_href ?? '')
  const [imagePreview, setImagePreview] = useState<string | null>(initial.image_url)
  const [removeImage, setRemoveImage] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  const preview = useMemo<DashboardBannerData>(() => ({
    ...initial,
    kind,
    status,
    title,
    description: description || null,
    image_url: imagePreview,
    cta_label: ctaLabel || null,
    cta_href: ctaHref || null,
  }), [ctaHref, ctaLabel, description, imagePreview, initial, kind, status, title])

  function handleImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setRemoveImage(false)
    setImagePreview(URL.createObjectURL(file))
  }

  function clearImage() {
    if (imageInputRef.current) imageInputRef.current.value = ''
    setRemoveImage(true)
    setImagePreview(null)
  }

  if (!enabled) {
    return (
      <Card className="border-amber-500/25 bg-amber-500/5">
        <CardContent className="p-4 text-sm text-amber-100/80">
          El banner estará disponible cuando se aplique la migración 030 en Supabase.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border-violet-500/20 bg-card/50">
      <CardContent className="p-0">
        <div className="border-b border-border/60 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
              <Megaphone className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">Banner del dashboard</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Publica un anuncio, evento o promoción sin desplegar una nueva versión.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)]">
          <form action={saveDashboardBanner} className="space-y-4">
            <input type="hidden" name="removeImage" value={removeImage ? 'on' : 'off'} />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Tipo</span>
                <select name="kind" value={kind} onChange={event => setKind(event.target.value as DashboardBannerKind)} className={fieldClass}>
                  <option value="announcement">Anuncio</option>
                  <option value="event">Evento</option>
                  <option value="promotion">Promoción</option>
                  <option value="info">Información</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Estado</span>
                <select name="status" value={status} onChange={event => setStatus(event.target.value as DashboardBannerStatus)} className={fieldClass}>
                  <option value="draft">Borrador</option>
                  <option value="active">Activo</option>
                  <option value="paused">Pausado</option>
                </select>
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Título</span>
              <input name="title" required minLength={3} maxLength={100} value={title} onChange={event => setTitle(event.target.value)} className={fieldClass} />
            </label>

            <label className="block space-y-1.5">
              <span className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                Descripción <span className="font-normal">{description.length}/280</span>
              </span>
              <textarea name="description" maxLength={280} rows={3} value={description} onChange={event => setDescription(event.target.value)} className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500" />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Texto del botón</span>
                <input name="ctaLabel" maxLength={40} value={ctaLabel} onChange={event => setCtaLabel(event.target.value)} placeholder="Ver más" className={fieldClass} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Enlace del botón</span>
                <input name="ctaHref" value={ctaHref} onChange={event => setCtaHref(event.target.value)} placeholder="/plan o https://..." className={fieldClass} />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Mostrar desde</span>
                <input name="startsOn" type="date" defaultValue={initial.starts_on ?? ''} className={fieldClass} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Mostrar hasta</span>
                <input name="endsOn" type="date" defaultValue={initial.ends_on ?? ''} className={fieldClass} />
              </label>
            </div>

            <div className="rounded-xl border border-dashed border-border/70 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-muted px-3 text-xs font-semibold text-foreground hover:bg-muted/80">
                  <ImagePlus className="h-4 w-4" />
                  {imagePreview ? 'Cambiar imagen' : 'Añadir imagen'}
                  <input ref={imageInputRef} name="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={handleImage} />
                </label>
                {imagePreview && (
                  <button type="button" onClick={clearImage} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-red-300 hover:bg-red-500/10">
                    <X className="h-4 w-4" /> Quitar
                  </button>
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">JPG, PNG, WebP o AVIF · máximo 8 MB · recomendado 1600 × 900.</p>
            </div>

            <SubmitButton label="Guardar banner" pendingLabel="Guardando banner" className="h-11 w-full bg-violet-500 text-white hover:bg-violet-400" />
          </form>

          <div className="lg:sticky lg:top-5 lg:self-start">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vista previa</p>
            <DashboardPromoBanner banner={preview} preview />
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              El banner solo aparecerá cuando esté activo y dentro de las fechas seleccionadas.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
