# Vekira Android 1.1.15-offline

Actualización del 10 de septiembre de 2026 en `codex/android-offline`. El alcance de publicación es Android y APK; no se despliega la web de producción.

## Aplicación

- Archivo local: `.artifacts/Vekira-1.1.15-offline.apk`.
- Paquete: `com.fitai.app`; versión `1.1.15-offline`; código `17`.
- Tamaño: 18 002 901 bytes (18,0 MB).
- SHA-256: `d59708bc8d9a3bede87e8a3fa8ae636334dcdcc929d5145d46e90ff015942f6c`.
- Certificado SHA-256: `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.

Firma APK v2 válida, con el certificado original. Instalar sobre la versión anterior, sin desinstalar, para conservar los datos. El primer acceso a una cuenta y la sincronización siguen necesitando conexión.

## Ficha de ejercicio compacta

La ficha muestra el nombre una sola vez, junto a una imagen pequeña ampliable y el tipo y nivel traducidos. Separa músculos y equipo en campos claros. La técnica aparece antes de los registros; las instrucciones y la demostración, cuando existen, se despliegan de forma independiente. El video externo conserva su enlace.

Los registros ocupan dos columnas en móvil y cuatro en escritorio. Se mantienen sesiones, mejor peso con fecha y repeticiones, último volumen y RPE. La gráfica y la tendencia se consultan en «Ver progreso», sin repetir los mismos indicadores en tarjetas adicionales. El historial permanece visible y admite acceso directo desde el mapa muscular, incluso tras recargar.

Se conservan las consultas y filtros por cuenta, la paginación y la ficha histórica basada en snapshots. No se agrega técnica ni imagen a ejercicios que ya no están disponibles en el catálogo público. La gráfica sigue representando carga registrada; no estima rendimiento de ejercicios temporizados ni carga corporal.

## Mapa muscular en Progreso

Tocar un músculo en el dibujo o seleccionarlo por teclado abre su desglose: series del periodo elegido y del anterior, diferencia absoluta, ejercicios contribuyentes y sesiones concretas. Cada ejercicio enlaza a su historial y cada sesión a su detalle. También se pueden desplegar los aportes del periodo anterior.

El selector ofrece intervalos móviles de 1, 4, 12 y 24 semanas, terminados en la fecha local actual. La comparación toma el intervalo inmediatamente anterior de igual duración, sin solapamiento. Ambas fechas están visibles. Se conserva la selección de músculo al cambiar de periodo. Cuando no existen sesiones anteriores se indica ausencia de registros; si existen sesiones pero ninguna serie del músculo, se muestra cero series registradas. No se inventan porcentajes ni indicadores de recuperación.

La atribución usa grupos y nombres guardados en los snapshots, incluye ejercicios temporizados y con peso corporal, y deduplica alias dentro de cada fila. Agrupa ejercicios por ID y sesiones por ID; los nombres del ejercicio corresponden a su contribución más reciente en el periodo. Identidades ausentes no se deducen por posición ni se fusionan por nombre.

El historial de un ejercicio ausente del catálogo público puede abrirse con registros propios y un snapshot válido de ese mismo ID. Conserva su información histórica sin inventar técnica o medios; las consultas se paginan y mantienen el filtro de cuenta. El enlace abre directamente la sección de historial, también en Android.

Mantiene las correcciones de 1.1.13: historial desde Inicio, fecha original azul al recuperar una sesión otro día y selectores de reprogramación del tema. No se cambia el esquema remoto ni se requieren migraciones Supabase.

## Verificación

- Acceso público e histórico a la ficha: las 12 pruebas de la ruta pasan, incluidos aislamiento por cuenta, paginación y errores de lectura.
- `pnpm mobile:test`: 216 pruebas aprobadas en 29 archivos.
- `pnpm type-check`, `pnpm mobile:type-check`, ESLint de los archivos modificados y `git diff --check`: aprobados.
- `pnpm android:offline:release`: build correcto; 37 pruebas JVM, cero errores y fallos.
- `node mobile/tests/muscle-details-regression.mjs`: 7 recorridos con SQLite real y red externa bloqueada. Vistas móviles de 320/390 px y escritorio de 1440 px; toque sobre anatomía, teclado, 12 series frente a 9, ejercicios con 6 + 6 series, sesiones, límites de fecha en Habana, cambio de periodo, temporizados, catálogo renombrado/ausente, ausencia de datos previos, inglés y navegación/recarga del historial.
- `node mobile/tests/exercise-detail-regression.mjs`: 3 recorridos de la ficha en 320/390/1440 px, con textos largos, imagen local, zoom y retorno de foco, desplegables por teclado, periodos del gráfico, enlace a sesión y acceso directo al historial tras recarga. Sin errores de página, desbordamiento ni cambios en los datos del fixture.
- Capturas revisadas en `.artifacts/exercise-detail-regression/` y `.artifacts/muscle-details-regression/`.
- `scripts/verify-android-offline.ps1`: bundle probado idéntico al APK; SQLite, 50 imágenes, 16 fuentes y licencia MuscleMap incluidos; sin cargador remoto ni service worker.
- `apksigner` y `aapt2`: firma y metadatos verificados; min SDK 24, target SDK 36.
- Revisión independiente sin hallazgos pendientes. Sin dispositivos conectados por ADB; instalación/actualización y cuenta real pendientes de prueba física.

## Integración

Desarrollo aislado en `codex/android-offline-opengym`, basado en `3fa08a7`. La rama Android recibe los cambios por fast-forward y push normal, con comparación de SHA local/remoto. `main` permanece fuera de esta integración. APK, firma y configuración local siguen ignorados por Git.

La limpieza de datos solicitada es una operación separada de esta actualización. Instalar el APK no elimina cuentas ni borra el almacenamiento local de los teléfonos.
