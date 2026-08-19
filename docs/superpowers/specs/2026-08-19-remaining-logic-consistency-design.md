# Remaining Logic Consistency Design

## Scope

Close the repository-side gaps left after the professional-plan ISO repair and the Settings/Measurements rollout:

1. Make AI workout adjustments transactional and bind workout-summary edits to the submitted plan.
2. Use the authenticated profile time zone for dashboard greetings, banner visibility, notifications, measurements, and the related client-side date formatters.
3. Distinguish measurement load failures from a valid empty history.
4. Bring migration and E2E documentation through the new database migration.

The already shipped migrations 049 and 050 remain immutable. The next migration is 051.

## Atomic workout adjustments

Migration `051_workout_adjustment_atomic.sql` adds `public.apply_workout_adjustment_atomic(p_workout_id uuid, p_changes jsonb)`. The authenticated caller is derived from `auth.uid()`; no caller-supplied user or plan identifier is trusted.

The RPC locks the workout and parent plan, then rejects a request unless the workout and plan belong to the caller, the plan is active, and `prescription_locked` is false. It validates the complete JSON array before mutation: supported operation, unique row IDs, membership in the workout, integer bounds matching the TypeScript validator, at least one effective update field, and at least one surviving exercise.

After validation it applies every update/removal, compacts `order_index`, and marks the parent plan as a manual update in the same database transaction. Any SQL error, including one after an earlier row was changed, rolls the whole RPC statement back. Execution is granted only to `authenticated` and `service_role`.

`applyWorkoutAdjustment` keeps its server-side normalization for fast feedback but performs one RPC write. `updateWorkoutSummary` scopes the update by `id`, `user_id`, and `plan_id`, and treats a zero-row update as a failure before touching the plan metadata.

## Profile-time-zone flow

The authenticated app layout resolves `profile.timezone` once and exposes it through `I18nProvider`. Client formatters consume that value instead of the browser or UTC default. Server dashboard logic uses the same resolved zone and one reference instant for the greeting, local date, banner window, and view model.

Date-only domain values such as an already-materialized `YYYY-MM-DD` calendar key remain formatted as date-only values; they must not be shifted as instants. Timestamp values such as `created_at`, `recorded_at`, and `completed_at` are formatted in the profile zone.

## Measurement load state

`getMeasurements` returns a discriminated result: either `{ success: true, measurements }` or `{ success: false, measurements: [], error }`. Authentication and query failures are errors, never empty histories. The page passes that state to `MeasurementsClient`, which renders an accessible error state with retry while preserving its Settings-aware back target. Only a successful empty result renders the first-measurement prompt.

## Verification and documentation

The database runner applies migration 051, executes a pgTAP suite for authorization, validation, reordering, metadata, and forced intermediate rollback, and reruns the migration against existing data. Unit/component tests cover RPC wiring, plan binding, time-zone boundaries, and error-versus-empty rendering.

README and operations documentation list migration 051. `.env.example` and the E2E instructions document `E2E_HISTORY_CONTINUITY_ENABLED=true` and its intended gate.

## Out of scope

Changing already deployed migration files, altering professional snapshots, or performing an unverified production control-plane action is out of scope. Production publication suspension remains an operational decision only if the ISO repair has not yet been deployed.
