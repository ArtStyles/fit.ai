# Vekira

Vekira es una aplicacion de entrenamiento personalizada, orientada a movil, que
genera planes semanales, guia sesiones y registra progresion. El flujo principal
usa Next.js y Supabase; la generacion de planes usa un motor determinista local.

## Estado actual

El repositorio contiene un MVP funcional avanzado. El flujo principal esta
conectado de extremo a extremo:

`registro -> onboarding -> generacion de plan -> dashboard -> sesion -> historial`

### Implementado

- Registro, login, logout, callback y proteccion de rutas con Supabase Auth.
- Onboarding persistente con objetivo, nivel, disponibilidad, equipo, lesiones y
  datos fisicos.
- Generacion inicial y regeneracion semanal mediante un motor local determinista,
  versionado y basado en evidencia. Anthropic queda reservado para chat e
  interpretacion de ajustes.
- Filtro de ejercicios segun perfil, equipo disponible y restricciones.
- Dashboard con rutina del dia, calendario semanal, racha, volumen, momentum,
  records, ajustes activos y resumen diario.
- Edicion completa del plan: resumen, entrenamientos, ejercicios, orden,
  reemplazos, cargas, RPE, descansos y notas.
- Sesion activa con series, peso, repeticiones, RPE, temporizador de descanso,
  wake lock, reemplazos o ejercicios solo para hoy, saltos con motivo y backup en
  `localStorage`.
- Restriccion de sesiones a la rutina activa programada para hoy y bloqueo de
  duplicados completados el mismo dia.
- Guardado de sesiones, deteccion de records personales y motor de progresion de
  carga.
- Historial general, detalle por sesion, detalle por ejercicio y graficas de
  progresion.
- Registro y eliminacion de medidas corporales con grafica de peso.
- Conversaciones del coach persistidas en Supabase.
- Ajustes de perfil, recordatorios locales nativos, politica de privacidad y
  eliminacion completa de cuenta.
- PWA instalable y proyecto Android con Capacitor, splash screen, haptics y
  notificaciones locales.
- Biblioteca de ejercicios desde free-exercise-db con imagenes re-alojadas en Supabase Storage.
- RLS en Supabase, RPCs optimizadas para dashboard e historial, y fallback a
  queries directas cuando una RPC no esta disponible.
- Zona horaria por usuario (autodetectada del dispositivo y sincronizada al
  perfil) para el gating de sesiones y el calendario.
- Check-in periodico: cada 4 semanas el dashboard invita a actualizar peso,
  objetivo y lesiones; guardar ajustes u onboarding lo registra.

### Parcial o pendiente

- El coach de chat y las sugerencias de ajuste usan Claude real cuando hay
  `ANTHROPIC_API_KEY` (modelo configurable con `ANTHROPIC_MODEL_COACH`); sin
  API key caen al mock local. Los ajustes devuelven cambios estructurados
  aplicables con un tap.
- El resumen diario del dashboard se genera localmente por diseño (gratuito y
  determinista).
- La ruta `/exercises` funciona como herramienta de desarrollo/admin; en
  produccion requiere que el email exista en `ADMIN_EMAILS`.
- La politica de privacidad mantiene `soporte@fitai.app` como correo placeholder.
- `.env.example` incluye `NEXT_PUBLIC_APP_URL`, pero el codigo actual no consume
  esa variable. `NEXT_PUBLIC_APP_TIME_ZONE` actua como zona de fallback cuando el
  perfil no tiene zona horaria propia.
- No hay pruebas end-to-end; la cobertura actual se concentra en el motor de
  planes, scheduling, acceso a sesiones, guardado y progresion.

## Stack

- Next.js 14 App Router, React 18 y TypeScript.
- Tailwind CSS, Radix UI, Lucide y Framer Motion.
- Supabase Auth, Postgres, RLS y Server Actions.
- Anthropic SDK para chat e interpretacion de ajustes.
- Zustand para el estado de la sesion activa.
- Vitest para pruebas.
- `@ducanh2912/next-pwa` para PWA.
- Capacitor 8 para Android y capacidades nativas.

## Puesta en marcha

### Requisitos

- Node.js y pnpm.
- Un proyecto de Supabase.
- Una API key de Anthropic solo si se quiere usar el chat y la interpretación de ajustes con IA real.
- Android Studio solo para trabajar con la app Android.

### Instalacion

```powershell
pnpm install
Copy-Item .env.example .env.local
```

Configura `.env.local` antes de iniciar la app.

### Variables de entorno

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente web y autenticacion. |
| `SUPABASE_SERVICE_ROLE_KEY` | Operaciones server/admin, limites IA, borrado de cuenta y seed. Nunca exponer al cliente. |
| `ANTHROPIC_API_KEY` | Activa chat e interpretacion de ajustes con Claude. Si falta, se usa el fallback local. |
| `USE_AI_MOCK` | Con `true`, usa respuestas locales para chat e interpretación de ajustes. |
| `MAX_DAILY_API_SPEND_USD` | Limite global opcional de gasto diario de Anthropic. |
| `ANTHROPIC_MODEL_COACH` | Modelo opcional del coach (chat y ajustes). Default: `claude-haiku-4-5`. |
| `ADMIN_EMAILS` | Emails separados por coma con acceso a `/exercises` en produccion. |

### Base de datos

Aplica las migraciones SQL en este orden:

```text
001_initial_schema.sql
002_wger_columns.sql
003_onboarding_preferences.sql
004_ai_plan_fields.sql
005_ai_usage_logs.sql
006_dashboard_payload.sql
007_fix_ai_usage_daily_security.sql
008_plan_lifecycle.sql
010_add_exercise_log_rpe_values.sql
011_history_and_exercise_payloads.sql
012_calendar_payload.sql
013_exercise_images.sql
014_exercise_source_columns.sql
015_coach_chat_operation.sql
016_profile_timezone.sql
017_profile_check_in.sql
018_avatars_bucket.sql
019_social_posts.sql
020_social_rls.sql
021_posts_bucket.sql
022_follows.sql
023_backfill_usernames.sql
024_private_accounts.sql
025_social_push_notifications.sql
026_plan_library.sql
027_exercise_localization.sql
028_evidence_training_engine.sql
029_admin_accounts.sql
030_dashboard_banner.sql
031_reclassify_exercise_cardio.sql
032_plan_generation_reliability.sql
033_remove_legacy_plan_generator.sql
034_product_events.sql
035_session_save_idempotency.sql
036_completed_session_context.sql
037_atomic_plan_lifecycle.sql
038_session_authorizations.sql
039_dashboard_payload_continuity.sql
```

Las migraciones de continuidad se despliegan en orden y **primero en base de
datos**: `036_completed_session_context.sql` → `037_atomic_plan_lifecycle.sql`
→ `038_session_authorizations.sql` → `039_dashboard_payload_continuity.sql`.
Aplica `038_session_authorizations.sql` antes de publicar la app que emite
autorizaciones. La app anterior sigue funcionando con `save_session_log_atomic`
v1. El fallback v1/directo de la app nueva existe sólo como puente para clientes
o sesiones legacy que ya estaban en ejecución; `authorize_session_start` no omite
la autorización si falta la RPC.
La autorización congela `policy_timezone`, `policy_date`, los límites UTC del día
y el inicio de la ventana del workout. El guard de guardado reutiliza esos valores
inmutables y serializa por usuario; no reconstruye la política desde perfil, plan,
workout ni `completed_at`. El timestamp cliente se conserva como fecha histórica,
pero sólo se acepta desde 15 minutos antes de autorizar hasta el menor entre el
vencimiento de 12 horas y 5 minutos después del intento de guardado.

Las sesiones completadas conservan un contexto inmutable. Si un registro legacy
quedó sin su workout, la interfaz muestra el fallback traducido `Entrenamiento` /
`Workout`; sus filas de ejercicios y sus métricas de volumen permanecen exactas.
Para revisar la recuperación sin modificar datos, ejecuta `pnpm audit:history`.
El comando usa exclusivamente lecturas paginadas con la service role y escribe sólo
agregados en stdout: nunca IDs, snapshots, nombres ni otra PII.

La prueba de continuidad Playwright requiere las variables de la cuenta E2E
dedicada, las migraciones anteriores y `E2E_HISTORY_CONTINUITY_ENABLED=true`.
Sin ese opt-in la spec de continuidad se omite de forma segura. El harness E2E
mantiene además su validación global de cuenta dedicada antes de iniciar cualquier
servidor o escritura.

No apliques `004_rollback.sql` ni `005_rollback.sql` durante una instalacion
normal. `009_reset_test_accounts.sql` es destructiva, contiene una cuenta de
prueba concreta y solo debe ejecutarse de forma intencional en desarrollo.

El esquema inicial incluye ejercicios basicos. Para importar el catalogo completo
desde free-exercise-db:

```bash
pnpm seed:exercises
pnpm translate:setup
pnpm translate:exercises:es
```

El seed requiere `SUPABASE_SERVICE_ROLE_KEY` y las migraciones
`014_exercise_source_columns.sql` y `028_evidence_training_engine.sql`. El backfill en español requiere además
`027_exercise_localization.sql`. Usa Argos Translate local, no requiere una API
key y procesa 25 ejercicios por ejecución; es incremental y no borra planes ni
historial. Usa `--limit=100` para ampliar un lote, `--all` para procesar todo o
`--force` solo para reemplazar traducciones existentes. Antes de guardar un lote,
puedes revisarlo con `pnpm translate:exercises:es -- --limit=25 --dry-run`. Las
traducciones de Argos que aún no están en el archivo revisado se muestran como
borrador y no se guardan automáticamente; `--allow-machine` permite aceptarlas
explícitamente.

### Desarrollo

```bash
pnpm dev
```

La app queda disponible en `http://localhost:3000`.

## Motor de planes e IA

La generación de planes usa exclusivamente el motor determinista local. El motor
no consume tokens, valida seguridad, equipamiento, duración y dosis, y guarda
cada plan de forma transaccional.

Desde la versión 1.2, la estructura también controla densidad por duración,
frecuencia de los grupos musculares principales, volumen semanal por grupo,
cobertura de patrones de movimiento y variedad entre sesiones. Cada generación
guarda un puntaje de calidad y sus métricas detalladas en `generation_metadata`.

El chat y la interpretación de peticiones siguen usando Anthropic cuando existe
una API key. Una petición de ajuste produce una intención tipada; el motor
recalcula y valida el plan completo antes de mostrar la vista previa.

Los limites de planes se aplican de forma transaccional en PostgreSQL: 3 planes
iniciales cada 24 horas y 2 regeneraciones semanales cada 7 dias. El presupuesto
global diario de Anthropic es opcional mediante `MAX_DAILY_API_SPEND_USD`.

La migracion `032_plan_generation_reliability.sql` aplica los limites del motor
en PostgreSQL, serializa generaciones concurrentes por usuario y hace
idempotentes los reintentos durante 30 segundos. `pnpm audit:plans` revisa la
cobertura del catalogo, planes incompletos, duplicados activos y la tasa diaria
de exito del motor.

## Android y PWA

La PWA se genera durante `pnpm build`; en desarrollo el service worker esta
desactivado. `public/sw.js`, `public/workbox-*.js` y `public/swe-worker-*.js`
son salida de build y no se versionan.

El proyecto Android usa `server.url` en `capacitor.config.ts`, por lo que la app
nativa carga la version desplegada en Vercel. Para sincronizar y abrir Android:

```bash
pnpm cap:sync
pnpm cap:android
```

## Scripts

| Comando | Descripcion |
| --- | --- |
| `pnpm dev` | Inicia Next.js en desarrollo. |
| `pnpm build` | Genera el build de produccion y la PWA. |
| `pnpm start` | Sirve el build de produccion. |
| `pnpm lint` | Ejecuta ESLint. |
| `pnpm type-check` | Ejecuta TypeScript sin emitir archivos. |
| `pnpm test` | Ejecuta Vitest una vez. |
| `pnpm test:watch` | Ejecuta Vitest en modo watch. |
| `pnpm test:ui` | Abre la interfaz de Vitest. |
| `pnpm seed:exercises` | Reemplaza el catálogo de ejercicios con free-exercise-db (resetea datos de entrenamiento de prueba). |
| `pnpm audit:plans` | Audita cobertura del catálogo, integridad de planes y métricas del motor sin modificar datos. |
| `pnpm audit:history` | Audita en modo lectura los conteos agregados de sesiones vinculadas o separadas, snapshots y evidencia de ejercicios. |
| `pnpm translate:setup` | Instala el motor local Argos Translate. |
| `pnpm translate:exercises:es` | Traduce localmente el siguiente lote de 25 ejercicios sin borrar planes ni historial. |
| `pnpm cap:sync` | Sincroniza recursos y plugins de Capacitor. |
| `pnpm cap:android` | Abre el proyecto Android. |

## Estructura

```text
src/app/          Rutas, paginas y Server Actions
src/components/   UI y flujos de producto
src/lib/          Supabase, IA, progresion, scheduling y capacidades nativas
src/store/        Estado Zustand de la sesion activa
supabase/         Migraciones SQL
scripts/          Seed de ejercicios y generacion de assets
android/          Proyecto Android de Capacitor
assets/           Assets fuente para iconos y splash
public/           Manifest, iconos y service worker generado
```

## Verificacion actual

Estado verificado el 3 de junio de 2026:

- `pnpm build`: correcto.
- `pnpm type-check`: correcto.
- `pnpm test`: 25 pruebas correctas en 5 archivos.
- `pnpm lint`: 0 errores y 3 warnings por valores no usados.
