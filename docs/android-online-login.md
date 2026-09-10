# Acceso obligatorio con conexión después de cerrar sesión

Fecha: 2026-09-09. Rama: `codex/android-offline`. Base: `f48b3f8`.

## Comportamiento

El login ya no muestra «Opciones sin conexión», creación de perfiles locales, selección de perfiles guardados ni recuperación de perfiles antiguos. Para volver a entrar después de cerrar sesión se requiere una autenticación válida con internet. Recuperar la conexión por sí solo no activa una cuenta.

Una barrera común redirige las rutas privadas al login cuando no existe una cuenta activa, incluida la pantalla de almacenamiento que antes podía abrirse directamente. Registro y documentos legales siguen accesibles. El formulario comunica el error de conexión al intentar iniciar sesión.

Importar un respaldo también exige una sesión activa en el almacenamiento. Una importación pendiente queda invalidada al cerrar sesión; si el cierre ocurre durante la escritura, se revierte su transacción. Los datos guardados se conservan.

Las sesiones que permanecen abiertas conservan el uso de sus datos descargados sin conexión. Esta entrega sustituye la opción de reapertura local descrita para la versión 1.1.3.

## Verificación

- `pnpm mobile:test`: 146 pruebas en 24 archivos, sin fallos. Seis casos nuevos de importación sin sesión y concurrencia con logout fallaron antes del arreglo y pasan después.
- Reproducción previa en navegador: almacenamiento permitía importar sin sesión; las opciones locales seguían visibles en el login.
- `node mobile/tests/login-loading-regression.mjs`: formulario sin opciones locales en 320/390/1440 px, error tras envío sin internet, reintento, privacidad, fallo de almacenamiento y carga accesible aprobados.
- `node mobile/tests/logout-regression.mjs`: perfiles locales heredados y vinculados permanecen fuera después de Atrás, cierre completo del proceso y reapertura. `/dashboard`, `/onboarding`, `/settings/almacenamiento` y `/notifications` redirigen al login; enviar sin conexión y recuperar internet mantienen la sesión cerrada. Conservación exacta de datos y cero errores de página.
- `node mobile/tests/original-journey.mjs`: recorrido aprobado con un perfil local heredado que ya estaba activo: onboarding, generación de rutina, sesión y recarga, historial, ocho medidas, ajustes y respaldos; cero errores de página. El fixture se corrigió para representar ese caso, ya que un perfil vinculado necesita internet para verificar su nombre público durante onboarding.
- Los perfiles para recorridos offline se preparan mediante un helper exclusivo de pruebas en SQLite/IndexedDB; no hay acceso de prueba en el producto ni autenticación remota simulada presentada como verificación del servidor.
- `pnpm mobile:type-check`, ESLint de archivos cambiados y `git diff --check`: aprobados.
- `pnpm android:offline:release`: aprobado; 37 pruebas JVM sin fallos ni errores.
- APK verificado: JS/CSS coinciden con `mobile/dist`; SQLite WASM, 16 fuentes y 50 imágenes presentes; sin cargador remoto. Configuración de autenticación presente.

## APK

- Archivo: `.artifacts/Vekira-1.1.4-offline.apk`.
- Aplicación: `com.fitai.app`; versión `1.1.4-offline`; código 6.
- Tamaño: 17 940 127 bytes.
- SHA-256: `5042f5a7d6ad1e37f2f807dd69a054908b5f385d8db382feffe1d2251614dab9`.
- Firma válida, mismo certificado que 1.1.3: SHA-256 `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.

No había dispositivos conectados en ADB. La instalación y el recorrido nativo en un teléfono quedan pendientes. Sin commit, push ni cambios remotos.
