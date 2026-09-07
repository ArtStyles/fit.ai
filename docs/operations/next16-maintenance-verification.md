# Actualización a Next.js 16

Fecha: 7 de septiembre de 2026. Rama: `codex/next16-maintenance`, desde `43812cb`.

## Cambios

- Next.js 14.2.0 → 16.3.4; React/React DOM 18 → 19.2.8.
- Tipos de React, ESLint y sus adaptadores compatibles; Lucide 0.475.0 admite React 19. PostCSS 8.5.28 y lockfile actualizado.
- `cookies()`, `headers()`, `params` y `searchParams` asíncronos, incluidos metadatos, filtros, rutas privadas y páginas legales.
- `middleware.ts` pasa a `proxy.ts`. Las cabeceras de identidad entrantes se eliminan antes de reconstruirlas desde la sesión verificada de Supabase.
- Los formularios de ajustes usan `useActionState`. Nombre y datos personales conservan sus valores después de errores y guardados; una referencia con limpieza instala un listener nativo de `reset`, compatible con React 19 estable y el React integrado en Next.js.
- `dev`, `dev:clean` y `build` usan `--webpack` para mantener la integración PWA. Se elimina `swcMinify`, retirado de Next.js.
- `type-check` ejecuta `next typegen` antes de TypeScript, para comprobar también los contratos generados de las rutas.
- La preparación de las pruebas de navegador carga su propia página y señal de disponibilidad en un contexto separado. Conserva los límites y las aserciones de las interacciones. La prueba de accesibilidad simula explícitamente la acción de autorización que pertenece al servidor.

## Verificación local

Entorno: Windows, Node.js 24.12.0, pnpm 10.27.0, Chromium de Playwright. El mínimo declarado es Node.js 22.12, por los requisitos conjuntos de Next.js, Capacitor y Vite.

| Comprobación | Resultado |
| --- | --- |
| Instalación con lockfile congelado y modo offline | Correcta; sin cambios de resolución |
| ESLint | 0 errores; 3 advertencias de directivas disable sin uso |
| Generación de tipos de rutas + TypeScript | Correctas |
| Vitest unitario, 4 workers | 279 archivos, 2.515 pruebas aprobadas |
| Vitest de navegador, ejecución serial sin retries | 18 archivos, 240 pruebas aprobadas; 223,80 s |
| Build final de producción con Webpack/PWA | Correcto; compilación en 35,1 s y generación de 53 páginas |
| Navegador sobre el servidor de producción | `/es`, `/en`, registro e inicio de sesión; sin errores JavaScript ni desbordamiento a 390 px; escritorio a 1280 px |

Las pruebas de navegador incluyen formularios, permisos y consentimientos simulados, navegación con cambios pendientes, teclado, accesibilidad y pantallas móviles/escritorio. Se inspeccionaron también las capturas del menú de cuenta a 390 px y la portada de producción a 1280 px. El service worker `/sw.js` quedó activado con alcance `/`; el manifiesto respondió correctamente. Las comprobaciones HTTP verificaron además páginas legales y la redirección de rutas privadas a `/login` sin sesión. Las solicitudes de analítica se interceptaron en la comprobación del navegador.

En la comprobación posterior para publicar en `main`, tipos, lint y las 2.515 pruebas unitarias volvieron a pasar. Una ejecución de navegador terminó con 239/240 casos aprobados: `AccountWorkspaceResponsive`, superficie `topbar` a 320 px, agotó la espera de 15 s de la señal de carga del fixture. Sus 40 casos pasaron al repetir el archivo completo sin modificar código ni tiempos de espera; el diagnóstico de Vite no mostró una nueva optimización de dependencias. La causa de esa intermitencia no quedó confirmada, por lo que no se declara corregida.

La primera ejecución tras instalar las nuevas dependencias en `main` detectó otro problema de preparación: Vite invalidaba `lucide-react` durante la carga del editor profesional (`504 Outdated Optimize Dep`) al descubrir tarde `react/jsx-dev-runtime`, `clsx`, `tailwind-merge` y el selector de Radix. Pasaron 198 casos y los 42 del editor quedaron sin ejecutar. Su configuración ahora limita el escaneo al HTML de ese fixture e incluye previamente esas dependencias, sin ampliar tiempos de espera ni cambiar aserciones. La ejecución completa posterior en `main` aprobó **18 archivos y 240 casos**, sin retries, en 389,36 s; también pasó el caso `topbar` citado anteriormente.

La repetición del build en el checkout de `main` quedó bloqueada por `connect EACCES 142.250.113.95:443` al descargar Barlow Condensed y Plus Jakarta Sans desde Google Fonts, tras tres reintentos automáticos. El build aprobado de la tabla corresponde a la carpeta aislada; el código de la aplicación es idéntico y la corrección posterior afecta solo a la preparación de pruebas. No se usaron fuentes simuladas ni se desactivaron comprobaciones para presentar como aprobado el build de `main`.

Regresiones comprobadas antes de corregir:

- Los filtros de usuarios se perdían al recibir `searchParams` como promesa.
- React 19 restauraba los valores iniciales de los formularios de nombre y datos personales después de una respuesta de error. Las pruebas nuevas usan los hooks y el DOM reales, con acciones de persistencia simuladas en el navegador; incluyen error, corrección y reintento exitoso en Strict Mode.
- Las cabeceras de identidad proporcionadas por un visitante persistían sin una sesión válida, o conservaban un correo falso cuando la sesión no tenía correo. Dos pruebas nuevas comprueban su eliminación.

## Auditoría de dependencias

`pnpm audit --prod --json` no informa avisos para Next.js, React ni React DOM en estas versiones. La auditoría del árbol completo aún informa **37 incidencias: 26 altas, 7 moderadas y 4 bajas; ninguna crítica**. El desglose debe interpretarse según la exposición de cada dependencia; no equivale a 37 fallos explotables de la aplicación.

Entre las cadenas pendientes están Workbox/webpack de `@ducanh2912/next-pwa` y dependencias de `firebase-admin`. Por ejemplo, `serialize-javascript` 6.0.2 llega por Workbox y necesita una versión principal posterior para cubrir todos sus avisos. Esta actualización no fuerza versiones principales incompatibles mediante overrides. La migración de esas cadenas requiere una revisión independiente; **no se declara el árbol completo libre de vulnerabilidades**.

## Límites del resultado

- No se han aplicado migraciones, modificado cuentas ni ejecutado fixtures destructivos contra Supabase remoto. Faltan las variables del proyecto y de la cuenta E2E dedicados.
- Capacitor conserva su `server.url` remoto. ADB está instalado pero no hay dispositivos conectados; no se atribuye a las pruebas locales una validación física de Android.
- La validación descrita es local. La integración y el push a `main` no acreditan un despliegue: el contenido remoto que carga la aplicación Android continúa dependiendo del despliegue de Vercel.

Referencias: [soporte de Next.js](https://nextjs.org/support-policy), [migración oficial a Next.js 16](https://nextjs.org/docs/app/guides/upgrading/version-16), [aviso de seguridad original](https://nextjs.org/blog/security-update-2025-12-11). La documentación instalada se encuentra en `node_modules/next/dist/docs/`.
