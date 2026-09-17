# Importar entrenamientos de otras apps

Implementado exclusivamente en `codex/android-offline`, para Vekira Android 1.1.28-offline (30). El portal de `main` y sus APIs no cambian. No necesita una migración de Supabase.

## Uso

Desde **Progreso → Importar entrenamientos**, o **Ajustes → Cuenta y almacenamiento → Importar entrenamientos**:

1. Elegir el CSV de entrenamientos de Hevy, Strong o FitNotes.
2. Revisar la zona horaria. Si el archivo no especifica unidades, elegirlas en **Unidades y fechas**. Para fechas ambiguas, indicar día/mes o mes/día.
3. Revisar sesiones, series, fechas, duplicados y equivalencias. Solo los nombres exactos inequívocos se asocian automáticamente al catálogo. Las equivalencias elegidas se recuerdan por cuenta y app.
4. Confirmar. Los entrenamientos aparecen en Historial y Progreso. Los ejercicios vinculados aportan sus músculos al mapa.

El archivo se procesa en el dispositivo y no requiere las credenciales de la otra app. No es una sincronización continua. El respaldo existente de Vekira conserva el historial y sus metadatos de importación.

Guías oficiales para exportar:

- [Hevy: Export Workouts](https://help.hevyapp.com/hc/en-us/articles/38001424401943-How-to-Import-Strong-App-CSV-Files-and-Export-Your-Data-in-Hevy).
- [Strong: Export Data](https://help.strongapp.io/article/235-export-workout-data).
- [FitNotes: Spreadsheet Export](https://www.fitnotesapp.com/settings/#spreadsheet-export).

## Contrato y límites

- Solo CSV de entrenamientos, hasta 5 MiB, 20.000 filas y 128 columnas. No se importan mediciones corporales, rutinas ni copias de respaldo de esas apps.
- No se modifica el catálogo, los planes ni las prescripciones. Los ejercicios sin equivalencia conservan nombre e historial, sin crear ejercicios públicos ni inventar músculos. Las sesiones importadas no consumen el cupo de entrenamiento guiado.
- Reps, pesos, RPE, notas, tipos de serie, duración y distancia se conservan cuando existen. Los pesos se convierten a kg y las distancias a metros. Un valor ausente sigue siendo `null`, diferente de un cero real.
- La actividad muscular cuenta las series registradas, incluidos calentamientos. No pretende calcular series fisiológicamente efectivas. Los descansos `Rest`/`Rest Timer` de Strong se guardan como notas; no suman series ni tiempo de ejercicio. Un tipo de serie desconocido rechaza el archivo con su fila para evitar inventar actividad.
- Hevy usa inicio/fin y Strong la duración exportada. Las fechas sin desfase se interpretan en la zona IANA elegida. Horas inexistentes o ambiguas durante cambios de horario requieren corregir la fecha/desfase del CSV; no se adivina una hora.
- FitNotes no incluye hora de sesión en este formato: agrupa por fecha y conserva duración desconocida. Su fecha civil se ancla internamente al mediodía para admitir días donde la medianoche no existe por DST; la interfaz muestra solo la fecha.
- Duplicados dentro de cada app: ID de origen cuando existe; de lo contrario, inicio normalizado (FitNotes: fecha). Ordenar de nuevo las filas no duplica entrenamientos. Una sesión renombrada o con valores cambiados se omite como conflicto y conserva el registro guardado. No hay sobrescritura automática ni fusión entre dos apps distintas; elegir una fuente si ambas contienen las mismas sesiones.
- Filas contradictorias, fechas futuras, unidades ausentes y datos inválidos impiden importar todo el archivo. No se guardan fragmentos silenciosamente.

## Persistencia

`imports/parse.ts` es puro. `imports/data.ts` prepara una vista previa en memoria que caduca a los 30 minutos, atada a la cuenta y a la versión de sesión. Confirmar revalida equivalencias y duplicados dentro de una sola mutación transaccional de `AppStore`.

Los registros usan `progress_logs` y `exercise_logs` existentes, `workout_id: null` y `mobile_session_kind: imported`. `session_context_snapshot` mantiene la presentación histórica. `mobile_import` conserva el origen, la huella y las medidas originales por serie; `mobile_history_imports` registra el lote y `mobile_fitness_import_links` las equivalencias. Son datos del estado local, sin tablas SQL remotas nuevas.

Las medidas originales alimentan Historial, ficha de ejercicio, mapa muscular, calendario, objetivos y tarjeta de actividad. La importación no dispara notificaciones de PR ni genera prescripciones. Los lectores de fuerza solo comparan pares reales de peso y repeticiones.

## Validación reproducible

```powershell
pnpm mobile:test
pnpm mobile:type-check
pnpm exec vitest run --config mobile/vitest.config.ts mobile/src/original/imports --maxWorkers=2
pnpm mobile:build
# En otra terminal:
node node_modules/vite/bin/vite.js preview --config mobile/vite.config.ts --host 127.0.0.1 --port 4184 --strictPort
node mobile/tests/fitness-import-regression.mjs
pnpm android:offline:release
./scripts/verify-android-offline.ps1
```

Los ejemplos de CSV son sintéticos y se documentan en `mobile/src/original/imports/__fixtures__/README.md`. Las pruebas de navegador usan una cuenta ficticia y SQLite real, bloqueando conexiones externas. Cubren tres formatos, equivalencias, mapa, ficha histórica sin catálogo, duplicados, conflictos, cancelación, archivo inválido, recarga y diseño ES/EN en 320/390/1440 px.

La compilación, las pruebas de navegador y la firma no equivalen a una prueba física: validar la selección de un CSV exportado desde el teléfono y la actualización de la APK sobre una instalación existente. El catálogo y los registros previos deben conservarse. Instalar la actualización sin desinstalar la app.

## Evidencia de esta entrega (2026-09-17)

- Suite móvil completa: 61 archivos y 475 pruebas verdes. Dentro de ella, 55 de importación (parser, SQLite, integración y UI). Lectores compartidos: otras 53 pruebas verdes.
- Cuatro recorridos Playwright con el bundle final: tres formatos/historial/mapa/ficha/errores en 390 px y revisiones adicionales ES 320 px, ES 1440 px y EN 390 px. Capturas y resultados en `.artifacts/fitness-import/`.
- TypeScript móvil, ESLint de los archivos afectados, `git diff --check`, `lintRelease`, 37 pruebas JVM y compilación firmada correctos.
- Verificación del APK: los assets corresponden al bundle probado; SQLite, 50 pósteres, 16 fuentes y licencia del mapa presentes; sin cargador remoto.
- APK: `.artifacts/Vekira-1.1.28-offline.apk`, 18.127.361 bytes (17,29 MiB), `com.fitai.app`, versionCode 30, minSdk 24/targetSdk 36.
- SHA-256: `6960702c9b5b9e623be85eb1bea605a64e3e80b673ed06e8fd528f6cc5783822`.
- Firma v2 con certificado original SHA-256 `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.
- Publicación de servidor: no requerida ni realizada. Migraciones remotas: ninguna. Dispositivo físico: `adb devices -l` sin dispositivos; validación con exportaciones personales pendiente.
