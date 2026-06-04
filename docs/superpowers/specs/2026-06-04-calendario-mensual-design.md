# Diseño — Calendario mensual de entrenamientos (`/calendario`)

**Fecha:** 2026-06-04
**Estado:** Aprobado para planificar
**Autor:** Claude + usuario (brainstorming)

## 1. Contexto y objetivo

El dashboard ya tiene `WeekCalendar` (semana actual: plan vs. progreso, estados
completed/today/scheduled/rest/skipped). El usuario quiere una vista más
estructurada para ver **todos los días del mes / de los meses que lleva
entrenando**: un calendario histórico tipo "mapa de constancia".

Objetivo: una página propia `/calendario` que combine un **mapa de calor
continuo** (panorama de todo el histórico) con un **mes grande navegable**
(detalle día a día), con estética coherente con el sistema (dark + violeta,
Barlow/`font-display`, `rounded-2xl`, animaciones `animate-in`).

No reemplaza al `WeekCalendar` ni al historial: lo complementa. El
`WeekCalendar` sigue siendo "el plan de esta semana"; `/calendario` es "tu
historial real de entrenamiento".

## 2. Decisiones tomadas (brainstorming)

1. **Tipo de vista:** híbrido — mes navegable (principal) + resumen multi-mes.
2. **Ubicación:** página propia `/calendario`, enlazada desde el dashboard
   (debajo del `WeekCalendar`) y desde Historial. **No** se añade pestaña a la
   barra inferior (evita apretar la `BottomNav` de 4 tabs).
3. **Coloreado del día:** heatmap por **volumen (kg)** = `Σ(weights_kg × reps_completed)`.
4. **Composición:** "Journey heatmap" — cabecera de stats → tira heatmap
   continua estilo GitHub (scroll horizontal) → mes grande navegable; tocar un
   mes/celda del heatmap salta a ese mes abajo.

## 3. Arquitectura y archivos

```
src/app/(app)/calendario/page.tsx          # server component: auth + carga + agregados → CalendarView
src/components/calendar/
  ├─ CalendarView.tsx        # 'use client': estado del mes seleccionado; orquesta summary + heatmap + grid
  ├─ CalendarSummary.tsx     # cabecera de stats
  ├─ ContributionHeatmap.tsx # tira continua (semanas × 7 días), scroll horizontal, navegador de meses
  ├─ MonthGrid.tsx           # mes grande navegable (rejilla L→D, flechas ‹ ›, botón "Hoy")
  └─ EmptyCalendar.tsx       # estado vacío
src/lib/calendar/aggregate.ts               # funciones PURAS (testeables): tipos, agregación, niveles, rachas, rejillas
supabase/migrations/012_calendar_payload.sql # RPC get_calendar_payload (+ índice si hace falta)
```

Reutiliza `src/lib/workouts/schedule.ts`: `getLocalDateString`, `getIsoWeekday`,
`addDays`, `getWeekMonday`, `getAppTimeZone` (semana **lunes-primero**).

## 4. Modelo de datos y capa de carga

### 4.1 Tipo del agregado por día

Un registro **por día entrenado** (no por sesión):

```ts
// src/lib/calendar/aggregate.ts
export interface DayAggregate {
  date:        string   // 'YYYY-MM-DD' en zona horaria de la app
  sessions:    number   // nº de progress_logs ese día
  volumeKg:    number   // Σ(weights × reps) del día
  durationMin: number   // Σ duration_minutes del día
  logIds:      string[] // ids de progress_logs (recientes primero) → enlace al detalle
}
```

### 4.2 Carga (server, en `page.tsx`)

Patrón idéntico a `get_dashboard_payload` / `get_history_payload`: **RPC con
fallback en JS**.

- **RPC `get_calendar_payload(p_time_zone text, p_from timestamptz)`** → array de
  agregados por día. Agrupa por día en la zona horaria de la app
  (`completed_at AT TIME ZONE p_time_zone)::date`). Es la vía recomendada porque
  agrega el volumen en el servidor (barato aunque haya años de histórico).
- **Fallback JS** (funciona **sin** la migración aplicada, como ya hace
  `get_history_payload` con su `try/catch`): consulta `progress_logs` +
  `exercise_logs` y agrega en cliente con `getLocalDateString` para el bucketing
  por día. Para acotar el payload, el fallback limita a **los últimos 12 meses**.

Ambas vías devuelven `DayAggregate[]`. La página pasa ese array + `todayStr`
(de `getLocalDateString()`) a `CalendarView`.

Filtro de sesiones: `workout_id IS NOT NULL`, **igual que historial y dashboard**,
para que las tres vistas coincidan. (A verificar: si existen logs legítimos sin
`workout_id`, revisar antes de fijar este filtro.)

### 4.3 SQL del RPC (para `012_calendar_payload.sql`)

```sql
CREATE OR REPLACE FUNCTION public.get_calendar_payload(
  p_time_zone text DEFAULT 'America/Havana',
  p_from      timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH day_sessions AS (
  SELECT
    (pl.completed_at AT TIME ZONE p_time_zone)::date AS day,
    COUNT(*)::int AS sessions,
    COALESCE(SUM(pl.duration_minutes), 0)::int AS duration_min,
    jsonb_agg(pl.id ORDER BY pl.completed_at DESC) AS log_ids
  FROM progress_logs pl
  WHERE pl.user_id = auth.uid()
    AND pl.workout_id IS NOT NULL
    AND (p_from IS NULL OR pl.completed_at >= p_from)
  GROUP BY 1
),
day_volume AS (
  SELECT
    (pl.completed_at AT TIME ZONE p_time_zone)::date AS day,
    COALESCE(SUM(weight_value * rep_value), 0)::numeric AS volume_kg
  FROM progress_logs pl
  JOIN exercise_logs el ON el.progress_log_id = pl.id
  CROSS JOIN LATERAL unnest(
    COALESCE(el.weights_kg, ARRAY[]::numeric[]),
    COALESCE(el.reps_completed, ARRAY[]::integer[])
  ) AS set_values(weight_value, rep_value)
  WHERE pl.user_id = auth.uid()
    AND pl.workout_id IS NOT NULL
    AND (p_from IS NULL OR pl.completed_at >= p_from)
  GROUP BY 1
)
SELECT COALESCE(jsonb_agg(
  jsonb_build_object(
    'date',         to_char(ds.day, 'YYYY-MM-DD'),
    'sessions',     ds.sessions,
    'duration_min', ds.duration_min,
    'volume_kg',    COALESCE(dv.volume_kg, 0),
    'log_ids',      ds.log_ids
  ) ORDER BY ds.day
), '[]'::jsonb)
FROM day_sessions ds
LEFT JOIN day_volume dv ON dv.day = ds.day;
$$;

GRANT EXECUTE ON FUNCTION public.get_calendar_payload(text, timestamptz) TO authenticated;
COMMENT ON FUNCTION public.get_calendar_payload(text, timestamptz) IS
  'Agregados por día (sesiones, volumen, duración, log_ids) del usuario autenticado para el calendario.';
```

Dos CTEs separados (sesiones/duración vs. volumen) **a propósito**: unir
`exercise_logs` + `unnest` multiplica filas, así que sumar `duration_minutes` en
el mismo join sobre-contaría. El índice `idx_progress_logs_user_completed` ya
existe (migración 006) y cubre el filtro.

### 4.4 Tipado en `src/types/database.ts`

Añadir a `Functions`:

```ts
get_calendar_payload: {
  Args: { p_time_zone?: string; p_from?: string | null }
  Returns: {
    date: string
    sessions: number
    duration_min: number
    volume_kg: number | string
    log_ids: string[]
  }[]
}
```

## 5. Lógica pura — `src/lib/calendar/aggregate.ts`

Funciones puras y testeables (sin React, sin Supabase):

- `aggregateLogsToDays(logs, exerciseLogs, timeZone): DayAggregate[]`
  — usada por el **fallback**: agrupa por `getLocalDateString(completed_at)`,
  suma volumen y duración, recoge `logIds`.
- `computeIntensityThresholds(days): [number, number, number]`
  — cuantiles p25/p50/p75 del `volumeKg` de los días entrenados (>0).
- `intensityLevel(volumeKg, thresholds): 1 | 2 | 3 | 4`
  — solo para días **entrenados**: 1–4 según los cuantiles (un día con volumen 0,
  p. ej. cardio, cae en nivel 1). El **nivel 0 lo asigna la celda** cuando no
  existe `DayAggregate` para esa fecha (no hay registro), no esta función.
- `computeStreaks(trainedDates: Set<string>, todayStr): { current: number; max: number }`
  — racha actual (hacia atrás desde hoy) y racha máxima histórica.
- `buildMonthGrid(year, month, todayStr): MonthCell[]`
  — celdas del mes con huecos iniciales/finales para alinear **lunes-primero**;
  marca `isToday`, `isFuture`, `inMonth`.
- `buildHeatmapWeeks(days, fromDate, toDate): HeatmapWeek[]`
  — columnas = semanas (lunes-primero), filas = L→D; cada celda referencia su
  `DayAggregate` o `null`. Incluye etiquetas de mes por columna.

Tipos auxiliares (`MonthCell`, `HeatmapWeek`, `HeatmapCell`) viven aquí.

## 6. Componentes

### 6.1 `CalendarView` (client)
- Props: `{ days: DayAggregate[]; todayStr: string; stats: CalendarStats }`.
- Estado: `selectedMonth` (`{ year, month }`, por defecto el mes de hoy).
- Construye un `Map<string, DayAggregate>` por fecha y los `thresholds` una vez
  (`useMemo`). Renderiza `CalendarSummary` + `ContributionHeatmap` + `MonthGrid`.

### 6.2 `CalendarSummary`
- Muestra: días entrenados (total histórico), **racha actual**, **racha
  máxima**, **promedio días/semana**, volumen total. Tarjetas
  `rounded-2xl border-border/60 bg-muted/10`, números `font-display tabular-nums`.

### 6.3 `ContributionHeatmap`
- Tira con scroll horizontal (`overflow-x-auto`), columnas = semanas, 7 filas
  (L→D), etiquetas de mes arriba. Celdas ~12–14px con color por
  `intensityLevel`. Auto-scroll al final (semana actual) al montar.
- Tocar una celda → `onSelectMonth({ year, month })` (salta el `MonthGrid`).
- Leyenda "menos → más" (4 cuadros violeta), patrón GitHub.

### 6.4 `MonthGrid`
- Cabecera: `‹` mes anterior, etiqueta "Junio 2026" (`Intl`, capitalizada), `›`
  mes siguiente, botón **"Hoy"**. Objetivos táctiles 44px (`h-11`).
- Rejilla 7 columnas (encabezado L M X J V S D) de `buildMonthGrid`. Cada día
  entrenado: fondo por intensidad; **hoy** con anillo violeta
  (`ring-violet-500`); futuro muted/no interactivo.
- Tocar día entrenado → `PendingLink` a `/history/{logIds[0]}` (la sesión más
  reciente de ese día). Día sin entrenar/futuro: no interactivo.
- Día con tooltip/`aria-label`: fecha + "N kg · M min" o "Sin registro".

### 6.5 `EmptyCalendar`
- Sin sesiones (`days.length === 0`): tarjeta punteada estilo `History`
  ("Cuando completes entrenamientos verás aquí tu mapa de constancia") + CTA
  `Ir al dashboard`.

## 7. Coloreado e intensidad

5 niveles, umbrales por **cuantiles del propio usuario** (la escala se adapta):

| Nivel | Significado          | Clase aprox.                                  |
|-------|----------------------|-----------------------------------------------|
| 0     | sin registro ese día | `border-border/40 bg-transparent`             |
| 1     | volumen ≤ p25        | `bg-violet-500/20`                             |
| 2     | p25 < vol ≤ p50      | `bg-violet-500/40`                             |
| 3     | p50 < vol ≤ p75      | `bg-violet-500/65`                             |
| 4     | vol > p75            | `bg-violet-500/90` + glow sutil               |

"Hoy" siempre con anillo violeta (entrenado o no). Mismas clases en heatmap y mes.

## 8. Estados del día (decisión de honestidad)

El calendario histórico muestra **solo hechos**: "entrené" (con intensidad) vs.
"no registrado". **No** se pinta "saltado/descanso/programado" en meses pasados,
porque el plan se regenera semanalmente y no se puede reconstruir con fiabilidad
qué estaba programado en el pasado. El "programado vs. hecho" es responsabilidad
del `WeekCalendar` (semana actual). Separación de responsabilidades limpia.

## 9. Interacción y navegación

- Heatmap: tap en celda → `MonthGrid` salta a ese mes y resalta el día.
- MonthGrid: `‹ ›` cambian de mes; "Hoy" vuelve al mes actual; tap en día
  entrenado → `/history/{logId}`.
- Entrada: link "Ver calendario →" en el dashboard (junto a "Ver plan
  completo →", bajo el `WeekCalendar`) y en la cabecera de Historial.
- Navegar a un mes anterior al rango cargado (solo en fallback de 12 meses)
  muestra días sin intensidad; ampliable después (ver §12).

## 10. Estética, motion y accesibilidad

- Cabecera con burbuja de icono (`CalendarRange` de lucide) + "Calendario" +
  subtítulo, como `History`. Link `‹ Dashboard` arriba.
- Secciones con `animate-in fade-in slide-in-from-bottom-3` escalonadas
  (delays 80/160/240ms). `max-w-lg`, `px-4`.
- Accesibilidad: `aria-label` por día, `aria-live` para cambios de mes,
  navegación por teclado en flechas; foco visible. Heatmap con `role="img"` +
  resumen textual (no depende solo de hover, que no existe en móvil).

## 11. Enlaces de entrada

- **Dashboard** (`src/app/(app)/dashboard/page.tsx`): añadir
  `Ver calendario →` (`PendingLink` a `/calendario`) junto al actual
  "Ver plan completo →" bajo `WeekCalendar`.
- **Historial** (`src/app/(app)/history/page.tsx`): enlace "Ver calendario" en
  la cabecera.

## 12. Fuera de alcance v1 (YAGNI / follow-up)

- Sheet de multi-sesión por día (v1 abre la más reciente).
- Marcadores ámbar de PR en el heatmap.
- Overlay de "programado/saltado" en meses pasados.
- Carga perezosa más allá de 12 meses en el fallback (el RPC ya trae todo).

## 13. Tests (Vitest, ya configurado)

`src/lib/calendar/__tests__/aggregate.test.ts`:
- `aggregateLogsToDays`: agrupa por día local correcto (incluye caso de
  `completed_at` cerca de medianoche con la zona horaria de la app).
- `computeIntensityThresholds` / `intensityLevel`: cuantiles y fronteras.
- `computeStreaks`: racha actual y máxima (con huecos; racha rota ayer).
- `buildMonthGrid`: nº de celdas, huecos lunes-primero, flags `isToday/isFuture`.
- `buildHeatmapWeeks`: nº de columnas y mapeo de celdas a fechas.

Los componentes visuales los valida el usuario en el navegador (servidor local).

## 14. Riesgos / a verificar

- **Zona horaria**: el bucketing por día DEBE usar la zona de la app en ambas
  vías (SQL `AT TIME ZONE p_time_zone`, JS `getLocalDateString`). Pasar la zona
  del cliente/servidor al RPC para que coincidan.
- **Filtro `workout_id IS NOT NULL`**: confirmar que no excluye sesiones reales.
- **Migración**: el RPC necesita aplicarse en Supabase; hasta entonces corre el
  fallback (12 meses). Documentar el paso de despliegue.
- **Volumen 0**: días entrenados sin `weights_kg` (p. ej. solo cardio/tiempo)
  caen en nivel 1, no en 0 (cuentan como "entrené"). Confirmar que es lo deseado.
