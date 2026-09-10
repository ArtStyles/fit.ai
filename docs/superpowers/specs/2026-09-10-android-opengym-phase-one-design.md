# Android: mapa muscular y reprogramación puntual

## Alcance aprobado

El usuario aprobó comenzar por mapa muscular y reprogramación puntual, y corrigió explícitamente la base a una rama derivada de `codex/android-offline`. Se trabaja en `codex/android-offline-opengym`, en `.worktrees/opengym-phase-one`. El commit `fd67f8c` contiene una copia verificada de los 137 archivos modificados/no rastreados de la integración Android existente, encima de `f48b3f8`; la rama y el directorio originales no se modificaron. Esta instantánea es la base, no parte de la nueva funcionalidad.

## Mapa muscular

Integrar en las pantallas originales Plan y Progreso, con vistas anterior/posterior y selección accesible de grupos. Plan muestra series prescritas; Progreso muestra series efectivamente registradas en el período seleccionado (4/12/24 semanas). Contar también series de peso corporal y temporizadas; excluir series no completadas. Una serie puede aparecer en varios grupos: comunicar que los valores por músculo no son aditivos ni porcentajes fisiológicos. No estimar recuperación, fatiga o riesgo de lesión.

Reutilizar únicamente la geometría original MIT de MuscleMap, con commit y licencia archivados; convertirla a un recurso local incluido en el bundle. No usar código AGPL ni imágenes/GIF de openGym. Normalizar nombres de grupos en español/inglés y acentos, evitar duplicar alias dentro de un ejercicio y mostrar los grupos sin correspondencia sin inventar anatomía. El historial usa el snapshot original del ejercicio antes que el catálogo actual. Mantener etiquetas/lista textual operable con teclado, objetivos táctiles de 44px, contraste y lectura en tema claro/oscuro, y scroll/zoom normales.

## Reprogramación local

Persistir excepciones por fecha en `workout_schedule_overrides` del AppState SQLite. Mantener `workouts.day_of_week` y la prescripción intactos. Cada excepción identifica usuario, plan, entrenamiento, fecha original y fecha efectiva. Un único resolvedor calcula las ocurrencias efectivas para Plan, Inicio, Entrenar y autorización.

Mover una ocurrencia original entre hoy menos 2 días y hoy más 7 días hacia una fecha entre hoy y hoy más 7 días. Mostrar fechas y causas de indisponibilidad. No ocupar una fecha con otra rutina efectiva, registro o autorización viva. No solapar dos ocurrencias del mismo entrenamiento dentro de su ventana de recuperación de 2 días. Impedir mover/revertir una ocurrencia iniciada o completada. Eliminar una excepción revierte el horario original; las excepciones completadas se conservan para impedir repetición.

Guardar identidad de ocurrencia original/efectiva en nuevas autorizaciones y registros locales. El fallback por timestamps solo aplica a registros antiguos. Validar usuario, plan activo/no retirado y fechas dentro de la mutación serializada; permitir mover la fecha de un plan de entrenador propio sin editar su prescripción. Conservar límites de una sesión al día, readiness, caducidad, aislamiento de cuentas y recuperación de sesión existentes.

Aceptar backups anteriores sin la tabla nueva, validar los nuevos y conservarla al exportar/importar/refrescar tablas remotas. La funcionalidad de cambio de fecha se habilita en Android local mediante el límite/alias ya existente; la web no recibe una acción que aparente guardar sin soporte remoto. No aplicar migraciones remotas ni desplegar.

## Validación y entrega

Pruebas de agregación/alias/historial; resolución de fechas y persistencia con SQLite real; límites de autorización, duplicados, cuentas y reversión; pruebas móviles completas, type-check y bundle. Verificar las pantallas originales en navegador en 360/390/1440px y selección por teclado. Entregar cambios locales revisados y documentar límites de dispositivo físico/sync remoto. No merge ni push solicitados.
