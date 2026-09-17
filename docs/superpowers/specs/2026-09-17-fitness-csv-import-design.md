# Importar historial de Hevy, Strong y FitNotes en Android

## Alcance autorizado

El usuario pidió incorporar su progreso desde otras apps y eligió importar archivos CSV desde la APK. Se implementan Hevy, Strong y FitNotes como primera versión. Trabajo en `codex/android-offline`, `.worktrees/android-offline`. No hay conexión continua a cuentas externas ni cambios de API o secretos móviles.

## Flujo

Entrada desde ajustes de almacenamiento. Elegir CSV, detectar formato, resolver unidades/fechas ambiguas y mostrar zona horaria. Vista previa con sesiones, series, intervalo, duplicados/conflictos y equivalencias de ejercicios. Solo coincidencias exactas inequívocas se vinculan automáticamente. El usuario puede escoger una equivalencia o mantener el nombre original como ejercicio histórico sin músculos inventados. Confirmación explícita dentro de la app antes de añadir registros.

Los archivos inválidos se rechazan con fila/motivo; no se importan fragmentos silenciosamente. Límite de 5 MiB y 20.000 filas. Se conservan tipos de series, notas, RPE, duración y distancia cuando existen. Las unidades se convierten a kg/m; las ausentes no se adivinan. FitNotes sin hora agrupa por fecha y lo explica. Fechas locales se interpretan en una zona visible, editable, inicialmente la del perfil.

## Persistencia y progreso

Mutación SQLite atómica con cuenta y versión de sesión verificadas. Sesiones históricas `mobile_session_kind: imported`, `workout_id: null`, snapshot de contexto válido y origen aparte del snapshot. Los ejercicios sin equivalencia tienen identidad histórica estable, sin crear filas públicas ni editar el catálogo. No se alteran planes, autorizaciones ni prescripciones. Las sesiones importadas no consumen el cupo de sesiones guiadas.

Identidad por origen/sesión independiente del orden del CSV; huella semántica para omitir repeticiones y señalar cambios del origen sin sobrescribir historial. Los cambios de cuenta/logout invalidan la previsualización. Los datos pasan a historial, progreso, constancia y, cuando hay equivalencia muscular, al mapa. El respaldo existente conserva sus metadatos. No se generan progresiones nuevas ni falsas notificaciones al importar.

## Evidencia

Pruebas de parser con variantes documentadas y fixtures sintéticos; pruebas SQLite de atomicidad, deduplicación, conflicto, aislamiento, backup y sesión guiada. Recorridos de navegador de selección/preview/mapping/import/reload, formatos alternativos, errores y responsive ES/EN. Tipos, bundle, suite móvil y APK firmada. Diferenciar estas pruebas de archivos reales del usuario, dispositivo físico y publicación. No requiere migración remota.
