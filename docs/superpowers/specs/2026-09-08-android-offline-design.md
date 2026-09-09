# Vekira Android offline

## Corrección aprobada: conservar la aplicación original

El usuario corrigió el alcance después de revisar la primera implementación: el APK debe adaptar Vekira existente, conservar sus pestañas y recorridos y permitir solamente mejoras visuales puntuales. La entrada vigente es `mobile/src/original/OriginalApp.tsx`; carga las páginas originales, AppShell, onboarding, sesión, medidas, progreso y ajustes. Los adaptadores sustituyen límites de servidor y almacenamiento, no los componentes de producto. Todo permanece en `codex/android-offline`.

La descripción histórica que sigue no autoriza reconstruir una interfaz alternativa. Los contratos actuales están en [android-offline.md](../../android-offline.md) y [android-original-sync.md](../../android-original-sync.md).

Approved in the conversation: Android APK; personal training works offline; trainers and account synchronization work online. The user requires a separate branch so the current web remains usable.

## Isolation and delivery

- Branch `codex/android-offline`, worktree `D:/work/project/.worktrees/android-offline`, base `f8eca62`.
- Do not change, merge, push or deploy `main`. Do not apply migrations to production during implementation. Keep existing Next.js routes functional on this branch as well.
- Add a separate `mobile/` React entry point built by Vite. Capacitor packages `mobile/dist`, never a remote `server.url`. Retain application ID and signing identity for a compatible update.
- Deliver source, verified build, APK and an exact statement of local/device/backend validation. A backend change not deployed is not called live synchronization.

## Personal application

The bundled application starts in airplane mode, including first installation. A local profile can generate a plan using the existing training engine after its readiness checks. Linking an existing account and downloading cloud history require internet. Linked profiles remain usable when authentication refresh cannot reach the server; offline access never authorizes online writes.

Keep Vekira's dark violet visual identity and Spanish interface, accessible controls, bottom navigation, Android Back, safe area spacing and responsive layout. Screens: Inicio, Rutinas, Entrenar (active session), Historial/progreso, Ejercicios, Entrenadores and Ajustes. Settings provide profile edits, measurements, account connection, sync status and backup import/export.

Bundle the reviewed exercise catalogue and media; unknown remote exercises retain text and a local fallback when media was not downloaded. Personal plans support creating/regenerating and selecting the active plan. Downloaded trainer prescriptions are immutable snapshots and runnable offline. Record repetitions, weights, duration, completed sets, rests, session finish and body measurements. A durable write must succeed before the interface reports completion. Preserve an active session across process death. Prevent replacing an unfinished workout silently.

## Local persistence and shared interface

Use native SQLite on Android and SQLite backed by IndexedDB for browser verification. Every entity belongs to `accountId`. A serialized write queue survives rejected writes. Transactions atomically write a completed session and its outbox operation. Stable UUID entity IDs make retries idempotent. Outbox payloads are immutable; acknowledgments match operation ID and cannot erase newer data. Logout/cross-account transitions never show or synchronize another account's data.

`mobile/src/domain/types.ts` defines these exact public structures (additional optional fields may be added without breaking consumers):

```ts
import type { TrainingProfile } from '../../../src/lib/training-engine/types'
type MobileAccount = { id: string; remoteUserId: string | null; name: string; profile: TrainingProfile; createdAt: string; updatedAt: string }
type MobileExercise = { id: string; remoteId?: string | null; name: string; imageUrl: string | null; instructions: string; muscleGroups: string[]; equipment: string[] }
type MobilePrescription = { id: string; exerciseId: string; name: string; imageUrl: string | null; instructions: string; sets: number; reps: number | null; durationSeconds: number | null; restSeconds: number; weightKg: number | null; targetRpe: number | null }
type MobileWorkout = { id: string; name: string; dayOfWeek: number; exercises: MobilePrescription[] }
type MobilePlan = { id: string; accountId: string; remoteId: string | null; source: 'personal' | 'trainer'; name: string; notes: string; workouts: MobileWorkout[]; createdAt: string; updatedAt: string }
type MobileSet = { id: string; reps: number | null; weightKg: number | null; durationSeconds: number | null; completed: boolean }
type MobileSessionExercise = { prescription: MobilePrescription; sets: MobileSet[] }
type MobileSession = { id: string; accountId: string; planId: string; workoutId: string; workoutName: string; source: 'personal' | 'trainer'; startedAt: string; finishedAt: string | null; exercises: MobileSessionExercise[]; rpe: number | null; notes: string; remoteId: string | null }
type MobileMeasurement = { id: string; accountId: string; date: string; weightKg: number; waistCm: number | null; notes: string; updatedAt: string; deletedAt: string | null }
type OutboxOperation = { id: string; accountId: string; kind: 'plan' | 'session' | 'measurement' | 'profile'; entityId: string; payload: unknown; createdAt: string; attempts: number; error: string | null }
type MobileData = { plans: MobilePlan[]; sessions: MobileSession[]; measurements: MobileMeasurement[]; activePlanId: string | null }
interface MobileRepository {
  listAccounts(): Promise<MobileAccount[]>;
  saveAccount(account: MobileAccount, enqueue?: boolean): Promise<void>;
  getActiveAccountId(): Promise<string | null>;
  setActiveAccountId(id: string | null): Promise<void>;
  loadData(accountId: string): Promise<MobileData>;
  savePlan(plan: MobilePlan, enqueue?: boolean): Promise<void>;
  setActivePlan(accountId: string, planId: string): Promise<void>;
  saveSession(session: MobileSession, enqueue?: boolean): Promise<void>;
  saveMeasurement(measurement: MobileMeasurement, enqueue?: boolean): Promise<void>;
  pending(accountId: string): Promise<OutboxOperation[]>;
  acknowledge(accountId: string, operationId: string): Promise<void>;
  recordFailure(accountId: string, operationId: string, message: string): Promise<void>;
  exportBackup(accountId: string): Promise<string>;
  importBackup(json: string, targetAccountId?: string): Promise<MobileAccount>;
}
```

Repository implementation lives in `mobile/src/data/`, exports `openMobileRepository(): Promise<MobileRepository>` from `data/index.ts`, and a driver-injected factory for real SQLite tests. Backups are versioned, validated completely before a transaction, do not contain credentials, and cannot overwrite another linked identity or silently discard newer/pending records. Import accepts the original account or explicitly maps an unlinked local account. Failed/corrupt import leaves original data intact.

`mobile/src/domain/catalog.ts` exports `exerciseCatalog: MobileExercise[]`. `domain/training.ts` exports `defaultTrainingProfile(): TrainingProfile`, `createPersonalPlan(account, previousPlan?): MobilePlan`, `createWorkoutSession(accountId, plan, workout): MobileSession`, and `sessionVolume(session): number`. Root owns these domain modules; reuse training-engine rules, do not duplicate or weaken readiness checks.

## Online account, trainers and synchronization

`mobile/src/cloud/index.ts` exports `createMobileCloud(repository): MobileCloud`. `MobileCloud` exposes `configured: boolean`, `signIn(email,password): Promise<MobileAccount>`, `signOut(): Promise<void>`, `sync(accountId): Promise<{ uploaded: number; downloaded: number; pending: number }>`, `listTrainers(): Promise<TrainerCard[]>`, `requestTrainer(serviceId,message): Promise<void>`, `listCoaching(): Promise<CoachingOverview>` and `dispose(): void`. Export trainer/coaching interfaces alongside the implementation so UI can consume them. No web URL is used for authenticated app functionality. Public Supabase URL/anon key come from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; never package service-role/Anthropic credentials.

Use existing Supabase APIs and secured RPCs where they implement the required behavior. Existing cloud plans/history import into SQLite. Trainer catalogue, requests, relationships and downloaded assignments retain permission rules. Native sync is serialized, starts on reconnect/resume and after completed writes, checks the authenticated user matches the local owner, retains rejected operations and reports action needed. Pending local entities win over stale downloads. Plan changes while offline retain the original session prescription snapshot; do not silently reinterpret completed work.

If existing RPC authorization prevents historical offline session ingestion, add a versioned, additive mobile-specific migration under `infra/supabase/migrations` with owner checks, canonical validation, transaction/idempotency and no weakening of existing web authorization. Test against a disposable local database if available; do not deploy. The UI must detect missing capability and retain pending work with a useful status instead of claiming it synced. Document deployment and remaining external verification clearly.

## Migration and recovery

Cloud import recovers already synchronized data. Existing pending `localStorage` drafts belong to the Vercel WebView origin and do not automatically appear under localhost. Preserve that origin's data. Supply a deliberate legacy-recovery path or an export/import bridge; validate user/workout ownership before linking. Do not silently drop legacy pending workouts. Backups use native Filesystem/Share and an import picker, with web equivalents for tests. Keep the same app ID/signature; no uninstall or clear-data instruction.

## Verification

- Real SQLite tests: persist/reopen, atomic session/outbox, failed transaction recovery, immutable retry IDs, account isolation, malformed backup and merge conflicts.
- Engine tests: deterministic valid plans, home/gym equipment, readiness blocked cases, prescription snapshots and metrics.
- Offline browser run against built assets: fresh start, onboarding, plan, several recorded sets, finish, force reload, history, export/import, account switch and airplane-mode network blocking. Check 360/390/768 widths, overflow and accessible controls.
- Cloud contract tests: wrong account, expired auth, lost response retry, missing capability, stale pull and changed trainer plan.
- Build APK with local `index.html`/JS/catalog; inspect archive and config for no Vercel loader; run Android unit tests. If a device is available, test airplane mode and compatible update there.
- Existing shared-code unit suite and web type/build checks; confirm original worktree remains clean on original main SHA.
