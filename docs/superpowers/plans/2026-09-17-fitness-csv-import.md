# Fitness CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Incorporar historial CSV de Hevy, Strong y FitNotes al progreso de la APK sin duplicar ni sustituir datos existentes.

**Architecture:** Parsers puros separados de una operación transaccional de AppStore y una pantalla móvil con previsualización. Historial canónico con metadatos de origen y snapshots, sin cambios del catálogo ni APIs nuevas.

**Tech Stack:** TypeScript, React, SQLite, Vitest, Playwright, Capacitor.

**Spec:** `docs/superpowers/specs/2026-09-17-fitness-csv-import-design.md`

## Global Constraints

- Producto solo en `codex/android-offline`; main conserva portal/API. No fusión global.
- Preservar catálogo, planes y datos existentes. Importación aditiva y privada por cuenta.
- No copiar código OpenGym ni pedir claves o contraseñas externas.
- CSV máximo 5 MiB / 20.000 filas. No asumir unidades ambiguas ni inventar medidas.
- Fechas y origen preservados; preview invalidada por logout/cambio de cuenta.

### Task 1: Formatos normalizados

**Files:** `mobile/src/original/imports/types.ts`, `parse.ts`, `parse.test.ts`, fixtures.

- [x] Pruebas rojas para tres formatos, CSV citado/BOM, unidades, fechas, agrupación y errores.
- [x] Implementar normalización sin efectos secundarios y verificar casos límites.

### Task 2: Guardado e integración con historial

**Files:** `mobile/src/original/imports/data.ts`, `data.test.ts`; contratos de evidencia/sesiones afectados.

- [x] Pruebas rojas con SQLite real: preview, dedup/reordenación, conflictos, mappings, cuenta, backup.
- [x] Implementar identidad y snapshots históricos; guardar mediante una mutación atómica.
- [x] Confirmar que importaciones no consumen sesiones guiadas ni alteran prescripciones.
- [x] Mostrar origen y detalles originales sin inventar músculos para registros no vinculados.

### Task 3: Pantalla y rutas Android

**Files:** `mobile/src/original/imports/FitnessImportScreen.tsx`, rutas y entrada en `StorageSettings.tsx`.

- [x] Selector nativo de archivo, formato/unidades/fechas, ayuda exportación y preview accesible.
- [x] Equivalencias, confirmación, resultado y cancelación; ES/EN y cambio de cuenta.

### Task 4: Validación y entrega

**Files:** `mobile/tests/fitness-import-regression.mjs`, `docs/android-fitness-import.md`, versión Android.

- [x] Recorridos de navegador con SQLite, tres formatos, duplicados, historial/mapa y archivo inválido.
- [x] Revisar diseño móvil/escritorio, tipos, lint, suite móvil y límites de bundle.
- [x] Revisión independiente; corregir fallos y repetir pruebas afectadas.
- [x] Compilar APK firmada compatible y documentar hash, límites y publicación real.
