# Plan: Progreso y objetivos personales

Spec: `docs/superpowers/specs/2026-09-11-progress-layout-goals-design.md`. Base `782efba`; worktree `D:\work\project\.worktrees\android-free-training`.

1. [x] Refactorizar `ProgressHub` y loading en Resumen/Rendimiento/Medidas. Mantener su contrato de datos. Incorporar `PersonalGoalsSlot` vacío en Rendimiento con `language`, `selectedExerciseId` y `onSelectionHandled`. Sustituir el periodo por Select existente; conservar periodos y advertencia de evidencia parcial. Consolidar lista de ejercicios y mover secundarios a disclosures.
2. [x] Compactar el mapa mediante prop opcional `compact`, conservando su modo original en otros consumidores. Añadir callback opcional de ejercicio para acceder a Rendimiento. Comprobar por navegador que Resumen contiene mapa y métricas, y otras vistas no alargan el documento.
3. [x] Implementar contratos de `mobile/src/original/goals/types.ts` en `data.ts` y pruebas. Exportar `loadExerciseGoalsModel()`, `saveExerciseGoal(input)` y `removeExerciseGoal(input)`. Validar dueño/versión/límite y evidencia por serie; cubrir creación, repetición, edición, borrado, cambio de cuenta, historial y fechas. Integrar validación del estado, huella y round-trip de respaldo.
4. [x] Implementar slot móvil y componentes UI, con selector de ejercicios buscable, formulario opcional de meta, tarjetas compactas y diálogo de evolución. Usar componentes existentes y etiquetas ES/EN. La UI consume solo el contrato compartido; los errores preservan formulario y el borrado pide confirmación dentro del diálogo.
5. [x] Tras validar layout, conectar alias Vite y callback del mapa. Comprobar objetivos offline con datos reales de SQLite, cambios tras editar sesiones y recarga. Ejecutar suites afectadas, type-check/lint/build, recorridos nuevos y originales, revisión independiente y corregir hallazgos.
6. [x] Documentar resultados, inspeccionar diff y guardar commit local en esta rama.

Casos concretos de evidencia: 60 kg × 8 → 60 kg × 10; meta 60 kg × 10 no se cumple con series 65×5 y 50×12; 45 y 30 segundos dan mejor serie45, no75; solo constancia no crea puntos; cuenta ajena y versión obsoleta fallan sin mutación; restaurar respaldo conserva tres objetivos y quitar uno no borra su historial.
