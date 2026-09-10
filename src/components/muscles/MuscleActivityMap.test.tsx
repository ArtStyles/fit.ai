import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import manifest from '../../../public/exercises/catalog/v1/manifest.json'
import { MuscleActivityMap } from './MuscleActivityMap'
import type { MuscleActivityInput } from '@/lib/muscles/activity'

vi.mock('@/components/navigation/PendingLink', () => ({ PendingLink: ({ children, ...props }: any) => <a {...props}>{children}</a> }))

function render(rows: MuscleActivityInput[], language: 'es' | 'en' = 'es') {
  return renderToStaticMarkup(<MuscleActivityMap rows={rows} language={language} mode="completed" />).replace(/\sd="[^"]*"/g, '')
}
function regions(html: string, slug: string) {
  return Array.from(html.matchAll(/<g\b[^>]*>/g), match => match[0]).filter(tag => tag.includes(`data-muscle-region="${slug}"`))
}

describe('muscle activity map anatomy and catalogue labels', () => {
  it('shows the real five-exercise session across all contributing groups', () => {
    const slugs = new Set(['arnold-press-mancuernas', 'press-banca-barra', 'press-frances-tumbado-barra-ez', 'press-inclinado-mancuernas', 'press-militar-pie-barra'])
    const exercises = manifest.exercises.filter(exercise => slugs.has(exercise.slug))
    expect(exercises).toHaveLength(5)
    const html = render(exercises.map(exercise => ({ muscleGroups: [...exercise.primaryMuscles, ...exercise.secondaryMuscles], sets: 3 })))
    for (const label of ['Pecho: 6', 'Hombros: 12', 'Tríceps: 15', 'Trapecio: 3', 'Ancóneo: 3']) {
      expect(html).toContain(`aria-label="${label} series completadas"`)
    }
    expect(html).not.toContain('Sin zona específica en el mapa:')
  })

  it('colors the existing trapezius geometry without attributing sets to the back or lumbar region', () => {
    const html = render([{ muscleGroups: ['trapecio superior'], sets: 3 }])
    expect(html).toContain('aria-label="Espalda: 0 series completadas"')
    expect(html).toContain('aria-label="Zona lumbar: 0 series completadas"')
    expect(regions(html, 'trapezius')).toHaveLength(2)
    for (const tag of regions(html, 'trapezius')) {
      expect(tag).toContain('data-muscle-group="traps"')
      expect(tag).toContain('fill-violet-600')
    }
    for (const slug of ['upperBack', 'lowerBack']) {
      expect(regions(html, slug)).toHaveLength(1)
      expect(regions(html, slug)[0]).not.toContain('fill-violet-')
    }
  })

  it('uses available lumbar, neck and tibialis paths while keeping the head decorative', () => {
    const html = render([{ muscleGroups: ['erectores espinales', 'cuello', 'tibial anterior'], sets: 2 }])
    for (const [slug, group, count] of [['lowerBack', 'lower_back', 1], ['neck', 'neck', 2], ['tibialis', 'tibialis', 1]] as const) {
      expect(regions(html, slug)).toHaveLength(count)
      for (const tag of regions(html, slug)) {
        expect(tag).toContain(`data-muscle-group="${group}"`)
        expect(tag).toContain('cursor-pointer')
        expect(tag).toContain('fill-violet-600')
      }
    }
    expect(regions(html, 'head')).toHaveLength(2)
    for (const tag of regions(html, 'head')) {
      expect(tag).not.toContain('data-muscle-group=')
      expect(tag).not.toContain('cursor-pointer')
    }
  })

  it('lists rotator cuff and anconeus activity without inventing their geometry', () => {
    const html = render([{ muscleGroups: ['manguito rotador', 'ancóneo'], sets: 2 }])
    expect(html).toContain('aria-label="Manguito rotador: 2 series completadas"')
    expect(html).toContain('aria-label="Ancóneo: 2 series completadas"')
    expect(html).toContain('Sin zona propia en el dibujo: ')
    expect(html).toContain('Manguito rotador (2)')
    expect(html).toContain('Ancóneo (2)')
    expect(html).not.toContain('data-muscle-group="rotator_cuff"')
    expect(html).not.toContain('data-muscle-group="anconeus"')
    expect(html).toContain('aria-label="Hombros: 0 series completadas"')
    expect(html).toContain('aria-label="Tríceps: 0 series completadas"')
    expect(html).not.toContain('Sin zona específica en el mapa:')
  })

  it('only notes missing geometry for groups with sets and keeps truly unknown labels separate', () => {
    expect(render([])).not.toContain('Sin zona propia en el dibujo:')
    expect(render([{ muscleGroups: ['pecho'], sets: 3 }])).not.toContain('Sin zona propia en el dibujo:')
    const html = render([{ muscleGroups: ['ancóneo', 'región sin clasificar'], sets: 2 }])
    expect(html).toContain('Sin zona propia en el dibujo: ')
    expect(html).toContain('Sin zona específica en el mapa: ')
    expect(html).toContain('región sin clasificar (2)')
    const english = render([{ muscleGroups: ['manguito rotador'], sets: 2 }], 'en')
    expect(english).toContain('No dedicated drawing region: ')
    expect(english).not.toContain('Sin zona propia')
  })
})
