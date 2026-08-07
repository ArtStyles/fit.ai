# Trainer Phase 5 Client Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al entrenador una vista de solo lectura sobre clientes consentidos, adherencia a su propia prescripcion, evidencia de sesiones y medidas corporales cuando exista permiso separado.

**Architecture:** PostgreSQL aplica el permiso y proyecta filas minimizadas mediante RPC `SECURITY DEFINER`; las paginas profesionales no consultan directamente tablas sensibles. Un modulo puro calcula ocurrencias prescritas, cumplimiento y alertas operativas usando zona horaria y vigencia de versiones.

**Tech Stack:** Next.js 14, React 18, TypeScript, Supabase/PostgreSQL, Vitest y Playwright.

## Global Constraints

- Cada lectura exige entrenador activo, relacion activa y consentimiento vigente en el momento de la llamada.
- Usar respuestas genericas para UUID ajeno/inexistente; no filtrar que un cliente o log existe.
- No dar al entrenador `INSERT`, `UPDATE` o `DELETE` sobre perfiles, planes, sesiones, logs o medidas del cliente.
- Adherencia cuenta solo ocurrencias prescritas por la asignacion profesional vigente.
- Actividades personales o adicionales no elevan ni reducen la adherencia profesional.
- Una ocurrencia no se marca omitida hasta cerrar la ventana actual de dos dias de recuperacion.
- Usar la zona horaria del cliente para dias y ventanas.
- Medidas corporales nunca se seleccionan si falta `body_measurements`, aunque la UI vaya a ocultarlas.
- Notas de sesion se muestran solo dentro del alcance basico aprobado; no indexar ni incluir en analytics.
- Alertas son operativas, no diagnosticos ni recomendaciones medicas.
- Los cambios de rutina se realizan publicando version; el panel no edita evidencia historica.

---

## File Map

- `src/lib/coaching/adherence.ts`: ocurrencias, cumplimiento y alertas puras.
- `supabase/migrations/044_trainer_insights.sql`: RPC minimizadas e indices de consulta.
- `src/lib/coaching/insights.ts`: adapta payload SQL a view models.
- `src/app/(app)/coach/page.tsx`: resumen profesional.
- `src/app/(app)/coach/clients/page.tsx`: lista de clientes.
- `src/app/(app)/coach/clients/[clientId]/page.tsx`: detalle consentido.
- `src/components/coaching/ClientInsightsDashboard.tsx`: adherencia, tendencias y alertas.
- `src/components/coaching/ClientSessionEvidence.tsx`: resultados y notas de solo lectura.
- `src/components/coaching/ClientMeasurementsPanel.tsx`: medidas opcionales.

### Task 1: Especificar el calculo de adherencia profesional

**Files:**
- Create: `src/lib/coaching/adherence.ts`
- Create: `src/lib/coaching/__tests__/adherence.test.ts`

**Interfaces:**
- Produces `buildPrescribedOccurrences`, `calculateTrainerAdherence` y `deriveOperationalAlerts`.
- Consume versiones con `effectiveFrom/effectiveTo`, workouts por ISO day, logs con `assignmentVersionId` y zona IANA.

- [ ] **Step 1: Escribir pruebas rojas de ocurrencias**

Cubrir semanas parciales, cambio de version a mitad de semana, DST, dias 1-7, ventana de dos dias, fecha futura y fin de relacion. Ninguna fecha puede pertenecer simultaneamente a dos versiones.

- [ ] **Step 2: Escribir pruebas rojas de cumplimiento**

```ts
expect(calculateTrainerAdherence({ prescribed: 4, completed: 3 })).toEqual({
  prescribed: 4,
  completed: 3,
  missed: 1,
  adherencePercent: 75,
})
```

Probar que una sesion personal, una repetida y una sesion profesional fuera de rango no cuentan; una ocurrencia aun en gracia queda `pending`, no `missed`.

- [ ] **Step 3: Escribir pruebas rojas de alertas no clinicas**

Reglas explicitas: `no_recent_prescribed_activity` tras 7 dias; `low_adherence` bajo 50% con al menos dos ocurrencias cerradas; `repeated_high_rpe` con RPE medio >=9 en dos sesiones consecutivas. No generar texto medico.

- [ ] **Step 4: Ejecutar RED**

```bash
pnpm vitest run src/lib/coaching/__tests__/adherence.test.ts
```

- [ ] **Step 5: Implementar funciones puras y confirmar GREEN**

```bash
pnpm vitest run src/lib/coaching/__tests__/adherence.test.ts
pnpm type-check
```

- [ ] **Step 6: Commit de la tarea**

```bash
git add src/lib/coaching/adherence.ts src/lib/coaching/__tests__/adherence.test.ts
git commit -m "feat(coaching): calculate prescribed adherence"
```

### Task 2: Crear RPC de resumen y detalle con permiso incorporado

**Files:**
- Create: `supabase/migrations/044_trainer_insights.sql`
- Create: `src/lib/coaching/__tests__/insightsMigration.test.ts`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produce `get_coach_clients_summary()` y `get_coach_client_insights(client_id,from_date,to_date)`.
- Consume `has_active_coaching_scope(auth.uid(),client_id,'training_profile')`.

- [ ] **Step 1: Escribir prueba roja de seguridad SQL**

Exigir `SECURITY DEFINER SET search_path`, rango maximo de 180 dias, guard de scope antes de leer logs, columnas enumeradas sin `SELECT *`, y ausencia de acceso directo del coach en politicas de `progress_logs`, `exercise_logs`, `measurements` y `profiles`.

- [ ] **Step 2: Escribir prueba roja del payload**

El detalle debe devolver JSON versionado:

```ts
export type CoachClientInsightsV1 = {
  schemaVersion: 1
  client: {
    id: string
    fullName: string | null
    avatarUrl: string | null
    timezone: string
    fitnessLevel: string | null
    primaryGoal: string | null
    daysPerWeek: number | null
    sessionDurationMinutes: number | null
    gymType: string | null
    availableEquipment: string[]
    movementLimitations: Json
  }
  relationship: { id: string; startedAt: string }
  versions: AssignmentVersionWindow[]
  prescribedWorkouts: PrescribedWorkout[]
  sessions: CoachSessionEvidence[]
  measurements: null
}
```

La RPC basica fija `measurements:null` sin consultar la tabla.

- [ ] **Step 3: Ejecutar RED**

```bash
pnpm vitest run src/lib/coaching/__tests__/insightsMigration.test.ts
```

- [ ] **Step 4: Implementar migracion e indices**

Indexar relaciones por entrenador/estado, consentimientos vigentes, versiones por asignacion/vigencia y logs por usuario/fecha. Resolver nombre de workout/ejercicio desde `session_context_snapshot` para preservar historial, con fallback al dato vivo solo cuando el snapshot legacy no exista.

- [ ] **Step 5: Actualizar tipos y confirmar GREEN**

```bash
pnpm vitest run src/lib/coaching/__tests__/insightsMigration.test.ts
pnpm type-check
```

- [ ] **Step 6: Commit de la tarea**

```bash
git add supabase/migrations/044_trainer_insights.sql src/lib/coaching/__tests__/insightsMigration.test.ts src/types/database.ts
git commit -m "feat(coaching): add consent-bound client insight RPCs"
```

### Task 3: Implementar resumen y lista de clientes

**Files:**
- Create: `src/lib/coaching/insights.ts`
- Create: `src/lib/coaching/__tests__/insights.test.ts`
- Replace: `src/app/(app)/coach/page.tsx`
- Replace: `src/app/(app)/coach/clients/page.tsx`
- Create: `src/components/coaching/CoachOverview.tsx`
- Create: `src/components/coaching/CoachClientList.tsx`
- Create: `src/components/coaching/__tests__/coachClientList.test.tsx`

**Interfaces:**
- Consume `get_coach_clients_summary()`.
- Produce contadores de solicitudes, activos/pausados, adherencia semanal y alertas operativas agregadas.

- [ ] **Step 1: Escribir pruebas rojas de adaptacion y UI**

Cubrir payload invalido, estado vacio, orden por alerta/actividad, relacion pausada sin detalle accesible, etiquetas no clinicas y navegacion por cliente.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/lib/coaching/__tests__/insights.test.ts src/components/coaching/__tests__/coachClientList.test.tsx
```

- [ ] **Step 3: Implementar resumen**

El servidor llama una sola RPC. La lista muestra nombre, estado, ultima sesion prescrita, completadas/prescritas y alertas. No mostrar medidas, notas ni datos de contacto en tarjetas.

- [ ] **Step 4: Ejecutar GREEN**

```bash
pnpm vitest run src/lib/coaching/__tests__/insights.test.ts src/components/coaching/__tests__/coachClientList.test.tsx
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/lib/coaching/insights.ts src/lib/coaching/__tests__/insights.test.ts src/app/\(app\)/coach/page.tsx src/app/\(app\)/coach/clients/page.tsx src/components/coaching/CoachOverview.tsx src/components/coaching/CoachClientList.tsx src/components/coaching/__tests__/coachClientList.test.tsx
git commit -m "feat(coaches): add client overview and adherence list"
```

### Task 4: Construir detalle de evidencia de solo lectura

**Files:**
- Create: `src/app/(app)/coach/clients/[clientId]/page.tsx`
- Create: `src/app/(app)/coach/clients/[clientId]/loading.tsx`
- Create: `src/components/coaching/ClientInsightsDashboard.tsx`
- Create: `src/components/coaching/ClientSessionEvidence.tsx`
- Create: `src/components/coaching/__tests__/clientInsightsDashboard.test.tsx`

**Interfaces:**
- Consume `get_coach_client_insights` y funciones de adherencia.
- Produce filtros de 4/12 semanas, calendario prescrito, tendencia y detalle de sets, carga, reps, RPE, duracion, notas y omisiones.

- [ ] **Step 1: Escribir prueba roja de privacidad y presentacion**

Exigir que el componente no incluya formularios/acciones de mutacion, diferencie `completed|missed|pending|incomplete`, muestre extras fuera del calculo y presente notas como texto escapado.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/components/coaching/__tests__/clientInsightsDashboard.test.tsx
```

- [ ] **Step 3: Implementar ruta y respuesta generica**

Validar UUID antes de llamar la RPC. Ante permiso ausente o recurso ajeno usar `notFound()` y no distinguir causas. Recalcular adherencia en servidor con zona del cliente y renderizar componentes sin handlers de escritura.

- [ ] **Step 4: Ejecutar GREEN**

```bash
pnpm vitest run src/components/coaching/__tests__/clientInsightsDashboard.test.tsx
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/app/\(app\)/coach/clients src/components/coaching/ClientInsightsDashboard.tsx src/components/coaching/ClientSessionEvidence.tsx src/components/coaching/__tests__/clientInsightsDashboard.test.tsx
git commit -m "feat(coaches): add read-only client evidence dashboard"
```

### Task 5: Añadir medidas solo mediante consentimiento separado

**Files:**
- Modify: `supabase/migrations/044_trainer_insights.sql`
- Modify: `src/lib/coaching/__tests__/insightsMigration.test.ts`
- Modify: `src/lib/coaching/insights.ts`
- Create: `src/components/coaching/ClientMeasurementsPanel.tsx`
- Create: `src/components/coaching/__tests__/clientMeasurementsPanel.test.tsx`
- Modify: `src/app/(app)/coach/clients/[clientId]/page.tsx`

**Interfaces:**
- Produce RPC `get_coach_client_measurements(client_id,from_date,to_date)` separada.
- Consume scope `body_measurements`; nunca el consentimiento basico como sustituto.

- [ ] **Step 1: Escribir pruebas rojas de permiso**

Cubrir consentimiento ausente, revocado, vigente, entrenador distinto, relacion pausada y grant revocado entre render y llamada. Sin permiso la RPC devuelve error generico y no ejecuta el SELECT de medidas.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/lib/coaching/__tests__/insightsMigration.test.ts src/components/coaching/__tests__/clientMeasurementsPanel.test.tsx
```

- [ ] **Step 3: Implementar RPC y carga condicional**

La pagina primero recibe scopes vigentes del payload basico y solo invoca la segunda RPC cuando incluye `body_measurements`. Mostrar peso y medidas disponibles con fecha, sin inferencias clinicas.

- [ ] **Step 4: Ejecutar GREEN**

```bash
pnpm vitest run src/lib/coaching/__tests__/insightsMigration.test.ts src/components/coaching/__tests__/clientMeasurementsPanel.test.tsx
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add supabase/migrations/044_trainer_insights.sql src/lib/coaching/__tests__/insightsMigration.test.ts src/lib/coaching/insights.ts src/components/coaching/ClientMeasurementsPanel.tsx src/components/coaching/__tests__/clientMeasurementsPanel.test.tsx src/app/\(app\)/coach/clients
git commit -m "feat(coaches): gate body measurements by consent"
```

### Task 6: Verificar revocacion, evidencia y regresion

**Files:**
- Create: `tests/e2e/trainer-insights.spec.ts`
- Modify: `tests/e2e/helpers/core-product.ts`
- Modify: `src/lib/analytics/events.ts`
- Modify: `src/lib/analytics/__tests__/events.test.ts`

**Interfaces:**
- Consume fixtures con sesiones profesionales, personales, versionadas y medidas.
- Produce eventos agregados sin IDs de cliente, notas, medidas ni texto libre.

- [ ] **Step 1: Añadir analytics seguros**

Permitir solo eventos `coach_overview_viewed`, `coach_client_insights_viewed` y `coach_alert_filter_used` con propiedades enumeradas como periodo y conteos agregados. Probar que el sanitizador rechaza `clientId`, `notes`, `weight`, `measurement` y texto libre.

- [ ] **Step 2: Implementar E2E**

Probar adherencia que excluye sesiones personales, detalle de resultados, medidas invisibles sin grant, visibilidad tras grant, revocacion inmediata sin recarga privilegiada, y perdida completa de acceso al finalizar/suspender.

- [ ] **Step 3: Ejecutar E2E focalizado**

```bash
pnpm playwright test tests/e2e/trainer-insights.spec.ts --project=mobile-375 --project=desktop-1440
```

- [ ] **Step 4: Ejecutar regresion completa**

```bash
pnpm test
pnpm type-check
pnpm lint
pnpm build
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add tests/e2e/trainer-insights.spec.ts tests/e2e/helpers/core-product.ts src/lib/analytics/events.ts src/lib/analytics/__tests__/events.test.ts
git commit -m "test(coaching): verify consent-bound client insights"
```

## Completion Criteria

- Entrenadores ven solo clientes con relacion activa y consentimiento basico vigente.
- Adherencia usa exclusivamente ocurrencias de versiones profesionales vigentes y respeta zona/gracia.
- Sesiones personales no afectan el porcentaje.
- Evidencia se presenta en solo lectura y conserva snapshots historicos.
- Medidas no se consultan ni renderizan sin permiso separado vigente.
- Finalizacion, revocacion o suspension corta el acceso en la siguiente llamada sin filtrar existencia.
