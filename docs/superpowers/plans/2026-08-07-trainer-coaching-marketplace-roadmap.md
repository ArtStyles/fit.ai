# Trainer Coaching Marketplace Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar el modulo aprobado de entrenadores de Vekira en seis versiones independientes, seguras y verificables, sin pagos ni mensajeria privada.

**Architecture:** Mantener una sola identidad de usuario y agregar una capacidad profesional aprobada. Separar verificacion, relaciones/consentimientos, plantillas/asignaciones y proyecciones de seguimiento. Las operaciones criticas se resuelven con RPC transaccionales y RLS; el plan profesional se copia al cliente como una version inmutable que reutiliza el motor actual de sesiones.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Supabase/PostgreSQL con RLS y RPC, Firebase/Capacitor push, Vitest y Playwright.

## Global Constraints

- La especificacion aprobada es `docs/superpowers/specs/2026-08-07-trainer-coaching-marketplace-design.md`; si un detalle del plan entra en conflicto, prevalece la especificacion.
- Trabajar sobre la rama activa y preservar `.superpowers/` y cualquier cambio ajeno sin versionar.
- Usar TDD por tarea: prueba roja, implementacion minima, prueba verde y commit enfocado.
- Aplicar migraciones y politicas antes de exponer rutas que dependan de ellas.
- Denegar por defecto: ningun permiso profesional puede derivarse de datos editables por el usuario ni de una relacion social.
- Una cuenta conserva todas sus funciones personales aunque tambien sea entrenador.
- Solo entrenadores aprobados y activos aparecen en el directorio o usan el espacio profesional.
- Un cliente solo puede tener una relacion `active`; las aceptaciones concurrentes deben serializarse en PostgreSQL.
- Los consentimientos son versionados y revocables; medidas corporales usan un alcance separado.
- Las rutinas profesionales son editables por el entrenador en plantillas, pero inmutables para el cliente una vez copiadas.
- Una sesion autorizada conserva la version con la que inicio aunque el entrenador publique una revision.
- La finalizacion o suspension revoca acceso profesional en la misma transaccion; no borra el ultimo plan del cliente.
- Los servicios usan `free_preview`. Los campos comerciales permanecen nulos y no se renderizan ni aceptan desde formularios.
- No implementar pagos, chat privado, correo automatico, videollamadas, reseñas ni multiples entrenadores activos.
- Comunidad permanece en el repositorio y en la base de datos, pero `COMMUNITY_ENABLED` es falso por defecto.
- Antes de cerrar cada fase ejecutar `pnpm test`, `pnpm type-check`, `pnpm lint` y `pnpm build`, ademas de su suite E2E focalizada.

---

## Orden de entrega

1. [Fase 1: fundaciones, Comunidad y notificaciones](./2026-08-07-trainer-phase-1-foundations.md)
2. [Fase 2: solicitud y verificacion profesional](./2026-08-07-trainer-phase-2-verification.md)
3. [Fase 3: directorio, servicios y relaciones](./2026-08-07-trainer-phase-3-relationships.md)
4. [Fase 4: plantillas, asignaciones y bloqueo](./2026-08-07-trainer-phase-4-programming.md)
5. [Fase 5: seguimiento y evidencia](./2026-08-07-trainer-phase-5-insights.md)
6. [Fase 6: endurecimiento y piloto](./2026-08-07-trainer-phase-6-hardening.md)

Cada fase debe desplegarse y validarse sin depender de trabajo de una fase posterior. Las rutas que aun no tengan funcionalidad completa muestran un estado vacio honesto, nunca datos simulados.

## Propiedad de migraciones

| Migracion | Fase | Responsabilidad |
| --- | --- | --- |
| `040_trainer_foundations.sql` | 1 | notificaciones generales, tokens globales, preferencias y auditoria profesional |
| `041_trainer_verification.sql` | 2 | solicitudes, credenciales privadas, revision, entrevista y perfil profesional |
| `042_trainer_relationships.sql` | 3 | servicios, solicitudes de clientes, relacion unica, consentimientos y suspension |
| `043_trainer_programming.sql` | 4 | plantillas, versiones, asignaciones, cupo profesional y bloqueo de prescripcion |
| `044_trainer_insights.sql` | 5 | RPC de lectura consentida, adherencia y detalle de evidencia |
| `045_trainer_hardening.sql` | 6 | indices finales, invariantes de auditoria y ajustes encontrados por pruebas de carga |

Una migracion posterior puede reemplazar una funcion anterior con `CREATE OR REPLACE`, pero no puede editar el archivo historico ya aplicado.

## Contratos compartidos entre fases

La fase 1 produce estados, notificaciones y auditoria comunes:

```ts
export type ProductNotificationType =
  | 'trainer_application_status'
  | 'coaching_request_status'
  | 'coaching_assignment_status'
  | 'coaching_relationship_status'
  | 'coaching_consent_status'

export type ProfessionalAuditEntity =
  | 'trainer_application'
  | 'trainer_profile'
  | 'trainer_service'
  | 'coaching_request'
  | 'coaching_relationship'
  | 'coaching_consent'
  | 'trainer_template'
  | 'trainer_assignment'
```

La fase 2 produce la capacidad profesional y el guard de rutas:

```ts
export type TrainerAccess = {
  approved: boolean
  active: boolean
  profileId: string | null
}

export async function getTrainerAccess(userId: string): Promise<TrainerAccess>
export async function requireActiveTrainerContext(): Promise<TrainerContext>
```

La fase 3 produce la autorizacion por relacion y alcance:

```ts
export type CoachingConsentScope = 'training_profile' | 'body_measurements'

export async function requireCoachingScope(input: {
  trainerUserId: string
  clientUserId: string
  scope: CoachingConsentScope
}): Promise<{ relationshipId: string }>
```

La fase 4 produce la identidad inmutable del plan profesional:

```ts
export type ProfessionalPlanIdentity = {
  relationshipId: string
  assignmentId: string
  assignmentVersionId: string
  prescriptionLocked: true
}
```

La fase 5 consume exclusivamente los RPC consentidos; sus paginas no consultan directamente `measurements`, `exercise_logs` ni perfiles privados del cliente.

## Cobertura de la especificacion

| Area aprobada | Plan responsable |
| --- | --- |
| Ocultar Comunidad sin borrar codigo/datos | Fase 1, tareas 1-2 |
| Centro interno y push general | Fase 1, tareas 3-5 |
| Solicitud abierta, credenciales y contacto | Fase 2, tareas 1-3 |
| Revision, cambios, entrevista y aprobacion | Fase 2, tareas 4-5 |
| Perfil profesional y selector de espacio | Fase 2, tareas 6-7 |
| Servicios multiples gratuitos y precios ocultos | Fase 3, tareas 1-2 |
| Directorio y perfil publico | Fase 3, tarea 3 |
| Solicitudes, relacion unica y consentimiento | Fase 3, tareas 4-6 |
| Finalizacion, suspension y reanudacion confirmada | Fase 3, tareas 7-8 |
| Plantillas separadas de planes personales | Fase 4, tareas 1-3 |
| Primera asignacion aceptada y revisiones automaticas | Fase 4, tareas 4-6 |
| Bloqueo completo y cupo independiente | Fase 4, tareas 2 y 7-9 |
| Clientes, adherencia, evidencia y medidas opcionales | Fase 5, tareas 1-5 |
| Accesibilidad, concurrencia, regresion y piloto | Fase 6, tareas 1-6 |

## Puertas de salida por fase

- [ ] **Fase 1:** `/feed` y mutaciones sociales quedan inaccesibles con la bandera apagada; `/trainers` reemplaza Comunidad; las notificaciones generales funcionan sin tablas sociales.
- [ ] **Fase 2:** un usuario puede enviar una solicitud y un administrador puede pedir cambios, coordinar entrevista y aprobar; solo entonces aparece el espacio Entrenador.
- [ ] **Fase 3:** un cliente puede solicitar un servicio gratuito y solo una aceptacion concurrente crea su relacion activa; terminar o suspender revoca acceso inmediatamente.
- [ ] **Fase 4:** el entrenador asigna una rutina, el cliente la acepta y puede ejecutarla sin editarla; una revision afecta solo sesiones futuras.
- [ ] **Fase 5:** el entrenador ve adherencia y evidencia exclusivamente de clientes y alcances autorizados.
- [ ] **Fase 6:** las matrices RLS, concurrencia, accesibilidad, rendimiento y regresion pasan en entornos equivalentes a produccion.

## Estrategia de integracion

- Cada tarea termina en un commit pequeño indicado por su plan.
- Cada fase termina con un commit de verificacion si solo agrega pruebas/documentacion; no mezclar fases en un mismo commit.
- No abrir rutas publicas antes de aplicar su migracion y sus RLS.
- En despliegue, aplicar migracion, desplegar servidor, ejecutar smoke tests y finalmente habilitar la superficie correspondiente.
- `COMMUNITY_ENABLED=false` y la ausencia de controles de precio son invariantes de todo el programa.

## Aceptacion del programa

- [ ] Los seis planes completaron todos sus comandos y criterios.
- [ ] Ningun solicitante pendiente o entrenador suspendido es descubrible ni accede a clientes.
- [ ] Ningun entrenador consulta datos sin relacion activa y consentimiento vigente.
- [ ] Una cuenta nunca tiene mas de una relacion activa como cliente.
- [ ] El plan profesional no puede editarse, ajustarse con IA, autoprogresarse, compartirse ni alterarse con herramientas de sesion.
- [ ] Los resultados reales y snapshots historicos permanecen correctos.
- [ ] Los servicios no muestran ni aceptan precio, moneda, periodicidad o pagos.
- [ ] Comunidad sigue intacta en codigo y datos, pero es inaccesible con la bandera apagada.
- [ ] Los flujos personales existentes mantienen sus pruebas de regresion.
