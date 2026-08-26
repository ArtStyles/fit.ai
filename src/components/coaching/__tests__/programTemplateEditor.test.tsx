import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, expect as pwExpect, type Browser } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

type RecordedCall = {
  action: string
  fields: Record<string, string | string[]>
}

describe('professional template editor browser interactions', () => {
  let browser: Browser
  let viteServer: { listen: () => Promise<void>; close: () => Promise<void>; httpServer: { address: () => string | { port: number } | null } }
  let baseUrl = ''

  beforeAll(async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const viteEntry = path.join(repoRoot, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')
    const fixtureActions = path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/trainerPrograms.fixture.ts')
    const fixtureAssignmentActions = path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/trainerAssignments.fixture.ts')
    const { createServer } = await import(pathToFileURL(viteEntry).href)
    viteServer = await createServer({
      configFile: false,
      root: repoRoot,
      appType: 'spa',
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-program-template-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'lucide-react', '@radix-ui/react-dialog'] },
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: [
          { find: '@/app/actions/trainerPrograms', replacement: fixtureActions },
          { find: '@/app/actions/trainerAssignments', replacement: fixtureAssignmentActions },
          { find: '@/app/actions/exerciseCatalog', replacement: fixtureActions },
          { find: 'next/navigation', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/nextNavigation.fixture.ts') },
          { find: 'next/image', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/nextImage.fixture.tsx') },
          { find: '@', replacement: path.join(repoRoot, 'src') },
        ],
      },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Vite template editor fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    await viteServer?.close()
  })

  it('keeps this editable professional template separate from published assignments', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await pwExpect(page.getByText(/Las ediciones de esta plantilla no cambian asignaciones ya publicadas/)).toBeVisible()
    } finally { await page.close() }
  })

  it('submits the new routine fields before the lazy server action and navigates to its editor', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?view=new`)
      await page.getByLabel('Nombre').fill('Fuerza base')
      await page.getByLabel('Objetivo').fill('Ganar fuerza')
      await page.getByRole('button', { name: 'Crear plantilla' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: unknown[] }).__PROGRAM_ACTIONS__?.length))

      expect(await page.evaluate(() => (window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__)).toEqual([
        { action: 'create-template', fields: { name: 'Fuerza base', goal: 'Ganar fuerza', daysPerWeek: '3', description: '' } },
      ])
      expect(await page.evaluate(() => (window as Window & { __PROGRAM_PUSHES__?: string[] }).__PROGRAM_PUSHES__)).toEqual([
        '/coach/programs/11111111-1111-4111-8111-111111111111',
      ])
    } finally { await page.close() }
  })

  it('marks descriptive edits pending and returns to saved after explicit save', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      const templateSummary = page.getByRole('region', { name: 'Fuerza' })
      await pwExpect(templateSummary.getByText('Todo guardado')).toBeVisible()
      await page.getByLabel('Nombre de la rutina').fill('Fuerza total')
      await pwExpect(templateSummary.getByText('Cambios pendientes')).toBeVisible()
      await page.getByRole('button', { name: 'Guardar detalles' }).click()
      await pwExpect(templateSummary.getByText('Todo guardado')).toBeVisible()

      expect(await page.evaluate(() => (window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__)).toEqual([
        { action: 'update-template', fields: { templateId: '11111111-1111-4111-8111-111111111111', name: 'Fuerza total', daysPerWeek: '3', goal: '', description: '' } },
      ])
    } finally { await page.close() }
  })

  it('blocks both professional actions until template details are explicitly saved', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await page.getByLabel('Nombre de la rutina').fill('Fuerza editada')
      await pwExpect(page.getByText('Cambios pendientes')).toBeVisible()

      for (const actionName of ['Enviar a un cliente', 'Publicar revisión']) {
        await page.getByRole('button', { name: actionName }).click()
        const actionRegion = page.getByRole('region', { name: actionName === 'Enviar a un cliente' ? 'Enviar como rutina profesional' : 'Publicar una revisión' })
        const status = actionRegion.getByRole('status')
        await pwExpect(status).toContainText('Guarda los cambios pendientes antes de asignar o publicar.')
        await pwExpect(status).toBeFocused()
      }

      await page.getByRole('button', { name: 'Guardar detalles' }).click()
      await pwExpect(page.getByText('Todo guardado').first()).toBeVisible()
      await page.getByRole('button', { name: 'Enviar a un cliente' }).click()
      await pwExpect(page.locator('#assign-program-form')).toBeVisible()
    } finally { await page.close() }
  })

  it('keeps a failed descriptive save protected and warns before leaving', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?save=error`)
      await page.getByLabel('Objetivo de la rutina').fill('Fuerza máxima')
      expect(await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true })
        return { dispatched: window.dispatchEvent(event), prevented: event.defaultPrevented }
      })).toEqual({ dispatched: false, prevented: true })

      await page.getByRole('button', { name: 'Guardar detalles' }).click()
      await pwExpect(page.getByText('No se pudo guardar').first()).toBeVisible()
      await page.getByRole('button', { name: 'Publicar revisión' }).click()
      await pwExpect(page.getByRole('region', { name: 'Publicar una revisión' }).getByRole('status')).toContainText('Guarda los cambios pendientes antes de asignar o publicar.')
      expect(await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true })
        return { dispatched: window.dispatchEvent(event), prevented: event.defaultPrevented }
      })).toEqual({ dispatched: false, prevented: true })
    } finally { await page.close() }
  })

  it('guards an already-open assignment form when details become dirty', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await page.getByRole('button', { name: 'Enviar a un cliente' }).click()
      const assignment = page.getByRole('region', { name: 'Enviar como rutina profesional' })
      await assignment.getByLabel('Cliente del acompañamiento').selectOption('relationship-a')
      await page.getByLabel('Descripción de la rutina').fill('Progresión pendiente')
      await assignment.getByRole('button', { name: 'Enviar propuesta bloqueada' }).click()

      await pwExpect(assignment.getByRole('status')).toContainText('Guarda los cambios pendientes antes de asignar o publicar.')
      expect(await page.evaluate(() => (window as Window & { __ASSIGNMENT_ACTIONS__?: unknown[] }).__ASSIGNMENT_ACTIONS__ ?? [])).toHaveLength(0)
    } finally { await page.close() }
  })

  it('shares active-day save state with publication guards and clears it after save', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await page.getByText('Editar día', { exact: true }).click()
      const workout = page.getByRole('group', { name: 'Editar día Día A' })
      await workout.getByRole('textbox', { name: 'Nombre' }).fill('Día de fuerza')
      await pwExpect(workout.getByText('Cambios pendientes')).toBeVisible()
      await page.getByRole('button', { name: 'Publicar revisión' }).click()
      await pwExpect(page.locator('#publish-program-revision-form')).toHaveCount(0)

      await workout.getByRole('button', { name: 'Guardar día' }).click()
      await pwExpect(workout.getByText('Todo guardado')).toBeVisible()
      await page.getByRole('button', { name: 'Publicar revisión' }).click()
      await pwExpect(page.locator('#publish-program-revision-form')).toBeVisible()
    } finally { await page.close() }
  })

  it('blocks both professional actions while a prescription draft is dirty', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()
      const exercise = page.getByRole('group', { name: 'Editar ejercicio Sentadilla' })
      await exercise.getByLabel('Series').fill('5')
      await exercise.getByLabel('Notas').fill('Progresión pendiente')
      await pwExpect(exercise.getByText('Cambios pendientes')).toBeVisible()
      expect(await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true })
        return { dispatched: window.dispatchEvent(event), prevented: event.defaultPrevented }
      })).toEqual({ dispatched: false, prevented: true })

      for (const actionName of ['Enviar a un cliente', 'Publicar revisión']) {
        await page.getByRole('button', { name: actionName }).click()
        const actionRegion = page.getByRole('region', { name: actionName === 'Enviar a un cliente' ? 'Enviar como rutina profesional' : 'Publicar una revisión' })
        await pwExpect(actionRegion.getByRole('status')).toContainText('Guarda los cambios pendientes antes de asignar o publicar.')
      }
    } finally { await page.close() }
  })

  it('preserves prescription values and dirty state across active-day tab switches', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()
      let exercise = page.getByRole('group', { name: 'Editar ejercicio Sentadilla' })
      await exercise.getByLabel('Series').fill('6')
      await exercise.getByLabel('RPE').fill('9')
      await exercise.getByLabel('Notas').fill('Mantener técnica')

      await page.getByRole('tab', { name: /Día B/ }).click()
      await page.getByRole('tab', { name: /Día A/ }).click()
      exercise = page.getByRole('group', { name: 'Editar ejercicio Sentadilla' })
      await pwExpect(exercise).toBeVisible()
      await pwExpect(exercise.getByLabel('Series')).toHaveValue('6')
      await pwExpect(exercise.getByLabel('RPE')).toHaveValue('9')
      await pwExpect(exercise.getByLabel('Notas')).toHaveValue('Mantener técnica')
      await pwExpect(exercise.getByText('Cambios pendientes')).toBeVisible()
    } finally { await page.close() }
  })

  it('clears the prescription guard after an explicit successful save', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()
      const exercise = page.getByRole('group', { name: 'Editar ejercicio Sentadilla' })
      await exercise.getByLabel('Repeticiones').fill('12')
      await exercise.getByRole('button', { name: 'Guardar ejercicio' }).click()
      await pwExpect(exercise).toHaveCount(0)
      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()
      await pwExpect(page.getByRole('group', { name: 'Editar ejercicio Sentadilla' }).getByLabel('Repeticiones')).toHaveValue('12')
      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()

      await page.getByRole('button', { name: 'Enviar a un cliente' }).click()
      await pwExpect(page.locator('#assign-program-form')).toBeVisible()
    } finally { await page.close() }
  })

  it('reconciles a successful prescription draft to canonical refreshed values', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()
      let exercise = page.getByRole('group', { name: 'Editar ejercicio Sentadilla' })
      await exercise.getByLabel('Series').fill('05')
      await exercise.getByLabel('Repeticiones').fill('012')
      await exercise.getByLabel('Peso (kg)').fill('082.50')
      await exercise.getByLabel('RPE').fill('8.0')
      await exercise.getByLabel('Descanso (seg.)').fill('075')
      await exercise.getByLabel('Notas').fill('   ')
      await exercise.getByRole('button', { name: 'Guardar ejercicio' }).click()
      await pwExpect(exercise).toHaveCount(0)

      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()
      exercise = page.getByRole('group', { name: 'Editar ejercicio Sentadilla' })
      await pwExpect(exercise.getByLabel('Series')).toHaveValue('5')
      await pwExpect(exercise.getByLabel('Repeticiones')).toHaveValue('12')
      await pwExpect(exercise.getByLabel('Peso (kg)')).toHaveValue('82.5')
      await pwExpect(exercise.getByLabel('RPE')).toHaveValue('8')
      await pwExpect(exercise.getByLabel('Descanso (seg.)')).toHaveValue('75')
      await pwExpect(exercise.getByLabel('Notas')).toHaveValue('')
    } finally { await page.close() }
  })

  it('shows a conflicting refreshed server prescription instead of the saved draft', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?prescription=concurrent`)
      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()
      let exercise = page.getByRole('group', { name: 'Editar ejercicio Sentadilla' })
      await exercise.getByLabel('Repeticiones').fill('12')
      await exercise.getByLabel('Notas').fill('Propuesta enviada')
      await exercise.getByRole('button', { name: 'Guardar ejercicio' }).click()
      await pwExpect(exercise).toHaveCount(0)

      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()
      exercise = page.getByRole('group', { name: 'Editar ejercicio Sentadilla' })
      await pwExpect(exercise.getByLabel('Repeticiones')).toHaveValue('15')
      await pwExpect(exercise.getByLabel('Notas')).toHaveValue('Ajuste externo')
    } finally { await page.close() }
  })

  it('keeps a failed prescription save guarded with its draft intact', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?prescription=error`)
      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()
      const exercise = page.getByRole('group', { name: 'Editar ejercicio Sentadilla' })
      await exercise.getByLabel('Peso (kg)').fill('82.5')
      await exercise.getByRole('button', { name: 'Guardar ejercicio' }).click()
      await pwExpect(exercise.getByText('No se pudo guardar')).toBeVisible()
      await pwExpect(exercise.getByLabel('Peso (kg)')).toHaveValue('82.5')

      await page.getByRole('button', { name: 'Publicar revisión' }).click()
      await pwExpect(page.locator('#publish-program-revision-form')).toHaveCount(0)
      await pwExpect(page.getByRole('region', { name: 'Publicar una revisión' }).getByRole('status')).toContainText('Guarda los cambios pendientes antes de asignar o publicar.')
    } finally { await page.close() }
  })

  it('blocks actions during a prescription save and clears the guard after success', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?prescription=hold`)
      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()
      const exercise = page.getByRole('group', { name: 'Editar ejercicio Sentadilla' })
      await exercise.getByLabel('Descanso (seg.)').fill('75')
      await exercise.getByRole('button', { name: 'Guardar ejercicio' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __RESOLVE_EXERCISE_SAVE__?: () => void }).__RESOLVE_EXERCISE_SAVE__))
      await pwExpect(exercise.getByText('Guardando…')).toBeVisible()

      await page.getByRole('button', { name: 'Enviar a un cliente' }).click()
      await pwExpect(page.locator('#assign-program-form')).toHaveCount(0)
      await page.evaluate(() => (window as Window & { __RESOLVE_EXERCISE_SAVE__?: () => void }).__RESOLVE_EXERCISE_SAVE__?.())
      await pwExpect(exercise).toHaveCount(0)
      await page.getByRole('button', { name: 'Enviar a un cliente' }).click()
      await pwExpect(page.locator('#assign-program-form')).toBeVisible()
    } finally { await page.close() }
  })

  it('clears an obsolete prescription guard after exercise deletion is reconciled', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?refresh=stale`)
      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()
      await page.getByRole('group', { name: 'Editar ejercicio Sentadilla' }).getByLabel('Series').fill('7')
      page.once('dialog', dialog => void dialog.accept())
      await page.getByRole('button', { name: 'Eliminar Sentadilla' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'delete-exercise')))
      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      await pwExpect(page.getByRole('button', { name: 'Editar Sentadilla' })).toHaveCount(0)

      await page.getByRole('button', { name: 'Publicar revisión' }).click()
      await pwExpect(page.locator('#publish-program-revision-form')).toBeVisible()
    } finally { await page.close() }
  })

  it('clears obsolete prescription drafts when their whole day is reconciled away', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?refresh=stale`)
      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()
      await page.getByRole('group', { name: 'Editar ejercicio Sentadilla' }).getByLabel('Notas').fill('Descartar con el día')
      page.once('dialog', dialog => void dialog.accept())
      await page.getByRole('button', { name: 'Eliminar día' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'delete-workout')))
      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      await pwExpect(page.getByRole('tab', { name: /Día A/ })).toHaveCount(0)

      await page.getByRole('button', { name: 'Enviar a un cliente' }).click()
      await pwExpect(page.locator('#assign-program-form')).toBeVisible()
    } finally { await page.close() }
  })

  it('clears a removed day dirty state after the structural deletion is reconciled', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?refresh=stale`)
      await page.getByText('Editar día', { exact: true }).click()
      await page.getByRole('group', { name: 'Editar día Día A' }).getByRole('textbox', { name: 'Nombre' }).fill('Día descartado')

      page.once('dialog', dialog => void dialog.accept())
      await page.getByRole('button', { name: 'Eliminar día' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'delete-workout')))
      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      await pwExpect(page.getByRole('tab', { name: /Día A/ })).toHaveCount(0)

      await page.getByRole('button', { name: 'Publicar revisión' }).click()
      await pwExpect(page.locator('#publish-program-revision-form')).toBeVisible()
    } finally { await page.close() }
  })

  it('renders complete relationship, assignment, and nested exercise metadata inside the workspace', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await pwExpect(page.getByText('Piernas · Barra', { exact: true }).first()).toBeVisible()

      await page.getByRole('button', { name: 'Enviar a un cliente' }).click()
      await pwExpect(page.getByLabel('Cliente del acompañamiento').getByRole('option')).toHaveText([
        'Selecciona una relación activa',
        'Entrenamiento personal · iniciado 24 ago 2026 · ref. relationship-a',
        'Entrenamiento personal · iniciado 10 ago 2026 · ref. relationship-b',
      ])

      await page.getByRole('button', { name: 'Publicar revisión' }).click()
      await pwExpect(page.locator('#publish-program-revision-form select[name="assignmentId"] option')).toHaveText([
        'Selecciona una asignación activa',
        'Entrenamiento personal · asignación assignment-a',
        'Entrenamiento personal · asignación assignment-b',
      ])
    } finally { await page.close() }
  })

  it('locks template metadata to the submitted snapshot while save is pending', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?save=hold`)
      const name = page.getByLabel('Nombre de la rutina')
      await name.fill('Fuerza en progreso')
      await page.getByRole('button', { name: 'Guardar detalles' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __RESOLVE_TEMPLATE_SAVE__?: () => void }).__RESOLVE_TEMPLATE_SAVE__))

      await pwExpect(name).toBeDisabled()
      await page.evaluate(() => (window as Window & { __RESOLVE_TEMPLATE_SAVE__?: () => void }).__RESOLVE_TEMPLATE_SAVE__?.())
      await pwExpect(name).toBeEnabled()
      await pwExpect(page.getByRole('region', { name: 'Fuerza' }).getByText('Todo guardado')).toBeVisible()
    } finally { await page.close() }
  })

  it('creates a day with a localized weekday and an internally computed order', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await page.getByRole('button', { name: 'Agregar día' }).click()
      const form = page.getByRole('form', { name: 'Agregar día' })
      await form.getByLabel('Nombre del día').fill('Día C')
      await form.getByLabel('Día de la semana').selectOption({ label: 'Viernes' })
      await expect(form.getByLabel(/Orden/).count()).resolves.toBe(0)
      await form.getByRole('button', { name: 'Agregar día' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'create-workout')))
      await pwExpect(page.getByRole('tab', { name: /Día C/ })).toBeVisible()
      await pwExpect(page.getByRole('button', { name: 'Agregar día' })).toHaveCount(0)

      expect((await page.evaluate(() => (window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__))?.at(-1)).toEqual({
        action: 'create-workout',
        fields: {
          templateId: '11111111-1111-4111-8111-111111111111',
          name: 'Día C',
          dayOfWeek: '5',
          orderInPlan: '3',
        },
      })
    } finally { await page.close() }
  })

  it('keeps day creation pending until refreshed props add the day', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?refresh=stale`)
      await page.getByRole('button', { name: 'Agregar día' }).click()
      const form = page.getByRole('form', { name: 'Agregar día' })
      await form.getByLabel('Nombre del día').fill('Día C')
      await form.getByRole('button', { name: 'Agregar día' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'create-workout')))

      const addDay = page.getByRole('button', { name: 'Agregar día' })
      await pwExpect(addDay).toBeDisabled()
      expect((await page.evaluate(() => (window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__ ?? [])).filter(call => call.action === 'create-workout')).toHaveLength(1)

      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      await pwExpect(page.getByRole('tab', { name: /Día C/ })).toBeVisible()
      await pwExpect(addDay).toHaveCount(0)
    } finally { await page.close() }
  })

  it('keeps day reorder pending and non-optimistic until refreshed order arrives', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?refresh=stale`)
      const dayTabs = page.getByRole('tab')
      await page.getByRole('button', { name: 'Bajar Día A' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'reorder-workouts')))

      await pwExpect(page.getByRole('button', { name: 'Bajar Día A' })).toBeDisabled()
      await pwExpect(dayTabs.first()).toContainText('Día A')

      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      await pwExpect(dayTabs.first()).toContainText('Día B')
      await pwExpect(page.getByRole('button', { name: 'Subir Día A' })).toBeEnabled()
    } finally { await page.close() }
  })

  it('shows one active day and switches panels with tab semantics', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await pwExpect(page.getByRole('tab', { name: /Día A/ })).toHaveAttribute('aria-selected', 'true')
      await pwExpect(page.getByRole('tabpanel', { name: /Día A/ })).toBeVisible()
      await page.getByRole('tab', { name: /Día B/ }).click()
      await pwExpect(page.getByRole('tabpanel', { name: /Día B/ })).toBeVisible()
      await pwExpect(page.getByRole('tabpanel', { name: /Día A/ })).toHaveCount(0)
    } finally { await page.close() }
  })

  it('keeps a failed multi-selection and retries the same batch', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?batch=retry`)
      await page.getByRole('button', { name: 'Agregar varios ejercicios' }).click()
      const dialog = page.getByRole('dialog', { name: 'Agregar ejercicios' })
      await dialog.getByRole('button', { name: /Prensa/ }).click()
      await dialog.getByRole('button', { name: /Gemelos/ }).click()
      await pwExpect(dialog.getByText('Valores iniciales: 3 × 10 · RPE 7 · 60 s')).toBeVisible()
      await dialog.getByRole('button', { name: 'Agregar 2 ejercicios' }).click()
      await pwExpect(dialog).toBeVisible()
      await pwExpect(dialog.getByRole('alert')).toContainText('No se pudieron agregar los ejercicios.')
      await dialog.getByRole('button', { name: 'Agregar 2 ejercicios' }).click()
      await pwExpect(dialog).toBeHidden()
      const calls = await page.evaluate(() => (window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__ ?? [])
      const batches = calls.filter(call => call.action === 'add-exercises')
      expect(batches).toHaveLength(2)
      expect(batches[0].fields.exerciseId).toEqual(['66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777'])
      expect(batches[1].fields.exerciseId).toEqual(batches[0].fields.exerciseId)
    } finally { await page.close() }
  })

  it('submits two consecutive batches without an order field', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      for (const exerciseName of ['Prensa', 'Gemelos']) {
        await page.getByRole('button', { name: 'Agregar varios ejercicios' }).click()
        const dialog = page.getByRole('dialog', { name: 'Agregar ejercicios' })
        await dialog.getByRole('button', { name: new RegExp(exerciseName) }).click()
        await dialog.getByRole('button', { name: 'Agregar 1 ejercicio' }).click()
        await pwExpect(dialog).toBeHidden()
      }
      const calls = await page.evaluate(() => (window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__ ?? [])
      const batches = calls.filter(call => call.action === 'add-exercises')
      expect(batches).toHaveLength(2)
      expect(batches.every(call => call.fields.orderIndex === undefined)).toBe(true)
      await pwExpect(page.getByText('3. Prensa', { exact: true })).toBeVisible()
      await pwExpect(page.getByText('4. Gemelos', { exact: true })).toBeVisible()
      await pwExpect(page.getByRole('tab', { name: /Día A/ })).toContainText('4 ejercicios')
      await pwExpect(page.getByText('26 espacios disponibles')).toBeVisible()
    } finally { await page.close() }
  })

  it('keeps a successful batch pending until refreshed exercises become visible', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?refresh=stale`)
      await page.getByRole('button', { name: 'Agregar varios ejercicios' }).click()
      const dialog = page.getByRole('dialog', { name: 'Agregar ejercicios' })
      await dialog.getByRole('button', { name: /Prensa/ }).click()
      await dialog.getByRole('button', { name: 'Agregar 1 ejercicio' }).click()
      await pwExpect(dialog).toBeHidden()

      const addBatch = page.getByRole('button', { name: 'Agregar varios ejercicios' })
      await pwExpect(addBatch).toBeDisabled()
      await pwExpect(page.locator('[data-template-exercise-id]')).toHaveCount(2)

      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      await pwExpect(page.locator('[data-template-exercise-id]')).toHaveCount(3)
      await pwExpect(page.getByText('3. Prensa', { exact: true })).toBeVisible()
      await pwExpect(addBatch).toBeEnabled()
      await pwExpect(page.getByText('27 espacios disponibles')).toBeVisible()
    } finally { await page.close() }
  })

  it('keeps exercise reorder pending and non-optimistic until refreshed order arrives', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?refresh=stale`)
      const exerciseIds = page.locator('[data-template-exercise-id]')
      const before = await exerciseIds.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-template-exercise-id')))
      await page.getByRole('button', { name: 'Bajar Sentadilla' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'reorder-exercises')))

      await pwExpect(page.getByRole('button', { name: 'Bajar Sentadilla' })).toBeDisabled()
      expect(await exerciseIds.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-template-exercise-id')))).toEqual(before)

      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      expect(await exerciseIds.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-template-exercise-id')))).toEqual([...before].reverse())
      await pwExpect(page.getByRole('button', { name: 'Subir Sentadilla' })).toBeEnabled()
    } finally { await page.close() }
  })

  it('preserves an active-day structural pending state across tab switches', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?refresh=stale`)
      await page.getByRole('button', { name: 'Bajar Sentadilla' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'reorder-exercises')))
      await pwExpect(page.getByRole('button', { name: 'Bajar Sentadilla' })).toBeDisabled()

      await page.getByRole('tab', { name: /Día B/ }).click()
      await page.getByRole('tab', { name: /Día A/ }).click()
      await pwExpect(page.getByRole('button', { name: 'Bajar Sentadilla' })).toBeDisabled()

      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      await pwExpect(page.getByRole('button', { name: 'Subir Sentadilla' })).toBeEnabled()
    } finally { await page.close() }
  })

  it('serializes reorder, append, and delete mutations of the active exercise list', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?refresh=stale`)
      await page.getByRole('button', { name: 'Bajar Sentadilla' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'reorder-exercises')))

      await pwExpect(page.getByRole('button', { name: 'Eliminar Sentadilla' })).toBeDisabled()
      await pwExpect(page.getByRole('button', { name: 'Agregar varios ejercicios' })).toBeDisabled()
      const overlapCalls = await page.evaluate(() => (window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__ ?? [])
      expect(overlapCalls.filter(call => call.action === 'delete-exercise' || call.action === 'add-exercises')).toHaveLength(0)

      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      await pwExpect(page.getByRole('button', { name: 'Eliminar Sentadilla' })).toBeEnabled()
      await pwExpect(page.getByRole('button', { name: 'Agregar varios ejercicios' })).toBeEnabled()

      await page.getByRole('button', { name: 'Agregar varios ejercicios' }).click()
      const dialog = page.getByRole('dialog', { name: 'Agregar ejercicios' })
      await dialog.getByRole('button', { name: /Prensa/ }).click()
      await dialog.getByRole('button', { name: 'Agregar 1 ejercicio' }).click()
      await pwExpect(dialog).toBeHidden()
      await pwExpect(page.getByRole('button', { name: 'Subir Sentadilla' })).toBeDisabled()
      await pwExpect(page.getByRole('button', { name: 'Eliminar Sentadilla' })).toBeDisabled()

      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      await pwExpect(page.getByRole('button', { name: 'Subir Sentadilla' })).toBeEnabled()
      await pwExpect(page.getByRole('button', { name: 'Eliminar Prensa' })).toBeEnabled()

      page.once('dialog', confirmation => void confirmation.accept())
      await page.getByRole('button', { name: 'Eliminar Prensa' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'delete-exercise')))
      await pwExpect(page.getByRole('button', { name: 'Subir Sentadilla' })).toBeDisabled()
      await pwExpect(page.getByRole('button', { name: 'Agregar varios ejercicios' })).toBeDisabled()

      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      await pwExpect(page.getByRole('button', { name: 'Subir Sentadilla' })).toBeEnabled()
      await pwExpect(page.getByRole('button', { name: 'Agregar varios ejercicios' })).toBeEnabled()
      await pwExpect(page.getByRole('button', { name: 'Eliminar Prensa' })).toHaveCount(0)
    } finally { await page.close() }
  })

  it('serializes day reorder and deletion until refreshed workout props settle', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?refresh=stale`)
      await page.getByRole('button', { name: 'Bajar Día A' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'reorder-workouts')))
      await pwExpect(page.getByRole('button', { name: 'Eliminar día' })).toBeDisabled()

      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      await pwExpect(page.getByRole('button', { name: 'Eliminar día' })).toBeEnabled()

      page.once('dialog', confirmation => void confirmation.accept())
      await page.getByRole('button', { name: 'Eliminar día' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'delete-workout')))
      await pwExpect(page.getByRole('button', { name: 'Subir Día A' })).toBeDisabled()

      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      await pwExpect(page.getByRole('tab', { name: /Día A/ })).toHaveCount(0)
      await pwExpect(page.getByRole('button', { name: 'Agregar día' })).toBeEnabled()
    } finally { await page.close() }
  })

  it('keeps exercise deletion pending until refreshed props remove the card', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?refresh=stale`)
      page.once('dialog', dialog => void dialog.accept())
      const deleteExercise = page.getByRole('button', { name: 'Eliminar Sentadilla' })
      await deleteExercise.click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'delete-exercise')))

      await pwExpect(deleteExercise).toBeDisabled()
      await pwExpect(page.locator('[data-template-exercise-id="33333333-3333-4333-8333-333333333333"]')).toBeVisible()

      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      await pwExpect(page.locator('[data-template-exercise-id="33333333-3333-4333-8333-333333333333"]')).toHaveCount(0)
    } finally { await page.close() }
  })

  it('keeps day deletion pending until refreshed props remove the day', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?refresh=stale`)
      page.once('dialog', dialog => void dialog.accept())
      const deleteDay = page.getByRole('button', { name: 'Eliminar día' })
      await deleteDay.click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'delete-workout')))

      await pwExpect(deleteDay).toBeDisabled()
      await pwExpect(page.getByRole('tabpanel', { name: /Día A/ })).toBeVisible()

      await page.evaluate(() => (window as Window & { __PROGRAM_APPLY_SERVER_STATE__?: () => void }).__PROGRAM_APPLY_SERVER_STATE__?.())
      await pwExpect(page.getByRole('tab', { name: /Día A/ })).toHaveCount(0)
      await pwExpect(page.getByRole('tabpanel', { name: /Día B/ })).toBeVisible()
    } finally { await page.close() }
  })

  it('keeps the confirmed order when a structural reorder fails', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?reorder=error`)
      const before = await page.locator('[data-template-exercise-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-template-exercise-id')))
      await page.getByRole('button', { name: 'Bajar Sentadilla' }).click()
      await pwExpect(page.getByRole('status')).toContainText('No se pudo actualizar el orden.')
      await pwExpect(page.getByRole('button', { name: 'Bajar Sentadilla' })).toBeEnabled()
      const after = await page.locator('[data-template-exercise-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-template-exercise-id')))
      expect(after).toEqual(before)
    } finally { await page.close() }
  })

  it('keeps structural order out of descriptive and prescription forms', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await page.getByText('Editar día', { exact: true }).click()
      const workout = page.getByRole('group', { name: 'Editar día Día A' })
      await workout.getByRole('button', { name: 'Guardar día' }).click()
      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()
      const exercise = page.getByRole('group', { name: 'Editar ejercicio Sentadilla' })
      await exercise.getByRole('button', { name: 'Guardar ejercicio' }).click()
      await page.waitForFunction(() => ((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__ ?? []).filter(call => call.action.startsWith('update-')).length === 2)

      const calls = await page.evaluate(() => (window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__ ?? [])
      expect(calls).toEqual([
        { action: 'update-workout', fields: { templateWorkoutId: '22222222-2222-4222-8222-222222222222', name: 'Día A', dayOfWeek: '1' } },
        { action: 'update-exercise', fields: { templateExerciseId: '33333333-3333-4333-8333-333333333333', exerciseId: '44444444-4444-4444-8444-444444444444', sets: '3', reps: '10', weightKg: '', targetRpe: '7', restSeconds: '60', notes: '' } },
      ])
    } finally { await page.close() }
  })
})
