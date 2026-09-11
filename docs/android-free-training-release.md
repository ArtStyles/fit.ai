# Vekira 1.1.19-offline

Entrega del 11 de septiembre de 2026 en `codex/android-offline`.

## Cambios incluidos

La rama integra por avance directo los commits `07b7ace`, `782efba` y `c47784f` de `codex/android-free-training`: registro libre posterior al entrenamiento, constancia sin series, edición de registros, selectores propios, Progreso organizado en Resumen/Rendimiento/Medidas y hasta tres objetivos personales por ejercicio.

Los objetivos y registros funcionan con el almacenamiento local existente. Las metas usan resultados de una misma serie, el historial conserva sus sesiones y la vista del periodo diferencia la evidencia de carga/repeticiones de las series temporizadas.

## APK

- Archivo: `.artifacts/Vekira-1.1.19-offline.apk`.
- Tamaño: 18 029 889 bytes.
- SHA-256: `aefc93b7d525ce186975f1cdd7ef344c35433e16d15c3bd30ac3cef609e5ae79`.
- Aplicación: `com.fitai.app`; versión `1.1.19-offline`; código 21.
- Android mínimo 24 y destino 36; incluye arm64-v8a, armeabi-v7a, x86 y x86_64.
- Firma v2 válida y certificado SHA-256 idéntico a 1.1.18-offline: `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.
- Alineación comprobada con `zipalign -c -P 16 -v 4`.

La copia de entrega coincide por SHA-256 con `android/app/build/outputs/apk/release/app-release.apk`. Los APK y las credenciales de firma permanecen fuera de Git.

## Verificación de la entrega

- `pnpm mobile:test`: 317 pruebas en 38 archivos.
- Pruebas compartidas de Progreso, mapa, historial, evidencia, diálogos, Atrás y calendario: 70 pruebas en 13 archivos.
- `pnpm mobile:type-check`, `pnpm type-check` y ESLint del código integrado: correctos.
- `pnpm android:offline:release`: build completo, sincronización Capacitor, 37 pruebas JVM sin fallos y APK release firmado.
- Ocho escenarios de Progreso/objetivos, seis de registro libre y recorrido original ejecutados contra el mismo `mobile/dist` empaquetado, con red externa bloqueada.
- `scripts/verify-android-offline.ps1`: JS/CSS, SQLite WASM, 50 posters, 16 fuentes y recursos/licencia muscular coinciden. Se verificó además `index.html` directamente contra el APK.
- `apksigner`, `aapt2` y el `output-metadata.json` recién generado confirman firma, paquete, código y nombre de versión. Sin cargador remoto ni service worker web.

Informes locales: `.artifacts/release-1.1.19/`, `.artifacts/progress-goals/`, `.artifacts/free-training/` y `.artifacts/original-journey/`.

## Instalación y alcance

Para actualizar, exportar un respaldo y abrir el APK sobre la instalación existente, sin desinstalar ni borrar sus datos. La firma y el identificador compatibles se verificaron; la actualización y ejecución en un teléfono físico no forman parte de esta validación.

Esta entrega publica código en la rama Android y proporciona el APK. No incluye migraciones de Supabase, despliegue web ni pruebas de sincronización con cuentas reales.
