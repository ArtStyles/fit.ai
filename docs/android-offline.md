# Vekira Android offline

Esta adaptación se desarrolla en `codex/android-offline`, dentro de `.worktrees/android-offline`. Reutiliza las páginas y componentes de Vekira: Inicio, Plan, Entrenar, Progreso y Entrenadores mantienen su navegación original. La web Next.js conserva sus comandos y rutas. La rama permanece separada de `main`.

## Desarrollo y compilación

```powershell
pnpm install --frozen-lockfile
pnpm mobile:dev
pnpm mobile:type-check
pnpm mobile:test
pnpm mobile:build
pnpm android:offline:debug
pnpm android:offline:release
```

La entrada `mobile/src/original/OriginalApp.tsx` carga los módulos originales de `src/app` y su AppShell. Los alias de compilación adaptan navegación, lectura de datos y acciones a un entorno local; no hay un servidor Next dentro del teléfono. La interfaz alternativa de la primera versión queda fuera de la entrada y del APK. `mobile:prepare` copia el catálogo, las tipografías originales y SQLite WASM a `mobile/public`, un directorio generado e ignorado por Git. La web mantiene `pnpm dev`, `pnpm build` y `pnpm start`.

Los comandos Android seleccionan el JDK de Android Studio y el SDK instalado en Windows si no existen variables explícitas. La compilación de release requiere los archivos de firma originales `android/keystore.properties` y su almacén de claves; nunca deben confirmarse en Git. No generar una nueva clave para actualizar una instalación existente.

## Funcionamiento

Puedes crear un perfil local, completar su cuestionario de preparación y generar una rutina sin cuenta ni internet. El motor mantiene las comprobaciones de preparación, equipamiento y límites de entrenamiento. Las imágenes e instrucciones del catálogo se incluyen en el APK. El catálogo local contiene los 50 ejercicios revisados; las opciones de equipamiento limitado pueden disponer de menos variedad que el catálogo completo de la web.

Las sesiones, medidas, rutinas y operaciones pendientes se guardan en SQLite en el espacio privado de la aplicación. Finalizar solo se confirma después de guardar. Una rutina recibida de un entrenador se conserva como una prescripción descargada y no se modifica al entrenar sin conexión.

La conexión con Supabase es opcional. Copia `mobile/.env.example` a `mobile/.env.local` y configura únicamente la URL pública y la clave anónima del proyecto. El navegador del APK nunca necesita claves de servicio ni claves de IA. El primer acceso a una cuenta existente y la descarga de sus datos requieren internet; los datos ya descargados siguen disponibles después.

Consulta [el contrato de respaldo completo](android-original-sync.md) para la descarga y sincronización. Se preservan filas y snapshots completos, incluidas las ocho medidas. Los datos nuevos del APK se respaldan entre instalaciones móviles mediante registros independientes. No actualizan automáticamente el historial de la web. La migración nueva está validada localmente y pendiente de despliegue. Su ausencia no impide descargar datos web; una subida pendiente debe mostrar esa condición.

Los recorridos profesionales que usan los RPC existentes mantienen sus permisos y necesitan una cuenta conectada. Las operaciones que dependían de secretos de servidor (IA remota, eliminación de cuenta y determinadas cargas de imágenes o notificaciones) aún requieren adaptar el servicio remoto; el APK no incluye esos secretos ni simula su éxito. El entrenamiento personal funciona sin Vercel. Esta compilación no prueba que todas las funciones profesionales estén listas en producción.

## Respaldo y actualización

En Ajustes, exporta un respaldo antes de cambiar de teléfono o actualizar. El archivo contiene datos de entrenamiento de un perfil, sin credenciales. Guárdalo en un lugar de confianza. Al importar, la aplicación valida el formato y el propietario y preserva cambios locales pendientes o posteriores.

El identificador Android sigue siendo `com.fitai.app`; la versión corregida es `1.1.1-offline` (código 3), que sustituye la interfaz alternativa de `1.1.0-offline`. Instala la versión firmada con la clave original sobre la anterior. No desinstales ni borres los datos para resolver un conflicto de firma: eso elimina el almacenamiento privado.

Las sesiones antiguas pendientes pueden estar en el almacenamiento WebView del origen Vercel. La opción «Recuperar sesión de la versión anterior», disponible en Android para una cuenta vinculada, lee solo los borradores v2 de esa cuenta utilizando una página local con el origen anterior y las cargas de red bloqueadas. Valida las sesiones con el analizador existente y exige que sus rutinas estén descargadas. Los borradores válidos vencidos se archivan íntegros sin activarlos ni inventar una autorización. Los que carecen de propietario, están corruptos o pertenecen a rutinas no descargadas se omiten y conservan en su origen.

## Verificación antes de distribuir

La pantalla de acceso permite recuperar explícitamente perfiles del APK `1.1.0-offline` si encuentra sus tablas anteriores. Se añaden como perfiles locales independientes, conservando los datos fuente y la selección actual. Los campos que aquella versión no guardaba permanecen vacíos; no se inventan series, medidas ni permisos profesionales. Las tablas originales nunca se eliminan.

1. Abrir el APK en modo avión, generar/consultar una rutina, completar series y finalizar.
2. Cerrar el proceso y reabrir; comprobar sesión en curso e historial.
3. Exportar e importar un respaldo y cambiar entre perfiles sin cruces de datos.
4. Conectar una cuenta autorizada y comprobar sincronización/reintentos y recepción de planes.
5. Actualizar sobre un APK anterior firmado igual y comprobar conservación y recuperación de borradores.

Las pruebas de navegador usan el mismo SQLite mediante WASM e IndexedDB. Permiten solicitudes al servidor local de archivos para representar el servidor interno de Capacitor y bloquean internet. No sustituyen las pruebas nativas de SQLite, actualización y almacenamiento WebView en un teléfono.

Consulta [el informe de verificación](android-offline-verification.md) para los resultados, la huella del APK firmado y los recorridos pendientes en dispositivo y servidor.
