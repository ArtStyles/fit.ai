# Vekira Android 1.1.12-offline

Entrega solicitada el 10 de septiembre de 2026: integrar/publicar en `codex/android-offline` y entregar el APK. La web de producción queda fuera de esta publicación.

## Aplicación

- Archivo local: `.artifacts/Vekira-1.1.12-offline.apk`.
- Paquete: `com.fitai.app`.
- Versión: `1.1.12-offline`; código `14`.
- Tamaño: 17 996 798 bytes (18,0 MB).
- SHA-256: `f9320867c53d9c48c8619e06dd8eeedff96907580a29949da886c736353bf032`.
- Certificado SHA-256: `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.

La firma APK v2 se verificó y coincide con la versión 1.1.11-offline. Instalar sobre la versión anterior para conservar los datos. No desinstalar primero. El primer acceso a una cuenta y la sincronización siguen necesitando conexión; el entrenamiento descargado conserva su funcionamiento offline.

## Cambios incluidos

Mapa muscular en Plan y Progreso, basado en series prescritas y realmente completadas, con selección accesible y geometría MIT local. Reprogramación de una sesión concreta, persistencia SQLite, restauración de fecha y protección contra registros duplicados, manteniendo la prescripción del entrenador. También incluye la integración Android pendiente que se preservó en `fd67f8c` y la funcionalidad revisada en `248e2e6`.

## Verificación de esta entrega

- `pnpm android:offline:release`: compilación correcta; 37 pruebas JVM sin fallos ni errores.
- `pnpm mobile:test`: 211 pruebas aprobadas en 28 archivos.
- `node mobile/tests/opengym-regression.mjs`: seis recorridos aprobados sobre el bundle de release, en 320/360/390/1440px según escenario; red externa bloqueada, persistencia SQLite real y sin errores de página.
- `scripts/verify-android-offline.ps1`: todos los assets coinciden con el bundle; SQLite, 50 imágenes revisadas, 16 fuentes y licencia MuscleMap incluidos; sin cargador web remoto ni service worker.
- `apksigner verify --verbose --print-certs`: firma válida y comparación de certificado con el APK anterior aprobada.
- Metadatos Android: paquete, versión y código comprobados mediante `aapt2`.
- La configuración pública de conexión y los archivos de firma originales se restauraron solo como archivos ignorados. No se incorporaron credenciales de servidor al bundle ni claves de firma a Git.

Las pruebas compartidas y revisión de la funcionalidad se documentan en [el informe de la primera fase](superpowers/reviews/2026-09-10-android-opengym-phase-one-validation.md). No hay cambios nuevos de esquema que desplegar en Supabase para esta fase. No había dispositivos conectados por ADB: la instalación/actualización y el recorrido con una cuenta real en un teléfono no se verificaron físicamente.

## Integración

Antes de adoptar la instantánea se comparan nuevamente las 137 rutas y hashes del worktree Android con el manifiesto original. El árbol staged debe coincidir exactamente con `fd67f8c`; después la rama puede avanzar a ese snapshot sin reemplazar archivos, y recibir la release mediante fast-forward. La publicación usa push normal de `codex/android-offline`, con comparación posterior de SHA local/remoto.
