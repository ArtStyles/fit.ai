# Primera fase Android: entrega y validación

Este informe registra el cierre local de la fase en `248e2e6`. La publicación y el APK solicitados después se documentan en [Vekira Android 1.1.12](../../android-opengym-release.md).

## Rama y base

- Rama de trabajo: `codex/android-offline-opengym`.
- Directorio: `D:\work\project\.worktrees\opengym-phase-one`.
- Origen: `codex/android-offline`, commit `f48b3f88e8d276717ba1ca66abaa67d31d111d60`.
- `fd67f8c` conserva los 137 archivos de integración pendientes en el directorio Android original. Se verificaron sus bytes y que el origen quedara intacto. Es la base heredada, no funcionalidad de esta fase.
- Revisar la funcionalidad con `git diff fd67f8c..HEAD`. Si la integración heredada se incorpora por separado, tomar únicamente el commit posterior a esa instantánea.

## Comportamiento entregado

Plan incluye un mapa anterior/posterior de series prescritas. Progreso muestra series completadas en el periodo de 4, 12 o 24 semanas, incluidas las de peso corporal y duración. Los grupos se normalizan en español/inglés, se deduplican por ejercicio y el historial conserva las etiquetas originales del snapshot. Los grupos desconocidos se muestran como tales. Hay selección por teclado, detalle textual, estado vacío y recursos completamente locales.

La geometría proviene directamente de MuscleMap, MIT, fijada a `7dc03071e03052e8bd4f6351e9176994cd28aa7d`. El importador verifica SHA-256 de los originales antes de escribir y la licencia viaja en el bundle. No se incorporaron código AGPL ni imágenes de openGym.

Plan permite mover una sesión concreta y restaurar su fecha. La fecha semanal y la prescripción del entrenador permanecen iguales. Inicio, Plan, Entrenar, autorización y guardado usan las fechas efectivas. La identidad original queda registrada y bloquea duplicados. La mutación local valida cuenta, plan activo, fechas, sesiones iniciadas/completadas y destinos ocupados. Los backups antiguos siguen siendo válidos; los nuevos conservan y validan las excepciones.

También se corrigieron dos fronteras descubiertas al validar: la consulta local de metadatos de versión de entrenador cuando no existen y la paginación del historial, que antes podía truncar series silenciosamente.

## Evidencia local

| Comprobación | Resultado |
| --- | --- |
| `pnpm mobile:test` | 28 archivos, 211 pruebas aprobadas |
| `pnpm exec vitest run --project unit --maxWorkers=2` | 310 archivos, 2810 pruebas aprobadas |
| `pnpm type-check` | Aprobado |
| `pnpm mobile:type-check` | Aprobado |
| ESLint sobre todos los archivos JS/TS modificados | Aprobado |
| `pnpm mobile:build` | Bundle generado; guardas de módulos servidor aprobadas |
| `node mobile/tests/opengym-regression.mjs` | 6 recorridos aprobados |
| `git diff --check` | Sin errores de whitespace |
| Revisión independiente de especificación e integración | Sin P1/P2 pendientes |

Los recorridos de navegador usan cuentas de prueba con SQLite real, conexión externa bloqueada y fechas controladas. Comprueban mapa en 360/390/1440px, vacío en 320px, teclado, cambio de periodo, snapshot histórico, series temporizadas y peso corporal; mover/restaurar, recargar, completar la sesión movida y rechazar otro registro en 390/1440px. Se conservan las cinco pestañas y la prescripción, sin errores de página ni desbordamiento horizontal. Se inspeccionaron capturas de geometría y controles, incluido el mapa con estilos claros.

Resultados y capturas: `.artifacts/opengym-regression/`. Logs e informes independientes: `.artifacts/opengym-base/`.

## Límites

Entrega local en la rama indicada. No se realizó merge, push, despliegue web, migración remota ni compilación/instalación de un APK. La validación en navegador no prueba un dispositivo físico ni sincronización contra cuentas reales.

La reprogramación es local al dispositivo Android; la web no muestra una acción sin persistencia remota. El refresco remoto conserva excepciones de planes existentes. Un futuro flujo de eliminación física remota de planes deberá decidir cómo archivar excepciones huérfanas; la retirada normal actual conserva los padres. La paginación usa orden estable, aunque inserciones concurrentes durante una carga remota larga pueden desplazar offsets.

Persisten avisos de build heredados sobre tamaño de chunks, importaciones dinámicas redundantes, clases Tailwind ambiguas y datos Browserslist antiguos; ninguno impidió la compilación.
