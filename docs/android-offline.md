# Vekira Android offline

Esta versión se desarrolla en `codex/android-offline`, dentro de `.worktrees/android-offline`. La web Next.js conserva sus comandos y rutas. No mezclar esta rama en `main` hasta decidir cómo integrar ambos productos.

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

La compilación móvil usa exclusivamente `mobile/`, el motor compartido y el catálogo revisado. `mobile:prepare` copia el catálogo y SQLite WASM a `mobile/public`, un directorio generado e ignorado por Git. La web mantiene `pnpm dev`, `pnpm build` y `pnpm start`.

Los comandos Android seleccionan el JDK de Android Studio y el SDK instalado en Windows si no existen variables explícitas. La compilación de release requiere los archivos de firma originales `android/keystore.properties` y su almacén de claves; nunca deben confirmarse en Git. No generar una nueva clave para actualizar una instalación existente.

## Funcionamiento

Puedes crear un perfil local, completar su cuestionario de preparación y generar una rutina sin cuenta ni internet. El motor mantiene las comprobaciones de preparación, equipamiento y límites de entrenamiento. Las imágenes e instrucciones del catálogo se incluyen en el APK. El catálogo local contiene los 50 ejercicios revisados; las opciones de equipamiento limitado pueden disponer de menos variedad que el catálogo completo de la web.

Las sesiones, medidas, rutinas y operaciones pendientes se guardan en SQLite en el espacio privado de la aplicación. Finalizar solo se confirma después de guardar. Una rutina recibida de un entrenador se conserva como una prescripción descargada y no se modifica al entrenar sin conexión.

La conexión con Supabase es opcional. Copia `mobile/.env.example` a `mobile/.env.local` y configura únicamente la URL pública y la clave anónima del proyecto. El navegador del APK nunca necesita claves de servicio ni claves de IA. El primer acceso a una cuenta existente y la descarga de sus datos requieren internet; los datos ya descargados siguen disponibles después.

Consulta `docs/android-offline-cloud.md` para el contrato de sincronización móvil y la capacidad adicional del servidor. Los datos nuevos del APK se sincronizan entre instalaciones móviles mediante registros independientes. No actualizan automáticamente el historial de la web. Una capacidad de servidor que aún no se haya desplegado debe mantener las operaciones pendientes y presentar el error, nunca informar que están sincronizadas.

## Respaldo y actualización

En Ajustes, exporta un respaldo antes de cambiar de teléfono o actualizar. El archivo contiene datos de entrenamiento de un perfil, sin credenciales. Guárdalo en un lugar de confianza. Al importar, la aplicación valida el formato y el propietario y preserva cambios locales pendientes o posteriores.

El identificador Android sigue siendo `com.fitai.app`; la versión de este cambio es `1.1.0-offline` (código 2). Instala la versión firmada con la clave original sobre la anterior. No desinstales ni borres los datos para resolver un conflicto de firma: eso elimina el almacenamiento privado.

Las sesiones antiguas pendientes pueden estar en el almacenamiento WebView del origen Vercel. La opción «Recuperar sesión de la versión anterior», disponible en Android para una cuenta vinculada, lee solo los borradores v2 de esa cuenta utilizando una página local con el origen anterior y las cargas de red bloqueadas. Valida las sesiones con el analizador existente y exige que sus rutinas estén descargadas. No elimina los originales. Los borradores sin propietario, corruptos, vencidos o de rutinas no descargadas no se importan automáticamente; se informa cuántos se omitieron y se conservan sus bytes originales.

## Verificación antes de distribuir

1. Abrir el APK en modo avión, generar/consultar una rutina, completar series y finalizar.
2. Cerrar el proceso y reabrir; comprobar sesión en curso e historial.
3. Exportar e importar un respaldo y cambiar entre perfiles sin cruces de datos.
4. Conectar una cuenta autorizada y comprobar sincronización/reintentos y recepción de planes.
5. Actualizar sobre un APK anterior firmado igual y comprobar conservación y recuperación de borradores.

Las pruebas de navegador usan el mismo SQLite mediante WASM e IndexedDB. Permiten solicitudes al servidor local de archivos para representar el servidor interno de Capacitor y bloquean internet. No sustituyen las pruebas nativas de SQLite, actualización y almacenamiento WebView en un teléfono.

Consulta [el informe de verificación](android-offline-verification.md) para los resultados, la huella del APK firmado y los recorridos pendientes en dispositivo y servidor.
