import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { bundledExercises } from './defaults'

it('resolves every bundled poster and reviewed motion to a packaged local asset', async () => {
  const exercises = await bundledExercises()
  expect(exercises).toHaveLength(50)
  expect(exercises.some(row => row.motion_preview_url)).toBe(true)
  for (const exercise of exercises) {
    for (const path of [exercise.image_url, exercise.motion_preview_url].filter(Boolean)) {
      expect(path).toMatch(/^\/exercises\/catalog\/v1\//)
      expect((await readFile(new URL(`../../../public${path}`, import.meta.url))).length).toBeGreaterThan(0)
    }
  }
})
