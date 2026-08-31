import { readFileSync } from 'node:fs'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Database } from '@/types/database'

type ExerciseRow = Database['public']['Tables']['exercises']['Row']
type ExerciseInsert = Database['public']['Tables']['exercises']['Insert']
type ExerciseUpdate = Database['public']['Tables']['exercises']['Update']
type ExerciseDetailRpc = Database['public']['Functions']['get_exercise_detail_payload']
type ExerciseDetail = NonNullable<ExerciseDetailRpc['Returns']['exercise']>

describe('exercise motion preview database contract', () => {
  it('adds the nullable column and projects it from the detail RPC', () => {
    const migration = readFileSync(
      new URL('../../../../supabase/migrations/057_exercise_motion_previews.sql', import.meta.url),
      'utf8',
    )

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS motion_preview_url TEXT')
    expect(migration).toContain('e.video_url, e.image_url, e.motion_preview_url')
  })

  it('types Row, Insert, Update and the RPC result explicitly', () => {
    expectTypeOf<ExerciseRow['motion_preview_url']>().toEqualTypeOf<string | null>()
    expectTypeOf<ExerciseInsert['motion_preview_url']>().toEqualTypeOf<string | null | undefined>()
    expectTypeOf<ExerciseUpdate['motion_preview_url']>().toEqualTypeOf<string | null | undefined>()
    expectTypeOf<ExerciseDetailRpc['Args']>().toEqualTypeOf<{ p_exercise_id: string }>()
    expectTypeOf<ExerciseDetail['motion_preview_url']>().toEqualTypeOf<string | null>()
  })
})
