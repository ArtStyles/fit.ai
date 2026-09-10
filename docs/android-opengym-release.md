# Vekira Android 1.1.16-offline

Actualización del 10 de septiembre de 2026 en `codex/android-offline`. El alcance de publicación es Android y APK; no se despliega la web de producción.

## Aplicación

- Archivo local: `.artifacts/Vekira-1.1.16-offline.apk`.
- Paquete: `com.fitai.app`; versión `1.1.16-offline`; código `18`.
- Tamaño: 18 003 361 bytes (18,0 MB).
- SHA-256: `ea8f1c864f03d3a1e0f4001ad34c9661ac8be1d1a1ec829fee4a2b62d89af86e`.
- Certificado SHA-256: `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.

Firma APK v2 válida, con el certificado original. Instalar sobre la versión anterior, sin desinstalar, para conservar los datos. El primer acceso a una cuenta y la sincronización siguen necesitando conexión.

## Foto de perfil

La selección de imagen funcionaba, pero la APK invocaba la acción web de avatar, que necesita un servicio de servidor ausente en Android. La acción móvil ahora guarda la foto con la sesión autenticada de la cuenta y confirma la actualización del perfil antes de persistir su URL en SQLite. También actualiza la base de sincronización y comprueba que la cuenta activa no haya cambiado durante la operación. El guardado de una cuenta conectada requiere internet; los perfiles exclusivamente locales guardan la imagen en SQLite sin conexión.

La migración `20260912030000_avatar_owner_storage.sql` está aplicada en Supabase. Permite a una cuenta activa consultar, subir, reemplazar y eliminar únicamente `avatars/{su-id}/avatar.webp`. Conserva la lectura pública de imágenes y limita las subidas a JPG, PNG o WebP y 5 MiB. No modifica el catálogo ni los demás buckets.

El contrato conserva la ruta estable que utiliza la web. Storage y la actualización del perfil son operaciones separadas: un error posterior a la escritura del archivo no revierte sus bytes. La interfaz informa del fallo y permite reintentar; las pruebas verifican que no se confirme un guardado ni se altere el estado local sin la confirmación del perfil remoto.

## Ficha de ejercicio compacta

La ficha muestra el nombre una sola vez, junto a una imagen pequeña ampliable y el tipo y nivel traducidos. Separa músculos y equipo en campos claros. La técnica aparece antes de los registros; las instrucciones y la demostración, cuando existen, se despliegan de forma independiente. El video externo conserva su enlace.

Los registros ocupan dos columnas en móvil y cuatro en escritorio. Se mantienen sesiones, mejor peso con fecha y repeticiones, último volumen y RPE. La gráfica y la tendencia se consultan en «Ver progreso», sin repetir los mismos indicadores en tarjetas adicionales. El historial permanece visible y admite acceso directo desde el mapa muscular, incluso tras recargar.

Se conservan las consultas y filtros por cuenta, la paginación y la ficha histórica basada en snapshots. No se agrega técnica ni imagen a ejercicios que ya no están disponibles en el catálogo público. La gráfica sigue representando carga registrada; no estima rendimiento de ejercicios temporizados ni carga corporal.

## Mapa muscular en Progreso

Tocar un músculo en el dibujo o seleccionarlo por teclado abre su desglose: series del periodo elegido y del anterior, diferencia absoluta, ejercicios contribuyentes y sesiones concretas. Cada ejercicio enlaza a su historial y cada sesión a su detalle. También se pueden desplegar los aportes del periodo anterior.

El selector ofrece intervalos móviles de 1, 4, 12 y 24 semanas, terminados en la fecha local actual. La comparación toma el intervalo inmediatamente anterior de igual duración, sin solapamiento. Ambas fechas están visibles. Se conserva la selección de músculo al cambiar de periodo. Cuando no existen sesiones anteriores se indica ausencia de registros; si existen sesiones pero ninguna serie del músculo, se muestra cero series registradas. No se inventan porcentajes ni indicadores de recuperación.

La atribución usa grupos y nombres guardados en los snapshots, incluye ejercicios temporizados y con peso corporal, y deduplica alias dentro de cada fila. Agrupa ejercicios por ID y sesiones por ID; los nombres del ejercicio corresponden a su contribución más reciente en el periodo. Identidades ausentes no se deducen por posición ni se fusionan por nombre.

El historial de un ejercicio ausente del catálogo público puede abrirse con registros propios y un snapshot válido de ese mismo ID. Conserva su información histórica sin inventar técnica o medios; las consultas se paginan y mantienen el filtro de cuenta. El enlace abre directamente la sección de historial, también en Android.

Mantiene las correcciones de 1.1.13: historial desde Inicio, fecha original azul al recuperar una sesión otro día y selectores de reprogramación del tema. El mapa y la ficha no requieren cambios de esquema remoto; esta versión añade los permisos de avatar descritos arriba.

## Verificación

- `pnpm mobile:test`: 233 pruebas aprobadas en 30 archivos, incluidas 17 de avatar con SQLite real: persistencia al reabrir, confirmación remota, errores de subida/perfil, cambios de cuenta, validación y eliminación.
- `pnpm type-check`, `pnpm mobile:type-check`, ESLint de los archivos modificados y `git diff --check`: aprobados.
- `pnpm android:offline:release`: build correcto; 37 pruebas JVM, cero errores y fallos.
- `node mobile/tests/avatar-regression.mjs`: 5 recorridos de navegador con SQLite real; perfiles locales en 390/1440 px y cuentas conectadas con respuestas remotas simuladas, incluidos fallo de Storage, fallo de perfil y reintento. Verifican guardar, recargar, eliminar y conservar el catálogo. Capturas en `.artifacts/avatar-regression/`.
- `supabase/tests/avatar_owner_storage_test.sql`: políticas verificadas en la base vinculada dentro de una transacción con rollback. Cubre propietario, otras cuentas, rutas ajenas, suspendidos, anónimos y objetos legados; los objetos existentes permanecen idénticos.
- Prueba real de la API de Storage con una cuenta temporal: subida y reemplazo autenticados, URL persistida en perfil, rechazo de formato/tamaño/ruta ajena, bytes públicos correctos y eliminación autenticada. La cuenta temporal y su imagen fueron eliminadas al finalizar. Verificación posterior: la cuenta existente permanece, cero cuentas de prueba, 122 ejercicios y 934 objetos del catálogo conservados.
- `pnpm check:supabase-migrations`: 12 migraciones activas válidas; la nueva migración consta en el registro remoto.
- `scripts/verify-android-offline.ps1`: bundle probado idéntico al APK; SQLite, 50 imágenes, 16 fuentes y licencia MuscleMap incluidos; sin cargador remoto ni service worker.
- `apksigner` y `aapt2`: firma y metadatos verificados; min SDK 24, target SDK 36.
- Revisión independiente realizada; la limitación de las operaciones separadas de Storage y perfil se documenta arriba. Instalación/actualización y selección de imagen en un teléfono físico pendientes de prueba; la API remota sí se verificó con una cuenta autenticada real.

## Integración

Desarrollo aislado en `codex/android-offline-opengym`, basado en `3fa08a7`. La rama Android recibe los cambios por fast-forward y push normal, con comparación de SHA local/remoto. `main` permanece fuera de esta integración. APK, firma y configuración local siguen ignorados por Git.

Esta actualización conserva las cuentas existentes y el catálogo. Instalar el APK no elimina cuentas ni borra el almacenamiento local de los teléfonos.
