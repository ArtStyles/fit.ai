# Vekira: separación web / Android

- `main` es el portal público: landing ES/EN, descarga Android, privacidad/términos, ayuda, recuperación/eliminación de cuenta y API de soporte móvil.
- El producto funcional se desarrolla y compila en `codex/android-offline`, worktree `.worktrees/android-offline`.
- No reintroducir entrenamiento, chat, entrenadores o administración como experiencia web, ni enlaces públicos para entrar/registrarse en el producto.
- Las pantallas se ejecutan dentro del APK. Las operaciones con privilegios y secretos permanecen en API autenticadas; ninguna clave privada se incorpora al bundle móvil.
- No fusionar globalmente estas ramas. Trasladar cambios compartidos concretos preservando los límites de plataforma; publicar el servidor y el APK compatible juntos.
- Antes de cerrar un cambio, separar evidencia local, publicación del servidor, migraciones y prueba física Android.
