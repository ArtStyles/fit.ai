# Vekira Android 1.1.18-offline

Actualización del 10 de septiembre de 2026 en `codex/android-offline`. El alcance de publicación es Android y APK; no se despliega la web de producción.

## Aplicación

- Archivo local: `.artifacts/Vekira-1.1.18-offline.apk`.
- Paquete: `com.fitai.app`; versión `1.1.18-offline`; código `20`.
- Tamaño: 18 004 229 bytes (18,0 MB).
- SHA-256: `acdc68510331d0b08c8dd81a038c9e0330b7c426608a43521ee7adbdf7c064b0`.
- Certificado SHA-256: `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.

Firma APK v2 válida, con el certificado original. Instalar sobre la versión anterior, sin desinstalar, para conservar los datos. El primer acceso a una cuenta y la sincronización siguen necesitando conexión.

## Carga entre vistas: Contorno

La opción 03 elegida sustituye la presentación anterior de carga de Android por una mancuerna inmóvil de trazo fino. Un segmento violeta recorre su contorno en ciclos de 2,8 segundos, acompañado únicamente por «Un momento…» o «Just a moment…», según el idioma de la cuenta.

El contenido visual aparece después de 180 ms, con una entrada de 140 ms. Esto no retrasa la carga ni exige una duración mínima: la vista lista reemplaza inmediatamente el indicador. La navegación y la carga de rutas conservan su funcionamiento. Con movimiento reducido, el contorno se muestra completo y estático, sin animación de entrada. Hay un único mensaje de estado accesible; el dibujo es decorativo.

La ilustración y su animación están incluidas en la APK y funcionan sin descargar imágenes. Esta actualización no requiere migraciones ni modifica cuentas, registros o catálogo.

## Corrección de la atribución muscular

El mapa reconocía etiquetas generales como «tríceps», pero omitía nombres anatómicos del catálogo como «pectoral mayor», «deltoides anterior» y «glúteo mayor». Una prueba con los cinco movimientos reportados reprodujo exactamente el resultado incorrecto: únicamente 15 series de tríceps. La normalización compartida por Plan, Progreso y el desglose ahora reconoce todas las etiquetas del catálogo, deduplica por grupo dentro de un mismo ejercicio y conserva visibles las etiquetas futuras desconocidas.

Con tres series de Arnold press, banca con barra, press francés EZ, inclinado con mancuernas y militar de pie, el resultado es pecho 6, hombros 12, tríceps 15, trapecio 3 y ancóneo 3. Son series con participación registrada; los grupos no se suman para calcular el total de series de la sesión ni distinguen trabajo principal de secundario.

El trapecio y la zona lumbar usan sus trazados independientes; también se activan las zonas existentes de cuello y tibial anterior. Los colores oscuros de pocas series son más visibles. Manguito rotador y ancóneo conservan sus conteos y enlaces al desglose en la lista, con una nota porque la ilustración no incluye una zona individual para ellos. Los elementos decorativos no son interactivos.

La corrección interpreta los nombres originales guardados en cada sesión. No reescribe el historial, no sustituye ejercicios antiguos por el catálogo actual y no requiere migraciones ni cambios de datos. Se aplica al volver a abrir las pantallas después de instalar la actualización.

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

Mantiene las correcciones de 1.1.13: historial desde Inicio, fecha original azul al recuperar una sesión otro día y selectores de reprogramación del tema. El mapa y la ficha no requieren cambios de esquema remoto; los permisos de avatar descritos arriba se incorporaron en 1.1.16.

## Verificación de 1.1.18

- `node mobile/tests/login-loading-regression.mjs`: arranque con carga retenida en 320/390/1440 px, animación normal y movimiento reducido, errores de acceso sin conexión y almacenamiento no disponible. Capturas revisadas en `.artifacts/login-loading-fixes/`.
- `node mobile/tests/contour-loading-regression.mjs`: 5 recorridos aprobados con SQLite real y red externa bloqueada. Plan y Progreso en 320/390/1440 px; cinco pestañas disponibles durante la carga; animación y retirada del indicador; cancelación hacia Inicio sin reemplazo tardío; inglés, tema claro y movimiento reducido. Datos de la cuenta intactos y cero errores de página. Evidencia en `.artifacts/contour-loading-regression/`.
- `node mobile/tests/original-journey.mjs`: alta local, configuración, generación, cinco pestañas, sesión con recuperación tras recargar, historial, medidas, calendario, catálogo, ficha de ejercicio, ajustes y copia de seguridad aprobados. Comprobaciones de diseño en 360/390/768 px, sin errores de página ni peticiones externas.
- `pnpm mobile:type-check`, ESLint de los archivos modificados y `git diff --check`: aprobados.
- `pnpm android:offline:release`: build correcto; 37 pruebas JVM, cero errores y fallos.
- `scripts/verify-android-offline.ps1`: bundle probado idéntico al APK; SQLite, 50 imágenes, 16 fuentes y licencia MuscleMap incluidos; sin cargador remoto ni service worker.
- `apksigner` y `aapt2`: firma y metadatos verificados; min SDK 24, target SDK 36.
- Revisión independiente realizada. Instalación/actualización y renderizado en un teléfono físico pendientes de prueba; los recorridos se verificaron en el navegador con el bundle que contiene la APK.

Las verificaciones de versiones anteriores se conservan como antecedentes, no como pruebas repetidas en 1.1.18: 1.1.17 aprobó 52 pruebas de atribución muscular, la cobertura de 122 ejercicios y 66 etiquetas del catálogo remoto, 5 recorridos de catálogo muscular, 7 de desglose y 233 pruebas móviles. En 1.1.16 se verificaron además 5 recorridos de avatar, sus políticas con rollback y una prueba real de Storage. Esta entrega solo modifica la presentación de carga y no incorpora migraciones.

## Integración

Desarrollo aislado en `codex/android-offline-opengym`, basado en `3fa08a7`. La rama Android recibe los cambios por fast-forward y push normal, con comparación de SHA local/remoto. `main` permanece fuera de esta integración. APK, firma y configuración local siguen ignorados por Git.

Esta actualización conserva las cuentas existentes y el catálogo. Instalar el APK no elimina cuentas ni borra el almacenamiento local de los teléfonos.
