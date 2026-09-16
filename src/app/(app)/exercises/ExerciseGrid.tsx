'use client'

import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { TYPE_CFG, DIFF_CFG } from './config'
import { ExerciseImage } from '@/components/exercises/ExerciseImage'
import type { Exercise } from '@/types/exercise'
import { useI18n } from '@/components/i18n/I18nProvider'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip any residual HTML tags that might survive the seed-script cleaner */
function clean(text: string | null): string {
  if (!text) return ''
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function ExerciseCard({ ex, onClick }: { ex: Exercise; onClick: (trigger: HTMLButtonElement) => void }) {
  const { t } = useI18n()
  const cfg  = ex.exercise_type ? TYPE_CFG[ex.exercise_type] : null
  const diff = ex.difficulty    ? DIFF_CFG[ex.difficulty]    : null

  return (
    <article
      aria-label={ex.name}
      className="
        group relative flex flex-col gap-3 rounded-2xl bg-zinc-900 p-4
        border border-zinc-800 cursor-pointer
        hover:bg-zinc-800/80 hover:border-zinc-700
        hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50
        transition-all duration-200 select-none
      "
    >
      <button
        type="button"
        aria-label={ex.name}
        aria-haspopup="dialog"
        onClick={event => onClick(event.currentTarget)}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
      />
      {/* Thumbnail + compound */}
      <div className="pointer-events-none relative z-20 [&_button]:pointer-events-auto">
        <ExerciseImage src={ex.image_url} alt={ex.name} variant="thumb" className="w-full" zoomable />
        {ex.is_compound && (
          <span className="absolute top-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-200">
            {t('Compuesto')}
          </span>
        )}
      </div>

      {/* Name */}
      <h3 className="font-bold text-white text-[13px] leading-snug line-clamp-2 min-h-[2.5rem]">
        {ex.name}
      </h3>

      {/* Footer */}
      <div className="flex flex-col gap-1.5 mt-auto">
        <div className="flex items-center gap-2 flex-wrap">
          {cfg && (
            <span className={`text-[10px] font-bold px-2.5 py-[3px] rounded-md ${cfg.pillBg} ${cfg.pillText}`}>
              {t(cfg.label)}
            </span>
          )}
          {diff && (
            <span className={`text-[10px] font-medium ${diff.color}`}>{t(diff.label)}</span>
          )}
        </div>

        {ex.muscle_groups.length > 0 && (
          <p className="text-[11px] text-zinc-400 leading-relaxed capitalize">
            {ex.muscle_groups.slice(0, 3).join(' · ')}
            {ex.muscle_groups.length > 3 && (
              <span className="text-zinc-400"> +{ex.muscle_groups.length - 3}</span>
            )}
          </p>
        )}
      </div>
    </article>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2.5">
        {title}
      </h4>
      {children}
    </div>
  )
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 capitalize">
      {label}
    </span>
  )
}

function ExerciseModal({ ex, onClose, returnFocus }: { ex: Exercise; onClose: () => void; returnFocus: HTMLElement | null }) {
  const { t } = useI18n()
  const cfg  = ex.exercise_type ? TYPE_CFG[ex.exercise_type] : null
  const diff = ex.difficulty    ? DIFF_CFG[ex.difficulty]    : null
  const closeRef = useRef<HTMLButtonElement>(null)

  const description  = clean(ex.description)
  const instructions = clean(ex.instructions)

  return (
    <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose() }}>
    <DialogPrimitive.Portal>
      {/* Backdrop */}
      <DialogPrimitive.Overlay asChild>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm"
      />
      </DialogPrimitive.Overlay>

      {/* Panel */}
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <DialogPrimitive.Content
        asChild
        aria-describedby={undefined}
        onOpenAutoFocus={event => { event.preventDefault(); closeRef.current?.focus() }}
        onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus?.isConnected) returnFocus.focus() }}
      >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{   opacity: 0, scale: 0.96, y: 12  }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-auto relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/70 flex flex-col max-h-[88vh] overflow-hidden"
      >
        {/* ── Hero image ────────────────────────────────────────────────── */}
        <ExerciseImage src={ex.image_url} alt={ex.name} variant="hero" zoomable className="w-full" frameClassName="rounded-none border-0" />

        {/* ── Header (sticky) ───────────────────────────────────────────── */}
        <div className={`relative px-5 pt-5 pb-4 border-b border-zinc-800 bg-gradient-to-br ${cfg?.sectionBg ?? 'from-zinc-800/30'} to-transparent shrink-0`}>
          {/* Close */}
          <button
            ref={closeRef}
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-700/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            aria-label={t('Cerrar')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Icon + title row */}
          <div className="flex items-start gap-4 pr-8">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0 ${cfg?.iconBg ?? 'bg-zinc-800'}`}>
              {cfg?.emoji ?? '💪'}
            </div>
            <div className="flex-1 min-w-0">
              <DialogPrimitive.Title asChild><h2 className="font-bold text-white text-lg leading-snug">
                {ex.name}
              </h2></DialogPrimitive.Title>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {cfg && (
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg ${cfg.pillBg} ${cfg.pillText}`}>
                    {t(cfg.label)}
                  </span>
                )}
                {diff && (
                  <span className={`text-[11px] font-semibold ${diff.color}`}>
                    {t(diff.label)}
                  </span>
                )}
                {ex.is_compound && (
                  <>
                    <span className="text-zinc-400" aria-hidden="true">·</span>
                    <span className="text-[11px] text-zinc-400 font-medium">{t('Compuesto')}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Body (scrollable) ─────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-6 scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700">

          {/* Description */}
          {description && (
            <Section title={t('Descripción')}>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {description}
              </p>
            </Section>
          )}

          {/* Muscles */}
          {ex.muscle_groups.length > 0 && (
            <Section title={t('Músculos trabajados')}>
              <div className="flex flex-wrap gap-2">
                {ex.muscle_groups.map(m => <Chip key={m} label={m} />)}
              </div>
            </Section>
          )}

          {/* Equipment */}
          {ex.equipment.length > 0 && (
            <Section title={t('Equipo')}>
              <div className="flex flex-wrap gap-2">
                {ex.equipment.map(e => <Chip key={e} label={e} />)}
              </div>
            </Section>
          )}

          {/* Instructions */}
          {instructions && (
            <Section title={t('Instrucciones')}>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
                {instructions}
              </p>
            </Section>
          )}

          {/* Video */}
          {ex.video_url && (
            <Section title={t('Video')}>
              <a
                href={ex.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-orange-400 hover:text-orange-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {t('Ver demostración')}
              </a>
            </Section>
          )}

          {/* Empty state */}
          {!description && !instructions && ex.muscle_groups.length === 0 && ex.equipment.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-4">
              {t('No hay más detalles disponibles para este ejercicio.')}
            </p>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-5 py-3.5 border-t border-zinc-800 shrink-0 flex items-center justify-between">
          <span className="text-[10px] text-zinc-400 font-mono">
            {ex.external_id ?? ex.id.slice(0, 8)}
          </span>
          <button
            onClick={onClose}
            className="text-sm font-medium text-zinc-400 hover:text-white px-4 py-1.5 rounded-xl border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800 transition-colors"
          >
            {t('Cerrar')}
          </button>
        </div>
      </motion.div>
      </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ─── Grid (exported) ──────────────────────────────────────────────────────────

export default function ExerciseGrid({ exercises }: { exercises: Exercise[] }) {
  const [selected, setSelected] = useState<Exercise | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const close = useCallback(() => setSelected(null), [])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {exercises.map(ex => (
          <ExerciseCard key={ex.id} ex={ex} onClick={trigger => { triggerRef.current = trigger; setSelected(ex) }} />
        ))}
      </div>

      <AnimatePresence>
        {selected && <ExerciseModal ex={selected} onClose={close} returnFocus={triggerRef.current} />}
      </AnimatePresence>
    </>
  )
}
