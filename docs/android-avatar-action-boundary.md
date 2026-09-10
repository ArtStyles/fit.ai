# Avatar: recuperación del editor y límite de Android

La mejora visual del perfil conserva el editor de foto compartido. Este cambio permite reintentar un fallo sin perder la foto anterior ni salir de la pantalla. El editor bloquea nuevas selecciones desde la decodificación, libera las URLs temporales al terminar o desmontarse y adopta la URL confirmada por la acción. Al quitar la foto, vuelve a mostrar las iniciales.

## Verificación local

- Siete regresiones de navegador fallaron antes de sus respectivas correcciones y pasan después: procesamiento ocupado, rechazo y reintento de subida, adopción de URL confirmada y actualización de props, invalidación de la imagen confirmada al volver a un valor de props anterior, rechazo y reintento de eliminación, limpieza durante navegación e impedir una nueva subida tras desmontarse mientras se procesa.
- Los tests montan el editor, Avatar, Toast y traducción reales; Canvas procesa un PNG real. Únicamente las respuestas remotas y el refresco de ruta se sustituyen por respuestas controladas.
- `pnpm exec vitest run src/components/profile/__tests__/avatarUploaderInteraction.test.tsx src/components/profile/__tests__/avatarUploader.test.ts`: 8 pruebas aprobadas.
- ESLint de los dos archivos y `git diff --check`: aprobados.

## Límite existente en el APK

La subida y eliminación remotas no quedan habilitadas en Android con este cambio. `mobile/vite.config.ts` todavía permite importar `src/app/actions/avatar.ts`, cuyas dos acciones usan `createServiceClient`. Ese cliente se sustituye en Android por `mobile/src/original/server-boundary.ts`, que lanza un error. El editor ahora recupera ese fallo y conserva la imagen anterior.

El esquema versionado de Storage crea el bucket público `avatars` sin políticas de escritura para clientes autenticados. Por tanto, sustituir únicamente el cliente privilegiado por el cliente del usuario no es una solución completa. Habilitar esa operación requiere una acción mobile autenticada con comprobación de cuenta y políticas de Storage acotadas al propietario, o un endpoint de servidor autenticado. Cualquiera de esas alternativas necesita su propia validación del servicio desplegado.

No se han modificado acciones de servidor, aliases de Android ni políticas de Storage; tampoco se realizaron mutaciones remotas. Esta prueba acredita la recuperación del editor, no una subida real desde el APK.
