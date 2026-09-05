# Mobile Navigation and Account Workspace Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limpiar la navegación autenticada de Vekira separando los destinos principales del cambio Personal/Entrenador, con un menú de cuenta persistente, profesional y coherente en móvil y escritorio.

**Architecture:** El layout autenticado cargará una sola vez un modelo serializable de identidad, preferencia y acceso, y AccountWorkspaceProvider resolverá el espacio presentado a partir de la ruta actual. BottomNav, DesktopSidebar y todos los disparadores consumirán ese mismo contexto; la Server Action seguirá siendo la única que valida acceso y escribe la cookie. El menú reutilizará Dialog como hoja móvil y DropdownMenu como panel anclado de escritorio, sin dependencias nuevas ni cambios de base de datos.

**Tech Stack:** Next.js 14 App Router y Server Actions, React 18, TypeScript 5, Tailwind CSS 3, Radix Dialog/DropdownMenu/Avatar, Vitest 4, Playwright/Chromium.

**Spec:** docs/superpowers/specs/2026-09-05-mobile-navigation-workspace-switcher-design.md

## Global Constraints

- La ejecución debe comenzar invocando superpowers:using-git-worktrees; no implementar directamente sobre main.
- Seguir TDD en cada tarea: escribir la prueba, confirmar el fallo correcto, implementar lo mínimo, confirmar el pase y crear únicamente entonces el commit indicado.
- Personal conserva exactamente cinco destinos y Entrenador exactamente cuatro; WorkspaceSwitcher no puede seguir dentro de BottomNav.
- `/coaching` sale de BottomNav pero conserva una entrada estable `Mi acompañamiento` en el menú Personal; no puede depender de que ya exista un plan asignado.
- Personal y Entrenador son espacios de la misma cuenta autenticada, nunca cuentas o permisos nuevos.
- resolvePresentedWorkspace es la única fuente cliente del espacio presentado y aplica, en orden, acceso, ruta profesional, ruta personal y preferencia para rutas compartidas o desconocidas.
- Visitar una URL directamente no reescribe vekira_workspace; solo el selector puede cambiar la cookie.
- La cookie nunca concede acceso. Los guards de /coach, las Server Actions, los grants y RLS permanecen como autoridad.
- setWorkspace debe devolver WorkspaceChangeResult y usar router.replace en el cliente. invalid_workspace y coach_unavailable nunca intentan escribir; cualquier fallo anterior a cookies().set tampoco muta, y la action nunca devuelve deliberadamente un error después de una escritura confirmada. El proxy cliente tolera `undefined` únicamente como redirect de autenticación ya gestionado por Next 14.2, sin segundo replace ni error falso.
- /session/**, /plans/generate y /feed/new ocultan barra y menú de cuenta; /entrenar continúa siendo solo un redirect.
- El disparador, enlaces y botones mantienen objetivos mínimos de 44 por 44 píxeles, foco visible, texto e icono para el estado y anuncios aria-live.
- La hoja móvil debe atrapar foco, cerrar con Escape, devolver foco al disparador, respetar safe area inferior y permitir scroll vertical.
- El botón Atrás de Android debe cerrar primero tanto la hoja móvil como el menú de escritorio/tablet; no puede navegar mientras uno de esos portales esté abierto.
- Durante un cambio de espacio pendiente quedan bloqueados selector, enlaces de cuenta y cierre de sesión para impedir que el resultado tardío sobrescriba otra acción.
- Validar 320×800, 360×800, 390×844, 412×915 y escritorio desde 1280 px; Entrenar debe quedar a no más de 2 px del centro horizontal.
- Las etiquetas visibles no pueden depender de truncate; a 320 px pueden usar font-display, pero nunca menos de 10 px ni ocultar texto.
- Conservar byte por byte la instantánea persistida de un entrenamiento activo durante el cambio de espacio.
- Añadir todas las copias nuevas al catálogo español/inglés existente.
- No instalar paquetes, crear migraciones Supabase, modificar esquemas, relajar autorización, incorporar Administración ni renombrar rutas.
- La validación local no demuestra deployment, sesión Supabase remota ni dispositivo físico; reportar esas fronteras por separado.

## File Map

**Create — domain and provider**

- src/components/navigation/workspacePresentation.ts — clasificación segura de familias y resolución única del espacio presentado.
- src/components/navigation/WorkspaceNavigationGuard.ts — evento cancelable de intención y hook compartido para superficies con cambios pendientes.
- src/components/navigation/AccountWorkspaceContext.tsx — tipos y hooks livianos del chrome, sin importar Server Actions.
- src/components/navigation/AccountWorkspaceProvider.tsx — modelo serializable, espacio/ruta inmersiva presentados, estado de transición, navegación replace y contexto del chrome.
- src/components/navigation/AccountWorkspaceTrigger.tsx — botón de avatar/badge en variantes compact, dashboard y sidebar.
- src/components/navigation/AccountWorkspaceMenu.tsx — cuerpo compartido, hoja móvil y panel de escritorio.
- src/lib/native/androidBackOverlay.ts — detección y cierre común de dialog/alertdialog/menu para el listener Android.

**Create — focused tests and fixtures**

- src/components/navigation/__tests__/workspacePresentation.test.ts — matriz acceso/ruta/preferencia y límites de prefijo.
- src/components/navigation/__tests__/AccountWorkspaceProvider.test.ts — orquestación pura de intención, action, replace, refresh y error.
- src/components/navigation/__tests__/AccountWorkspaceMenu.test.tsx — identidad, selector, enlaces, accesibilidad e i18n.
- src/components/navigation/__tests__/FixedTopBarAccountSlot.test.tsx — modos default, hidden y custom y composición de acciones.
- src/components/navigation/__tests__/AccountWorkspaceRouteCoverage.test.ts — contrato estructural de todas las familias estándar e inmersivas.
- src/components/navigation/__tests__/AccountWorkspaceResponsive.test.ts — aceptación real en Chromium, geometría, teclado, historial y persistencia.
- src/components/navigation/__tests__/fixtures/accountWorkspace.html — documento aislado de la aceptación visual.
- src/components/navigation/__tests__/fixtures/accountWorkspace.fixture.tsx — superficies personal, coach, dashboard, topbar e inmersiva.
- src/components/navigation/__tests__/fixtures/nextNavigation.fixture.ts — pathname reactivo y registro de replace/refresh para Chromium.
- src/components/navigation/__tests__/fixtures/nextLink.fixture.tsx — enlace forwardRef compatible con Radix asChild y navegación lógica del fixture.
- src/components/navigation/__tests__/fixtures/workspaceAction.fixture.ts — action controlable para éxito, latencia y errores.
- src/lib/native/__tests__/androidBackOverlay.test.ts — prioridad de overlays para Atrás de Android.

**Modify — domain and server boundary**

- src/lib/coaching/workspace.ts — tipos WorkspaceChangeResult y WorkspaceDestination, sin cambiar normalizeWorkspace.
- src/components/navigation/appNavigation.ts — cuatro destinos profesionales y tipos/iconos reducidos.
- src/app/actions/workspace.ts — resultado discriminado y escritura solo en éxito.
- src/app/actions/__tests__/workspace.test.ts — contrato de autenticación, errores, cookie y revalidación.
- src/lib/coaching/__tests__/workspace.test.ts — regresión explícita de que la preferencia no concede acceso.
- src/components/navigation/__tests__/appNavigation.test.ts — orden 5/4 y aria-current correcto.

**Modify — shell and account chrome**

- src/app/(app)/layout.tsx — carga única del modelo serializable y ambos conjuntos de navegación.
- src/app/(app)/__tests__/layout.test.tsx — límites del modelo pasado al cliente.
- src/components/navigation/AppShell.tsx — provider único alrededor del chrome.
- src/components/navigation/BottomNav.tsx — solo destinos, grid 5/4 y dock condicionado por espacio resuelto.
- src/components/navigation/DesktopSidebar.tsx — bloque de cuenta inferior en lugar del selector aislado.
- src/components/navigation/__tests__/DesktopSidebar.test.tsx — bloque de cuenta, home contextual y nav separado.
- src/components/navigation/__tests__/AppChromeSurface.test.tsx — superficie visual y ausencia del sexto control.
- src/components/navigation/__tests__/ActiveWorkoutDock.test.tsx — visibilidad Personal/Entrenador sin resolver ni borrar la sesión persistida.
- src/lib/native/useAndroidBack.ts — delegar el ramo de overlay al helper que también reconoce role=menu.
- src/components/navigation/WorkspaceSwitcher.tsx — eliminar después de migrar consumidores.

**Modify — top bars and route integration**

- src/components/navigation/FixedTopBar.tsx — accountSlot default, hidden o custom, región actions y exclusión route-aware de flujos inmersivos.
- src/components/navigation/PageTopBar.tsx — composición del control compacto mediante la región actions.
- src/components/feedback/RouteLoading.tsx — excluir el disparador en el loading inmersivo de sesión y heredarlo en loadings estándar.
- src/components/feedback/__tests__/routeLoading.test.ts — alinear el loading de Dashboard con el avatar de cuenta real y cubrir la exclusión inmersiva.
- src/app/(app)/loading.tsx — retirar el avatar ficticio; el FixedTopBar decide por pathname si muestra el control real durante la carga.
- src/components/navigation/__tests__/pendingLinkRscBoundary.test.tsx — preservar límites serializables de RSC.
- src/components/dashboard/DashboardHeader.tsx — avatar como disparador, campana conservada y engranaje eliminado.
- src/components/dashboard/__tests__/DashboardHeader.test.tsx — apertura de cuenta sin input de archivo.
- src/lib/dashboard/__tests__/DashboardPage.integration.test.tsx — retirar la expectativa obsoleta del engranaje y conservar el límite sin perfil social.
- src/components/session/SessionHeader.tsx — accountSlot hidden.
- src/components/session/__tests__/SessionHeader.test.ts — preservar controles y exclusión inmersiva.
- src/app/(app)/plans/generate/page.tsx — accountSlot hidden.
- src/app/(app)/feed/new/page.tsx — accountSlot hidden.
- src/app/(app)/feed/page.tsx — agrupar sus acciones y el disparador sin colisión.
- src/components/chat/ChatContainer.tsx — agrupar controles y disparador en sus dos encabezados.
- src/app/(app)/exercises/page.tsx — colocar el disparador en la primera fila del toolbar multinivel.
- src/components/coaching/TrainerDirectory.tsx — disparador dentro de su header existente.
- src/components/coaching/TrainerPublicProfile.tsx — disparador dentro del header de perfil.
- src/app/(app)/coaching/page.tsx — disparador junto al encabezado Acompañamiento en éxito y error.
- src/components/settings/__tests__/profileSettings.test.tsx — confirmar que AvatarUploader sigue en /settings/perfil.
- src/lib/i18n/index.ts — copias ES/EN del menú y estados.

**Modify — dirty-state and browser infrastructure**

- src/components/coaching/ProgramTemplateEditor.tsx — usar WorkspaceNavigationGuard en lugar del hook local.
- src/components/coaching/__tests__/programTemplateEditor.test.tsx — cancelar/confirmar cambio antes de la action.
- src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.fixture.tsx — menú de cuenta real alrededor del editor.
- src/components/coaching/__tests__/fixtures/nextNavigation.fixture.ts — representar rutas por superficie y registrar replace sin romper push/refresh existentes.
- src/components/coaching/__tests__/fixtures/workspace.fixture.ts — stub async de WorkspaceChangeResult.
- src/components/coaching/__tests__/fixtures/trainerAccessibility.fixture.tsx — migrar AppShell y retirar WorkspaceSwitcher.
- src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts — mantener la superficie workspace sobre el menú nuevo.
- vitest.config.ts — registrar únicamente AccountWorkspaceResponsive.test.ts en browser-fixtures.

---

## Task 1: Establish the single presentation and navigation contract

**Files:**

- Create: src/components/navigation/workspacePresentation.ts
- Create: src/components/navigation/__tests__/workspacePresentation.test.ts
- Modify: src/components/navigation/appNavigation.ts
- Modify: src/components/navigation/__tests__/appNavigation.test.ts
- Modify: src/lib/coaching/__tests__/workspace.test.ts

**Interfaces:**

- Consumes: Workspace de src/lib/coaching/workspace.ts y AppNavItem del módulo actual.
- Produces: WorkspaceRouteKind, IMMERSIVE_ROUTE_PREFIXES, isRouteWithinPrefix(pathname, prefix), isImmersiveWorkspaceRoute(pathname), classifyWorkspaceRoute(pathname) y resolvePresentedWorkspace({ pathname, preferredWorkspace, trainerAccess }).

- [ ] **Step 1: Write the failing route-resolution tests**

Crear el archivo nuevo con la matriz completa:

~~~ts
import { describe, expect, it } from 'vitest'
import {
  PERSONAL_ROUTE_PREFIXES,
  classifyWorkspaceRoute,
  isImmersiveWorkspaceRoute,
  isRouteWithinPrefix,
  resolvePresentedWorkspace,
} from '../workspacePresentation'

const personalFamilies = [
  '/dashboard', '/plan', '/plans', '/entrenar', '/session', '/progress',
  '/feed', '/trainers', '/coaching', '/calendario', '/history', '/medidas',
  '/exercises', '/buscar', '/post', '/solicitudes', '/u', '/chat', '/coach/apply',
] as const

describe('workspace presentation', () => {
  it.each(personalFamilies)('classifies %s and its descendants as personal', prefix => {
    expect(PERSONAL_ROUTE_PREFIXES).toContain(prefix)
    expect(classifyWorkspaceRoute(prefix)).toBe('personal')
    expect(classifyWorkspaceRoute(prefix + '/child')).toBe('personal')
  })

  it('uses an exact slash boundary and excludes coach application', () => {
    expect(isRouteWithinPrefix('/coach/clients', '/coach')).toBe(true)
    expect(isRouteWithinPrefix('/coaching', '/coach')).toBe(false)
    expect(classifyWorkspaceRoute('/coach/profile')).toBe('coach')
    expect(classifyWorkspaceRoute('/coach/services')).toBe('coach')
    expect(classifyWorkspaceRoute('/coach/apply')).toBe('personal')
  })

  it.each(['/session/workout-1', '/plans/generate', '/feed/new'])('%s is immersive', pathname => {
    expect(isImmersiveWorkspaceRoute(pathname)).toBe(true)
  })

  it('does not hide chrome for neighboring prefixes', () => {
    expect(isImmersiveWorkspaceRoute('/sessions')).toBe(false)
    expect(isImmersiveWorkspaceRoute('/feed/news')).toBe(false)
  })

  it('applies access, route, then shared preference priority', () => {
    expect(resolvePresentedWorkspace({
      pathname: '/coach/clients',
      preferredWorkspace: 'coach',
      trainerAccess: { granted: false },
    })).toBe('personal')
    expect(resolvePresentedWorkspace({
      pathname: '/coach/clients',
      preferredWorkspace: 'personal',
      trainerAccess: { granted: true },
    })).toBe('coach')
    expect(resolvePresentedWorkspace({
      pathname: '/dashboard',
      preferredWorkspace: 'coach',
      trainerAccess: { granted: true },
    })).toBe('personal')
    expect(resolvePresentedWorkspace({
      pathname: '/settings/perfil',
      preferredWorkspace: 'coach',
      trainerAccess: { granted: true },
    })).toBe('coach')
    expect(resolvePresentedWorkspace({
      pathname: '/future-shared-route',
      preferredWorkspace: 'personal',
      trainerAccess: { granted: true },
    })).toBe('personal')
  })
})
~~~

- [ ] **Step 2: Tighten the expected bottom-navigation sets**

Reemplazar la expectativa profesional existente y añadir la semántica de Perfil/Servicios:

~~~ts
it('uses five personal destinations with Entrenar third', () => {
  expect(getPersonalNavItems({ communityEnabled: false }).map(item => item.href)).toEqual([
    '/dashboard', '/plan', '/entrenar', '/progress', '/trainers',
  ])
})

it('replaces Entrenadores with Comunidad without adding a sixth destination', () => {
  expect(getPersonalNavItems({ communityEnabled: true }).map(item => item.href)).toEqual([
    '/dashboard', '/plan', '/entrenar', '/progress', '/feed',
  ])
})

it('uses exactly four professional destinations', () => {
  expect(getCoachNavItems()).toEqual([
    { href: '/coach', label: 'Resumen' },
    { href: '/coach/clients', label: 'Clientes' },
    { href: '/coach/programs', label: 'Rutinas' },
    { href: '/coach/requests', label: 'Solicitudes' },
  ])
})

it('does not mark overview active on profile or services', () => {
  expect(isAppNavItemActive('/coach/profile', '/coach')).toBe(false)
  expect(isAppNavItemActive('/coach/services', '/coach')).toBe(false)
  expect(getCoachNavItems().some(item => item.href === '/coach/profile')).toBe(false)
})
~~~

Eliminar del archivo real el caso obsoleto `keeps Mi entrenador available alongside the contextual fifth destination`: `/coaching` deja de ser un `AppNavItem` y se reubica como `Mi acompañamiento` en el menú de cuenta Personal, no como sexto destino. Los dos casos anteriores sustituyen ese contrato tanto con comunidad desactivada como activada; Task 4 prueba el nuevo acceso estable.

En src/lib/coaching/__tests__/workspace.test.ts añadir:

~~~ts
it('never turns a coach preference into permission', () => {
  expect(normalizeWorkspace('coach', false)).toBe('personal')
  expect(normalizeWorkspace('coach', true)).toBe('coach')
  expect(normalizeWorkspace('invalid', true)).toBe('personal')
})
~~~

- [ ] **Step 3: Run the focused tests and verify the intended red state**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=4 src/components/navigation/__tests__/workspacePresentation.test.ts src/components/navigation/__tests__/appNavigation.test.ts src/lib/coaching/__tests__/workspace.test.ts
~~~

Expected: FAIL because workspacePresentation.ts does not exist and the current coach list still contains /coach/profile.

- [ ] **Step 4: Implement the pure route resolver**

Crear src/components/navigation/workspacePresentation.ts:

~~~ts
import type { Workspace } from '@/lib/coaching/workspace'

export const PERSONAL_ROUTE_PREFIXES = [
  '/dashboard', '/plan', '/plans', '/entrenar', '/session', '/progress',
  '/feed', '/trainers', '/coaching', '/calendario', '/history', '/medidas',
  '/exercises', '/buscar', '/post', '/solicitudes', '/u', '/chat', '/coach/apply',
] as const

export const SHARED_ROUTE_PREFIXES = ['/settings', '/notifications'] as const
export const IMMERSIVE_ROUTE_PREFIXES = ['/session', '/plans/generate', '/feed/new'] as const

export type WorkspaceRouteKind = 'personal' | 'coach' | 'shared'

export function isRouteWithinPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

export function isImmersiveWorkspaceRoute(pathname: string): boolean {
  return IMMERSIVE_ROUTE_PREFIXES.some(prefix => isRouteWithinPrefix(pathname, prefix))
}

export function classifyWorkspaceRoute(pathname: string): WorkspaceRouteKind {
  if (
    isRouteWithinPrefix(pathname, '/coach')
    && !isRouteWithinPrefix(pathname, '/coach/apply')
  ) return 'coach'
  if (PERSONAL_ROUTE_PREFIXES.some(prefix => isRouteWithinPrefix(pathname, prefix))) {
    return 'personal'
  }
  return 'shared'
}

export function resolvePresentedWorkspace({
  pathname,
  preferredWorkspace,
  trainerAccess,
}: {
  pathname: string
  preferredWorkspace: Workspace
  trainerAccess: { granted: boolean }
}): Workspace {
  if (!trainerAccess.granted) return 'personal'
  const routeKind = classifyWorkspaceRoute(pathname)
  if (routeKind === 'coach') return 'coach'
  if (routeKind === 'personal') return 'personal'
  return preferredWorkspace
}
~~~

- [ ] **Step 5: Reduce the professional nav without broadening active matching**

En appNavigation.ts limitar AppNavItem y APP_NAV_ICONS a las rutas realmente presentes en la barra, y definir COACH_NAV_ITEMS así:

~~~ts
export type AppNavItem = {
  href: '/dashboard' | '/plan' | '/entrenar' | '/progress' | '/feed' | '/trainers'
    | '/coach' | '/coach/clients' | '/coach/programs' | '/coach/requests'
  label: 'Inicio' | 'Plan' | 'Entrenar' | 'Progreso' | 'Comunidad' | 'Entrenadores'
    | 'Resumen' | 'Clientes' | 'Rutinas' | 'Solicitudes'
}

const COACH_NAV_ITEMS: readonly AppNavItem[] = [
  { href: '/coach', label: 'Resumen' },
  { href: '/coach/clients', label: 'Clientes' },
  { href: '/coach/programs', label: 'Rutinas' },
  { href: '/coach/requests', label: 'Solicitudes' },
]

const APP_NAV_ICONS: Record<AppNavItem['href'], LucideIcon> = {
  '/dashboard': Home,
  '/plan': Dumbbell,
  '/entrenar': Play,
  '/progress': BarChart3,
  '/feed': Users,
  '/trainers': Users,
  '/coach': LayoutDashboard,
  '/coach/clients': Users,
  '/coach/programs': Dumbbell,
  '/coach/requests': ClipboardList,
}
~~~

Retirar Briefcase y UserRound de los imports de lucide-react porque Perfil y Servicios ya no son AppNavItem; el menú de cuenta tiene sus propios iconos.

Conservar esta regla exacta para que /coach no absorba Perfil o Servicios:

~~~ts
export function isAppNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/dashboard' || href === '/entrenar' || href === '/coach') return false
  return pathname.startsWith(href + '/')
}
~~~

- [ ] **Step 6: Re-run the task tests**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=4 src/components/navigation/__tests__/workspacePresentation.test.ts src/components/navigation/__tests__/appNavigation.test.ts src/lib/coaching/__tests__/workspace.test.ts
~~~

Expected: PASS; coach devuelve cuatro items, las 19 familias personales quedan clasificadas y /coaching no coincide con /coach.

- [ ] **Step 7: Commit the domain contract**

~~~powershell
git add src/components/navigation/workspacePresentation.ts src/components/navigation/__tests__/workspacePresentation.test.ts src/components/navigation/appNavigation.ts src/components/navigation/__tests__/appNavigation.test.ts src/lib/coaching/__tests__/workspace.test.ts
git commit -m "feat: define workspace presentation contract"
~~~

---

## Task 2: Return a canonical workspace action result

**Files:**

- Modify: src/lib/coaching/workspace.ts
- Modify: src/app/actions/workspace.ts
- Modify: src/app/actions/__tests__/workspace.test.ts

**Interfaces:**

- Consumes: requireAppUserContext(), getTrainerAccess(), cookies() y revalidatePath('/', 'layout').
- Produces: WorkspaceDestination y WorkspaceChangeResult; setWorkspace(formData): Promise<WorkspaceChangeResult>.

- [ ] **Step 1: Replace redirect expectations with discriminated-result tests**

En el test existente retirar el mock de next/navigation, cambiar el import de Vitest a `import { afterEach, ... } from 'vitest'` y cubrir los seis contratos:

~~~ts
it('writes the coach preference and returns its canonical destination', async () => {
  mocks.getTrainerAccess.mockResolvedValue({
    granted: true,
    profile: { id: 'trainer-profile-1', status: 'active' },
  })

  await expect(setWorkspace(workspaceForm('coach'))).resolves.toEqual({
    ok: true,
    workspace: 'coach',
    destination: '/coach',
  })
  expect(mocks.cookieSet).toHaveBeenCalledWith('vekira_workspace', 'coach', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
})

it('rejects malformed input before access lookup or cookie mutation', async () => {
  await expect(setWorkspace(workspaceForm('admin'))).resolves.toEqual({
    ok: false,
    code: 'invalid_workspace',
    error: 'El espacio solicitado no es válido.',
  })
  expect(mocks.getTrainerAccess).not.toHaveBeenCalled()
  expect(mocks.cookieSet).not.toHaveBeenCalled()
})

it('does not silently normalize unavailable coach access', async () => {
  mocks.getTrainerAccess.mockResolvedValue({ granted: false, reason: 'suspended' })

  await expect(setWorkspace(workspaceForm('coach'))).resolves.toEqual({
    ok: false,
    code: 'coach_unavailable',
    error: 'El espacio de entrenador ya no está disponible.',
  })
  expect(mocks.cookieSet).not.toHaveBeenCalled()
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
})

it('does not mutate the cookie when revalidation throws', async () => {
  mocks.getTrainerAccess.mockResolvedValue({
    granted: true,
    profile: { id: 'trainer-profile-1', status: 'active' },
  })
  mocks.revalidatePath.mockImplementationOnce(() => {
    throw new Error('revalidation unavailable')
  })

  await expect(setWorkspace(workspaceForm('personal'))).resolves.toEqual({
    ok: false,
    code: 'unexpected',
    error: 'No se pudo cambiar de espacio. Inténtalo nuevamente.',
  })
  expect(mocks.cookieSet).not.toHaveBeenCalled()
})

it('does not report success when the cookie API rejects', async () => {
  mocks.getTrainerAccess.mockResolvedValue({
    granted: true,
    profile: { id: 'trainer-profile-1', status: 'active' },
  })
  mocks.cookieSet.mockImplementationOnce(() => {
    throw new Error('cookie storage unavailable')
  })

  await expect(setWorkspace(workspaceForm('personal'))).resolves.toEqual({
    ok: false,
    code: 'unexpected',
    error: 'No se pudo cambiar de espacio. Inténtalo nuevamente.',
  })
  expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
})

it('allows authentication redirects to propagate', async () => {
  const authRedirect = new Error('NEXT_REDIRECT:/login')
  mocks.requireAppUserContext.mockRejectedValueOnce(authRedirect)

  await expect(setWorkspace(workspaceForm('personal'))).rejects.toBe(authRedirect)
  expect(mocks.cookieSet).not.toHaveBeenCalled()
})
~~~

- [ ] **Step 2: Run the action test and verify the contract mismatch**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=4 src/app/actions/__tests__/workspace.test.ts
~~~

Expected: FAIL because setWorkspace currently throws redirect and writes Personal for an unauthorized coach request.

- [ ] **Step 3: Add the shared result types**

Añadir a src/lib/coaching/workspace.ts sin tocar normalizeWorkspace:

~~~ts
export type WorkspaceDestination = '/dashboard' | '/coach'

export type WorkspaceChangeResult =
  | { ok: true; workspace: Workspace; destination: WorkspaceDestination }
  | {
      ok: false
      code: 'invalid_workspace' | 'coach_unavailable' | 'unexpected'
      error: string
    }

export function workspaceDestination(workspace: Workspace): WorkspaceDestination {
  return workspace === 'coach' ? '/coach' : '/dashboard'
}
~~~

- [ ] **Step 4: Implement validate-then-write semantics**

La política de atomicidad será explícita: validar acceso y ejecutar revalidatePath antes de cookies().set. Así ningún error previo toca la preferencia; después de que cookies().set retorna, la action devuelve éxito sin ejecutar ninguna operación que pueda degradarlo a error. Si la API de cookies lanza, se devuelve unexpected, aunque no es posible prometer rollback frente a una implementación externa que hubiese escrito parcialmente antes de lanzar.

Reemplazar la action por:

~~~ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { requireAppUserContext } from '@/lib/auth/server'
import { getTrainerAccess } from '@/lib/coaching/access'
import {
  WORKSPACE_COOKIE,
  workspaceDestination,
  type Workspace,
  type WorkspaceChangeResult,
} from '@/lib/coaching/workspace'

export async function setWorkspace(formData: FormData): Promise<WorkspaceChangeResult> {
  const { user, supabase } = await requireAppUserContext()
  const value = formData.get('workspace')
  if (value !== 'personal' && value !== 'coach') {
    return {
      ok: false,
      code: 'invalid_workspace',
      error: 'El espacio solicitado no es válido.',
    }
  }

  const workspace: Workspace = value
  try {
    const access = await getTrainerAccess(user.id, supabase)
    if (workspace === 'coach' && !access.granted) {
      return {
        ok: false,
        code: 'coach_unavailable',
        error: 'El espacio de entrenador ya no está disponible.',
      }
    }

    revalidatePath('/', 'layout')
    cookies().set(WORKSPACE_COOKIE, workspace, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
    return { ok: true, workspace, destination: workspaceDestination(workspace) }
  } catch {
    return {
      ok: false,
      code: 'unexpected',
      error: 'No se pudo cambiar de espacio. Inténtalo nuevamente.',
    }
  }
}
~~~

- [ ] **Step 5: Verify production cookie attributes as a separate assertion**

Conservar el caso existente que usa vi.stubEnv('NODE_ENV', 'production'), pero cambiar su resultado esperado a ok: true y comprobar secure: true. Ejecutar vi.unstubAllEnvs() en el afterEach importado en Step 1 para que el resto no herede el entorno.

- [ ] **Step 6: Re-run the action tests**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=4 src/app/actions/__tests__/workspace.test.ts
~~~

Expected: PASS; invalid_workspace y coach_unavailable no revalidan ni escriben, el fallo de revalidación no alcanza cookieSet, un fallo de cookie no devuelve éxito y no queda import de redirect en workspace.ts.

- [ ] **Step 7: Commit the server contract**

~~~powershell
git add src/lib/coaching/workspace.ts src/app/actions/workspace.ts src/app/actions/__tests__/workspace.test.ts
git commit -m "feat: return canonical workspace changes"
~~~

---

## Task 3: Provide one client workspace model and transition pipeline

**Files:**

- Create: src/components/navigation/WorkspaceNavigationGuard.ts
- Create: src/components/navigation/AccountWorkspaceContext.tsx
- Create: src/components/navigation/AccountWorkspaceProvider.tsx
- Create: src/components/navigation/__tests__/AccountWorkspaceProvider.test.ts

**Interfaces:**

- Consumes: setWorkspace(FormData), usePathname(), useRouter(), resolvePresentedWorkspace().
- Produces: AccountWorkspaceModel, AccountWorkspaceContextValue con immersiveRoute/signOutAccount, useAccountWorkspace(), useOptionalAccountWorkspace(), requestWorkspaceNavigation(intent), commitWorkspaceNavigation(intent) y executeWorkspaceTransition(target, current, dependencies).

- [ ] **Step 1: Write tests for action ordering and recoverable outcomes**

Crear AccountWorkspaceProvider.test.ts:

~~~ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/actions/workspace', () => ({ setWorkspace: vi.fn() }))
vi.mock('@/app/(auth)/actions', () => ({ signOut: vi.fn() }))

import { executeWorkspaceTransition } from '../AccountWorkspaceProvider'

describe('executeWorkspaceTransition', () => {
  it('requests permission, exposes pending, commits, replaces, and refreshes in order', async () => {
    const order: string[] = []
    const outcome = await executeWorkspaceTransition('coach', 'personal', {
      requestIntent: target => {
        order.push('intent:' + target)
        return true
      },
      commitIntent: target => { order.push('commit:' + target) },
      action: async formData => {
        order.push('action:' + formData.get('workspace'))
        return { ok: true, workspace: 'coach', destination: '/coach' }
      },
      replace: destination => { order.push('replace:' + destination) },
      refresh: () => { order.push('refresh') },
      setPending: target => { order.push('pending:' + String(target)) },
    })

    expect(outcome).toEqual({ status: 'navigating' })
    expect(order).toEqual([
      'intent:coach',
      'pending:coach',
      'action:coach',
      'commit:coach',
      'replace:/coach',
      'refresh',
      'pending:null',
    ])
  })

  it('cancels before the server action', async () => {
    const action = vi.fn()
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => false,
      commitIntent: vi.fn(),
      action,
      replace: vi.fn(),
      refresh: vi.fn(),
      setPending: vi.fn(),
    })).resolves.toEqual({ status: 'cancelled' })
    expect(action).not.toHaveBeenCalled()
  })

  it('keeps errors recoverable and refreshes revoked access', async () => {
    const refresh = vi.fn()
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => true,
      commitIntent: vi.fn(),
      action: async () => ({
        ok: false,
        code: 'coach_unavailable',
        error: 'El espacio de entrenador ya no está disponible.',
      }),
      replace: vi.fn(),
      refresh,
      setPending: vi.fn(),
    })).resolves.toEqual({
      status: 'failed',
      code: 'coach_unavailable',
      error: 'El espacio de entrenador ya no está disponible.',
    })
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('surfaces invalid input without commit, navigation, or refresh', async () => {
    const commitIntent = vi.fn()
    const replace = vi.fn()
    const refresh = vi.fn()
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => true,
      commitIntent,
      action: async () => ({
        ok: false,
        code: 'invalid_workspace',
        error: 'El espacio solicitado no es válido.',
      }),
      replace,
      refresh,
      setPending: vi.fn(),
    })).resolves.toEqual({
      status: 'failed',
      code: 'invalid_workspace',
      error: 'El espacio solicitado no es válido.',
    })
    expect(commitIntent).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('turns a rejected network call into an unexpected failure', async () => {
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => true,
      commitIntent: vi.fn(),
      action: async () => { throw new Error('offline') },
      replace: vi.fn(),
      refresh: vi.fn(),
      setPending: vi.fn(),
    })).resolves.toEqual({
      status: 'failed',
      code: 'unexpected',
      error: 'No se pudo cambiar de espacio. Inténtalo nuevamente.',
    })
  })

  it('treats an absent action result as navigation already handled by Next', async () => {
    const commitIntent = vi.fn()
    const replace = vi.fn()
    const refresh = vi.fn()
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => true,
      commitIntent,
      action: async () => undefined,
      replace,
      refresh,
      setPending: vi.fn(),
    })).resolves.toEqual({ status: 'redirecting' })
    expect(commitIntent).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
~~~

- [ ] **Step 2: Run the provider test and verify it fails for the missing module**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=4 src/components/navigation/__tests__/AccountWorkspaceProvider.test.ts
~~~

Expected: FAIL because AccountWorkspaceContext.tsx, AccountWorkspaceProvider.tsx and executeWorkspaceTransition do not exist.

- [ ] **Step 3: Create the cancelable intent protocol**

Crear WorkspaceNavigationGuard.ts:

~~~ts
import type { Workspace } from '@/lib/coaching/workspace'

export const WORKSPACE_NAVIGATION_INTENT = 'vekira:workspace-navigation-intent'
export const WORKSPACE_NAVIGATION_COMMIT = 'vekira:workspace-navigation-commit'

export type WorkspaceNavigationIntent = {
  workspace: Workspace
  destination: '/dashboard' | '/coach'
}

export function requestWorkspaceNavigation(intent: WorkspaceNavigationIntent): boolean {
  if (typeof window === 'undefined') return true
  return window.dispatchEvent(new CustomEvent(WORKSPACE_NAVIGATION_INTENT, {
    cancelable: true,
    detail: intent,
  }))
}

export function commitWorkspaceNavigation(intent: WorkspaceNavigationIntent): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(WORKSPACE_NAVIGATION_COMMIT, {
    detail: intent,
  }))
}
~~~

- [ ] **Step 4: Define an action-free context and the pure transition helper**

Crear primero AccountWorkspaceContext.tsx. Este módulo es el único que importarán FixedTopBar, AccountWorkspaceMenu, BottomNav y DesktopSidebar; no puede importar Server Actions ni AccountWorkspaceProvider:

~~~tsx
'use client'

import { createContext, useContext } from 'react'
import type { AppNavItem } from './appNavigation'
import type { Workspace } from '@/lib/coaching/workspace'

export type TrainerAccessSummary =
  | { granted: true }
  | { granted: false; reason: 'missing_profile' | 'suspended' | 'inactive' }

export type AccountWorkspaceModel = {
  account: {
    name: string | null
    email: string
    avatarUrl: string | null
  }
  trainerAccess: TrainerAccessSummary
  preferredWorkspace: Workspace
  personalNavItems: readonly AppNavItem[]
  coachNavItems: readonly AppNavItem[]
}

export type WorkspaceTransitionOutcome =
  | { status: 'cancelled' | 'navigating' | 'redirecting' }
  | {
      status: 'failed'
      code: 'invalid_workspace' | 'coach_unavailable' | 'unexpected'
      error: string
    }

export type AccountWorkspaceContextValue = AccountWorkspaceModel & {
  presentedWorkspace: Workspace
  immersiveRoute: boolean
  navItems: readonly AppNavItem[]
  pendingWorkspace: Workspace | null
  error: string | null
  clearError: () => void
  changeWorkspace: (target: Workspace) => Promise<WorkspaceTransitionOutcome>
  signOutAccount: () => Promise<void>
}

export const AccountWorkspaceContext = createContext<AccountWorkspaceContextValue | null>(null)

export function useAccountWorkspace(): AccountWorkspaceContextValue {
  const value = useContext(AccountWorkspaceContext)
  if (!value) throw new Error('useAccountWorkspace must be used within AccountWorkspaceProvider')
  return value
}

export function useOptionalAccountWorkspace(): AccountWorkspaceContextValue | null {
  return useContext(AccountWorkspaceContext)
}
~~~

Crear AccountWorkspaceProvider.tsx con los imports de actions confinados aquí y el helper puro debajo:

~~~ts
'use client'

import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { setWorkspace } from '@/app/actions/workspace'
import { signOut as signOutAction } from '@/app/(auth)/actions'
import {
  AccountWorkspaceContext,
  type AccountWorkspaceContextValue,
  type AccountWorkspaceModel,
  type WorkspaceTransitionOutcome,
} from './AccountWorkspaceContext'
import {
  isImmersiveWorkspaceRoute,
  resolvePresentedWorkspace,
} from './workspacePresentation'
import {
  commitWorkspaceNavigation,
  requestWorkspaceNavigation,
} from './WorkspaceNavigationGuard'
import {
  workspaceDestination,
  type Workspace,
  type WorkspaceChangeResult,
} from '@/lib/coaching/workspace'

type WorkspaceTransitionDependencies = {
  requestIntent: (target: Workspace) => boolean
  commitIntent: (target: Workspace) => void
  action: (formData: FormData) => Promise<WorkspaceChangeResult | undefined>
  replace: (destination: '/dashboard' | '/coach') => void
  refresh: () => void
  setPending: (target: Workspace | null) => void
}

export async function executeWorkspaceTransition(
  target: Workspace,
  current: Workspace,
  dependencies: WorkspaceTransitionDependencies,
): Promise<WorkspaceTransitionOutcome> {
  if (target === current) return { status: 'cancelled' }
  if (!dependencies.requestIntent(target)) return { status: 'cancelled' }
  const formData = new FormData()
  formData.set('workspace', target)
  dependencies.setPending(target)
  try {
    const result = await dependencies.action(formData)
    // Next 14.2 resolves the client proxy with undefined when the Server Action
    // response carries x-action-redirect (for example, an expired session).
    if (result === undefined) return { status: 'redirecting' }
    if (!result.ok) {
      if (result.code === 'coach_unavailable') dependencies.refresh()
      return { status: 'failed', code: result.code, error: result.error }
    }
    dependencies.commitIntent(target)
    dependencies.replace(result.destination)
    dependencies.refresh()
    return { status: 'navigating' }
  } catch {
    return {
      status: 'failed',
      code: 'unexpected',
      error: 'No se pudo cambiar de espacio. Inténtalo nuevamente.',
    }
  } finally {
    dependencies.setPending(null)
  }
}
~~~

- [ ] **Step 5: Implement the provider state around the helper**

Completar el mismo archivo con:

~~~tsx
export function AccountWorkspaceProvider({
  model,
  children,
}: {
  model: AccountWorkspaceModel
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const transitionInFlight = useRef(false)
  const [pendingWorkspace, setPendingWorkspace] = useState<Workspace | null>(null)
  const [error, setError] = useState<string | null>(null)
  const presentedWorkspace = resolvePresentedWorkspace({
    pathname,
    preferredWorkspace: model.preferredWorkspace,
    trainerAccess: model.trainerAccess,
  })
  const immersiveRoute = isImmersiveWorkspaceRoute(pathname)
  const navItems = presentedWorkspace === 'coach'
    ? model.coachNavItems
    : model.personalNavItems

  const value = useMemo<AccountWorkspaceContextValue>(() => ({
    ...model,
    presentedWorkspace,
    immersiveRoute,
    navItems,
    pendingWorkspace,
    error,
    clearError: () => setError(null),
    signOutAccount: async () => { await signOutAction() },
    changeWorkspace: async target => {
      if (transitionInFlight.current || target === presentedWorkspace) {
        return { status: 'cancelled' }
      }
      transitionInFlight.current = true
      setError(null)
      try {
        const outcome = await executeWorkspaceTransition(target, presentedWorkspace, {
          requestIntent: requested => requestWorkspaceNavigation({
            workspace: requested,
            destination: workspaceDestination(requested),
          }),
          commitIntent: committed => commitWorkspaceNavigation({
            workspace: committed,
            destination: workspaceDestination(committed),
          }),
          action: setWorkspace,
          replace: destination => router.replace(destination),
          refresh: () => router.refresh(),
          setPending: setPendingWorkspace,
        })
        if (outcome.status === 'failed') setError(outcome.error)
        return outcome
      } finally {
        transitionInFlight.current = false
      }
    },
  }), [error, immersiveRoute, model, navItems, pendingWorkspace, presentedWorkspace, router])

  return (
    <AccountWorkspaceContext.Provider value={value}>
      {children}
    </AccountWorkspaceContext.Provider>
  )
}
~~~

La intención se emite antes de setPendingWorkspace y antes de setWorkspace; así un veto no abre estado pendiente ni puede mutar la cookie. El ref síncrono bloquea dobles envíos incluso antes del siguiente render y COMMIT solo se emite tras un resultado ok. En Next 14.2, una Server Action que redirige por sesión vencida llega al proxy cliente como `undefined`: ese resultado se clasifica como `redirecting`, sin error local, COMMIT, replace ni refresh, porque el router de Next ya procesa `x-action-redirect`. Los imports de setWorkspace/signOut quedan confinados al Provider; importar un header o el menú fuera de AppShell solo alcanza AccountWorkspaceContext y no evalúa módulos server-only.

- [ ] **Step 6: Re-run provider and resolver tests**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=4 src/components/navigation/__tests__/AccountWorkspaceProvider.test.ts src/components/navigation/__tests__/workspacePresentation.test.ts
~~~

Expected: PASS, incluida la secuencia intent → pending → action → commit → replace → refresh → pending:null, invalid_workspace sin navegación, el refresh adicional solo para coach_unavailable y el resultado ausente de un redirect de autenticación sin falso error ni navegación manual.

- [ ] **Step 7: Commit the provider boundary**

~~~powershell
git add src/components/navigation/WorkspaceNavigationGuard.ts src/components/navigation/AccountWorkspaceContext.tsx src/components/navigation/AccountWorkspaceProvider.tsx src/components/navigation/__tests__/AccountWorkspaceProvider.test.ts
git commit -m "feat: add account workspace provider"
~~~

---

## Task 4: Build the shared account trigger, sheet, and desktop panel

**Files:**

- Create: src/components/navigation/AccountWorkspaceTrigger.tsx
- Create: src/components/navigation/AccountWorkspaceMenu.tsx
- Create: src/components/navigation/__tests__/AccountWorkspaceMenu.test.tsx
- Modify: src/lib/i18n/index.ts

**Interfaces:**

- Consumes: useOptionalAccountWorkspace(), signOutAccount(), Dialog, DropdownMenu, Avatar y PendingLink.
- Produces: AccountWorkspaceTrigger y AccountWorkspaceMenu({ surface: 'topbar' | 'dashboard' | 'sidebar' }).

- [ ] **Step 1: Write static contracts for identity, available spaces, contextual links, and translations**

Crear AccountWorkspaceMenu.test.tsx con I18nProvider y renderToStaticMarkup:

~~~tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { translate } from '@/lib/i18n'

vi.mock('../PendingLink', () => ({
  PendingLink: ({
    href,
    children,
    showSpinner: _showSpinner,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string
    showSpinner?: boolean
  }) => <a href={href} {...props}>{children}</a>,
}))

import { AccountWorkspaceMenuBody } from '../AccountWorkspaceMenu'
import { AccountWorkspaceTrigger } from '../AccountWorkspaceTrigger'

const account = {
  name: 'Ana Pérez con un nombre profesional especialmente largo',
  email: 'ana.entrenamiento@example.com',
  avatarUrl: null,
}

function renderBody(
  workspace: 'personal' | 'coach',
  canUseCoach: boolean,
  error: string | null = null,
  pendingWorkspace: 'personal' | 'coach' | null = null,
) {
  return renderToStaticMarkup(
    <I18nProvider language="es" syncDocumentLanguage={false}>
      <AccountWorkspaceMenuBody
        account={account}
        workspace={workspace}
        canUseCoach={canUseCoach}
        pendingWorkspace={pendingWorkspace}
        error={error}
        onWorkspaceChange={vi.fn()}
        onSignOut={vi.fn()}
      />
    </I18nProvider>,
  )
}

describe('AccountWorkspaceMenuBody', () => {
  it('shows only Personal and the personal profile without coach access', () => {
    const html = renderBody('personal', false)
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('Personal')
    expect(html).not.toContain('>Entrenador<')
    expect(html).toContain('href="/settings/perfil"')
    expect(html).toContain('href="/coaching"')
    expect(html).not.toContain('href="/coach/profile"')
    expect(html).toContain('href="/settings"')
    expect(html).toContain('Cerrar sesión')
  })

  it('shows professional profile and services only in coach context', () => {
    const html = renderBody('coach', true)
    expect(html).toContain('>Entrenador<')
    expect(html).toContain('href="/coach/profile"')
    expect(html).toContain('href="/coach/services"')
    expect(html).not.toContain('href="/settings/perfil"')
    expect(html).not.toContain('href="/coaching"')
  })

  it('uses Radix menu items rather than nesting dialog controls in role=menu', () => {
    const source = readFileSync(new URL('../AccountWorkspaceMenu.tsx', import.meta.url), 'utf8')
    expect(source).toContain('<DropdownMenuRadioGroup')
    expect(source).toContain('<DropdownMenuRadioItem')
    expect(source).toContain('<DropdownMenuItem disabled={interactionLocked} asChild>')
    expect(source).toContain("presentation === 'menu'")
    expect(source).toContain("window.matchMedia('(min-width: 1024px)')")
    expect(source).toContain("sideOffset={surface === 'sidebar' ? 16 : 4}")
  })

  it('keeps headers and the menu free of transitive Server Action imports', () => {
    const menu = readFileSync(new URL('../AccountWorkspaceMenu.tsx', import.meta.url), 'utf8')
    const context = readFileSync(new URL('../AccountWorkspaceContext.tsx', import.meta.url), 'utf8')
    expect(menu).not.toContain('@/app/')
    expect(context).not.toContain('@/app/')
    expect(menu).toContain('context.signOutAccount()')
  })

  it('announces a recoverable action error in the shared body', () => {
    const html = renderBody('personal', true, 'El espacio solicitado no es válido.')
    expect(html).toContain('role="alert"')
    expect(html).toContain('El espacio solicitado no es válido.')
  })

  it('renders a touch-sized trigger without a file input', () => {
    const html = renderToStaticMarkup(
      <I18nProvider language="es" syncDocumentLanguage={false}>
        <AccountWorkspaceTrigger
          variant="compact"
          workspace="personal"
          name="Ana Pérez"
          avatarUrl={null}
          pending={false}
          data-radix-probe="forwarded"
        />
      </I18nProvider>,
    )
    expect(html).toContain('aria-label="Abrir cuenta y espacios"')
    expect(html).toMatch(/<button[^>]+h-11[^>]+w-11/)
    expect(html).toContain('data-radix-probe="forwarded"')
    expect(html).toContain('data-account-workspace-trigger')
    expect(html).toContain('data-account-workspace-avatar')
    expect(html).toContain('data-account-workspace-badge')
    const descriptionId = html.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(descriptionId).toBeTruthy()
    expect(html).toContain(`id="${descriptionId}"`)
    expect(html).toContain('Espacio activo: Personal')
    expect(html).not.toContain('type="file"')
  })

  it('locks every navigation and sign-out action while a workspace change is pending', () => {
    for (const [html, hrefs] of [
      [renderBody('coach', true, null, 'personal'), ['/coach/profile', '/coach/services', '/settings']],
      [renderBody('personal', true, null, 'coach'), ['/settings/perfil', '/coaching', '/settings']],
    ] as const) {
      for (const href of hrefs) {
        const link = html.match(new RegExp(`<a[^>]+href="${href}"[^>]*>`))?.[0]
        expect(link).toContain('aria-disabled="true"')
        expect(link).toContain('tabindex="-1"')
      }
      const signOut = html.match(/<button[^>]+data-account-sign-out[^>]*>/)?.[0]
      expect(signOut).toContain('disabled=""')
    }
  })

  it('contains every new English label', () => {
    const labels = [
      ['Usuario', 'User'],
      ['Personal', 'Personal'],
      ['Entrenador', 'Coach'],
      ['Resumen', 'Overview'],
      ['Clientes', 'Clients'],
      ['Rutinas', 'Programs'],
      ['Entrenadores', 'Trainers'],
      ['Servicios', 'Services'],
      ['Abrir cuenta y espacios', 'Open account and workspaces'],
      ['Cuenta y espacios', 'Account and workspaces'],
      ['Selector de espacio', 'Workspace selector'],
      ['Espacio activo', 'Active workspace'],
      ['Enlaces de cuenta', 'Account links'],
      ['Perfil personal', 'Personal profile'],
      ['Mi acompañamiento', 'My coaching'],
      ['Perfil profesional', 'Professional profile'],
      ['El espacio solicitado no es válido.', 'The requested workspace is invalid.'],
      ['El espacio de entrenador ya no está disponible.', 'The coach workspace is no longer available.'],
      ['No se pudo cambiar de espacio. Inténtalo nuevamente.', 'Could not switch workspaces. Try again.'],
    ] as const
    for (const [source, expected] of labels) {
      expect(translate('en', source)).toBe(expected)
    }
    expect(translate('en', 'Cambiando al espacio {workspace}…', {
      workspace: 'Coach',
    })).toBe('Switching to the Coach workspace…')
  })
})
~~~

- [ ] **Step 2: Run the menu test and verify the missing components and translations**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=4 src/components/navigation/__tests__/AccountWorkspaceMenu.test.tsx
~~~

Expected: FAIL because AccountWorkspaceMenu, AccountWorkspaceTrigger and the new English keys do not exist.

- [ ] **Step 3: Implement the forward-ref avatar trigger**

Crear AccountWorkspaceTrigger.tsx con un botón real compatible con Radix asChild:

~~~tsx
'use client'

import { forwardRef, useId } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { Briefcase, Loader2, UserRound } from 'lucide-react'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { Workspace } from '@/lib/coaching/workspace'
import { cn } from '@/lib/utils'

export type AccountWorkspaceTriggerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'className'
> & {
  variant: 'compact' | 'dashboard' | 'sidebar'
  workspace: Workspace
  name: string | null
  avatarUrl: string | null
  pending: boolean
  className?: string
}

export function accountInitials(name: string | null): string {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? []
  if (!words.length) return 'V'
  return words.slice(0, 2).map(word => word[0]).join('').toUpperCase()
}

export const AccountWorkspaceTrigger = forwardRef<
  HTMLButtonElement,
  AccountWorkspaceTriggerProps
>(function AccountWorkspaceTrigger({
  variant,
  workspace,
  name,
  avatarUrl,
  pending,
  className,
  disabled,
  ...buttonProps
}, ref) {
  const { t } = useI18n()
  const workspaceDescriptionId = useId()
  const WorkspaceIcon = workspace === 'coach' ? Briefcase : UserRound
  const workspaceLabel = workspace === 'coach' ? t('Entrenador') : t('Personal')
  const dashboard = variant === 'dashboard'
  const sidebar = variant === 'sidebar'

  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      data-account-workspace-trigger
      aria-label={t('Abrir cuenta y espacios')}
      aria-describedby={workspaceDescriptionId}
      aria-busy={pending || undefined}
      disabled={pending || disabled}
      className={cn(
        'relative flex min-h-11 min-w-11 shrink-0 items-center rounded-xl outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        dashboard && 'h-20 w-20 justify-center rounded-full',
        !dashboard && !sidebar && 'h-11 w-11 justify-center',
        sidebar && 'w-full gap-3 px-2 py-2 text-left hover:bg-muted/40',
        className,
      )}
    >
      <span data-account-workspace-avatar className="relative flex shrink-0">
        <Avatar className={cn(dashboard ? 'h-20 w-20' : 'h-10 w-10')}>
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback>{accountInitials(name)}</AvatarFallback>
        </Avatar>
        <span
          aria-hidden="true"
          data-account-workspace-badge
          className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[hsl(var(--surface-1))] bg-primary text-primary-foreground"
        >
          {pending
            ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
            : <WorkspaceIcon className="h-3 w-3" />}
        </span>
      </span>
      {sidebar ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {name?.trim() || t('Usuario')}
          </span>
          <span className="block text-xs text-muted-foreground">{workspaceLabel}</span>
        </span>
      ) : null}
      <span id={workspaceDescriptionId} className="sr-only">
        {t('Espacio activo')}: {workspaceLabel}
      </span>
    </button>
  )
})
~~~

La extensión de ButtonHTMLAttributes y ...buttonProps son obligatorias: DialogTrigger/DropdownMenuTrigger con asChild inyectan onPointerDown, onKeyDown, aria-expanded y data-state; descartarlas dejaría el avatar visualmente correcto pero inerte.

- [ ] **Step 4: Implement one menu body for both responsive shells**

Crear AccountWorkspaceMenu.tsx. El cuerpo compartido debe usar este selector y estos destinos exactos:

~~~tsx
'use client'

import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { Briefcase, LogOut, Settings, UserRound } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import type { Workspace } from '@/lib/coaching/workspace'
import { cn } from '@/lib/utils'
import {
  useOptionalAccountWorkspace,
  type AccountWorkspaceModel,
} from './AccountWorkspaceContext'
import {
  AccountWorkspaceTrigger,
  accountInitials,
} from './AccountWorkspaceTrigger'
import { PendingLink } from './PendingLink'

type MenuBodyProps = {
  presentation?: 'dialog' | 'menu'
  account: AccountWorkspaceModel['account']
  workspace: Workspace
  canUseCoach: boolean
  pendingWorkspace: Workspace | null
  error: string | null
  onWorkspaceChange: (workspace: Workspace) => void
  onSignOut: () => void
}

export function AccountWorkspaceMenuBody({
  presentation = 'dialog',
  account,
  workspace,
  canUseCoach,
  pendingWorkspace,
  error,
  onWorkspaceChange,
  onSignOut,
}: MenuBodyProps) {
  const { t } = useI18n()
  const spaces: readonly Workspace[] = canUseCoach
    ? ['personal', 'coach']
    : ['personal']
  const activeLabel = workspace === 'coach' ? t('Entrenador') : t('Personal')
  const interactionLocked = pendingWorkspace !== null
  const guardedLinkProps = {
    'aria-disabled': interactionLocked || undefined,
    tabIndex: interactionLocked ? -1 : undefined,
    onClick: interactionLocked
      ? (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault()
      : undefined,
  }

  if (presentation === 'menu') {
    return (
      <>
        <DropdownMenuLabel className="flex min-w-0 items-center gap-3 px-2 py-2">
          <Avatar className="h-12 w-12 shrink-0">
            {account.avatarUrl ? <AvatarImage src={account.avatarUrl} alt="" /> : null}
            <AvatarFallback>{accountInitials(account.name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-foreground">
              {account.name?.trim() || t('Usuario')}
            </span>
            <span className="block truncate text-sm font-normal text-muted-foreground">
              {account.email}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('Espacio activo')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={workspace} aria-label={t('Selector de espacio')}>
          {spaces.map(option => {
            const Icon = option === 'coach' ? Briefcase : UserRound
            const label = option === 'coach' ? t('Entrenador') : t('Personal')
            return (
              <DropdownMenuRadioItem
                key={option}
                value={option}
                disabled={interactionLocked}
                onSelect={event => {
                  event.preventDefault()
                  onWorkspaceChange(option)
                }}
                className="min-h-11 gap-2 rounded-xl pr-3 text-sm font-semibold"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
        {pendingWorkspace ? (
          <DropdownMenuLabel asChild>
            <p role="status" aria-live="polite" className="px-3 py-2 text-sm font-normal text-muted-foreground">
              {t('Cambiando al espacio {workspace}…', {
                workspace: pendingWorkspace === 'coach' ? t('Entrenador') : t('Personal'),
              })}
            </p>
          </DropdownMenuLabel>
        ) : null}
        {error ? (
          <DropdownMenuLabel asChild>
            <p role="alert" className="px-3 py-2 text-sm font-normal text-destructive">{t(error)}</p>
          </DropdownMenuLabel>
        ) : null}
        <DropdownMenuSeparator />
        {workspace === 'coach' ? (
          <>
            <DropdownMenuItem disabled={interactionLocked} asChild>
              <PendingLink {...guardedLinkProps} href="/coach/profile" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
                {t('Perfil profesional')}
              </PendingLink>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={interactionLocked} asChild>
              <PendingLink {...guardedLinkProps} href="/coach/services" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
                {t('Servicios')}
              </PendingLink>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem disabled={interactionLocked} asChild>
              <PendingLink {...guardedLinkProps} href="/settings/perfil" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
                {t('Perfil personal')}
              </PendingLink>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={interactionLocked} asChild>
              <PendingLink {...guardedLinkProps} href="/coaching" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
                {t('Mi acompañamiento')}
              </PendingLink>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem disabled={interactionLocked} asChild>
          <PendingLink {...guardedLinkProps} href="/settings" showSpinner={false} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
            <Settings className="h-4 w-4" aria-hidden="true" />
            {t('Ajustes')}
          </PendingLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={interactionLocked} asChild>
          <button
            type="button"
            data-account-sign-out
            disabled={interactionLocked}
            onClick={onSignOut}
            className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-destructive disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t('Cerrar sesión')}
          </button>
        </DropdownMenuItem>
      </>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 items-center gap-3 pr-12">
        <Avatar className="h-12 w-12 shrink-0">
          {account.avatarUrl ? <AvatarImage src={account.avatarUrl} alt="" /> : null}
          <AvatarFallback>{accountInitials(account.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {account.name?.trim() || t('Usuario')}
          </p>
          <p className="truncate text-sm text-muted-foreground">{account.email}</p>
        </div>
      </div>
      <section aria-label={t('Selector de espacio')}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('Espacio activo')}
        </p>
        <div className={cn('mt-2 grid gap-2', canUseCoach ? 'grid-cols-2' : 'grid-cols-1')}>
          {spaces.map(option => {
            const selected = workspace === option
            const Icon = option === 'coach' ? Briefcase : UserRound
            const label = option === 'coach' ? t('Entrenador') : t('Personal')
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                disabled={interactionLocked}
                onClick={() => onWorkspaceChange(option)}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold',
                  'outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                  selected
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            )
          })}
        </div>
      </section>
      {pendingWorkspace ? (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {t('Cambiando al espacio {workspace}…', {
            workspace: pendingWorkspace === 'coach' ? t('Entrenador') : t('Personal'),
          })}
        </p>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{t(error)}</p> : null}
      <nav aria-label={t('Enlaces de cuenta')} className="grid gap-1 border-t border-border/60 pt-3">
        {workspace === 'coach' ? (
          <>
            <PendingLink {...guardedLinkProps} href="/coach/profile" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
              {t('Perfil profesional')}
            </PendingLink>
            <PendingLink {...guardedLinkProps} href="/coach/services" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
              {t('Servicios')}
            </PendingLink>
          </>
        ) : (
          <>
            <PendingLink {...guardedLinkProps} href="/settings/perfil" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
              {t('Perfil personal')}
            </PendingLink>
            <PendingLink {...guardedLinkProps} href="/coaching" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
              {t('Mi acompañamiento')}
            </PendingLink>
          </>
        )}
        <PendingLink {...guardedLinkProps} href="/settings" showSpinner={false} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
          <Settings className="h-4 w-4" aria-hidden="true" />
          {t('Ajustes')}
        </PendingLink>
      </nav>
      <div className="border-t border-border/60 pt-3">
        <button
          type="button"
          data-account-sign-out
          disabled={interactionLocked}
          onClick={onSignOut}
          className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-destructive disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t('Cerrar sesión')}
        </button>
      </div>
      <span className="sr-only">{t('Espacio activo')}: {activeLabel}</span>
    </div>
  )
}
~~~

- [ ] **Step 5: Compose mobile Dialog and desktop DropdownMenu without duplicating state logic**

Completar AccountWorkspaceMenu.tsx con un wrapper controlado. `topbar` y `dashboard` aparecen solo debajo de lg; `sidebar` es la única variante de escritorio:

~~~tsx
export function AccountWorkspaceMenu({
  surface,
}: {
  surface: 'topbar' | 'dashboard' | 'sidebar'
}) {
  const context = useOptionalAccountWorkspace()
  const desktopTitleId = useId()
  const mobileContentRef = useRef<HTMLDivElement>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(false)

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeInactivePortal = () => {
      if (desktop.matches) setMobileOpen(false)
      else setDesktopOpen(false)
    }
    closeInactivePortal()
    desktop.addEventListener('change', closeInactivePortal)
    return () => desktop.removeEventListener('change', closeInactivePortal)
  }, [])

  if (!context) return null

  const triggerVariant = surface === 'dashboard'
    ? 'dashboard'
    : surface === 'sidebar'
      ? 'sidebar'
      : 'compact'
  const renderTrigger = () => (
    <AccountWorkspaceTrigger
      variant={triggerVariant}
      workspace={context.presentedWorkspace}
      name={context.account.name}
      avatarUrl={context.account.avatarUrl}
      pending={context.pendingWorkspace !== null}
    />
  )
  const renderBody = (presentation: 'dialog' | 'menu') => (
    <AccountWorkspaceMenuBody
      presentation={presentation}
      account={context.account}
      workspace={context.presentedWorkspace}
      canUseCoach={context.trainerAccess.granted}
      pendingWorkspace={context.pendingWorkspace}
      error={context.error}
      onSignOut={() => { void context.signOutAccount() }}
      onWorkspaceChange={target => {
        void context.changeWorkspace(target).then(outcome => {
          if (outcome.status === 'navigating' || outcome.status === 'redirecting') {
            setMobileOpen(false)
            setDesktopOpen(false)
          }
        })
      }}
    />
  )
  const changeMobileOpen = (next: boolean) => {
    setMobileOpen(next)
    if (!next) context.clearError()
  }
  const changeDesktopOpen = (next: boolean) => {
    setDesktopOpen(next)
    if (!next) context.clearError()
  }

  return (
    <>
      {surface !== 'sidebar' ? (
        <div className="lg:hidden">
          <Dialog open={mobileOpen} onOpenChange={changeMobileOpen}>
            <DialogTrigger asChild>{renderTrigger()}</DialogTrigger>
            <DialogContent
              ref={mobileContentRef}
              aria-describedby={undefined}
              className="gap-4 border-border/70 bg-popover"
              onOpenAutoFocus={event => {
                event.preventDefault()
                mobileContentRef.current?.querySelector<HTMLButtonElement>(
                  '[aria-pressed="true"]',
                )
                  ?.focus()
              }}
            >
              <DialogTitle className="sr-only">
                <AccountWorkspaceMenuTitle />
              </DialogTitle>
              {renderBody('dialog')}
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
      {surface === 'sidebar' ? (
        <div className="hidden lg:block">
          <DropdownMenu open={desktopOpen} onOpenChange={changeDesktopOpen}>
            <DropdownMenuTrigger asChild>{renderTrigger()}</DropdownMenuTrigger>
            <DropdownMenuContent
              aria-labelledby={desktopTitleId}
              side={surface === 'sidebar' ? 'right' : 'bottom'}
              sideOffset={surface === 'sidebar' ? 16 : 4}
              align="end"
              className="w-80 rounded-2xl border-border/70 p-4"
            >
              <DropdownMenuLabel asChild>
                <span id={desktopTitleId} className="sr-only">
                  <AccountWorkspaceMenuTitle />
                </span>
              </DropdownMenuLabel>
              {renderBody('menu')}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </>
  )
}
~~~

Los estados de apertura son independientes: `topbar` y `dashboard` montan únicamente la rama móvil bajo `lg`, mientras `sidebar` monta únicamente el DropdownMenu de escritorio. Así el avatar grande del Dashboard no duplica el bloque de cuenta visible en escritorio y todo panel desktop queda anclado al sidebar, como exige la spec. El listener de matchMedia cierra el portal del breakpoint que deja de estar activo; lg:hidden/hidden lg:block controlan los triggers, no se usan para intentar ocultar contenido portalizado. En sidebar, sideOffset=16 coloca el panel después del borde de 256 px y evita que invada el nav. La rama de escritorio no introduce botones o nav arbitrarios dentro de role=menu: usa RadioGroup/RadioItem para el selector e Item asChild para enlaces y salida. Mientras la action está pendiente, selector, enlaces y cierre de sesión quedan bloqueados; el wrapper cierra tras `navigating` o `redirecting`, y deja abierto el panel para errores recuperables.

Definir antes del wrapper el título localizado sin obligar a AccountWorkspaceMenu a llamar useI18n cuando está fuera del provider:

~~~tsx
function AccountWorkspaceMenuTitle() {
  const { t } = useI18n()
  return <>{t('Cuenta y espacios')}</>
}
~~~

- [ ] **Step 6: Add the exact English catalog entries**

Añadir a ENGLISH:

~~~ts
  'Usuario': 'User',
  'Personal': 'Personal',
  'Entrenador': 'Coach',
  'Resumen': 'Overview',
  'Clientes': 'Clients',
  'Rutinas': 'Programs',
  'Entrenadores': 'Trainers',
  'Servicios': 'Services',
  'Abrir cuenta y espacios': 'Open account and workspaces',
  'Cuenta y espacios': 'Account and workspaces',
  'Selector de espacio': 'Workspace selector',
  'Espacio activo': 'Active workspace',
  'Enlaces de cuenta': 'Account links',
  'Perfil personal': 'Personal profile',
  'Mi acompañamiento': 'My coaching',
  'Perfil profesional': 'Professional profile',
  'Cambiando al espacio {workspace}…': 'Switching to the {workspace} workspace…',
  'El espacio solicitado no es válido.': 'The requested workspace is invalid.',
  'El espacio de entrenador ya no está disponible.': 'The coach workspace is no longer available.',
  'No se pudo cambiar de espacio. Inténtalo nuevamente.': 'Could not switch workspaces. Try again.',
~~~

- [ ] **Step 7: Re-run the component contract**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=4 src/components/navigation/__tests__/AccountWorkspaceMenu.test.tsx src/components/navigation/__tests__/AccountWorkspaceProvider.test.ts
~~~

Expected: PASS; Personal-only omite Coach pero conserva `Mi acompañamiento`, los enlaces cambian por contexto, las 20 copias inglesas están cubiertas y el trigger no contiene input de archivo.

- [ ] **Step 8: Commit the responsive account menu**

~~~powershell
git add src/components/navigation/AccountWorkspaceTrigger.tsx src/components/navigation/AccountWorkspaceMenu.tsx src/components/navigation/__tests__/AccountWorkspaceMenu.test.tsx src/lib/i18n/index.ts
git commit -m "feat: add responsive account workspace menu"
~~~

---

## Task 5: Make the shell consume the provider and clean both navigation bars

**Files:**

- Modify: src/app/(app)/layout.tsx
- Modify: src/app/(app)/__tests__/layout.test.tsx
- Modify: src/components/navigation/AppShell.tsx
- Modify: src/components/navigation/BottomNav.tsx
- Modify: src/components/navigation/DesktopSidebar.tsx
- Modify: src/components/navigation/__tests__/DesktopSidebar.test.tsx
- Modify: src/components/navigation/__tests__/AppChromeSurface.test.tsx
- Modify: src/components/navigation/__tests__/ActiveWorkoutDock.test.tsx
- Create: src/lib/native/androidBackOverlay.ts
- Modify: src/lib/native/useAndroidBack.ts
- Create: src/lib/native/__tests__/androidBackOverlay.test.ts
- Delete: src/components/navigation/WorkspaceSwitcher.tsx
- Modify: src/components/coaching/__tests__/fixtures/trainerAccessibility.fixture.tsx
- Modify: src/components/coaching/__tests__/fixtures/nextNavigation.fixture.ts
- Modify: src/components/coaching/__tests__/fixtures/workspace.fixture.ts
- Modify: src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts

**Interfaces:**

- Consumes: AccountWorkspaceModel y useAccountWorkspace().
- Produces: AppShell({ children, accountWorkspace }); BottomNav() y DesktopSidebar() sin navItems/workspace propios.

- [ ] **Step 1: Rewrite layout and chrome expectations before implementation**

En layout.test.tsx cambiar AppShellProps y la expectativa de entrenador activo:

~~~tsx
type AppShellProps = {
  accountWorkspace: {
    account: { name: string | null; email: string; avatarUrl: string | null }
    trainerAccess: { granted: boolean; reason?: string }
    preferredWorkspace: string
    personalNavItems: unknown
    coachNavItems: unknown
  }
}

expect(appShellProps).toEqual({
  accountWorkspace: {
    account: {
      name: 'Ana Pérez',
      email: 'ana@example.com',
      avatarUrl: '/avatar.jpg',
    },
    trainerAccess: { granted: true },
    preferredWorkspace: 'coach',
    personalNavItems: [{ href: '/dashboard', label: 'Inicio' }],
    coachNavItems: [{ href: '/coach', label: 'Resumen' }],
  },
})
~~~

Actualizar el mock de requireAppUserContext para que profile incluya full_name y avatar_url y user incluya email. En el caso de acceso inactivo, esperar trainerAccess: { granted: false, reason: 'inactive' }, preferredWorkspace: 'personal' y los dos arrays; no esperar workspace: undefined. Migrar también el tercer caso existente de cookie inválida: debe conservar trainerAccess `{ granted: true }`, normalizar preferredWorkspace a `personal` y recibir el mismo objeto `accountWorkspace` con ambos arrays. Ninguno de los tres casos puede conservar las props antiguas `navItems` o `workspace`.

En AppChromeSurface.test.tsx retirar primero el mock de `../WorkspaceSwitcher` —el módulo se eliminará en esta tarea—, importar AccountWorkspaceModel desde `../AccountWorkspaceContext` y AccountWorkspaceProvider desde `../AccountWorkspaceProvider`, y añadir:

~~~tsx
const mocks = vi.hoisted(() => ({ pathname: '/dashboard' }))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/actions/workspace', () => ({ setWorkspace: vi.fn() }))
vi.mock('@/app/(auth)/actions', () => ({ signOut: vi.fn() }))

const PERSONAL_MODEL: AccountWorkspaceModel = {
  account: { name: 'Ana', email: 'ana@example.com', avatarUrl: null },
  trainerAccess: { granted: true },
  preferredWorkspace: 'personal',
  personalNavItems: [
    { href: '/dashboard', label: 'Inicio' },
    { href: '/plan', label: 'Plan' },
    { href: '/entrenar', label: 'Entrenar' },
    { href: '/progress', label: 'Progreso' },
    { href: '/trainers', label: 'Entrenadores' },
  ],
  coachNavItems: [
    { href: '/coach', label: 'Resumen' },
    { href: '/coach/clients', label: 'Clientes' },
    { href: '/coach/programs', label: 'Rutinas' },
    { href: '/coach/requests', label: 'Solicitudes' },
  ],
}
const COACH_MODEL: AccountWorkspaceModel = {
  ...PERSONAL_MODEL,
  preferredWorkspace: 'coach',
}

function renderChrome(model: AccountWorkspaceModel, pathname = '/dashboard') {
  mocks.pathname = pathname
  return renderToStaticMarkup(
    <AccountWorkspaceProvider model={model}>
      <BottomNav />
    </AccountWorkspaceProvider>,
  )
}

it('keeps both persistent bars on the shared lighter surface', () => {
  const expectedSurface = 'bg-[hsl(var(--surface-1)/0.95)]'
  const topBar = renderToStaticMarkup(
    <FixedTopBar accountSlot="hidden">Vekira</FixedTopBar>,
  )
  const bottomBar = renderChrome(PERSONAL_MODEL)
  expect(topBar).toContain(expectedSurface)
  expect(bottomBar).toContain(expectedSurface)
})

it('renders only five personal destinations and never a workspace tab', () => {
  const html = renderChrome(PERSONAL_MODEL)
  expect((html.match(/data-bottom-nav-item=/g) ?? [])).toHaveLength(5)
  expect(html).not.toContain('data-workspace-switcher')
  expect(html).not.toContain('Cambiar al espacio')
  expect(html).toContain('grid-cols-5')
})

it('renders exactly four coach destinations', () => {
  const html = renderChrome(COACH_MODEL, '/coach')
  expect((html.match(/data-bottom-nav-item=/g) ?? [])).toHaveLength(4)
  expect(html).toContain('grid-cols-4')
})
~~~

En ActiveWorkoutDock.test.tsx retirar antes del borrado el mock de ../WorkspaceSwitcher. Mockear useOptionalAccountWorkspace con un valor mutable y extraer/probar shouldShowActiveWorkoutDock({ workspace, snapshot, pathname }): true para Personal con snapshot, false para Coach y false dentro de /session. Este test solo cubre la decisión pura de visibilidad; no añadir spies huérfanos de Storage. Task 9 probará la garantía de persistencia de forma integrada con saveBackup, el dock real y comparación byte a byte.

~~~ts
const snapshot: RestorableSessionSnapshot = {
  clientSessionId: 'session-1',
  workoutId: 'workout-1',
  workoutName: 'Fuerza',
  startedAt: Date.now(),
  exercises: [],
}

it.each([
  { workspace: 'personal', pathname: '/dashboard', expected: true },
  { workspace: 'coach', pathname: '/coach', expected: false },
  { workspace: 'personal', pathname: '/session/workout-1', expected: false },
] as const)('resolves dock visibility for $workspace at $pathname', testCase => {
  const { expected, ...input } = testCase
  expect(shouldShowActiveWorkoutDock({ ...input, snapshot }))
    .toBe(expected)
})

~~~

Reemplazar en DesktopSidebar.test.tsx los props y el mock de WorkspaceSwitcher. Importar el tipo desde AccountWorkspaceContext, mockear next/navigation, setWorkspace y signOut como en AppChromeSurface; envolver DesktopSidebar en AccountWorkspaceProvider con COACH_MODEL y pathname /coach. El contrato exacto es:

~~~tsx
function renderSidebar(model: AccountWorkspaceModel, pathname: string) {
  mocks.pathname = pathname
  return renderToStaticMarkup(
    <AccountWorkspaceProvider model={model}>
      <DesktopSidebar />
    </AccountWorkspaceProvider>,
  )
}

const html = renderSidebar(COACH_MODEL, '/coach')
expect(html).toContain('href="/coach"')
expect((html.match(/aria-current="page"/g) ?? [])).toHaveLength(1)
expect(html).not.toContain('href="/coach/profile"')
expect(html).not.toContain('href="/coach/services"')
expect(html).not.toContain('data-workspace-switcher')
const navEnd = html.indexOf('</nav>')
const accountTrigger = html.indexOf('aria-label="Abrir cuenta y espacios"')
expect(navEnd).toBeGreaterThan(-1)
expect(accountTrigger).toBeGreaterThan(navEnd)

const PERSONAL_ONLY_MODEL: AccountWorkspaceModel = {
  ...PERSONAL_MODEL,
  trainerAccess: { granted: false, reason: 'inactive' },
  preferredWorkspace: 'personal',
}
const personalHtml = renderSidebar(PERSONAL_ONLY_MODEL, '/dashboard')
expect(personalHtml).toContain('href="/dashboard"')
expect(personalHtml).not.toContain('href="/coach"')
expect(personalHtml).toContain('Espacio activo: Personal')
expect(personalHtml).not.toContain('data-workspace-switcher')
~~~

Esto reemplaza también el segundo test real de DesktopSidebar (`keeps the personal destination...`); no dejar ninguna invocación con `navItems` ni sin AccountWorkspaceProvider.

- [ ] **Step 2: Run shell/layout tests and confirm the old prop shape fails**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=4 "src/app/(app)/__tests__/layout.test.tsx" src/components/navigation/__tests__/AppChromeSurface.test.tsx src/components/navigation/__tests__/DesktopSidebar.test.tsx src/components/navigation/__tests__/ActiveWorkoutDock.test.tsx
~~~

Expected: FAIL because AppShell still receives one preselected nav array and BottomNav still appends WorkspaceSwitcher.

- [ ] **Step 3: Pass a minimal serializable model from the authenticated layout**

En layout.tsx construir ambos arrays y pasar solo datos escalares/arrays simples:

~~~tsx
const preferredWorkspace = normalizeWorkspace(
  cookies().get(WORKSPACE_COOKIE)?.value,
  trainerAccess.granted,
)
const accountWorkspace = {
  account: {
    name: profile.full_name,
    email: user.email ?? '',
    avatarUrl: profile.avatar_url,
  },
  trainerAccess: trainerAccess.granted
    ? { granted: true as const }
    : trainerAccess,
  preferredWorkspace,
  personalNavItems: getPersonalNavItems({ communityEnabled }),
  coachNavItems: getCoachNavItems(),
}

return (
  <I18nProvider language={language} timeZone={timeZone}>
    <AndroidBackHandler />
    <ProductPushNotificationsInit />
    {communityEnabled ? <SocialPushNotificationsInit /> : null}
    <TimezoneSync current={profile.timezone} />
    <AppShell accountWorkspace={accountWorkspace}>{children}</AppShell>
  </I18nProvider>
)
~~~

No pasar trainerAccess.profile al cliente y no llamar cookies().set desde el layout.

- [ ] **Step 4: Wrap all authenticated chrome in the provider**

Reemplazar la firma y composición de AppShell:

~~~tsx
import type { ReactNode } from 'react'
import { AccountWorkspaceProvider } from './AccountWorkspaceProvider'
import type { AccountWorkspaceModel } from './AccountWorkspaceContext'
import { AppScrollViewport } from './AppScrollViewport'
import { ActiveWorkoutDock, BottomNav } from './BottomNav'
import { DesktopSidebar } from './DesktopSidebar'

export function AppShell({
  children,
  accountWorkspace,
}: {
  children: ReactNode
  accountWorkspace: AccountWorkspaceModel
}) {
  return (
    <AccountWorkspaceProvider model={accountWorkspace}>
      <div className="fixed bottom-0 left-[var(--app-safe-area-left)] right-[var(--app-safe-area-right)] top-[var(--app-safe-area-top)] flex overflow-hidden">
        <DesktopSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppScrollViewport>
            {children}
            <ActiveWorkoutDock />
          </AppScrollViewport>
          <BottomNav />
        </div>
      </div>
    </AccountWorkspaceProvider>
  )
}
~~~

- [ ] **Step 5: Convert BottomNav to an exact four/five-column destination grid**

Eliminar el import y render de WorkspaceSwitcher. Dentro de BottomNav obtener navItems del contexto y usar:

~~~tsx
export function BottomNav() {
  const pathname = usePathname()
  const { navItems } = useAccountWorkspace()
  const { t } = useI18n()

  if (isImmersiveWorkspaceRoute(pathname)) return null

  return (
    <nav
      aria-label={t('Navegación principal')}
      className="fitai-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border/50 bg-[hsl(var(--surface-1)/0.95)] backdrop-blur lg:hidden"
    >
      <div className={cn(
        'mx-auto grid h-16 max-w-lg items-center px-2',
        navItems.length === 5 ? 'grid-cols-5' : 'grid-cols-4',
      )}>
        {navItems.map(({ href, label }) => {
          const Icon = getAppNavIcon(href)
          const isActive = isAppNavItemActive(pathname, href)
          const isTrainAction = href === '/entrenar'

          return (
            <PendingLink
              key={href}
              data-bottom-nav-item={href}
              href={href}
              showSpinner={false}
              aria-label={t(label)}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => { void hapticImpact('light') }}
              className="group relative flex min-w-0 cursor-pointer touch-manipulation flex-col items-center justify-center px-0 py-1.5 outline-none [aria-busy=true]:opacity-100"
            >
              <span
                data-bottom-nav-icon
                className={cn(
                'flex items-center justify-center transition-[color,background-color,transform,box-shadow] duration-200 ease-out group-active:scale-90 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background',
                isTrainAction
                  ? '-translate-y-1 h-11 w-11 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 group-hover:bg-primary/90 min-[480px]:-translate-y-2 min-[480px]:h-14 min-[480px]:w-14 min-[480px]:rounded-2xl'
                  : 'h-10 w-10 rounded-xl',
                !isTrainAction && isActive
                  ? 'fitai-nav-selected text-primary'
                  : !isTrainAction && 'text-muted-foreground group-hover:text-foreground',
              )}>
                {isActive && href === '/dashboard' ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-[23px] w-[23px] fill-current"
                  >
                    <path d="M12 2.25 2.75 9.45v10.3A2.25 2.25 0 0 0 5 22h3.75v-7.25a3.25 3.25 0 0 1 6.5 0V22H19a2.25 2.25 0 0 0 2.25-2.25V9.45L12 2.25Z" />
                  </svg>
                ) : (
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      'transition-[stroke-width] duration-150',
                      isTrainAction ? 'h-6 w-6' : 'h-[22px] w-[22px]',
                    )}
                    strokeWidth={isActive || isTrainAction ? 2.75 : 2}
                  />
                )}
              </span>
              <span
                data-bottom-nav-label
                className={cn(
                'mt-0.5 inline-block w-max max-w-none whitespace-nowrap text-center font-display text-[10px] font-semibold leading-none tracking-[-0.03em] transition-colors',
                isTrainAction
                  ? '-mt-1 text-primary'
                  : isActive
                    ? 'text-primary'
                    : 'text-muted-foreground',
              )}>
                {t(label)}
              </span>
            </PendingLink>
          )
        })}
      </div>
    </nav>
  )
}
~~~

La variación visual intencional frente al bloque actual es grid 5/4, cero padding horizontal del link y un label de ancho intrínseco, sin truncado, con font-display a 10 px y tracking -0.03em. En 320 px, Entrenadores puede sobresalir de su celda sin salir del viewport ni tocar Progreso; Task 9 mide los rectángulos reales de todas las etiquetas y no depende de que Arial Narrow exista. Haptics, SVG de Inicio y jerarquía de Entrenar permanecen explícitos en el código anterior.

Importar isImmersiveWorkspaceRoute desde workspacePresentation en BottomNav y DesktopSidebar, y eliminar sus listas locales HIDDEN_PREFIXES. Ambas superficies deben compartir el mismo límite exacto de ruta.

- [ ] **Step 6: Hide the active-workout dock from the resolved coach space without touching persistence**

Exportar el helper puro probado y, al inicio de ActiveWorkoutDock, leer el contexto opcional:

~~~tsx
export function shouldShowActiveWorkoutDock({
  workspace,
  snapshot,
  pathname,
}: {
  workspace: Workspace
  snapshot: RestorableSessionSnapshot | null
  pathname: string
}): boolean {
  return workspace === 'personal'
    && snapshot !== null
    && !isRouteWithinPrefix(pathname, '/session')
}

const accountWorkspace = useOptionalAccountWorkspace()
if (!shouldShowActiveWorkoutDock({
  workspace: accountWorkspace?.presentedWorkspace ?? 'personal',
  snapshot,
  pathname,
})) return null
~~~

No llamar clearActiveSession, localStorage.removeItem ni ninguna mutación al cambiar de espacio.

- [ ] **Step 7: Replace the desktop switcher with an account block outside nav**

DesktopSidebar no recibe props:

~~~tsx
export function DesktopSidebar() {
  const pathname = usePathname()
  const { navItems, presentedWorkspace } = useAccountWorkspace()
  const { t } = useI18n()
  const homeHref = presentedWorkspace === 'coach' ? '/coach' : '/dashboard'

  if (isImmersiveWorkspaceRoute(pathname)) return null

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border/60 bg-[hsl(var(--surface-1))] lg:flex lg:flex-col">
      <PendingLink
        href={homeHref}
        showSpinner={false}
        aria-label={t('Inicio')}
        className="mx-5 mt-6 inline-flex min-h-11 items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <VekiraLogo markClassName="h-10 w-10" />
      </PendingLink>
      <nav aria-label={t('Navegación principal')} className="mt-10 flex flex-1 flex-col gap-2 px-4">
        {navItems.map(({ href, label }) => {
          const Icon = getAppNavIcon(href)
          const isActive = isAppNavItemActive(pathname, href)
          return (
            <PendingLink
              key={href}
              href={href}
              showSpinner={false}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-4 text-sm font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-[hsl(var(--surface-2))] hover:text-foreground',
              )}
            >
              <Icon
                aria-hidden="true"
                className="h-5 w-5 shrink-0"
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span>{t(label)}</span>
            </PendingLink>
          )
        })}
      </nav>
      <div className="border-t border-border/60 p-4">
        <AccountWorkspaceMenu surface="sidebar" />
      </div>
    </aside>
  )
}
~~~

El bloque de cuenta queda después de </nav>; verificar en el test que el botón Abrir cuenta y espacios no es descendiente del nav principal.

- [ ] **Step 8: Migrate fixtures and remove the obsolete component**

En trainerAccessibility.fixture.tsx definir un modelo estable:

~~~ts
const coachAccountWorkspace = {
  account: {
    name: 'Ada Entrenadora',
    email: 'ada@example.com',
    avatarUrl: null,
  },
  trainerAccess: { granted: true as const },
  preferredWorkspace: 'coach' as const,
  personalNavItems: getPersonalNavItems({ communityEnabled: false }),
  coachNavItems: getCoachNavItems(),
}

const personalAccountWorkspace = {
  ...coachAccountWorkspace,
  preferredWorkspace: 'personal' as const,
  personalNavItems: getPersonalNavItems({ communityEnabled: true }),
}
~~~

Montar `editor-shell` con `<AppShell accountWorkspace={coachAccountWorkspace}>` y `personal-shell` con `<AppShell accountWorkspace={personalAccountWorkspace}>`; no puede quedar ninguna llamada con las props antiguas `navItems/workspace`. Para las demás superficies, envolver el `<main>` existente en `<AccountWorkspaceProvider model={coachAccountWorkspace}>`; así DirectoryFixture y TrainerPublicProfile reciben el contexto que sus headers nuevos consumen sin anidar otro provider dentro de AppShell. Reemplazar la superficie workspace por `<AccountWorkspaceMenu surface="dashboard" />` y retirar el import de WorkspaceSwitcher.

En nextNavigation.fixture.ts hacer que usePathname represente la familia visual real en vez de devolver siempre /dashboard:

~~~ts
export function usePathname() {
  const fixtureSurface = new URLSearchParams(window.location.search).get('surface')
  if (fixtureSurface === 'personal-shell') return '/dashboard'
  if (fixtureSurface === 'directory') return '/trainers'
  if (fixtureSurface === 'public-profile') return '/trainers/ada-entrenadora'
  if (fixtureSurface === 'active-dock') return '/dashboard'
  return '/coach'
}
~~~

Conservar push/refresh actuales; Task 8 añadirá replace para probar el cambio desde un editor sucio. Cambiar workspace.fixture.ts a:

~~~ts
export async function setWorkspace(formData: FormData) {
  const workspace = formData.get('workspace')
  if (workspace !== 'personal' && workspace !== 'coach') {
    return {
      ok: false as const,
      code: 'invalid_workspace' as const,
      error: 'El espacio solicitado no es válido.',
    }
  }
  return {
    ok: true as const,
    workspace,
    destination: workspace === 'coach' ? '/coach' as const : '/dashboard' as const,
  }
}

export async function signOut() {
  const state = window as Window & { __SIGN_OUTS__?: number }
  state.__SIGN_OUTS__ = (state.__SIGN_OUTS__ ?? 0) + 1
}
~~~

En trainerAccessibilityAcceptance.test.ts añadir el alias exacto de @/app/(auth)/actions al mismo workspace.fixture.ts, conservar el alias de @/app/actions/workspace y añadir @radix-ui/react-dropdown-menu a optimizeDeps. El fixture exporta las dos acciones para que el Provider no arrastre módulos server-only de Next dentro de Vite. Eliminar src/components/navigation/WorkspaceSwitcher.tsx después de confirmar con rg que no quedan imports.

Reemplazar además el caso angosto `keeps six personal destinations...`: su lista exacta pasa a `['Inicio', 'Plan', 'Entrenar', 'Progreso', 'Comunidad']`, los links son exactamente cinco, `Mi entrenador` y `Cambiar al espacio Entrenador` no existen dentro del nav, e `iconBounds` tiene exactamente cinco elementos —sin el `+ 1` del switcher eliminado—. Conservar las comprobaciones de targets, bounds y no solape en todos los viewports ya definidos.

- [ ] **Step 9: Write the Android overlay-back contract and confirm red**

Crear src/lib/native/__tests__/androidBackOverlay.test.ts antes del helper:

~~~ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dismissOpenRadixOverlay,
  OPEN_RADIX_OVERLAY_SELECTOR,
} from '../androidBackOverlay'

afterEach(() => vi.unstubAllGlobals())

describe('Android back overlay priority', () => {
  it.each(['dialog', 'alertdialog', 'menu'])('recognizes an open %s', role => {
    expect(OPEN_RADIX_OVERLAY_SELECTOR)
      .toContain(`[role="${role}"][data-state="open"]`)
  })

  it('returns false without dispatching when no overlay is open', () => {
    const dispatchEvent = vi.fn()
    const root = {
      querySelector: vi.fn().mockReturnValue(null),
      dispatchEvent,
    } as unknown as Document
    expect(dismissOpenRadixOverlay(root)).toBe(false)
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('dispatches one cancelable Escape when the top overlay is open', () => {
    class FakeKeyboardEvent {
      constructor(public type: string, public init: KeyboardEventInit) {}
    }
    vi.stubGlobal('KeyboardEvent', FakeKeyboardEvent)
    const dispatchEvent = vi.fn()
    const root = {
      querySelector: vi.fn().mockReturnValue({}),
      dispatchEvent,
    } as unknown as Document
    expect(dismissOpenRadixOverlay(root)).toBe(true)
    expect(dispatchEvent).toHaveBeenCalledOnce()
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: 'keydown',
      init: { key: 'Escape', bubbles: true, cancelable: true },
    })
  })
})
~~~

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=4 src/lib/native/__tests__/androidBackOverlay.test.ts
~~~

Expected: FAIL porque androidBackOverlay.ts todavía no existe.

- [ ] **Step 10: Extract the production overlay branch used by Android Back**

Crear src/lib/native/androidBackOverlay.ts:

~~~ts
export const OPEN_RADIX_OVERLAY_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
].join(', ')

export function dismissOpenRadixOverlay(root: Document = document): boolean {
  if (!root.querySelector(OPEN_RADIX_OVERLAY_SELECTOR)) return false
  root.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  }))
  return true
}
~~~

En useAndroidBack.ts importar dismissOpenRadixOverlay, borrar hasOpenOverlay/dismissTopOverlay y reemplazar el ramo 2 por:

~~~ts
if (dismissOpenRadixOverlay()) return
~~~

Así el mismo ramo que usa el listener nativo cubre el Dialog móvil y el `role=menu` de tablet/escritorio. Task 9 lo invocará en Chromium sobre ambos portales para verificar cierre y restauración de foco; no se limita a simular Escape con una ruta de prueba distinta.

- [ ] **Step 11: Re-run shell and existing accessibility contracts**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=1 "src/app/(app)/__tests__/layout.test.tsx" src/components/navigation/__tests__/AppChromeSurface.test.tsx src/components/navigation/__tests__/DesktopSidebar.test.tsx src/components/navigation/__tests__/ActiveWorkoutDock.test.tsx src/lib/native/__tests__/androidBackOverlay.test.ts src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts
~~~

Expected: PASS; la fixture browser compila con la API nueva, Personal produce cinco links, Coach cuatro, no existe data-workspace-switcher y Android reconoce dialog/alertdialog/menu antes de navegar.

- [ ] **Step 12: Commit the cleaned shell**

~~~powershell
git add "src/app/(app)/layout.tsx" "src/app/(app)/__tests__/layout.test.tsx" src/components/navigation/AppShell.tsx src/components/navigation/BottomNav.tsx src/components/navigation/DesktopSidebar.tsx src/components/navigation/__tests__/DesktopSidebar.test.tsx src/components/navigation/__tests__/AppChromeSurface.test.tsx src/components/navigation/__tests__/ActiveWorkoutDock.test.tsx src/lib/native/androidBackOverlay.ts src/lib/native/useAndroidBack.ts src/lib/native/__tests__/androidBackOverlay.test.ts src/components/coaching/__tests__/fixtures/trainerAccessibility.fixture.tsx src/components/coaching/__tests__/fixtures/nextNavigation.fixture.ts src/components/coaching/__tests__/fixtures/workspace.fixture.ts src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts
git rm src/components/navigation/WorkspaceSwitcher.tsx
git commit -m "feat: clean workspace navigation chrome"
~~~

---

## Task 6: Add the shared top-bar slot and explicit immersive exclusions

**Files:**

- Modify: src/components/navigation/FixedTopBar.tsx
- Modify: src/components/navigation/PageTopBar.tsx
- Create: src/components/navigation/__tests__/FixedTopBarAccountSlot.test.tsx
- Create: src/components/navigation/__tests__/AccountWorkspaceRouteCoverage.test.ts
- Modify: src/components/navigation/__tests__/pendingLinkRscBoundary.test.tsx
- Modify: src/components/feedback/RouteLoading.tsx
- Modify: src/components/feedback/__tests__/routeLoading.test.ts
- Modify: src/app/(app)/loading.tsx
- Modify: src/components/session/SessionHeader.tsx
- Modify: src/components/session/__tests__/SessionHeader.test.ts
- Modify: src/app/(app)/plans/generate/page.tsx
- Modify: src/app/(app)/feed/new/page.tsx
- Modify: src/app/(app)/feed/page.tsx
- Modify: src/components/chat/ChatContainer.tsx
- Modify: src/app/(app)/exercises/page.tsx

**Interfaces:**

- Consumes: AccountWorkspaceMenu surface="topbar" y accountContext.immersiveRoute resuelto por el provider.
- Produces: FixedTopBarAccountSlot = 'default' | 'hidden' | 'custom'; FixedTopBar accountSlot/actions y PageTopBar accountSlot, con una sola región derecha para acciones más cuenta.

- [ ] **Step 1: Write account-slot composition tests**

Crear FixedTopBarAccountSlot.test.tsx:

~~~tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import type { AccountWorkspaceModel } from '../AccountWorkspaceContext'
import { AccountWorkspaceProvider } from '../AccountWorkspaceProvider'
import { FixedTopBar } from '../FixedTopBar'
import { PageTopBar } from '../PageTopBar'

const mocks = vi.hoisted(() => ({ pathname: '/notifications' }))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/actions/workspace', () => ({ setWorkspace: vi.fn() }))
vi.mock('@/app/(auth)/actions', () => ({ signOut: vi.fn() }))

const model: AccountWorkspaceModel = {
  account: { name: 'Ana Pérez', email: 'ana@example.com', avatarUrl: null },
  trainerAccess: { granted: true },
  preferredWorkspace: 'personal',
  personalNavItems: [{ href: '/dashboard', label: 'Inicio' }],
  coachNavItems: [{ href: '/coach', label: 'Resumen' }],
}

afterEach(() => {
  mocks.pathname = '/notifications'
})

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <I18nProvider language="es" syncDocumentLanguage={false}>
      <AccountWorkspaceProvider model={model}>{node}</AccountWorkspaceProvider>
    </I18nProvider>,
  )
}

describe('FixedTopBar account slot', () => {
  it('adds one default compact account trigger inside the provider', () => {
    const html = render(<FixedTopBar>Título</FixedTopBar>)
    expect((html.match(/aria-label="Abrir cuenta y espacios"/g) ?? [])).toHaveLength(1)
  })

  it.each(['/session/workout-1', '/plans/generate', '/feed/new'])(
    'suppresses the default account trigger on immersive route %s',
    pathname => {
      mocks.pathname = pathname
      expect(render(<FixedTopBar>Cargando</FixedTopBar>))
        .not.toContain('Abrir cuenta y espacios')
    },
  )

  it('renders neither default nor geometry outside the provider', () => {
    const html = renderToStaticMarkup(<FixedTopBar>Título</FixedTopBar>)
    expect(html).not.toContain('Abrir cuenta y espacios')
    expect(html).not.toContain('data-account-workspace-slot')
  })

  it('supports hidden and caller-owned custom slots', () => {
    expect(render(<FixedTopBar accountSlot="hidden">Sesión</FixedTopBar>))
      .not.toContain('Abrir cuenta y espacios')
    const custom = render(
      <FixedTopBar accountSlot="custom">
        <button aria-label="Abrir cuenta y espacios">Cuenta</button>
      </FixedTopBar>,
    )
    expect((custom.match(/aria-label="Abrir cuenta y espacios"/g) ?? [])).toHaveLength(1)
  })

  it('keeps caller actions and the default trigger in one right region', () => {
    const html = render(
      <FixedTopBar actions={<button aria-label="Buscar">Buscar</button>}>
        <h1>Comunidad</h1>
      </FixedTopBar>,
    )
    expect((html.match(/data-fixed-topbar-actions/g) ?? [])).toHaveLength(1)
    expect(html).toContain('aria-label="Buscar"')
    expect((html.match(/aria-label="Abrir cuenta y espacios"/g) ?? [])).toHaveLength(1)
  })

  it('keeps PageTopBar right actions next to one account trigger', () => {
    const html = render(
      <PageTopBar
        title="Notificaciones"
        right={<button aria-label="Filtrar notificaciones">Filtrar</button>}
      />,
    )
    expect(html).toContain('aria-label="Filtrar notificaciones"')
    expect((html.match(/aria-label="Abrir cuenta y espacios"/g) ?? [])).toHaveLength(1)
    expect(html).toContain('data-page-topbar-actions')
  })

  it('lets PageTopBar hide the account while preserving caller actions', () => {
    const html = render(
      <PageTopBar
        accountSlot="hidden"
        title="Generar plan"
        right={<button aria-label="Ayuda">Ayuda</button>}
      />,
    )
    expect(html).toContain('aria-label="Ayuda"')
    expect(html).not.toContain('Abrir cuenta y espacios')
  })
})
~~~

Crear también AccountWorkspaceRouteCoverage.test.ts con imports/root/read y el describe de contratos fuente detallado en Step 6. Debe existir antes de tocar feed, chat, exercises o los call sites inmersivos.

En src/components/feedback/__tests__/routeLoading.test.ts reemplazar la expectativa obsoleta de `dashboard-avatar-badge` por este contrato fuente:

~~~ts
it('uses the real dashboard account trigger without a duplicate avatar skeleton', () => {
  const routeLoading = source('../RouteLoading.tsx')
  const start = routeLoading.indexOf('export function DashboardLoading')
  const end = routeLoading.indexOf('export function PlanLoading')
  const dashboard = routeLoading.slice(start, end)
  expect(dashboard).toContain('accountSlot="custom"')
  expect(dashboard).toContain('<AccountWorkspaceMenu surface="dashboard"')
  expect(dashboard).toContain('data-loading-slot="dashboard-notification"')
  expect(dashboard).not.toContain('dashboard-avatar-badge')
})
~~~

No añadir mocks de workspace/signOut a routeLoading.test.ts, SessionHeader.test.ts ni a los tests existentes de Settings/Measurements/Notifications/Coach: el contrato action-free de AccountWorkspaceContext debe permitir importar FixedTopBar y AccountWorkspaceMenu sin evaluar esas Server Actions. AccountWorkspaceMenu.test.ts comprueba esta separación a nivel fuente y la suite completa comprueba esos consumidores reales.

- [ ] **Step 2: Run the new test and confirm the missing prop**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=4 src/components/navigation/__tests__/FixedTopBarAccountSlot.test.tsx src/components/navigation/__tests__/AccountWorkspaceRouteCoverage.test.ts src/components/navigation/__tests__/pendingLinkRscBoundary.test.tsx src/components/feedback/__tests__/routeLoading.test.ts src/components/session/__tests__/SessionHeader.test.ts
~~~

Expected: FAIL because FixedTopBar has no accountSlot/actions, PageTopBar does not compose the account action and los consumidores especiales aún no declaran su política.

- [ ] **Step 3: Add the explicit slot modes to FixedTopBar**

Extender el contrato y añadir el slot como último hijo del contenedor flex:

~~~tsx
export type FixedTopBarAccountSlot = 'default' | 'hidden' | 'custom'

interface FixedTopBarProps {
  children: ReactNode
  actions?: ReactNode
  className?: string
  contentClassName?: string
  initialHeight?: number
  accountSlot?: FixedTopBarAccountSlot
}

export function FixedTopBar({
  children,
  actions,
  className,
  contentClassName,
  initialHeight = 68,
  accountSlot = 'default',
}: FixedTopBarProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [contentHeight, setContentHeight] = useState(initialHeight)
  const accountContext = useOptionalAccountWorkspace()

  useEffect(() => {
    setPortalTarget(document.body)
  }, [])

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const updateHeight = () => setContentHeight(content.getBoundingClientRect().height)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(content)
    return () => observer.disconnect()
  }, [portalTarget])

  const account = accountSlot === 'default'
    && accountContext
    && !accountContext.immersiveRoute
    ? <AccountWorkspaceMenu surface="topbar" />
    : null

  const topBar = (
    <header className={cn(
      'fixed inset-x-0 top-0 z-30 border-b border-border/30 bg-[hsl(var(--surface-1)/0.95)] pt-[var(--app-safe-area-top)] shadow-sm backdrop-blur-md',
      className,
    )}>
      <div
        ref={contentRef}
        className={cn('mx-auto flex max-w-lg items-center gap-3 px-4 py-3', contentClassName)}
      >
        {children}
        {(actions || account) ? (
          <div
            data-fixed-topbar-actions
            className="ml-auto flex shrink-0 items-center gap-2"
          >
            {actions}
            {account ? <span data-account-workspace-slot>{account}</span> : null}
          </div>
        ) : null}
      </div>
    </header>
  )

  return (
    <>
      {portalTarget ? createPortal(topBar, portalTarget) : topBar}
      <div aria-hidden className="shrink-0" style={{ height: contentHeight }} />
    </>
  )
}
~~~

Añadir AccountWorkspaceMenu desde su módulo y useOptionalAccountWorkspace desde AccountWorkspaceContext; los dos effects anteriores quedan completos en el bloque y mantienen el portal/ResizeObserver existentes. FixedTopBar consume immersiveRoute del mismo provider que ya resolvió el pathname: así protege el loading padre sin introducir otro usePathname en cada loading o test que renderiza la barra fuera del shell. actions es la API obligatoria para controles de la derecha: no se dejan grupos de acciones mezclados entre children, lo que mantiene una única región encogible y evita que el trigger se convierta en un tercer bloque ambiguo.

- [ ] **Step 4: Make PageTopBar own the action grouping**

PageTopBar delega su cuenta al slot común y entrega right a la región actions:

~~~tsx
interface PageTopBarProps {
  title: string
  subtitle?: string
  backHref?: string
  backLabel?: string
  icon?: React.ReactNode
  right?: React.ReactNode
  accountSlot?: 'default' | 'hidden'
}

export function PageTopBar({
  title,
  subtitle,
  backHref,
  backLabel,
  icon,
  right,
  accountSlot = 'default',
}: PageTopBarProps) {
  return (
    <FixedTopBar
      accountSlot={accountSlot}
      contentClassName="justify-between"
      actions={right ? (
        <span data-page-topbar-actions className="contents">{right}</span>
      ) : undefined}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {backHref && backLabel ? (
          <PendingLink
            href={backHref}
            showSpinner={false}
            aria-label={backLabel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          >
            <PendingLinkIcon name="arrow-left" className="h-5 w-5" />
          </PendingLink>
        ) : null}
        {icon ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-bold leading-tight text-foreground">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
    </FixedTopBar>
  )
}
~~~

El PendingLink conserva su tamaño de 44 px y estados de hover; la prueba RSC seguirá validando el icono serializable. PageTopBar ya no importa AccountWorkspaceMenu, por lo que no duplica el trigger ni expone un forwardRef de Radix a sus consumidores servidor.

- [ ] **Step 5: Mark immersive page headers explicitly and make the parent loading route-safe**

Aplicar exactamente:

~~~tsx
// src/components/session/SessionHeader.tsx
<FixedTopBar
  accountSlot="hidden"
  className="bg-background/95"
  contentClassName="block max-w-lg p-0"
  initialHeight={73}
>

// src/app/(app)/plans/generate/page.tsx
<PageTopBar
  accountSlot="hidden"
  title="Generar plan"
  subtitle="Entrenamiento personalizado basado en evidencia"
  backHref="/plan"
  backLabel="Plan"
  icon={<Sparkles className="h-5 w-5" />}
/>

// src/app/(app)/feed/new/page.tsx
<FixedTopBar accountSlot="hidden">

// src/components/feedback/RouteLoading.tsx, solo SessionLoading
<FixedTopBar
  accountSlot="hidden"
  contentClassName="justify-between"
  actions={<Shimmer className="h-10 w-20 rounded-lg bg-violet-500/15" />}
>
  <div className="min-w-0">
    <p className="text-xs font-semibold uppercase tracking-widest text-violet-300/80">
      Sesion en curso
    </p>
    <h1 className="mt-1 truncate font-display text-xl font-bold text-foreground">
      Cargando rutina
    </h1>
  </div>
</FixedTopBar>
~~~

En el mismo RouteLoading.tsx, DashboardLoading deja de dibujar otro avatar/badge y usa el disparador grande real del provider mientras mantiene esqueletos solo para el saludo y la campana. Dentro de la función existente, reemplazar únicamente su bloque FixedTopBar por:

~~~tsx
<FixedTopBar
  accountSlot="custom"
  initialHeight={92}
  contentClassName="max-w-6xl flex-col items-stretch gap-0 sm:px-6"
>
  <div className="flex items-center gap-3">
    <AccountWorkspaceMenu surface="dashboard" />
    <div className="min-w-0 flex-1">
      <Shimmer className="h-4 w-24 rounded bg-muted/40" />
      <Shimmer className="mt-2 h-8 w-36 rounded" />
    </div>
    <Shimmer
      data-loading-slot="dashboard-notification"
      className="h-11 w-11 shrink-0 rounded-xl bg-muted/40"
    />
  </div>
</FixedTopBar>
~~~

Importar AccountWorkspaceMenu en RouteLoading.tsx y conservar literalmente el cuerpo actual situado después de FixedTopBar, incluido weekDays, semana, métricas y cards.

En src/app/(app)/loading.tsx retirar el avatar shimmer de la derecha. El FixedTopBar estándar mostrará el trigger real en rutas estándar, pero su comprobación compartida de isImmersiveWorkspaceRoute(pathname) lo omitirá para /session/**, /plans/generate y /feed/new incluso cuando Next renderice este loading padre antes del call site específico. Mantener además accountSlot="hidden" en las páginas y en SessionLoading como contrato explícito de cada superficie inmersiva.

- [ ] **Step 6: Move collision-prone controls into the right action region**

Actualizar los consumidores conocidos en vez de confiar en el orden arbitrario de children:

- feed/page.tsx: dejar el h1 con min-w-0 flex-1 como children y pasar Bell/Search/Publicar mediante actions. Publicar usa h-11 w-11 justify-center en móvil y sm:w-auto sm:px-2; su texto usa sr-only sm:not-sr-only para que a 320 px convivan título, tres acciones y cuenta sin overflow, manteniendo aria-label.
- ChatContainer.tsx: en vista chat envolver back+título en un único div min-w-0 flex-1; en la lista dejar ese grupo como children y pasar Nueva mediante actions. El accountSlot default queda al final de la misma región derecha.
- exercises/page.tsx: usar accountSlot="custom" porque el toolbar es multinivel; primera fila h1 más AccountWorkspaceMenu surface="topbar", segunda fila StatStrip y tercera fila ExerciseFilters. Subir initialHeight a 156 como reserva SSR y dejar que ResizeObserver mida la altura real.
- RouteLoading.tsx: BackHeader, ChatLoading y SocialFeedLoading pasan right/skeletons mediante actions; ExercisesLoading replica las tres filas anteriores y monta AccountWorkspaceMenu en la primera. Los demás loadings simples heredan el slot default.

Usar estas composiciones, conservando los handlers/destinos actuales dentro de cada control:

~~~tsx
// feed/page.tsx
<FixedTopBar
  actions={(
    <div className="flex items-center gap-1">
      <Link href="/solicitudes" aria-label={t('Solicitudes de seguimiento')} className="relative flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground">
        <Bell className="h-5 w-5" />
        {pendingRequests > 0 ? (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {pendingRequests}
          </span>
        ) : null}
      </Link>
      <Link href="/buscar" aria-label={t('Buscar usuarios')} className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground">
        <Search className="h-5 w-5" />
      </Link>
      <Link href="/feed/new" aria-label={t('Nueva publicación')} className="inline-flex h-11 w-11 items-center justify-center gap-1.5 text-primary sm:w-auto sm:px-2">
        <PlusCircle className="h-5 w-5" />
        <span className="sr-only sm:not-sr-only">{t('Publicar')}</span>
      </Link>
    </div>
  )}
>
  <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold">{t('Comunidad')}</h1>
</FixedTopBar>

// ChatContainer.tsx, rama lista
<FixedTopBar
  actions={(
    <button
      type="button"
      onClick={() => setShowNewDialog(true)}
      className="flex min-h-11 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white"
    >
      <Plus className="h-4 w-4" />
      {t('Nueva')}
    </button>
  )}
>
  <div className="flex min-w-0 flex-1 items-center gap-2.5">
    <PendingLink href="/dashboard" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
      <ArrowLeft className="h-5 w-5" />
    </PendingLink>
    <h1 className="truncate font-display text-xl font-bold text-foreground">Coach IA</h1>
  </div>
</FixedTopBar>

// exercises/page.tsx
<FixedTopBar
  accountSlot="custom"
  className="border-zinc-800/50 bg-[#0e0e10]/95"
  contentClassName="mx-auto block max-w-7xl px-4 py-3 sm:px-6"
  initialHeight={156}
>
  <div className="flex min-w-0 items-center justify-between gap-3">
    <h1 className="min-w-0 truncate text-xl font-bold tracking-tight">
      {t('Biblioteca de ejercicios')}
    </h1>
    <AccountWorkspaceMenu surface="topbar" />
  </div>
  <div className="mt-2 flex min-h-11 items-center justify-end">
    <StatStrip total={total} page={page} totalPages={totalPages} t={t} />
  </div>
  <div className="pb-3">
    <ExerciseFilters
      muscleGroups={muscleGroups.map(value => ({ value, label: localizeMuscleGroup(value, language) }))}
      equipmentList={equipmentList.map(value => ({ value, label: localizeEquipment(value, language) }))}
      current={{ search, difficulty, exercise_type, muscle_group, equipment }}
      total={total}
    />
  </div>
</FixedTopBar>

// RouteLoading.tsx: BackHeader
<FixedTopBar actions={right}>
  <div className="flex min-w-0 flex-1 items-center gap-2.5">
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground">
      <ArrowLeft className="h-5 w-5" />
      <span className="sr-only">{backLabel}</span>
    </div>
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      <h1 className="truncate font-display text-lg font-bold leading-tight text-foreground">{title}</h1>
      {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
    </div>
  </div>
</FixedTopBar>

// RouteLoading.tsx: ChatLoading
<FixedTopBar
  actions={(
    <div className="flex min-h-11 items-center gap-1.5 rounded-lg bg-violet-600/70 px-3 text-sm font-medium text-white">
      <PlusCircle className="h-4 w-4" />
      Nueva
    </div>
  )}
>
  <div className="flex min-w-0 flex-1 items-center gap-2.5">
    <div className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground">
      <ArrowLeft className="h-5 w-5" />
    </div>
    <h1 className="truncate font-display text-xl font-bold text-foreground">Coach IA</h1>
  </div>
</FixedTopBar>

// RouteLoading.tsx: SocialFeedLoading
<FixedTopBar
  actions={(
    <div className="flex items-center gap-1 text-muted-foreground">
      <span className="flex h-11 w-11 items-center justify-center"><Bell className="h-5 w-5" /></span>
      <span className="flex h-11 w-11 items-center justify-center"><Search className="h-5 w-5" /></span>
      <span className="flex h-11 w-11 items-center justify-center text-primary"><PlusCircle className="h-5 w-5" /></span>
    </div>
  )}
>
  <h1 className="min-w-0 flex-1 text-lg font-bold">Comunidad</h1>
</FixedTopBar>
~~~

ExercisesLoading usa este bloque exacto y no importa componentes de página servidor:

~~~tsx
<FixedTopBar
  accountSlot="custom"
  className="border-zinc-800/50 bg-[#0e0e10]/95"
  contentClassName="mx-auto block max-w-7xl px-4 py-3 sm:px-6"
  initialHeight={156}
>
  <div className="flex min-w-0 items-center justify-between gap-3">
    <h1 className="min-w-0 truncate text-xl font-bold tracking-tight">Exercise Library</h1>
    <AccountWorkspaceMenu surface="topbar" />
  </div>
  <div className="mt-2 flex min-h-11 items-center justify-end gap-5">
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
  <div className="mt-2 flex gap-2 overflow-hidden pb-3">
    <Shimmer className="h-10 w-48 rounded-xl bg-zinc-800" />
    <Shimmer className="h-10 w-32 rounded-xl bg-zinc-800" />
    <Shimmer className="h-10 w-32 rounded-xl bg-zinc-800" />
  </div>
</FixedTopBar>
~~~

El AccountWorkspaceRouteCoverage.test.ts rojo de Step 1 usa readFileSync y la misma resolución root mostrada en Task 7. Su primer contrato es:

~~~ts
describe('top-bar account composition contract', () => {
  it('groups feed and chat actions instead of appending an unrelated sibling', () => {
    expect(read('src/app/(app)/feed/page.tsx')).toContain('actions=')
    expect(read('src/components/chat/ChatContainer.tsx')).toContain('actions=')
  })
  it('owns the exercise account trigger inside its multi-row toolbar', () => {
    const source = read('src/app/(app)/exercises/page.tsx')
    expect(source).toContain('accountSlot="custom"')
    expect(source).toContain('<AccountWorkspaceMenu surface="topbar"')
  })
  it.each([
    'src/components/session/SessionHeader.tsx',
    'src/app/(app)/plans/generate/page.tsx',
    'src/app/(app)/feed/new/page.tsx',
  ])('%s explicitly hides account access', source => {
    expect(read(source)).toContain('accountSlot="hidden"')
  })
  it('hides account access in SessionLoading only', () => {
    const source = read('src/components/feedback/RouteLoading.tsx')
    const start = source.indexOf('export function SessionLoading')
    const end = source.indexOf('export function ExercisesLoading')
    const session = source.slice(start, end)
    expect(session).toContain('accountSlot="hidden"')
  })
  it('keeps the parent loading route-aware without a duplicate avatar', () => {
    const provider = read('src/components/navigation/AccountWorkspaceProvider.tsx')
    const topBar = read('src/components/navigation/FixedTopBar.tsx')
    const appLoading = read('src/app/(app)/loading.tsx')
    expect(provider).toContain('isImmersiveWorkspaceRoute(pathname)')
    expect(topBar).toContain('!accountContext.immersiveRoute')
    expect(appLoading).not.toContain('h-10 w-10 rounded-full')
  })
})
~~~

Task 7 ampliará el archivo con la matriz completa. Task 9 medirá las composiciones topbar, feed y toolbar a 320 y 360 px.

- [ ] **Step 7: Preserve the RSC boundary test**

En pendingLinkRscBoundary.test.tsx conservar solo los mocks que el test ya necesita para next/navigation y PendingLink; no añadir mocks de Server Actions. Añadir un caso que invoque PageTopBar con right y confirme que containsRawForwardRef sigue devolviendo false y que el output contiene data-page-topbar-actions. Esto verifica que PageTopBar y el contexto consumido por los headers siguen libres de imports transitivos de acciones servidor. No pasar componentes Radix forwardRef crudos como props desde una página servidor.

- [ ] **Step 8: Re-run focused top-bar and immersive tests**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=4 src/components/navigation/__tests__/FixedTopBarAccountSlot.test.tsx src/components/navigation/__tests__/pendingLinkRscBoundary.test.tsx src/components/navigation/__tests__/AccountWorkspaceRouteCoverage.test.ts src/components/feedback/__tests__/routeLoading.test.ts src/components/session/__tests__/SessionHeader.test.ts
~~~

Expected: PASS; default produce un trigger dentro del provider, hidden cero, las tres URLs inmersivas también producen cero desde el FixedTopBar del loading padre, DashboardLoading usa un solo disparador grande real y el header de sesión mantiene sus controles anteriores.

- [ ] **Step 9: Commit the top-bar contract**

~~~powershell
git add src/components/navigation/FixedTopBar.tsx src/components/navigation/PageTopBar.tsx src/components/navigation/__tests__/FixedTopBarAccountSlot.test.tsx src/components/navigation/__tests__/AccountWorkspaceRouteCoverage.test.ts src/components/navigation/__tests__/pendingLinkRscBoundary.test.tsx src/components/feedback/RouteLoading.tsx src/components/feedback/__tests__/routeLoading.test.ts src/components/session/SessionHeader.tsx src/components/session/__tests__/SessionHeader.test.ts "src/app/(app)/loading.tsx" "src/app/(app)/plans/generate/page.tsx" "src/app/(app)/feed/new/page.tsx" "src/app/(app)/feed/page.tsx" src/components/chat/ChatContainer.tsx "src/app/(app)/exercises/page.tsx"
git commit -m "feat: expose account menu from app top bars"
~~~

---

## Task 7: Turn the dashboard avatar and content headers into account entry points

**Files:**

- Modify: src/components/dashboard/DashboardHeader.tsx
- Modify: src/components/dashboard/__tests__/DashboardHeader.test.tsx
- Modify: src/lib/dashboard/__tests__/DashboardPage.integration.test.tsx
- Modify: src/app/(app)/dashboard/page.tsx
- Modify: src/components/coaching/TrainerDirectory.tsx
- Modify: src/components/coaching/TrainerPublicProfile.tsx
- Modify: src/app/(app)/coaching/page.tsx
- Modify: src/components/settings/__tests__/profileSettings.test.tsx
- Modify: src/components/navigation/__tests__/AccountWorkspaceRouteCoverage.test.ts
- Modify: src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts

**Interfaces:**

- Consumes: AccountWorkspaceMenu surface="dashboard" y surface="topbar", además del slot común de Task 6.
- Produces: un botón Abrir cuenta y espacios en cada familia estándar de la matriz, sin barra vacía ni título duplicado. En TrainerDirectory, TrainerPublicProfile y coaching/page el acceso es consistente dentro del header de contenido existente; no se declara fijo durante scroll.

- [ ] **Step 1: Replace dashboard settings/uploader assertions with the approved behavior**

Actualizar DashboardHeader.test.tsx: retirar los mocks de AvatarUploader e I18nProvider y quitar `avatarUrl` de baseProps; mockear next/navigation, `@/app/actions/workspace` y `@/app/(auth)/actions` como en AccountWorkspaceProvider.test.ts; importar el tipo desde AccountWorkspaceContext y envolver el header en I18nProvider y AccountWorkspaceProvider con un modelo personal estable. Mantener el mock de FixedTopBar, ampliándolo para aceptar los props nuevos sin reenviarlos al DOM. Probar:

~~~tsx
it('uses the large avatar as account trigger and keeps notifications', () => {
  const html = renderHeader()
  expect(html).toContain('aria-label="Abrir cuenta y espacios"')
  expect(html).toContain('href="/notifications"')
  expect(html).toContain('aria-label="Abrir notificaciones"')
  expect(html).not.toContain('href="/settings"')
  expect(html).not.toContain('aria-label="Abrir ajustes"')
  expect(html).not.toContain('type="file"')
  expect(html).not.toContain('data-avatar-uploader')
})
~~~

Migrar también el segundo caso real (`routes the notice control...`): con `hasNotificationAttention: true` debe conservar `/notifications`, `Abrir notificaciones`, la ausencia de aria-expanded y la ausencia de `dashboard-notice-hub`, pero ahora exigir que no existan `/settings` ni `Abrir ajustes`. El tercer caso de `profileHref` se conserva. Así ninguna expectativa residual vuelve a exigir el engranaje retirado.

En profileSettings.test.tsx fortalecer el contrato de edición:

~~~tsx
it('keeps avatar editing in personal profile settings', async () => {
  const html = await renderProfileSettings(false)
  expect(html).toContain('aria-label="Foto de perfil"')
})
~~~

En DashboardPage.integration.test.tsx retirar el mock de AvatarUploader, mockear AccountWorkspaceMenu como un botón `aria-label="Abrir cuenta y espacios"` y reemplazar la expectativa antigua que retenía Ajustes:

~~~tsx
vi.doMock('@/components/navigation/AccountWorkspaceMenu', () => ({
  AccountWorkspaceMenu: () => (
    <button type="button" aria-label="Abrir cuenta y espacios">Cuenta</button>
  ),
}))

it('withholds the social profile link and exposes account access when Community is disabled', async () => {
  const { html, isCommunityEnabled } = await renderDashboardWithCommunityDisabled()
  expect(isCommunityEnabled).toHaveBeenCalledTimes(1)
  expect(html).not.toContain('href="/u/ana"')
  expect(html).not.toContain('href="/settings"')
  expect(html).not.toContain('aria-label="Abrir ajustes"')
  expect(html).toContain('aria-label="Abrir cuenta y espacios"')
})
~~~

- [ ] **Step 2: Run dashboard/profile tests and verify the old gear and uploader fail**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=4 src/components/dashboard/__tests__/DashboardHeader.test.tsx src/lib/dashboard/__tests__/DashboardPage.integration.test.tsx src/components/settings/__tests__/profileSettings.test.tsx
~~~

Expected: FAIL because DashboardHeader still renders AvatarUploader and /settings.

- [ ] **Step 3: Convert DashboardHeader to a custom account slot**

Eliminar Settings y AvatarUploader de sus imports y usar esta estructura:

~~~tsx
export function DashboardHeader({
  greeting,
  firstName,
  dateLabel,
  profileHref,
  hasNotificationAttention = false,
}: Props) {
  const { t } = useI18n()

  return (
    <FixedTopBar
      accountSlot="custom"
      initialHeight={92}
      contentClassName="max-w-6xl flex-col items-stretch gap-0 sm:px-6"
    >
      <div className="flex items-center gap-3">
        <AccountWorkspaceMenu surface="dashboard" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground first-letter:uppercase">
            {dateLabel}
          </p>
          <div className="truncate text-balance font-display text-xl font-bold leading-tight text-foreground sm:text-2xl">
            <span className="text-base font-medium text-muted-foreground">{greeting}, </span>
            {profileHref ? (
              <Link
                data-marketing-private
                href={profileHref}
                className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                {firstName}
              </Link>
            ) : <span data-marketing-private>{firstName}</span>}
          </div>
        </div>
        <Link
          href="/notifications"
          aria-label={t('Abrir notificaciones')}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card text-foreground transition-colors hover:border-violet-400/50 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 motion-reduce:transition-none"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {hasNotificationAttention ? (
            <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[hsl(var(--training-warning))]" />
          ) : null}
        </Link>
      </div>
    </FixedTopBar>
  )
}
~~~

Retirar avatarUrl del tipo Props, del destructuring y del call site de dashboard/page.tsx, porque la identidad ya procede del modelo único del layout.

- [ ] **Step 4: Lock the three content-header entry points, then implement them**

Antes de editar los componentes, añadir al AccountWorkspaceRouteCoverage.test.ts y ejecutar esta tabla:

~~~ts
it.each([
  'src/components/coaching/TrainerDirectory.tsx',
  'src/components/coaching/TrainerPublicProfile.tsx',
  'src/app/(app)/coaching/page.tsx',
])('%s exposes account access in its existing content header', source => {
  expect(read(source)).toContain('<AccountWorkspaceMenu surface="topbar"')
})
~~~

Run: pnpm exec vitest run --maxWorkers=1 src/components/navigation/__tests__/AccountWorkspaceRouteCoverage.test.ts src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts

Expected: FAIL en los tres archivos, antes de cualquier modificación visual. Luego aplicar las estructuras siguientes.

Antes de aplicar esas estructuras, añadir también a trainerAccessibilityAcceptance.test.ts este caso sobre la fixture que Task 5 ya dejó dentro del provider, y ejecutarlo junto al contrato estructural para obtener el mismo rojo visible:

~~~ts
it.each(['directory', 'public-profile'] as const)(
  '%s exposes one touch-sized account trigger on mobile',
  async surface => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    try {
      await page.goto(
        `${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=${surface}`,
      )
      await page.waitForFunction(() => Boolean((window as Window & {
        __TRAINER_ACCESSIBILITY_READY__?: boolean
      }).__TRAINER_ACCESSIBILITY_READY__))
      const trigger = page.getByRole('button', { name: 'Abrir cuenta y espacios' })
      await pwExpect(trigger).toHaveCount(1)
      await pwExpect(trigger).toBeVisible()
      await expectActionTargetsAtLeast44(page)
      await expectResponsiveGeometry(page)
    } finally {
      await context.close()
    }
  },
)
~~~

Run otra vez: `pnpm exec vitest run --maxWorkers=1 src/components/navigation/__tests__/AccountWorkspaceRouteCoverage.test.ts src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts`

Expected: FAIL tanto por los imports ausentes en los tres headers como por los dos triggers móviles inexistentes. Solo entonces editar los componentes.

En TrainerDirectory cambiar su header a:

~~~tsx
<header className="flex items-start justify-between gap-3">
  <div className="min-w-0">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Profesionales</p>
    <h1 id="trainer-directory-title" className="mt-1 text-3xl font-bold tracking-tight text-foreground">
      Encuentra tu entrenador
    </h1>
    <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
      Explora profesionales verificados y encuentra el acompañamiento que encaja contigo.
    </p>
  </div>
  <AccountWorkspaceMenu surface="topbar" />
</header>
~~~

En TrainerPublicProfile conservar foto y contenido, pero poner el menú como último control de la fila:

~~~tsx
<div className="flex flex-wrap items-start justify-between gap-3">
  <div className="min-w-0 flex-1">
    <h1 ref={headingRef} tabIndex={-1} id="trainer-name" className="text-2xl font-bold text-foreground">
      {trainer.professionalName}
    </h1>
    <span className="mt-2 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold">
      Perfil verificado
    </span>
  </div>
  {trainer.professionalPhotoUrl ? (
    <img src={trainer.professionalPhotoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
  ) : null}
  <AccountWorkspaceMenu surface="topbar" />
</div>
~~~

En coaching/page.tsx crear una función local reutilizada por las ramas error y éxito:

~~~tsx
function CoachingHeader({ description }: { description?: string }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-foreground">Acompañamiento</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <AccountWorkspaceMenu surface="topbar" />
    </header>
  )
}
~~~

Usar CoachingHeader en ambos returns; no añadir FixedTopBar ni repetir el h1.

- [ ] **Step 5: Add a route-family structural contract**

Ampliar AccountWorkspaceRouteCoverage.test.ts, creado en Task 6, para inventariar el mecanismo que cubre cada familia. Es una red estructural y no se presenta como render de rutas servidor; la composición compartida y la ausencia de duplicados se prueban con componentes reales en Task 6 y Chromium en Task 9:

~~~ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

const pageTopBarSources = [
  'src/app/(app)/plan/page.tsx',
  'src/app/(app)/progress/page.tsx',
  'src/app/(app)/notifications/page.tsx',
  'src/components/settings/SettingsScreen.tsx',
  'src/components/measurements/MeasurementsClient.tsx',
  'src/app/(app)/exercises/[exerciseId]/page.tsx',
  'src/app/(app)/calendario/page.tsx',
  'src/app/(app)/history/page.tsx',
  'src/app/(app)/history/[logId]/page.tsx',
  'src/app/(app)/u/[username]/page.tsx',
  'src/app/(app)/coach/page.tsx',
  'src/app/(app)/coach/clients/page.tsx',
  'src/app/(app)/coach/clients/[clientId]/page.tsx',
  'src/app/(app)/coach/programs/page.tsx',
  'src/app/(app)/coach/programs/new/page.tsx',
  'src/app/(app)/coach/programs/[templateId]/page.tsx',
  'src/app/(app)/coach/requests/page.tsx',
  'src/app/(app)/coach/profile/page.tsx',
  'src/app/(app)/coach/services/page.tsx',
] as const

const fixedTopBarSources = [
  'src/app/(app)/feed/page.tsx',
  'src/app/(app)/buscar/page.tsx',
  'src/components/chat/ChatContainer.tsx',
  'src/app/(app)/exercises/page.tsx',
  'src/app/(app)/post/[id]/page.tsx',
  'src/app/(app)/solicitudes/page.tsx',
  'src/app/(app)/coach/apply/page.tsx',
] as const

describe('authenticated account-trigger route coverage', () => {
  it.each(pageTopBarSources)('%s uses the shared PageTopBar slot', source => {
    expect(read(source)).toContain('<PageTopBar')
  })
  it.each(fixedTopBarSources)('%s uses a non-immersive FixedTopBar slot', source => {
    const content = read(source)
    expect(content).toContain('<FixedTopBar')
    expect(content).not.toContain('accountSlot="hidden"')
  })
  it.each([
    'src/components/coaching/TrainerDirectory.tsx',
    'src/components/coaching/TrainerPublicProfile.tsx',
    'src/app/(app)/coaching/page.tsx',
  ])('%s uses its existing content header', source => {
    expect(read(source)).toContain('<AccountWorkspaceMenu surface="topbar"')
  })
  it('uses a custom dashboard trigger and preserves /entrenar as a redirect', () => {
    expect(read('src/components/dashboard/DashboardHeader.tsx')).toContain('accountSlot="custom"')
    expect(read('src/app/(app)/entrenar/page.tsx')).toContain('redirect(')
  })
  it('groups collision-prone actions and gives the exercise toolbar an explicit slot', () => {
    expect(read('src/app/(app)/feed/page.tsx')).toContain('actions=')
    expect(read('src/components/chat/ChatContainer.tsx')).toContain('actions=')
    const exercises = read('src/app/(app)/exercises/page.tsx')
    expect(exercises).toContain('accountSlot="custom"')
    expect(exercises).toContain('<AccountWorkspaceMenu surface="topbar"')
  })
  it.each([
    'src/components/session/SessionHeader.tsx',
    'src/app/(app)/plans/generate/page.tsx',
    'src/app/(app)/feed/new/page.tsx',
  ])('%s opts out explicitly', source => {
    expect(read(source)).toContain('accountSlot="hidden"')
  })
  it('keeps the session loading header immersive', () => {
    const loading = read('src/components/feedback/RouteLoading.tsx')
    const start = loading.indexOf('export function SessionLoading')
    const end = loading.indexOf('export function ExercisesLoading')
    const sessionLoading = loading.slice(start, end)
    expect(sessionLoading).toContain('accountSlot="hidden"')
  })
})
~~~

- [ ] **Step 6: Run route, dashboard, profile, and directory tests**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=4 src/components/navigation/__tests__/AccountWorkspaceRouteCoverage.test.ts src/components/dashboard/__tests__/DashboardHeader.test.tsx src/lib/dashboard/__tests__/DashboardPage.integration.test.tsx src/components/settings/__tests__/profileSettings.test.tsx src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts
~~~

Expected: PASS; todos los paths de la matriz tienen un mecanismo verificable, Dashboard no contiene uploader y /settings/perfil sí.

- [ ] **Step 7: Commit route integration**

~~~powershell
git add src/components/dashboard/DashboardHeader.tsx src/components/dashboard/__tests__/DashboardHeader.test.tsx src/lib/dashboard/__tests__/DashboardPage.integration.test.tsx "src/app/(app)/dashboard/page.tsx" src/components/coaching/TrainerDirectory.tsx src/components/coaching/TrainerPublicProfile.tsx "src/app/(app)/coaching/page.tsx" src/components/settings/__tests__/profileSettings.test.tsx src/components/navigation/__tests__/AccountWorkspaceRouteCoverage.test.ts src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts
git commit -m "feat: expose account menu across standard routes"
~~~

---

## Task 8: Let dirty editors veto workspace changes before cookie mutation

**Files:**

- Modify: src/components/navigation/WorkspaceNavigationGuard.ts
- Modify: src/components/navigation/__tests__/AccountWorkspaceProvider.test.ts
- Modify: src/components/coaching/ProgramTemplateEditor.tsx
- Modify: src/components/coaching/__tests__/programTemplateEditor.test.tsx
- Modify: src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.fixture.tsx
- Modify: src/components/coaching/__tests__/fixtures/nextNavigation.fixture.ts
- Modify: src/components/coaching/__tests__/fixtures/workspace.fixture.ts

**Interfaces:**

- Consumes: WORKSPACE_NAVIGATION_INTENT, WORKSPACE_NAVIGATION_COMMIT y commitWorkspaceNavigation(intent) de Task 3.
- Produces: useWorkspaceNavigationGuard({ blocked, message }).

- [ ] **Step 1: Prepare the test-only menu fixture, then add the guard acceptance**

Antes de escribir la expectativa, montar AccountWorkspaceProvider y AccountWorkspaceMenu alrededor de EditorFixture usando exactamente editorAccountModel mostrado en Step 7. En programTemplateEditor.test.tsx añadir desde ahora los aliases @/app/actions/workspace y @/app/(auth)/actions hacia workspace.fixture.ts, además de Radix Avatar/DropdownMenu en optimizeDeps. Añadir replace al nextNavigation.fixture y hacer que setWorkspace registre FormData en window.__WORKSPACE_ACTIONS__ antes de devolver. Estos son cambios exclusivos de infraestructura de prueba; así el primer rojo tendrá un trigger funcional y fallará porque el guard vigente no escucha WORKSPACE_NAVIGATION_INTENT, no porque falte el menú o un alias.

En programTemplateEditor.test.tsx añadir un contexto móvil y este caso:

~~~ts
it('vetoes a workspace change before the action and continues once after confirmation', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  try {
    await page.goto(
      baseUrl
      + '/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html',
    )
    const historyLengthBeforeGuard = await page.evaluate(() => window.history.length)
    await openTemplateDetails(page)
    await page.getByLabel('Nombre de la rutina').fill('Fuerza pendiente')
    await page.getByRole('button', { name: 'Abrir cuenta y espacios' }).click()

    page.once('dialog', dialog => dialog.dismiss())
    await page.getByRole('button', { name: 'Personal' }).click()
    expect(await page.evaluate(() => (
      window as Window & { __WORKSPACE_ACTIONS__?: unknown[] }
    ).__WORKSPACE_ACTIONS__ ?? [])).toHaveLength(0)
    await pwExpect(page.getByRole('dialog')).toBeVisible()

    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Personal' }).click()
    await page.waitForFunction(() => (
      window as Window & { __WORKSPACE_ACTIONS__?: unknown[] }
    ).__WORKSPACE_ACTIONS__?.length === 1)

    expect(await page.evaluate(() => (
      window as Window & { __WORKSPACE_REPLACES__?: string[] }
    ).__WORKSPACE_REPLACES__)).toEqual(['/dashboard'])
    expect(await page.evaluate(() => window.history.length))
      .toBe(historyLengthBeforeGuard)
  } finally {
    await context.close()
  }
})
~~~

La fixture del editor se presenta en `/coach` con preferencia Coach; por eso el cambio ejercitado es `Personal` → `/dashboard`. Pulsar Entrenador aquí sería un no-op del Provider y no probaría el guard.

- [ ] **Step 2: Run the editor test and confirm the button bypasses the current link-only guard**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=1 src/components/coaching/__tests__/programTemplateEditor.test.tsx
~~~

Expected: FAIL because the existing hook only intercepts anchors, beforeunload and popstate; a workspace button has no cancelable protocol wired to it.

- [ ] **Step 3: Prepare the shared protocol module to host the React guard**

Añadir 'use client' como primera línea e importar useEffect/useRef junto al tipo Workspace ya presente:

~~~ts
'use client'

import { useEffect, useRef } from 'react'
import type { Workspace } from '@/lib/coaching/workspace'
~~~

Conservar las funciones requestWorkspaceNavigation y commitWorkspaceNavigation creadas en Task 3; la primera es cancelable y la segunda solo se dispara después de que la action devuelve ok.

- [ ] **Step 4: Move the complete existing guard into the shared hook**

Trasladar la lógica vigente de beforeunload, click y popstate desde ProgramTemplateEditor y añadir los dos listeners:

~~~ts
const HISTORY_GUARD_KEY = '__vekiraTrainerRoutineGuard'

export function useWorkspaceNavigationGuard({
  blocked,
  message,
}: {
  blocked: boolean
  message: string
}) {
  const sequence = useRef(0)

  useEffect(() => {
    if (!blocked) return
    sequence.current += 1
    const guardId = String(Date.now()) + ':' + String(sequence.current)
    let bypass = false
    let restoringGuardEntry = false
    const currentState = window.history.state
    window.history.replaceState({
      ...(currentState && typeof currentState === 'object' ? currentState : {}),
      [HISTORY_GUARD_KEY]: guardId,
    }, '', window.location.href)

    const clearGuardMarker = () => {
      const state = window.history.state
      if (
        !state
        || typeof state !== 'object'
        || state[HISTORY_GUARD_KEY] !== guardId
      ) return
      const nextState = { ...state }
      delete nextState[HISTORY_GUARD_KEY]
      window.history.replaceState(nextState, '', window.location.href)
    }

    const confirmDiscard = () => window.confirm(message)
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const guardLink = (event: MouseEvent) => {
      if (
        bypass
        || event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) return
      const target = event.target
      const anchor = target instanceof Element
        ? target.closest<HTMLAnchorElement>('a[href]')
        : null
      if (!anchor || anchor.download || (anchor.target && anchor.target !== '_self')) return
      const destination = new URL(anchor.href, window.location.href)
      const current = new URL(window.location.href)
      if (
        destination.origin !== current.origin
        || (
          destination.pathname === current.pathname
          && destination.search === current.search
        )
      ) return
      if (confirmDiscard()) {
        clearGuardMarker()
        bypass = true
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const guardBack = () => {
      if (bypass) return
      if (restoringGuardEntry) {
        restoringGuardEntry = false
        return
      }
      if (confirmDiscard()) {
        bypass = true
        return
      }
      restoringGuardEntry = true
      window.history.go(1)
    }
    const guardWorkspaceIntent = (event: Event) => {
      if (bypass) return
      if (!confirmDiscard()) event.preventDefault()
    }
    const acceptWorkspaceCommit = () => {
      bypass = true
      clearGuardMarker()
    }

    window.addEventListener('beforeunload', preventUnload)
    document.addEventListener('click', guardLink, true)
    window.addEventListener('popstate', guardBack)
    window.addEventListener(WORKSPACE_NAVIGATION_INTENT, guardWorkspaceIntent)
    window.addEventListener(WORKSPACE_NAVIGATION_COMMIT, acceptWorkspaceCommit)
    return () => {
      window.removeEventListener('beforeunload', preventUnload)
      document.removeEventListener('click', guardLink, true)
      window.removeEventListener('popstate', guardBack)
      window.removeEventListener(WORKSPACE_NAVIGATION_INTENT, guardWorkspaceIntent)
      window.removeEventListener(WORKSPACE_NAVIGATION_COMMIT, acceptWorkspaceCommit)
      if (!bypass) clearGuardMarker()
    }
  }, [blocked, message])
}
~~~

El marcador se escribe con replaceState sobre la entrada actual: armar el guard no crea una entrada sintética. Si popstate ya llevó al usuario hacia atrás, aceptar conserva esa entrada de destino y cancelar usa forward una sola vez para restaurar el editor. Un intento de cambio de espacio confirmado pero fallido no emite COMMIT, por lo que el editor continúa protegido. Solo un resultado ok limpia el marcador y desarma el guard justo antes de router.replace.

- [ ] **Step 5: Lock the success-only commit behavior with a regression test**

Añadir a AccountWorkspaceProvider.test.ts:

~~~ts
it('does not commit or replace when the action fails', async () => {
  const commitIntent = vi.fn()
  const replace = vi.fn()
  const setPending = vi.fn()

  await expect(executeWorkspaceTransition('coach', 'personal', {
    requestIntent: () => true,
    commitIntent,
    action: async () => ({
      ok: false,
      code: 'unexpected',
      error: 'No se pudo cambiar de espacio. Inténtalo nuevamente.',
    }),
    replace,
    refresh: vi.fn(),
    setPending,
  })).resolves.toEqual({
    status: 'failed',
    code: 'unexpected',
    error: 'No se pudo cambiar de espacio. Inténtalo nuevamente.',
  })

  expect(commitIntent).not.toHaveBeenCalled()
  expect(replace).not.toHaveBeenCalled()
  expect(setPending.mock.calls).toEqual([['coach'], [null]])
})
~~~

- [ ] **Step 6: Replace the editor-local hook**

Eliminar usePendingNavigationGuard, HISTORY_GUARD_KEY y sus imports de useEffect/useRef cuando ya no se usen. Importar y llamar:

~~~ts
import { useWorkspaceNavigationGuard } from '@/components/navigation/WorkspaceNavigationGuard'

useWorkspaceNavigationGuard({
  blocked: hasPendingDescriptions,
  message: LEAVE_EDITOR_MESSAGE,
})
~~~

- [ ] **Step 7: Reconcile the prepared fixture with the production guard**

La fixture ya fue preparada antes del primer rojo. Confirmar que programTemplateEditorInteraction.fixture.tsx envuelve la composición existente tras retirar el hook local; no reemplazar el branch `view=new` ni el PendingLink que ejercita el guard de enlaces:

~~~tsx
const editorAccountModel = {
  account: { name: 'Ada Entrenadora', email: 'ada@example.com', avatarUrl: null },
  trainerAccess: { granted: true as const },
  preferredWorkspace: 'coach' as const,
  personalNavItems: getPersonalNavItems({ communityEnabled: false }),
  coachNavItems: getCoachNavItems(),
}

<I18nProvider language="es" timeZone="America/Havana" syncDocumentLanguage={false}>
  <AccountWorkspaceProvider model={editorAccountModel}>
    <main>
      <div className="flex justify-end p-2">
        <AccountWorkspaceMenu surface="dashboard" />
      </div>
      {!showNewTemplateForm
        ? <PendingLink href="/coach/programs">Rutinas</PendingLink>
        : null}
      {showNewTemplateForm
        ? <NewProgramTemplateForm clientId={query.get('clientId') ?? undefined} />
        : <EditorFixture />}
    </main>
  </AccountWorkspaceProvider>
</I18nProvider>
~~~

Confirmar en programTemplateEditor.test.tsx los aliases de @/app/actions/workspace y @/app/(auth)/actions a fixtures/workspace.fixture.ts, además de @radix-ui/react-avatar y @radix-ui/react-dropdown-menu en optimizeDeps. El workspace.fixture exporta setWorkspace y signOut desde Task 5. nextNavigation.fixture.ts debe conservar:

~~~ts
replace: (href: string) => {
  const state = window as Window & { __WORKSPACE_REPLACES__?: string[] }
  state.__WORKSPACE_REPLACES__ ??= []
  state.__WORKSPACE_REPLACES__.push(href)
},
~~~

Confirmar que workspace.fixture.ts registra cada FormData en window.__WORKSPACE_ACTIONS__ antes de devolver el resultado canónico; no añadir una segunda instrumentación.

- [ ] **Step 8: Re-run provider and editor interaction suites**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=1 src/components/navigation/__tests__/AccountWorkspaceProvider.test.ts src/components/coaching/__tests__/programTemplateEditor.test.tsx
~~~

Expected: PASS; cancelar produce cero actions, confirmar produce exactamente una, un fallo no emite commit y el editor sigue bloqueando salidas.

- [ ] **Step 9: Commit the navigation guard**

~~~powershell
git add src/components/navigation/WorkspaceNavigationGuard.ts src/components/navigation/__tests__/AccountWorkspaceProvider.test.ts src/components/coaching/ProgramTemplateEditor.tsx src/components/coaching/__tests__/programTemplateEditor.test.tsx src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.fixture.tsx src/components/coaching/__tests__/fixtures/nextNavigation.fixture.ts src/components/coaching/__tests__/fixtures/workspace.fixture.ts
git commit -m "feat: guard workspace changes with dirty editors"
~~~

---

## Task 9: Prove responsive geometry, accessibility, history, and session continuity

**Files:**

- Create: src/components/navigation/__tests__/AccountWorkspaceResponsive.test.ts
- Create: src/components/navigation/__tests__/fixtures/accountWorkspace.html
- Create: src/components/navigation/__tests__/fixtures/accountWorkspace.fixture.tsx
- Create: src/components/navigation/__tests__/fixtures/nextNavigation.fixture.ts
- Create: src/components/navigation/__tests__/fixtures/nextLink.fixture.tsx
- Create: src/components/navigation/__tests__/fixtures/workspaceAction.fixture.ts
- Modify: vitest.config.ts

**Interfaces:**

- Consumes: AppShell, DashboardHeader, PageTopBar, AccountWorkspaceMenu y los helpers Playwright existentes de tests/e2e/helpers/acceptance.
- Produces: evidencia Chromium en 320×800, 360×800, 390×844, 412×915 y 1280×800, además de capturas locales no versionadas.

- [ ] **Step 1: Write the complete browser acceptance first and confirm red**

Añadir únicamente esta entrada a browserFixtureTests en vitest.config.ts:

~~~ts
  'src/components/navigation/__tests__/AccountWorkspaceResponsive.test.ts',
~~~

Antes de crear accountWorkspace.html o cualquiera de sus módulos, escribir AccountWorkspaceResponsive.test.ts completo con todos los casos y helpers especificados en Steps 4–7: cuatro tamaños móviles Personal, cuatro Coach, ES/EN, seis composiciones angostas, hoja y foco, estados pending/error, prioridad de ruta, historial, bytes de sesión y panel desktop. El test debe iniciar el mismo Vite aislado que las aceptaciones existentes, con CSS real, una sola React y todos los módulos server-only sustituidos. Declarar `repoRoot`, `fixtureDir`, `fixtureHtml` y `actionFixture` en scope de módulo/describe —fuera de beforeAll— para que también estén disponibles en las capturas de Step 7. El chequeo existsSync ocurre inmediatamente en ese mismo scope; desde `viteEntry` en adelante, la configuración se ejecuta dentro de beforeAll. Usar este bloque (además de los imports afterAll/beforeAll/describe/expect/it, chromium, pwExpect, Browser, Page, existsSync/mkdirSync, path, fileURLToPath y pathToFileURL):

~~~ts
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const fixtureDir = path.join(
  repoRoot,
  'src/components/navigation/__tests__/fixtures',
)
const fixtureHtml = path.join(fixtureDir, 'accountWorkspace.html')
if (!existsSync(fixtureHtml)) {
  throw new Error('Account workspace fixture HTML is missing.')
}
const actionFixture = path.join(fixtureDir, 'workspaceAction.fixture.ts')
const viteEntry = path.join(
  repoRoot,
  'node_modules/.pnpm/node_modules/vite/dist/node/index.js',
)
const { createServer } = await import(pathToFileURL(viteEntry).href)
viteServer = await createServer({
  configFile: false,
  root: repoRoot,
  appType: 'spa',
  cacheDir: path.join(repoRoot, 'node_modules', '.vite-account-workspace-test'),
  oxc: { jsx: { runtime: 'automatic' } },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'lucide-react',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
    ],
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: '@/app/actions/workspace', replacement: actionFixture },
      { find: '@/app/(auth)/actions', replacement: actionFixture },
      { find: '@/app/actions/authorizeSession', replacement: actionFixture },
      { find: 'next/navigation', replacement: path.join(fixtureDir, 'nextNavigation.fixture.ts') },
      { find: 'next/link', replacement: path.join(fixtureDir, 'nextLink.fixture.tsx') },
      { find: '@', replacement: path.join(repoRoot, 'src') },
    ],
  },
  server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
})
~~~

Declarar browser, viteServer y baseUrl con el mismo tipo estructural de trainerAccessibilityAcceptance.test.ts. Después del bloque anterior, escuchar en puerto 0, validar que httpServer.address() devuelve objeto, lanzar chromium headless y cerrar browser más Vite en afterAll. Definir el único helper de apertura así:

~~~ts
await viteServer.listen()
const address = viteServer.httpServer.address()
if (!address || typeof address === 'string') {
  throw new Error('Account workspace fixture did not bind a TCP port.')
}
baseUrl = `http://127.0.0.1:${address.port}`
browser = await chromium.launch({ headless: true })

async function openFixture(page: Page, query: string) {
  const response = await page.goto(
    baseUrl
    + '/src/components/navigation/__tests__/fixtures/accountWorkspace.html?'
    + query,
  )
  if (!response?.ok()) {
    throw new Error(`Account workspace fixture returned ${response?.status() ?? 'no response'}.`)
  }
  await page.waitForFunction(() => Boolean((window as Window & {
    __ACCOUNT_WORKSPACE_READY__?: boolean
  }).__ACCOUNT_WORKSPACE_READY__), undefined, { timeout: 15_000 })
}
~~~

Cerrar browser y Vite en afterAll. Este setup es parte del gate: sin globals.css o sin dedupe las mediciones no cuentan como evidencia.

Run antes de crear ningún asset de fixture:

~~~powershell
pnpm exec vitest run --maxWorkers=1 src/components/navigation/__tests__/AccountWorkspaceResponsive.test.ts
~~~

Expected: FAIL una sola vez y de inmediato con `Account workspace fixture HTML is missing.` Ese es el rojo obligatorio del comportamiento de aceptación completo, no un fallo de sintaxis ni una cadena de timeouts por cada viewport.

- [ ] **Step 2: Build the deterministic document, routing, and action stubs**

Solo después del rojo, crear accountWorkspace.html con tema oscuro, idioma inicial y un stack tipográfico offline; no se permite depender de Google Fonts ni de red durante las mediciones. Se usa deliberadamente Arial/sans-serif, sin Arial Narrow: el layout debe admitir una fuente de sistema ancha mediante etiquetas de ancho intrínseco. El stack puede variar entre sistemas, por lo que el gate mide que los rectángulos no se recorten, no se solapen y permanezcan dentro del viewport; no se presenta como equivalencia tipográfica pixel-perfect.

~~~html
<!doctype html>
<html lang="es" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        --font-display: Arial, sans-serif;
        --font-sans: Arial, sans-serif;
      }
    </style>
    <title>Account workspace fixture</title>
  </head>
  <body class="bg-background font-sans text-foreground antialiased">
    <div id="root"></div>
    <script type="module" src="./accountWorkspace.fixture.tsx"></script>
  </body>
</html>
~~~

nextNavigation.fixture.ts debe usar useSyncExternalStore para reflejar replace sin recargar:

~~~ts
import { useSyncExternalStore } from 'react'

let pathname = new URLSearchParams(window.location.search).get('pathname') || '/dashboard'
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(listener => listener())

function writeLogicalPath(next: string, mode: 'push' | 'replace') {
  pathname = next
  const query = new URLSearchParams(window.location.search)
  query.set('pathname', next)
  const url = window.location.pathname + '?' + query.toString()
  if (mode === 'push') window.history.pushState({}, '', url)
  else window.history.replaceState({}, '', url)
  notify()
}

window.addEventListener('popstate', () => {
  pathname = new URLSearchParams(window.location.search).get('pathname') || '/dashboard'
  notify()
})
;(window as Window & {
  __SET_LOGICAL_PATHNAME__?: (path: string, mode: 'push' | 'replace') => void
}).__SET_LOGICAL_PATHNAME__ = writeLogicalPath

export function usePathname() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => pathname,
    () => pathname,
  )
}

export function useRouter() {
  return {
    replace: (href: string) => {
      const state = window as Window & { __WORKSPACE_REPLACES__?: string[] }
      state.__WORKSPACE_REPLACES__ ??= []
      state.__WORKSPACE_REPLACES__.push(href)
      writeLogicalPath(href, 'replace')
    },
    refresh: () => {
      const state = window as Window & { __WORKSPACE_REFRESHES__?: number }
      state.__WORKSPACE_REFRESHES__ = (state.__WORKSPACE_REFRESHES__ ?? 0) + 1
    },
  }
}
~~~

Después de definir writeLogicalPath, exponer también la navegación usada por el enlace fixture:

~~~ts
;(window as Window & {
  __NEXT_LINK_NAVIGATE__?: (href: string) => void
}).__NEXT_LINK_NAVIGATE__ = href => writeLogicalPath(href, 'push')
~~~

Crear nextLink.fixture.tsx con forwardRef; no reutilizar el mock funcional antiguo porque DropdownMenuItem asChild necesita entregar un ref real al anchor:

~~~tsx
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react'

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string
  children: ReactNode
}

const NextLinkFixture = forwardRef<HTMLAnchorElement, Props>(function NextLinkFixture({
  href,
  children,
  onClick,
  ...props
}, ref) {
  return (
    <a
      ref={ref}
      href={href}
      {...props}
      onClick={event => {
        onClick?.(event)
        const navigate = (window as Window & {
          __NEXT_LINK_NAVIGATE__?: (next: string) => void
        }).__NEXT_LINK_NAVIGATE__
        if (!event.defaultPrevented && navigate) {
          event.preventDefault()
          navigate(href)
        }
      }}
    >
      {children}
    </a>
  )
})

export default NextLinkFixture
~~~

workspaceAction.fixture.ts debe aceptar query outcome=success|invalid|unavailable|network|redirect y delay, además de sustituir las otras dos actions server-only importadas por el shell:

~~~ts
export async function setWorkspace(formData: FormData) {
  const query = new URLSearchParams(window.location.search)
  const delay = Number(query.get('delay') || 0)
  if (delay > 0) await new Promise(resolve => window.setTimeout(resolve, delay))
  const workspace = formData.get('workspace')
  const state = window as Window & { __WORKSPACE_ACTIONS__?: string[] }
  state.__WORKSPACE_ACTIONS__ ??= []
  state.__WORKSPACE_ACTIONS__.push(String(workspace))
  if (query.get('outcome') === 'network') throw new Error('offline')
  if (query.get('outcome') === 'redirect') return undefined
  if (query.get('outcome') === 'invalid') {
    return {
      ok: false as const,
      code: 'invalid_workspace' as const,
      error: 'El espacio solicitado no es válido.',
    }
  }
  if (query.get('outcome') === 'unavailable') {
    return {
      ok: false as const,
      code: 'coach_unavailable' as const,
      error: 'El espacio de entrenador ya no está disponible.',
    }
  }
  if (workspace !== 'personal' && workspace !== 'coach') {
    return {
      ok: false as const,
      code: 'invalid_workspace' as const,
      error: 'El espacio solicitado no es válido.',
    }
  }
  return {
    ok: true as const,
    workspace,
    destination: workspace === 'coach' ? '/coach' as const : '/dashboard' as const,
  }
}

export async function signOut() {
  const state = window as Window & { __SIGN_OUTS__?: number }
  state.__SIGN_OUTS__ = (state.__SIGN_OUTS__ ?? 0) + 1
}

export async function releaseSessionAuthorization() {
  return { success: true as const }
}

~~~

- [ ] **Step 3: Mount the exact acceptance surfaces**

accountWorkspace.fixture.tsx debe comenzar con `import '@/styles/globals.css'` e incluir explícitamente `import type { AccountWorkspaceModel } from '@/components/navigation/AccountWorkspaceContext'`. Importar además createRoot, Bell/Search/PlusCircle, AppShell, DashboardHeader, FixedTopBar, PageTopBar, AccountWorkspaceMenu, I18nProvider, getPersonalNavItems/getCoachNavItems, `dismissOpenRadixOverlay`, `WORKSPACE_NAVIGATION_COMMIT` y saveBackup con SessionSnapshot. Leer surface, preferred, access y language de query, crear el modelo con labels deliberadamente largos y renderizar:

~~~tsx
const query = new URLSearchParams(window.location.search)
const surface = query.get('surface') ?? 'shell'
const preferred = query.get('preferred') ?? 'personal'
const access = query.get('access') ?? 'granted'
const language = query.get('language') ?? 'es'

const personalNavItems = getPersonalNavItems({ communityEnabled: false })
const coachNavItems = getCoachNavItems()
const model: AccountWorkspaceModel = {
  account: {
    name: 'Ana Pérez Entrenamiento de Rendimiento',
    email: 'ana.entrenamiento.muy.largo@example.com',
    avatarUrl: null,
  },
  trainerAccess: access === 'denied'
    ? { granted: false, reason: 'inactive' }
    : { granted: true },
  preferredWorkspace: preferred === 'coach' ? 'coach' : 'personal',
  personalNavItems,
  coachNavItems,
}

document.documentElement.lang = language === 'en' ? 'en' : 'es'
document.documentElement.classList.add('dark')

const content = (() => {
  if (surface === 'dashboard') {
    return (
      <DashboardHeader
        greeting="Buenos días"
        firstName="Ana"
        dateLabel="sábado, 5 de septiembre"
        profileHref={null}
      />
    )
  }
  if (surface === 'immersive') {
    return (
      <FixedTopBar accountSlot="hidden">
        <h1>Flujo inmersivo</h1>
      </FixedTopBar>
    )
  }
  if (surface === 'menu') {
    return <div className="flex justify-end"><AccountWorkspaceMenu surface="topbar" /></div>
  }
  if (surface === 'feed') {
    return (
      <FixedTopBar
        actions={(
          <div aria-label="Acciones de comunidad" className="flex items-center gap-1">
            <button aria-label="Solicitudes" className="h-11 w-11"><Bell /></button>
            <button aria-label="Buscar" className="h-11 w-11"><Search /></button>
            <button aria-label="Publicar" className="h-11 w-11"><PlusCircle /></button>
          </div>
        )}
      >
        <h1 data-fixture-title className="min-w-0 flex-1 truncate font-display text-lg font-bold">Comunidad</h1>
      </FixedTopBar>
    )
  }
  if (surface === 'toolbar') {
    return (
      <FixedTopBar
        accountSlot="custom"
        contentClassName="mx-auto block max-w-7xl px-4 py-3"
        initialHeight={156}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h1 data-fixture-title className="min-w-0 truncate text-xl font-bold">
            Biblioteca de ejercicios
          </h1>
          <AccountWorkspaceMenu surface="topbar" />
        </div>
        <div data-fixture-stats className="mt-2 flex min-h-11 items-center justify-end gap-4">
          <span>124 ejercicios</span><span>Página 1 de 8</span>
        </div>
        <div data-fixture-filters className="mt-2 flex min-h-11 gap-2 overflow-hidden">
          <button className="min-h-11 px-3">Buscar</button>
          <button className="min-h-11 px-3">Filtros</button>
        </div>
      </FixedTopBar>
    )
  }
  return (
    <PageTopBar
      title="Notificaciones profesionales pendientes"
      right={<button className="h-11 px-3">Filtrar</button>}
    />
  )
})()

Object.assign(window, {
  __WORKSPACE_ACTIONS__: [] as string[],
  __WORKSPACE_COMMITS__: [] as string[],
  __WORKSPACE_REPLACES__: [] as string[],
  __WORKSPACE_REFRESHES__: 0,
  __SIGN_OUTS__: 0,
  __ANDROID_BACK__: () => dismissOpenRadixOverlay(),
})
window.addEventListener(WORKSPACE_NAVIGATION_COMMIT, event => {
  const detail = (event as CustomEvent<{ workspace: string }>).detail
  ;(window as Window & { __WORKSPACE_COMMITS__: string[] })
    .__WORKSPACE_COMMITS__.push(detail.workspace)
})

createRoot(document.getElementById('root')!).render(
  <I18nProvider
    language={language === 'en' ? 'en' : 'es'}
    timeZone="America/Havana"
    syncDocumentLanguage={false}
  >
    <AppShell accountWorkspace={model}>
      <main className="min-h-screen px-4 py-6">{content}</main>
    </AppShell>
  </I18nProvider>,
)
~~~

Exponer helpers que usen la API real de persistencia, no localStorage escrito a mano:

~~~ts
const activeSnapshot: SessionSnapshot = {
  clientSessionId: 'session-1',
  workoutId: 'workout-1',
  workoutName: 'Fuerza de prueba',
  startedAt: Date.now(),
  exercises: [],
}
const readSessionBytes = () => ({
  pointer: localStorage.getItem('fitai_active_session'),
  backup: localStorage.getItem('fitai_session_workout-1'),
})
Object.assign(window, {
  __SEED_ACTIVE_SESSION__: () => {
    const result = saveBackup(activeSnapshot)
    if (!result.ok) throw new Error(result.error)
    return readSessionBytes()
  },
  __READ_ACTIVE_SESSION_BYTES__: readSessionBytes,
})
requestAnimationFrame(() => requestAnimationFrame(() => {
  ;(window as Window & { __ACCOUNT_WORKSPACE_READY__?: boolean })
    .__ACCOUNT_WORKSPACE_READY__ = true
}))
~~~

La fixture representa componentes/chrome reales, no páginas Server Component completas. El test estructural cubre los call sites; esta fixture cubre CSS, portales, providers e interacción compartida.

- [ ] **Step 4: Implement the fixture behavior required by the mobile geometry acceptance**

Los casos ya existen desde Step 1. Hacerlos verdes con la fixture y añadir un helper local que inspeccione el chrome portalizado directamente; expectResponsiveGeometry sobre main se conserva, pero no sustituye esta comprobación porque overflow oculto en el root podría enmascarar un header, nav, sheet o menú fuera del viewport:

~~~ts
async function expectWorkspaceChromeContained(page: Page) {
  const failures = await page.locator([
    'header',
    'header h1',
    '[data-fixture-title]',
    'nav[aria-label="Navegación principal"]',
    '[data-fixed-topbar-actions]',
    '[data-bottom-nav-item]',
    '[data-bottom-nav-label]',
    '[role="dialog"]',
    '[role="dialog"] button',
    '[role="dialog"] a',
    '[role="menu"]',
    '[role="menuitem"]',
    '[role="menuitemradio"]',
  ].join(', ')).evaluateAll(elements => elements.flatMap((element, index) => {
    const node = element as HTMLElement
    const style = getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    if (
      style.display === 'none'
      || style.visibility === 'hidden'
      || rect.width === 0
      || rect.height === 0
    ) return []
    const insideViewport = rect.left >= -1 && rect.right <= window.innerWidth + 1
    const mustFitText = node.matches([
      '[data-fixed-topbar-actions]',
      'header h1',
      '[data-fixture-title]',
      '[data-bottom-nav-label]',
      '[role="dialog"]',
      '[role="menu"]',
      '[role="menuitem"]',
      '[role="menuitemradio"]',
    ].join(', '))
    const isTitle = node.matches('header h1, [data-fixture-title]')
    const clipsTitleExplicitly = isTitle
      && ['hidden', 'clip'].includes(style.overflowX)
    const contentFits = !mustFitText
      || node.scrollWidth <= node.clientWidth + 1
      || clipsTitleExplicitly
    return insideViewport && contentFits
      ? []
      : [{ index, tag: node.tagName, rect: rect.toJSON(), scrollWidth: node.scrollWidth }]
  }))
  expect(failures).toEqual([])
}
~~~

Importar también el tipo Page desde Playwright. Ejecutar este helper después de abrir cada estado móvil, cada barra angosta y cada sheet/menu. Usar:

~~~ts
const MOBILE_VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
] as const

it.each(MOBILE_VIEWPORTS)(
  'keeps five personal destinations readable and Entrenar centered at $width px',
  async viewport => {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    try {
      await openFixture(page, 'pathname=/dashboard&preferred=coach')
      const links = page.locator('[data-bottom-nav-item]')
      await pwExpect(links).toHaveCount(5)
      await pwExpect(page.locator('[data-bottom-nav-item][href="/coaching"]'))
        .toHaveCount(0)
      const geometry = await page.evaluate(() => {
        const train = document.querySelector<HTMLElement>(
          '[data-bottom-nav-item="/entrenar"]',
        )!
        const labels = Array.from(
          document.querySelectorAll<HTMLElement>('[data-bottom-nav-label]'),
        )
        const labelRects = labels.map(label => label.getBoundingClientRect())
        const rect = train.getBoundingClientRect()
        return {
          delta: Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2),
          labelsFit: labels.every(label => label.scrollWidth <= label.clientWidth + 1),
          labelsInside: labelRects.every(label => (
            label.left >= -1 && label.right <= window.innerWidth + 1
          )),
          labelsSeparated: labelRects.every((label, index) => (
            index === labelRects.length - 1
            || label.right <= labelRects[index + 1].left + 1
          )),
          rootFits: document.documentElement.scrollWidth <= window.innerWidth,
        }
      })
      expect(geometry.delta).toBeLessThanOrEqual(2)
      expect(geometry.labelsFit).toBe(true)
      expect(geometry.labelsInside).toBe(true)
      expect(geometry.labelsSeparated).toBe(true)
      expect(geometry.rootFits).toBe(true)
      await expectActionTargetsAtLeast44(page)
      await expectWorkspaceChromeContained(page)
    } finally {
      await context.close()
    }
  },
)
~~~

Añadir esta matriz Coach explícita, reutilizando las mismas mediciones de labelsFit/rootFits, expectActionTargetsAtLeast44 y expectWorkspaceChromeContained del caso Personal:

~~~ts
it.each(MOBILE_VIEWPORTS)(
  'keeps four coach destinations readable at $width px',
  async viewport => {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    try {
      await openFixture(page, 'pathname=/coach&preferred=personal')
      const links = page.locator('[data-bottom-nav-item]')
      await pwExpect(links).toHaveCount(4)
      await pwExpect(page.locator('[data-bottom-nav-item][href="/coach/profile"]'))
        .toHaveCount(0)
      await pwExpect(page.locator('[data-bottom-nav-item][href="/coach/services"]'))
        .toHaveCount(0)
      const geometry = await page.evaluate(() => {
        const labels = Array.from(
          document.querySelectorAll<HTMLElement>('[data-bottom-nav-label]'),
        )
        const labelRects = labels.map(label => label.getBoundingClientRect())
        return {
          labelsFit: labels.every(label => label.scrollWidth <= label.clientWidth + 1),
          labelsInside: labelRects.every(label => (
            label.left >= -1 && label.right <= window.innerWidth + 1
          )),
          labelsSeparated: labelRects.every((label, index) => (
            index === labelRects.length - 1
            || label.right <= labelRects[index + 1].left + 1
          )),
          rootFits: document.documentElement.scrollWidth <= window.innerWidth,
        }
      })
      expect(geometry).toEqual({
        labelsFit: true,
        labelsInside: true,
        labelsSeparated: true,
        rootFits: true,
      })
      await expectActionTargetsAtLeast44(page)
      await expectWorkspaceChromeContained(page)
    } finally {
      await context.close()
    }
  },
)
~~~

Añadir `it.each([{ width: 320, language: 'en' }, { width: 412, language: 'en' }])` y ejecutar tanto pathname=/dashboard como pathname=/coach; comprobar cinco/cuatro destinos, labelsFit/labelsInside/labelsSeparated=true, lang del documento igual a en y chrome contenido. Así el idioma inglés y su geometría no quedan implícitos en el loop español.

Añadir una tabla explícita para las barras con más presión horizontal:

~~~ts
it.each([
  { width: 320, surface: 'topbar' },
  { width: 360, surface: 'topbar' },
  { width: 320, surface: 'feed' },
  { width: 360, surface: 'feed' },
  { width: 320, surface: 'toolbar' },
  { width: 360, surface: 'toolbar' },
])('keeps $surface title and actions separated at $width px', async testCase => {
  const context = await browser.newContext({
    viewport: { width: testCase.width, height: 800 },
  })
  const page = await context.newPage()
  try {
    await openFixture(page, 'surface=' + testCase.surface + '&pathname=/exercises')
    const title = page.locator('[data-fixture-title], h1').first()
    const actions = testCase.surface === 'toolbar'
      ? page.getByRole('button', { name: 'Abrir cuenta y espacios' })
      : page.locator('[data-fixed-topbar-actions]')
    const titleBox = await title.boundingBox()
    const actionBox = await actions.boundingBox()
    expect(titleBox).not.toBeNull()
    expect(actionBox).not.toBeNull()
    expect((titleBox?.x ?? 0) + (titleBox?.width ?? 0))
      .toBeLessThanOrEqual((actionBox?.x ?? 0) + 1)
    await expectResponsiveGeometry(page)
    await expectWorkspaceChromeContained(page)
  } finally {
    await context.close()
  }
})
~~~

Crear además un contexto 390×844 con reducedMotion: 'reduce', abrir surface=menu, activar `[data-account-workspace-trigger]:visible` para que el dialog exista y solo entonces ejecutar expectReducedMotionAndSafeArea(page) y expectWorkspaceChromeContained(page). Esto valida las variables de safe area y que trigger, badge, hoja y navegación no conservan transiciones largas bajo reducción de movimiento.

- [ ] **Step 5: Make sheet focus, safe area, pending, and error cases pass**

Completar el comportamiento de la fixture hasta que los casos rojos escritos en Step 1 pasen. Abrir el trigger a 390×640, inyectar --safe-area-inset-bottom: 24px y verificar:

~~~ts
const trigger = page.getByRole('button', { name: 'Abrir cuenta y espacios' }).first()
await pwExpect(trigger).toHaveAccessibleDescription('Espacio activo: Personal')
await trigger.focus()
await page.keyboard.press('Enter')
const dialog = page.getByRole('dialog')
await pwExpect(dialog).toBeVisible()
await pwExpect(dialog.getByRole('link', { name: 'Mi acompañamiento' })).toBeVisible()
const personal = page.getByRole('button', { name: 'Personal' })
await pwExpect(personal).toBeFocused()
await pwExpect(personal).toHaveAttribute('aria-pressed', 'true')
await expectActionTargetsAtLeast44(page)
await expectWorkspaceChromeContained(page)

const focusables = dialog.locator('button:not([disabled]), a[href]')
const firstFocusable = focusables.first()
const lastFocusable = focusables.last()
await lastFocusable.focus()
await page.keyboard.press('Tab')
await pwExpect(firstFocusable).toBeFocused()
await firstFocusable.focus()
await page.keyboard.press('Shift+Tab')
await pwExpect(lastFocusable).toBeFocused()

const safeGeometry = await dialog.evaluate(element => ({
  bottom: element.getBoundingClientRect().bottom,
  viewport: window.innerHeight,
  paddingBottom: Number.parseFloat(getComputedStyle(element).paddingBottom),
}))
expect(safeGeometry.bottom).toBeLessThanOrEqual(safeGeometry.viewport)
expect(safeGeometry.paddingBottom).toBeGreaterThanOrEqual(24)

await page.keyboard.press('Escape')
await pwExpect(dialog).toBeHidden()
await pwExpect(trigger).toBeFocused()

await trigger.click()
await pwExpect(dialog).toBeVisible()
expect(await page.evaluate(() => (
  window as Window & { __ANDROID_BACK__: () => boolean }
).__ANDROID_BACK__())).toBe(true)
await pwExpect(dialog).toBeHidden()
await pwExpect(trigger).toBeFocused()
~~~

Añadir un caso vertical independiente a 390×320 para ejercer scroll real, no solo max-height:

~~~ts
const shortContext = await browser.newContext({ viewport: { width: 390, height: 320 } })
const shortPage = await shortContext.newPage()
try {
  await openFixture(shortPage, 'surface=menu&pathname=/dashboard')
  await shortPage.locator('[data-account-workspace-trigger]:visible').click()
  const scrollRegion = shortPage.locator('[data-fitai-dialog-scroll-region]')
  const scrollGeometry = await scrollRegion.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))
  expect(scrollGeometry.scrollHeight).toBeGreaterThan(scrollGeometry.clientHeight)
  const signOut = shortPage.getByRole('button', { name: 'Cerrar sesión' })
  await signOut.scrollIntoViewIfNeeded()
  await pwExpect(signOut).toBeVisible()
  await pwExpect(signOut).toBeEnabled()
  await signOut.click()
  expect(await shortPage.evaluate(() => (
    window as Window & { __SIGN_OUTS__: number }
  ).__SIGN_OUTS__)).toBe(1)
} finally {
  await shortContext.close()
}
~~~

En una página con delay=1000, abrir con Enter, enfocar Entrenador y pulsar Space dos veces. Mientras espera, comprobar aria-busy mediante `page.locator('[data-account-workspace-trigger]:visible').first()` —el locator por role queda excluido del árbol accesible cuando Radix aplica aria-hidden al fondo—, ambos selectores disabled y role=status con Cambiando al espacio. Disparar programáticamente click sobre el enlace `/settings` y `[data-account-sign-out]`: la URL lógica no cambia y `__SIGN_OUTS__` permanece en cero. Después de resolver, esperar exactamente `__WORKSPACE_ACTIONS__ === ['coach']`, `__WORKSPACE_COMMITS__ === ['coach']`, `__WORKSPACE_REPLACES__ === ['/coach']` y `__WORKSPACE_REFRESHES__ === 1`, además del cierre de hoja; el trigger reabierto tiene descripción accesible `Espacio activo: Entrenador` y Entrenador `aria-pressed=true`. Así el gate cubre la cadena completa action → commit → replace → refresh, tanto ante doble selector como ante navegación/cierre de sesión concurrentes, sin una ventana de latencia frágil en CI.

Añadir una aceptación de cambio de breakpoint para los portales. Abrir el Dialog en `surface=menu` a 390×640, cambiar con `page.setViewportSize({ width: 1280, height: 800 })` y exigir que el dialog se desmonte antes de usar el único trigger visible del sidebar. Abrir entonces el menú desktop, volver a 390×640 y exigir que role=menu se desmonte y que quede un solo trigger móvil visible. Ejecutar expectWorkspaceChromeContained después de cada resize; ningún portal del breakpoint anterior puede sobrevivir oculto solo por CSS.

Ejecutar la misma interacción en páginas separadas con outcome=invalid, outcome=unavailable y outcome=network. En las tres: role=alert visible, hoja abierta, `__WORKSPACE_COMMITS__` vacío, cero replace y posibilidad de cerrar con Escape. invalid no incrementa __WORKSPACE_REFRESHES__; unavailable lo incrementa exactamente una vez para refrescar permisos; network tampoco refresca. Esto cubre el error recuperable de Provider/Menu que no puede provocar el selector normal por sí solo. Añadir `outcome=redirect`: la action devuelve `undefined`, `__WORKSPACE_ACTIONS__ === ['coach']`, el panel cierra sin alert y solo commit/replace/refresh manuales permanecen en cero, modelando el `x-action-redirect` que ya procesa Next 14.2.

- [ ] **Step 6: Make route priority, replace history, and session continuity pass**

Resolver en la fixture las combinaciones ya escritas:

~~~ts
const routeCases = [
  { pathname: '/dashboard', preferred: 'coach', expected: 'Personal', links: 5 },
  { pathname: '/coach/clients', preferred: 'personal', expected: 'Entrenador', links: 4 },
  { pathname: '/coach/apply', preferred: 'coach', expected: 'Personal', links: 5 },
  { pathname: '/coaching', preferred: 'coach', expected: 'Personal', links: 5 },
  { pathname: '/settings/perfil', preferred: 'coach', expected: 'Entrenador', links: 4 },
  { pathname: '/notifications', preferred: 'personal', expected: 'Personal', links: 5 },
  { pathname: '/coach/clients', preferred: 'coach', access: 'denied', expected: 'Personal', links: 5 },
] as const
~~~

Para cada caso, comprobar label activo, conteo y que __WORKSPACE_ACTIONS__ permanece vacío: resolver una URL directa no puede simular una selección ni reescribir la cookie.

Añadir una matriz separada `['/session/workout-1', '/plans/generate', '/feed/new']`: abrir la superficie shell con cada pathname y comprobar `toHaveCount(0)` sin `:visible` para `[data-account-workspace-trigger]`, `[data-bottom-nav-item]` y `aside`. Las tres superficies deben desmontarse, no quedar meramente ocultas por el breakpoint; así el caso no puede pasar debido a `lg:hidden` o `hidden lg:flex`. Esto ejecuta en Chromium la exclusión compartida que protege tanto el chrome como un FixedTopBar default durante el loading padre.

En un caso Personal separado, sembrar la instantánea mediante el helper que llama saveBackup y conservar exactamente los dos strings devueltos:

~~~ts
const before = await page.evaluate(() => (
  window as Window & {
    __SEED_ACTIVE_SESSION__: () => { pointer: string | null; backup: string | null }
  }
).__SEED_ACTIVE_SESSION__())
await pwExpect(page.getByRole('complementary', { name: 'Entrenamiento en curso' }))
  .toBeVisible()

await page.getByRole('button', { name: 'Abrir cuenta y espacios' }).first().click()
await page.getByRole('button', { name: 'Entrenador' }).click()
await pwExpect(page.locator('[data-bottom-nav-item]')).toHaveCount(4)
await pwExpect(page.getByRole('complementary', { name: 'Entrenamiento en curso' }))
  .toBeHidden()

await page.getByRole('button', { name: 'Abrir cuenta y espacios' }).first().click()
await page.getByRole('button', { name: 'Personal' }).click()
await pwExpect(page.locator('[data-bottom-nav-item]')).toHaveCount(5)
await pwExpect(page.getByRole('complementary', { name: 'Entrenamiento en curso' }))
  .toBeVisible()
~~~

Tras Personal → Entrenador → Personal comprobar:

~~~ts
expect(await page.evaluate(() => (
  window as Window & { __WORKSPACE_REPLACES__?: string[] }
).__WORKSPACE_REPLACES__)).toEqual(['/coach', '/dashboard'])
const after = await page.evaluate(() => (
  window as Window & {
    __READ_ACTIVE_SESSION_BYTES__: () => { pointer: string | null; backup: string | null }
  }
).__READ_ACTIVE_SESSION_BYTES__())
expect(after).toEqual(before)
~~~

En otra página, llamar __SET_LOGICAL_PATHNAME__('/plan', 'replace') y luego __SET_LOGICAL_PATHNAME__('/dashboard', 'push'). Guardar history.length inmediatamente antes de cambiar a Entrenador y comprobar que replace sustituye únicamente /dashboard. page.goBack() debe mostrar pathname lógico /plan con cinco links personales, no una entrada intermedia /dashboard; page.goForward() debe volver a /coach con cuatro. Validar __WORKSPACE_REPLACES__ === ['/coach'] y que history.length conserva exactamente el valor guardado durante el cambio.

- [ ] **Step 7: Make the desktop panel pass its written acceptance and capture visual evidence**

Añadir primero un caso `surface=dashboard&pathname=/dashboard` a 1280×800: `[data-account-workspace-trigger]:visible` tiene count 1, ese único trigger es descendiente de `aside:visible` y `main [data-account-workspace-trigger]:visible` tiene count 0. El avatar grande sigue siendo la entrada móvil del Dashboard, pero a partir de `lg` la única entrada interactiva es el bloque de cuenta del sidebar; esto impide dos popovers competidores.

A 1280×800 y pathname=/coach comprobar con locators concretos: `const desktopSidebar = page.locator('aside:visible')`; dentro de ese aside, `getByRole('navigation', { name: 'Navegación principal' })` contiene cuatro links y ningún /coach/profile o /coach/services. Localizar BottomNav por su descendiente exclusivo, `page.locator('nav').filter({ has: page.locator('[data-bottom-nav-item]') })`: conserva cuatro items en el DOM, pero ese nav está hidden y `[data-bottom-nav-item]:visible` tiene count 0. El botón Abrir cuenta y espacios está dentro del bloque posterior al nav del sidebar, no es descendiente de ese nav y tiene descripción accesible `Espacio activo: Entrenador`. Enfocarlo y abrir con Enter; getByRole('menu') queda visible y los dos espacios son menuitemradio con Entrenador aria-checked=true. Usar ArrowUp/ArrowDown para foco roving, Space sobre Personal para seleccionar, y en una apertura sin selección usar Escape para cerrar y devolver foco al trigger. Reabrir una vez más e invocar `window.__ANDROID_BACK__()`; debe devolver true, cerrar el `role=menu` y restaurar foco al mismo trigger, cubriendo Android en un viewport tablet/escritorio.

Comparar bounding boxes: menu.left debe ser mayor o igual que `sidebarNav.right - 1`, menu.top/bottom deben quedar dentro del viewport y la intersección horizontal con el nav debe ser cero dentro de esa tolerancia de 1 px. Comparar además `[data-account-workspace-avatar]` y `[data-account-workspace-badge]` dentro del trigger sidebar: el centro del badge debe caer dentro de los límites del avatar, cerca de su esquina inferior derecha, no en la esquina de la fila completa. Ejecutar expectWorkspaceChromeContained y auditCriticalAndSeriousAccessibility con el panel abierto. Medir explícitamente todos los `[role="menuitem"], [role="menuitemradio"]` visibles y exigir width y height mayores o iguales a 43.5 px; el helper genérico de targets no incluye esos roles. Esta es la aceptación de semántica menú; Tab no se usa para recorrer menuitems porque el patrón ARIA de menú usa flechas, mientras la hoja móvil sí atrapa Tab/Shift+Tab.

~~~ts
const desktopSidebar = page.locator('aside:visible')
const sidebarNav = desktopSidebar.getByRole('navigation', {
  name: 'Navegación principal',
})
const bottomNav = page.locator('nav').filter({
  has: page.locator('[data-bottom-nav-item]'),
})
await pwExpect(sidebarNav).toBeVisible()
await pwExpect(page.locator('[data-bottom-nav-item]')).toHaveCount(4)
await pwExpect(bottomNav).toBeHidden()
await pwExpect(page.locator('[data-bottom-nav-item]:visible')).toHaveCount(0)
const desktopTargetSizes = await page.locator(
  '[role="menuitem"]:visible, [role="menuitemradio"]:visible',
).evaluateAll(elements => elements.map(element => {
  const rect = element.getBoundingClientRect()
  return { width: rect.width, height: rect.height }
}))
expect(desktopTargetSizes.length).toBeGreaterThan(0)
expect(desktopTargetSizes.every(({ width, height }) => (
  width >= 43.5 && height >= 43.5
))).toBe(true)
~~~

Importar mkdirSync de node:fs y capturar, sin versionar:

~~~ts
mkdirSync(path.join(repoRoot, '.artifacts/workspace-navigation'), { recursive: true })
await page.screenshot({
  path: path.join(repoRoot, '.artifacts/workspace-navigation/coach-desktop-1280.png'),
  fullPage: true,
})
~~~

Capturar también:

- .artifacts/workspace-navigation/personal-320.png
- .artifacts/workspace-navigation/personal-menu-390.png
- .artifacts/workspace-navigation/coach-412.png
- .artifacts/workspace-navigation/dashboard-account-390.png

Inspeccionar cada imagen a resolución original y rechazar superposición, recorte, trigger duplicado, badge ambiguo o hoja debajo de la safe area.

- [ ] **Step 8: Re-run the focused browser acceptance green**

Run:

~~~powershell
pnpm exec vitest run --maxWorkers=1 src/components/navigation/__tests__/AccountWorkspaceResponsive.test.ts
~~~

Expected: PASS en los cinco tamaños; CSS real cargado con fallback tipográfico offline conservador, cinco/cuatro destinos exactos, delta de Entrenar ≤ 2, etiquetas completas sin solape, barras sin colisión, scroll vertical ejercitado, foco y descripción accesible correctos, Android Back cerrando dialog/menu, acciones concurrentes bloqueadas, errores y redirect recuperados, menú de escritorio con flechas, reduced motion/safe area, replace registrado y ambos bytes de sesión idénticos.

- [ ] **Step 9: Run every delivery gate from a clean test-process state**

Primero confirmar que no queda un proceso Vitest/Vite propio de una ejecución anterior. Después:

~~~powershell
pnpm exec vitest run --maxWorkers=4
pnpm type-check
pnpm lint
rg -n "WorkspaceSwitcher|data-workspace-switcher" src --glob '!**/__tests__/**'
git status --short
git add vitest.config.ts src/components/navigation/__tests__/AccountWorkspaceResponsive.test.ts src/components/navigation/__tests__/fixtures/accountWorkspace.html src/components/navigation/__tests__/fixtures/accountWorkspace.fixture.tsx src/components/navigation/__tests__/fixtures/nextNavigation.fixture.ts src/components/navigation/__tests__/fixtures/nextLink.fixture.tsx src/components/navigation/__tests__/fixtures/workspaceAction.fixture.ts
git diff --cached --check
git diff --check
git diff --cached --name-status
~~~

Expected: suite completa, type-check, lint y ambos diff checks con exit code 0; rg sin referencias de producción (las aserciones negativas bajo __tests__ quedan excluidas); el índice contiene exactamente los siete paths de Task 9. `.artifacts/` continúa sin versionarse y cualquier archivo ajeno permanece intacto y fuera del índice.

- [ ] **Step 10: Commit the verified responsive acceptance**

~~~powershell
git diff --cached --stat
git commit -m "test: verify responsive workspace navigation"
~~~

## Final Verification Checklist

- [ ] Personal muestra Inicio, Plan, Entrenar, Progreso y Entrenadores/Comunidad; Entrenador muestra Resumen, Clientes, Rutinas y Solicitudes.
- [ ] Mi acompañamiento no ocupa la barra, pero `/coaching` sigue accesible desde el menú Personal sin depender de un plan asignado.
- [ ] /coach/profile y /coach/services siguen accesibles desde cuenta, pero no reciben aria-current de Resumen.
- [ ] Dashboard conserva saludo y campana; el avatar abre cuenta y Ajustes ya no ocupa un botón propio.
- [ ] Todas las rutas estándar de la matriz tienen trigger; las tres rutas inmersivas quedan excluidas por pathname incluso en el loading padre, y sus headers finales además declaran hidden explícitamente.
- [ ] Una cuenta no entrenadora nunca ve la opción Entrenador y coach_unavailable no altera la cookie.
- [ ] El cambio confirmado ejecuta una action, commit, replace y refresh; un veto ejecuta cero actions.
- [ ] La hoja conserva foco, Escape, Android Back, retorno, safe area, scroll, aria-pressed, aria-live y targets de 44 px; el panel desktop usa menuitemradio, flechas, Android Back y retorno de foco.
- [ ] Los cinco viewports cumplen conteo, textos sin recorte, overflow cero y centrado de Entrenar.
- [ ] La instantánea de sesión activa permanece idéntica y no existe ningún cambio de migración/RLS/guard.
- [ ] Las capturas de .artifacts fueron revisadas visualmente y no se incluyeron en commits.
- [ ] Suite completa, type-check, lint, git diff --cached --check y git diff --check pasan con salidas actuales.
