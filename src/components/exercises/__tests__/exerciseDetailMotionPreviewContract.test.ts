import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const detailPage = readFileSync(
  resolve(process.cwd(), 'src/app/(app)/exercises/[exerciseId]/page.tsx'),
  'utf8',
)
const grid = readFileSync(resolve(process.cwd(), 'src/app/(app)/exercises/ExerciseGrid.tsx'), 'utf8')
const catalogPage = readFileSync(resolve(process.cwd(), 'src/app/(app)/exercises/page.tsx'), 'utf8')
const catalogAction = readFileSync(resolve(process.cwd(), 'src/app/actions/exerciseCatalog.ts'), 'utf8')

describe('exercise detail motion preview contract', () => {
  it('loads and renders the optional motion preview only on the exercise detail', () => {
    expect(detailPage).toContain('motion_preview_url: string | null')
    expect(detailPage).toContain('video_url, image_url, motion_preview_url')
    expect(detailPage).toContain("import { ExerciseMotionPreview }")
    expect(detailPage).toContain('posterSrc={exercise.image_url}')
    expect(detailPage).toContain('motionSrc={exercise.motion_preview_url}')
    expect(detailPage).not.toContain('<ExerciseImage src={exercise.image_url}')
  })

  it('keeps catalog surfaces static', () => {
    for (const staticSurface of [grid, catalogPage, catalogAction]) {
      expect(staticSurface).not.toContain('ExerciseMotionPreview')
      expect(staticSurface).not.toContain('motion_preview_url')
    }
  })
})
