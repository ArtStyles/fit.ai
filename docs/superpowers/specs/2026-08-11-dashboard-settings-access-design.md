# Acceso a Ajustes desde el Home

**Fecha:** 2026-08-11
**Estado:** aprobado para planificación

## Problema

Las rutas de `/settings` continúan disponibles, pero su acceso visible dependía del perfil social `/u/[username]`. Al desactivar Comunidad y sustituir su destino de navegación por Entrenadores, el usuario quedó sin una entrada clara y estable hacia Ajustes.

## Objetivo

Restablecer un acceso evidente a `/settings` mediante un icono de engranaje visible exclusivamente en la cabecera del Home personal (`/dashboard`), sin volver a habilitar ninguna superficie de Comunidad.

## Decisiones de experiencia

- El engranaje se mostrará siempre en `DashboardHeader`, aunque el usuario no tenga nombre de usuario o no exista contenido de avisos.
- El control será un enlace de al menos 44 × 44 px hacia `/settings`.
- Tendrá foco visible, icono decorativo y la etiqueta accesible localizada `Abrir ajustes`.
- Cuando exista el botón de avisos, ambos controles aparecerán juntos a la derecha de la cabecera sin superponerse ni reducir el área táctil.
- El engranaje no aparecerá en la navegación inferior, el menú lateral, el workspace de entrenador, las sesiones de entrenamiento ni otras páginas.

## Desacoplamiento de Comunidad

`DashboardHeader` no conocerá directamente el feature flag de Comunidad. `DashboardPage`, que se ejecuta en el servidor, resolverá `isCommunityEnabled()` y construirá un `profileHref` únicamente cuando Comunidad esté activa y exista un `username`.

- Comunidad activa y `username` disponible: el nombre conserva el enlace a `/u/[username]`.
- Comunidad desactivada o `username` ausente: el nombre se representa como texto y no apunta a una ruta social no disponible.
- El engranaje hacia `/settings` permanece disponible en ambos casos.

Esta separación evita que los ajustes de cuenta vuelvan a depender de perfiles, publicaciones o acciones sociales.

## Componentes afectados

### `DashboardPage`

- Consultará el estado de Comunidad.
- Pasará a `DashboardHeader` un `profileHref` opcional en lugar de hacer que la cabecera deduzca el destino a partir del `username`.
- Mantendrá el resto de la carga del dashboard sin cambios.

### `DashboardHeader`

- Añadirá el enlace permanente a `/settings` con el icono `Settings`.
- Renderizará el nombre como enlace sólo cuando reciba `profileHref`.
- Mantendrá intacto el comportamiento del hub de avisos.

No se requieren cambios de base de datos, permisos, middleware ni acciones de servidor.

## Flujo

1. El usuario abre `/dashboard`.
2. El servidor carga su contexto y resuelve si Comunidad está activa.
3. La página construye o descarta el enlace social del nombre.
4. La cabecera muestra siempre el engranaje.
5. Al activarlo, Next.js navega a `/settings`, donde siguen aplicándose los controles de autenticación existentes.

## Manejo de errores

El enlace no realiza lecturas ni mutaciones adicionales. Si la navegación a `/settings` falla por un error general de la aplicación, se aplicará el manejo existente de rutas. La ausencia de `username` o la desactivación de Comunidad no se consideran errores y sólo convierten el nombre en texto.

## Pruebas

- Prueba del componente: el engranaje siempre enlaza a `/settings` y expone una etiqueta accesible.
- Prueba del componente: el engranaje y el botón de avisos conviven cuando hay contenido de avisos.
- Prueba del componente: el nombre es texto cuando `profileHref` es nulo y enlace cuando tiene un destino.
- Prueba de integración de la página: Comunidad desactivada produce `profileHref` nulo sin eliminar el acceso a Ajustes.
- Verificación de regresión: navegación, tipado, lint y suite existente del dashboard.

## Criterios de aceptación

- Desde el Home personal siempre se puede abrir `/settings` mediante el engranaje.
- El control cumple el tamaño táctil y los estados de foco del sistema visual existente.
- Desactivar Comunidad no genera enlaces hacia `/u/[username]` desde el Home.
- No aparece un nuevo destino de Ajustes en las barras de navegación.
- No se modifica el Home del entrenador ni los flujos de pantalla completa.

## Fuera de alcance

- Reactivar Comunidad o sus perfiles públicos.
- Rediseñar las pantallas internas de Ajustes.
- Añadir un menú desplegable al avatar.
- Mostrar el engranaje fuera de `/dashboard`.
