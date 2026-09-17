# Vekira Android

- Esta rama `codex/android-offline` contiene el producto funcional móvil. `main` contiene exclusivamente el portal público de descarga, documentos, cuenta y API necesarias.
- Mantener las pantallas originales, navegación de cinco pestañas y almacenamiento local. No abrir pantallas web para entrenar, usar chat, gestionar entrenadores o administrar.
- Mantener secretos y operaciones privilegiadas en API autenticadas desplegadas desde main. Cambios de API compartidos deben trasladarse de forma acotada a main; no fusionar indiscriminadamente las ramas.
- Conservar verificaciones de identidad, permisos, sesión y cambio de cuenta; compilar sin dependencias de servidor en el bundle.
- Publicar el servidor compatible y el APK firmado juntos. Pruebas locales no equivalen a dispositivo físico ni despliegue.
- `vercel.json` desactiva despliegues web automáticos de esta rama Android; el portal y servidor se despliegan desde `main`.
