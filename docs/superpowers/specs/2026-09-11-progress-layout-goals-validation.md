# Progreso y objetivos: validación local

Entrega sobre `782efba`, en `codex/android-free-training`. El layout se construyó y verificó primero con el slot vacío; después se activó el alias Android y se comprobó la integración.

## Resultado

- Resumen, Rendimiento y Medidas son vistas internas. Se mantienen las cinco pestañas principales.
- Resumen abre con tres métricas y el mapa. Carga, constancia y exploración completa de músculos son desplegables. Se mantiene una advertencia sobre registros parciales y las comparaciones no se presentan como cambios físicos.
- Rendimiento reúne los últimos resultados y marcas por ejercicio. Los objetivos Android usan todo el historial disponible, sin depender del periodo de las estadísticas.
- Se pueden seguir hasta tres ejercicios, sin meta o con peso/repeticiones de una misma serie o segundos por serie. Primer registro, último resultado, mejor marca y sesiones de origen permanecen consultables.
- Los objetivos se guardan en la cuenta SQLite, se incluyen en el respaldo privado y sobreviven a una descarga del estado web. No se añadieron columnas ni migraciones remotas.

## Evidencia de navegador

`mobile/tests/progress-goals-regression.mjs` utiliza el bundle real, SQLite y datos de prueba propios. Bloquea la red externa y fija fecha/zona horaria para que los resultados sean reproducibles.

- Layout y selectores en 320, 390 y 1440 px; vistas con teclado, mapa desplegable y enlaces de origen. Un único peso corporal no genera una comparación ni tendencia inventada.
- Estado vacío en inglés, sin NaN ni porcentajes ficticios.
- Mapa → creación preseleccionada, sin guardado automático; crear/editar/recargar/quitar objetivo sin borrar sesiones.
- Un registro de enero de 2025 aparece en el objetivo aunque las estadísticas del periodo no lo incluyen.
- Meta 65 kg × 10 no alcanzada con series de 65 × 5 y 50 × 12; al corregir la primera serie a 65 × 10, se recalcula como alcanzada.
- Tres ejercicios seguidos, máximo aplicado; selectores propios y navegación de diálogos.
- Series de 45 y 30 segundos: la mejor serie es 45, no el total de 75. Cambiar una meta temporal a 45 actualiza su estado.

Capturas y reportes se conservan en `.artifacts/progress-goals/` (ignorados por Git). La regresión de registro libre y el recorrido original comprueban además onboarding, cinco pestañas, sesión guiada, historial, medidas y respaldo.

## Revisión

La revisión independiente encontró y corrigió la clasificación temporal de ejercicios retirados del catálogo, la lectura de duraciones individuales de sesiones guiadas y la conservación del tipo de una meta ante cambios del catálogo. Los totales históricos sin desglose siguen excluidos.

También se revisaron conflictos de edición, respuestas atrasadas al cambiar de cuenta, orden cronológico real y accesibilidad de los diálogos. Las versiones se capturan al abrir el editor y las respuestas de otra sesión no actualizan el formulario.

La lista del periodo usa únicamente pares explícitos de carga y repeticiones dentro de los límites de sesión. Agrupa por ejercicio y sesión y desempata por fecha/hora e identificador. Las series por tiempo no se convierten en cero repeticiones. El volumen de métricas y gráfica comparte la misma evidencia normalizada. Las marcas de esta lista indican su horizonte de 12 meses; los objetivos conservan su alcance de todo el historial disponible.

## Comprobaciones finales

- `pnpm mobile:test`: 317 pruebas en 38 archivos.
- Vitest de Progreso, mapa, evidencia parcial, Atrás y calendario: 57 pruebas en 9 archivos.
- `pnpm mobile:type-check` y `pnpm type-check`: correctos. Se adaptó un bucle de calendario y los iteradores nuevos al target TypeScript web existente, sin cambiar su comportamiento.
- ESLint de todos los archivos TypeScript modificados y nuevos: correcto.
- `pnpm mobile:build`: correcto, con los avisos habituales de tamaño de bundle e imports dinámicos ya compartidos.
- Navegador: ocho escenarios nuevos de layout/objetivos, seis de registro libre y recorrido original completo. Sin errores de página en los recorridos aprobados.
- Se simuló un fallo real de escritura IndexedDB mientras llegaba Escape: el diálogo mantuvo los valores, mostró el error y permitió reintentar sin duplicar el objetivo.

La regresión de Select ahora espera a que la opción seleccionada reciba foco antes de comprobar el clic externo; el recorrido anterior podía ejecutar ese clic antes de que el menú terminara de abrir.

## Alcance comprobado

Pruebas locales automatizadas y revisión visual del bundle Android en navegador. No se generó APK ni se verificó en dispositivo físico. No se hizo push, despliegue remoto, migración ni prueba con cuentas reales de sincronización.
