# Trainer Phase 6 Hardening and Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar seguridad, concurrencia, accesibilidad, rendimiento, observabilidad y operacion antes de habilitar un piloto controlado del modulo de entrenadores.

**Architecture:** Probar el sistema desde tres capas: SQL/RLS para autoridad, acciones/RPC para transiciones y Playwright para journeys reales. Una migracion final añade invariantes e indices medidos. Runbooks y auditoria permiten operar aprobaciones, suspensiones y rollback sin exponer datos sensibles.

**Tech Stack:** PostgreSQL/pgTAP y Supabase CLI, Next.js 14, TypeScript, Vitest, Playwright, Axe y herramientas de auditoria del repositorio.

## Global Constraints

- No reducir un guard o politica para hacer pasar una prueba; corregir el contrato o la implementacion mas restrictiva.
- Ejecutar seguridad con identidades separadas: cliente, entrenador correcto, otro entrenador, solicitante pendiente, entrenador suspendido y administrador.
- Las pruebas de concurrencia deben usar conexiones reales independientes, no mocks secuenciales.
- Ningun log, trace, evento analytics o captura del piloto contiene credenciales, contacto privado, notas libres, medidas o IDs de storage.
- Cumplir WCAG 2.2 AA y probar 375, 768, 1024 y 1440 px sin overflow no intencional.
- Preservar soporte de `prefers-reduced-motion`, safe areas de Capacitor y navegacion por teclado.
- Comunidad permanece apagada y los campos comerciales permanecen ocultos durante todo el piloto.
- No invitar usuarios reales hasta que todas las puertas tecnicas y el checklist de privacidad esten cerrados.
- El piloto empieza con 3-5 entrenadores ya verificados y clientes que acepten explicitamente participar.

---

## File Map

- `supabase/tests/trainer_authorization_test.sql`: matriz RLS y RPC.
- `tests/e2e/trainer-security.spec.ts`: manipulacion de IDs, revocacion y concurrencia real.
- `tests/e2e/trainer-marketplace.spec.ts`: journey completo entre roles.
- `tests/e2e/accessibility.spec.ts`: Axe y teclado en nuevas rutas.
- `supabase/migrations/045_trainer_hardening.sql`: indices e invariantes finales.
- `scripts/audit-trainer-marketplace.ts`: comprueba estado operativo y consultas criticas.
- `src/lib/analytics/events.ts`: allowlist de eventos sin datos sensibles.
- `docs/operations/trainer-marketplace-runbook.md`: despliegue, suspension, incidentes y rollback.
- `docs/operations/trainer-pilot-checklist.md`: entrada, seguimiento y salida del piloto.

### Task 1: Construir matriz SQL de autorizacion

**Files:**
- Create: `supabase/tests/trainer_authorization_test.sql`
- Create: `supabase/migrations/045_trainer_hardening.sql`
- Create: `src/lib/coaching/__tests__/authorizationMatrix.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consume migraciones 040-044 sobre una base local limpia.
- Produce un test pgTAP reproducible con `pnpm test:db:trainers`.

- [ ] **Step 1: Escribir la matriz de actores y recursos**

Sembrar UUID fijos para `client_a`, `client_b`, `coach_a`, `coach_b`, `pending_coach` y `suspended_coach`. Probar SELECT/INSERT/UPDATE/DELETE y RPC sobre:

- solicitud y credencial profesional;
- perfil y servicio publico;
- solicitud/relacion/consentimiento;
- plantilla/asignacion/version;
- plan/workout/prescripcion bloqueada;
- resumen, evidencia y medidas;
- notificaciones y auditoria.

- [ ] **Step 2: Añadir aserciones de revocacion**

Dentro de la misma transaccion, terminar, revocar y suspender; la siguiente sentencia con identidad del entrenador debe fallar. Verificar que cliente conserva SELECT/ejecucion de su plan y que otro entrenador nunca obtiene acceso.

- [ ] **Step 3: Ejecutar RED contra las politicas actuales**

```bash
supabase db reset
supabase test db supabase/tests/trainer_authorization_test.sql
```

Esperado inicial: al menos una asercion falla hasta completar huecos encontrados.

- [ ] **Step 4: Corregir solo mediante migracion 045 y añadir prueba estatica**

Nunca editar 040-044 ya aplicadas. `authorizationMatrix.test.ts` debe verificar que todas las tablas sensibles tienen RLS, grants explicitos y funciones con `search_path` fijo.

- [ ] **Step 5: Añadir comando y confirmar GREEN**

```json
"test:db:trainers": "supabase test db supabase/tests/trainer_authorization_test.sql"
```

```bash
pnpm test:db:trainers
pnpm vitest run src/lib/coaching/__tests__/authorizationMatrix.test.ts
```

- [ ] **Step 6: Commit de la tarea**

```bash
git add supabase/tests/trainer_authorization_test.sql supabase/migrations/045_trainer_hardening.sql src/lib/coaching/__tests__/authorizationMatrix.test.ts package.json
git commit -m "test(coaching): enforce trainer authorization matrix"
```

### Task 2: Probar concurrencia, idempotencia y manipulacion de IDs

**Files:**
- Create: `tests/e2e/trainer-security.spec.ts`
- Modify: `tests/e2e/fixtures.ts`
- Modify: `tests/e2e/helpers/core-product.ts`
- Create: `tests/e2e/helpers/trainer-marketplace.ts`
- Modify: `src/app/actions/coachingRequests.ts`
- Modify: `src/app/actions/coachingRelationships.ts`
- Modify: `src/app/actions/trainerAssignments.ts`
- Modify: `src/lib/coaching/permissions.ts`

**Interfaces:**
- Consume dos clientes Supabase autenticados por actor y RPC reales.
- Produce pruebas de carreras y reintentos sobre la base local.

- [ ] **Step 1: Escribir pruebas rojas de concurrencia**

Ejecutar con `Promise.allSettled` y conexiones independientes:

1. dos entrenadores aceptan pendientes del mismo cliente;
2. el mismo entrenador repite propuesta/asignacion;
3. el cliente acepta mientras el entrenador publica o es suspendido;
4. dos revisiones intentan version N+1;
5. finalizar compite con lectura de evidencia.

Esperar un unico ganador, numeros de version unicos, ningun plan activo doble y cero filas parciales.

- [ ] **Step 2: Escribir pruebas rojas de IDOR**

Manipular applicationId, credentialId, requestId, relationshipId, clientId, templateId, assignmentId, planId y progressLogId. Cada respuesta debe ser generica y no cambiar filas.

- [ ] **Step 3: Ejecutar RED y corregir mediante RPC/guards**

```bash
pnpm playwright test tests/e2e/trainer-security.spec.ts --project=desktop-1024
```

Los ajustes SQL se agregan a 045; los de servidor se acompañan de prueba unitaria focalizada.

- [ ] **Step 4: Ejecutar GREEN tres veces**

```bash
pnpm playwright test tests/e2e/trainer-security.spec.ts --project=desktop-1024 --repeat-each=3
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add tests/e2e/trainer-security.spec.ts tests/e2e/fixtures.ts tests/e2e/helpers/core-product.ts tests/e2e/helpers/trainer-marketplace.ts supabase/migrations/045_trainer_hardening.sql src/app/actions/coachingRequests.ts src/app/actions/coachingRelationships.ts src/app/actions/trainerAssignments.ts src/lib/coaching/permissions.ts
git commit -m "test(coaching): harden concurrent trainer workflows"
```

### Task 3: Cerrar accesibilidad y responsive

**Files:**
- Modify: `tests/e2e/accessibility.spec.ts`
- Create: `tests/e2e/trainer-accessibility.spec.ts`
- Modify: `tests/e2e/helpers/acceptance.ts`
- Modify: componentes de `src/components/coaching/**` solo cuando una prueba lo requiera.

**Interfaces:**
- Consume rutas de postulante, admin, directorio, coaching, coach y notificaciones.
- Produce Axe sin violaciones critical/serious y geometria valida en cuatro viewports.

- [ ] **Step 1: Escribir pruebas de teclado y Axe**

Cubrir `/trainers`, perfil, `/coach/apply`, `/coaching`, `/coach`, solicitudes, editor de plantilla, cliente detalle, admin revision y notificaciones. Probar orden de foco, labels, errores asociados, dialogs, estados async y focus tras navegacion.

- [ ] **Step 2: Escribir pruebas de geometria**

En 375, 768, 1024 y 1440 px exigir ausencia de overflow de pagina, controles de al menos 44 px, tablas/timelines contenidos y navegacion correcta por modo.

- [ ] **Step 3: Ejecutar RED y corregir componentes**

```bash
pnpm playwright test tests/e2e/trainer-accessibility.spec.ts
```

- [ ] **Step 4: Confirmar GREEN y regresion Axe existente**

```bash
pnpm playwright test tests/e2e/trainer-accessibility.spec.ts tests/e2e/accessibility.spec.ts
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add tests/e2e/trainer-accessibility.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/helpers/acceptance.ts src/components/coaching
git commit -m "fix(coaching): close accessibility and responsive gaps"
```

### Task 4: Medir consultas y añadir indices finales

**Files:**
- Modify: `supabase/migrations/045_trainer_hardening.sql`
- Create: `scripts/audit-trainer-marketplace.ts`
- Create: `src/lib/coaching/__tests__/hardeningMigration.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produce `pnpm audit:trainers` y evidencia de planes de consulta.
- Consume una fixture de 100 entrenadores, 1,000 clientes, 52 semanas de versiones y logs representativos en entorno local.

- [ ] **Step 1: Escribir prueba roja de indices requeridos**

Exigir indices compuestos/parciales para:

- directorio por perfil activo/slug;
- servicios activos por entrenador;
- solicitudes pendientes por entrenador/fecha y cliente/estado;
- relaciones por entrenador/estado y cliente/estado;
- consentimientos vigentes por relacion/scope;
- versiones por asignacion/vigencia;
- notificaciones no leidas por usuario/fecha;
- logs de cliente por fecha ya utilizados por insights.

- [ ] **Step 2: Implementar script de auditoria**

Ejecutar `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` para directorio, cola, lista de clientes y detalle de 12 semanas. Fallar si hay sequential scan de tablas grandes evitable o si p95 local de 20 repeticiones supera 300 ms despues de warm-up.

- [ ] **Step 3: Ejecutar RED**

```bash
pnpm vitest run src/lib/coaching/__tests__/hardeningMigration.test.ts
pnpm tsx --env-file=.env.local scripts/audit-trainer-marketplace.ts
```

- [ ] **Step 4: Añadir indices `IF NOT EXISTS` y confirmar GREEN**

Agregar a `package.json`:

```json
"audit:trainers": "tsx --env-file=.env.local scripts/audit-trainer-marketplace.ts"
```

```bash
pnpm vitest run src/lib/coaching/__tests__/hardeningMigration.test.ts
pnpm audit:trainers
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add supabase/migrations/045_trainer_hardening.sql scripts/audit-trainer-marketplace.ts src/lib/coaching/__tests__/hardeningMigration.test.ts package.json
git commit -m "perf(coaching): index trainer marketplace queries"
```

### Task 5: Completar auditoria, privacidad y runbook operativo

**Files:**
- Modify: `supabase/migrations/045_trainer_hardening.sql`
- Modify: `src/lib/analytics/events.ts`
- Modify: `src/lib/analytics/__tests__/events.test.ts`
- Create: `src/lib/coaching/__tests__/auditCoverage.test.ts`
- Create: `docs/operations/trainer-marketplace-runbook.md`

**Interfaces:**
- Produce auditoria append-only y runbook de despliegue/incidente/rollback.
- Consume eventos de transicion definidos en fases 1-5.

- [ ] **Step 1: Escribir prueba roja de cobertura de auditoria**

Exigir evento para solicitud, revision, entrevista, decision, perfil, servicio, solicitud de cliente, relacion, consentimiento, plantilla, asignacion, revision, suspension y reanudacion. Exigir trigger que rechace UPDATE/DELETE de `professional_audit_logs` fuera de una funcion de retencion administrativa futura.

- [ ] **Step 2: Endurecer allowlist de analytics y logs**

Probar que no se aceptan email, telefono, credencial, URL de storage, notas, razon libre, IDs de cliente, medidas o cargas. Los errores del servidor usan codigos de dominio y un correlation id, no payloads sensibles.

- [ ] **Step 3: Redactar runbook ejecutable**

Documentar orden 040-045, variables, smoke tests, aprobacion, entrevista externa, suspension inmediata, restablecimiento, revocacion, inspeccion de auditoria, respaldo y rollback por despliegue hacia atras sin eliminar tablas/datos.

- [ ] **Step 4: Ejecutar pruebas**

```bash
pnpm vitest run src/lib/coaching/__tests__/auditCoverage.test.ts src/lib/analytics/__tests__/events.test.ts
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add supabase/migrations/045_trainer_hardening.sql src/lib/analytics/events.ts src/lib/analytics/__tests__/events.test.ts src/lib/coaching/__tests__/auditCoverage.test.ts docs/operations/trainer-marketplace-runbook.md
git commit -m "docs(coaching): add secure operations runbook"
```

### Task 6: Ejecutar journey completo y puerta del piloto

**Files:**
- Create: `tests/e2e/trainer-marketplace.spec.ts`
- Create: `docs/operations/trainer-pilot-checklist.md`
- Modify: `.env.example`
- Verify: aplicacion completa.

**Interfaces:**
- Consume base limpia, `COMMUNITY_ENABLED=false`, sin claves de pago y cuentas de todos los roles.
- Produce evidencia de release y checklist firmado manualmente antes de invitar al piloto.

- [ ] **Step 1: Implementar journey completo**

Automatizar: solicitud profesional, cambios, entrevista, aprobacion, servicios, descubrimiento, varias solicitudes, aceptacion unica, consentimientos, plantilla, asignacion, aceptacion, sesion, evidencia, revision concurrente, revocacion de medidas, finalizacion, suspension y reanudacion confirmada.

- [ ] **Step 2: Añadir aserciones de exclusiones**

En todo el journey verificar: sin Comunidad, precios, checkout, chat, reseñas ni controles de edicion del plan profesional.

- [ ] **Step 3: Ejecutar todas las puertas tecnicas**

```bash
supabase db reset
pnpm test:db:trainers
pnpm test
pnpm type-check
pnpm lint
pnpm build
pnpm playwright test tests/e2e/trainer-marketplace.spec.ts tests/e2e/trainer-security.spec.ts tests/e2e/trainer-accessibility.spec.ts
pnpm audit:trainers
```

- [ ] **Step 4: Ejecutar regresion E2E existente**

```bash
pnpm test:e2e
```

- [ ] **Step 5: Completar checklist de piloto**

El documento debe exigir: 3-5 entrenadores aprobados, credenciales revisadas, consentimiento informado de clientes, canal de soporte, responsable de incidentes, metrica semanal de errores/adherencia, revision a 7 y 14 dias, y criterio de detener piloto ante acceso indebido, corrupcion de plan o perdida de logs.

- [ ] **Step 6: Inspeccionar el diff final**

```bash
git status --short
git diff --check
git log --oneline --decorate -30
```

Esperado: solo cambios previstos; `.superpowers/` permanece sin versionar; ninguna pasarela, chat o migracion social eliminada.

- [ ] **Step 7: Commit de la tarea**

```bash
git add tests/e2e/trainer-marketplace.spec.ts docs/operations/trainer-pilot-checklist.md .env.example
git commit -m "test(coaching): gate trainer marketplace pilot"
```

## Completion Criteria

- Matriz SQL y pruebas IDOR niegan todo acceso fuera de relacion/consentimiento.
- Carreras reales dejan un ganador y ningun estado parcial.
- Nuevas rutas pasan Axe, teclado y responsive en cuatro viewports.
- Consultas criticas cumplen los indices y presupuesto medido.
- Auditoria es completa, append-only y libre de datos sensibles en analytics/logs.
- Journey total y regresion existente pasan desde una base limpia.
- El piloto no comienza sin checklist operacional completo y mantiene Comunidad, pagos y mensajeria deshabilitados.
