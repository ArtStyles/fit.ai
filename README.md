# FitAI

FitAI es una aplicacion de entrenamiento personalizada, orientada a movil, que
genera planes semanales, guia sesiones y registra progresion. El flujo principal
usa Next.js y Supabase; la generacion de planes puede usar Anthropic o un mock
local.

## Estado actual

El repositorio contiene un MVP funcional avanzado. El flujo principal esta
conectado de extremo a extremo:

`registro -> onboarding -> generacion de plan -> dashboard -> sesion -> historial`

### Implementado

- Registro, login, logout, callback y proteccion de rutas con Supabase Auth.
- Onboarding persistente con objetivo, nivel, disponibilidad, equipo, lesiones y
  datos fisicos.
- Generacion inicial y regeneracion semanal de planes, con modo Anthropic real o
  mock local.
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
- No hay pruebas end-to-end; la cobertura actual se concentra en generacion mock,
  scheduling, acceso a sesiones, guardado y progresion.

## Stack

- Next.js 14 App Router, React 18 y TypeScript.
- Tailwind CSS, Radix UI, Lucide y Framer Motion.
- Supabase Auth, Postgres, RLS y Server Actions.
- Anthropic SDK para generacion real de planes.
- Zustand para el estado de la sesion activa.
- Vitest para pruebas.
- `@ducanh2912/next-pwa` para PWA.
- Capacitor 8 para Android y capacidades nativas.

## Puesta en marcha

### Requisitos

- Node.js y pnpm.
- Un proyecto de Supabase.
- Una API key de Anthropic solo si se quiere usar IA real.
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
| `ANTHROPIC_API_KEY` | Activa generacion real de planes. Si falta, se usa mock. |
| `USE_AI_MOCK` | Con `true`, fuerza el generador local aunque exista API key. |
| `MAX_DAILY_API_SPEND_USD` | Limite global opcional de gasto diario de Anthropic. |
| `ANTHROPIC_MODEL_PRIMARY` | Modelo primario opcional. Default: `claude-sonnet-4-5`. |
| `ANTHROPIC_MODEL_FALLBACK` | Modelo fallback opcional. Default: `claude-opus-4-5`. |
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
```

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

El seed requiere `SUPABASE_SERVICE_ROLE_KEY` y la migracion
`014_exercise_source_columns.sql`. El backfill en español requiere además
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

## Comportamiento de IA

La generacion de planes usa mock cuando `USE_AI_MOCK=true` o cuando no existe
`ANTHROPIC_API_KEY`. Con IA real, el generador valida el JSON devuelto, limita los
ejercicios al pool permitido, reintenta hasta 3 veces, registra uso/costo y puede
usar un modelo fallback.

Limites configurados:

- Plan inicial: 3 generaciones exitosas cada 24 horas.
- Regeneracion semanal: 2 generaciones exitosas cada 7 dias.
- Presupuesto global diario: opcional mediante `MAX_DAILY_API_SPEND_USD`.

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
