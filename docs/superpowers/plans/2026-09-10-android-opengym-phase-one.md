# Android openGym Phase One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Añadir mapa muscular y reprogramación puntual funcionales en la APK con las pantallas originales.

**Architecture:** React compartido con límites de acciones Android existentes; datos y excepciones por cuenta en AppStore SQLite. Agregación muscular pura y geometría MIT local, sin código de openGym.

**Tech Stack:** TypeScript, React, Vite, Capacitor, SQLite, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-android-opengym-phase-one-design.md`

## Global Constraints

- Trabajar en `codex/android-offline-opengym`, baseline heredado `fd67f8c`.
- No modificar el worktree original ni `main`; no merge, push o despliegue.
- Preservar pantallas, cinco pestañas, prescripciones y aislamiento de cuentas.
- Reprogramación: origen hoy-2..hoy+7, destino hoy..hoy+7, fechas civiles del usuario.
- Geometría MIT original y empaquetada; nunca código AGPL o medios de openGym.
- No afirmar fatiga o recuperación fisiológica a partir del mapa.

### Task 1: Mapa muscular y evidencia de series

**Files:** Crear `src/lib/muscles/activity.ts`, `activity.test.ts`, geometría local y licencia, `src/components/muscles/MuscleActivityMap.tsx`. Modificar `src/components/plan/PlanDistribution.tsx`, `src/components/progress/ProgressHub.tsx`, `src/app/(app)/progress/page.tsx`. Prueba móvil de pantalla en `mobile/tests/opengym-regression.mjs` al integrar.

**Interfaces:** `MuscleActivityInput = { muscleGroups: string[]; sets: number; date?: string }`; `buildMuscleActivity(rows, range?)` normaliza alias, deduplica dentro de cada fila, suma series y conserva etiquetas sin correspondencia. `MuscleActivityMap` recibe filas, modo prescrito/registrado y lenguaje. La página de Progreso produce filas con grupos resueltos por snapshot y `sets_completed`; no usar únicamente los puntos de carga, que excluyen series temporizadas.

- [ ] Escribir y ejecutar pruebas que fallen al faltar agregación: `[ {muscleGroups:['Chest','pecho'],sets:3}, {muscleGroups:['Tríceps'],sets:2} ]` produce pecho=3 y tríceps=2; filas de 0/NaN no suman; filtrar por rango inclusivo; grupo desconocido queda visible.

```ts
const result = buildMuscleActivity([
  { muscleGroups: ['Chest', 'pecho'], sets: 3 },
  { muscleGroups: ['Tríceps'], sets: 2 },
])
expect(result.groups.find(group => group.id === 'chest')?.sets).toBe(3)
expect(result.groups.find(group => group.id === 'triceps')?.sets).toBe(2)
```

- [ ] Convertir geometría original y registrar commit/licencia; montar vistas anterior/posterior, colores relativos y controles textuales accesibles, con estado vacío y selección.
- [ ] Integrar Plan sin perder lista existente y Progreso con datos reales y período actual. Prueba de carga histórica asegura que snapshot gana al catálogo y cuenta series de tiempo/peso corporal.
- [ ] Ejecutar pruebas específicas y type-check. Guardar evidencia visual móvil/escritorio y teclado durante Task 3.

### Task 2: Ocurrencias y reprogramación de la sesión local

**Files:** Crear `src/lib/workouts/occurrences.ts` y pruebas, `mobile/src/original/actions/rescheduleWorkout.ts` y pruebas, acción web que devuelve indisponibilidad fuera del modo local y componente de reprogramación. Modificar `src/lib/workouts/access.ts`, `mobile/src/original/actions/authorizeSession.ts`, `saveSession.ts`, `storage.ts`, `query.ts`, `mobile/vite.config.ts`, loaders de `dashboard`, `entrenar`, `plan`, y componentes Plan/semana necesarios. No editar archivos propiedad de Task 1.

**Interfaces:** Fila persistida `{id,user_id,plan_id,workout_id,source_date,target_date,policy_timezone,created_at,updated_at}`. Resolvedor opcional devuelve `{workoutId,sourceDate,scheduledDate}` sin cambiar workout original. Nuevas autorizaciones y logs guardan `occurrence_source_date` y `occurrence_scheduled_date`. El acceso web mantiene su ruta actual cuando no se suministra el contexto local.

- [ ] Pruebas rojas del resolvedor: lunes 2026-09-14 movido a martes 2026-09-15 desaparece del lunes, aparece el martes y el lunes 2026-09-21 sigue igual. Probar domingo/lunes y meses/años, recuperación 2d, fechas inválidas, selección por zona.
- [ ] Implementar resolvedor puro y acción `mutate` que valida dueño, plan propio activo, fuente disponible, destino libre y ausencia de lease/log. Una autorización viva o completada impide reprogramar/revertir. Plan bloqueado conserva bytes de prescripción y day_of_week.
- [ ] Pruebas SQLite reales: persistencia/reload/export/import, backup antiguo, tabla nueva inválida, cuenta ajena, dobles clics, conflictos de destino, fuente completada/repetida, pérdida de sesión, idempotencia autorización/guardado y legacy fallback. Registrar identidad de ocurrencia en todas las sesiones nuevas.
- [ ] Conectar acceso y las tres superficies a las mismas fechas; añadir formulario de fecha con estado pendiente/errores, confirmación visible de fecha guardada y restauración antes de iniciar. Limitar controles al modo Android local, con alias seguro y exclusión de dependencias de servidor en bundle.
- [ ] Ejecutar pruebas específicas. Reportar archivos, comandos/evidencia y dudas al controlador; no iniciar servidores ni hacer commit durante el trabajo paralelo del controlador.

### Task 3: Revisión integrada y verificación

**Files:** `mobile/tests/opengym-regression.mjs`, `docs/android-opengym-phase-one.md`; correcciones localizadas de las tareas anteriores.

- [ ] Ejecutar `pnpm mobile:test`, `pnpm mobile:type-check`, pruebas unitarias compartidas relevantes y `pnpm mobile:build`.
- [ ] En un único preview local usar cuenta de ejemplo desechable; comprobar mapa en Plan/Progreso, rango, selección, empty state, reprogramar/revertir, persistir al recargar, iniciar/guardar sesión movida y conservar semana siguiente. Validar 360/390/1440px, teclado y ausencia de errores/overflow.
- [ ] Revisión independiente del diff posterior a `fd67f8c`, especialmente identidad de ocurrencias, permisos, snapshots y backups. Corregir hallazgos y repetir solo pruebas relacionadas.
- [ ] Registrar validación y límites, ejecutar diff check y guardar commits de funcionalidad separados del baseline heredado. Confirmar rama/worktree original sin cambios propios.
