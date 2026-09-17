# Vekira: producto Android y portal web

Decisión del propietario, 2026-09-16: `main` contiene el portal público de descarga. `codex/android-offline` contiene la aplicación móvil. El nombre existente de la rama es android-offline.

La web conserva landing bilingüe, descarga del APK, privacidad, términos, ayuda, recuperación y eliminación de cuenta. Las rutas de entrenamiento, entrenadores, chat y administración dejan de ofrecer el producto en el navegador y conducen a la descarga. El propietario confirmó trasladar también las pantallas auxiliares a Android antes de cerrar esta transición.

Android conserva las pantallas originales y las cinco pestañas. Solicitud de entrenador, foto profesional, chat y administración se resuelven dentro del APK. Las operaciones que necesitan privilegios o secretos se ejecutan mediante API explícitas en main: identidad verificada con bearer, permisos existentes, respuestas sin caché y guardas de cambio de cuenta en el cliente. Los secretos no entran en el APK.

No se reemplaza Supabase ni se borran datos. Las correcciones de recuperación/eliminación desplegadas desde Android se incorporan en main. El portal desactiva la instalación PWA y retira el caché antiguo. La distribución incluye un APK firmado verificable y versión/hash correspondientes al artefacto entregado.

La publicación remota y la prueba en teléfono son verificaciones distintas del trabajo local. El portal y sus API deben publicarse junto con el APK nuevo: los APK anteriores aún usan las pantallas web auxiliares.
