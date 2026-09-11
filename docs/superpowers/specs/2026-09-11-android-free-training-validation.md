# Registro libre Android: validación local

Fecha: 11 de septiembre de 2026. Rama `codex/android-free-training`, creada desde `codex/android-offline` en `826315bfe947e1a064dcb687cf9d3135e90da3d2`. Worktree: `D:\work\project\.worktrees\android-free-training`.

## Entrega

- Acceso «Registrar entrenamiento» desde Inicio; Entrenar permite el registro sin plan activo.
- Constancia con fecha y nombre opcional; duración, nota y ejercicios se añaden cuando se necesitan. Meta semanal personal para quien no tiene plan activo.
- Series de fuerza o por tiempo; reutilizar un registro anterior requiere confirmación. Diferencia explícita entre constancia, detalle parcial y completo.
- Borrador SQLite privado por cuenta: recupera campos sin terminar al recargar o volver desde Inicio. Nueva sesión explícita y edición posterior del mismo registro.
- Guardado atómico con identidad estable, versión esperada y operación idempotente. Una edición reemplaza sus series sin duplicar el entrenamiento.
- Historial y calendario distinguen datos ausentes de ceros medidos. Progreso explica los periodos con información parcial; el mapa utiliza las series registradas.
- El respaldo privado existente incluye los registros libres. Las ediciones con el mismo identificador vuelven a activar el coordinador mediante `updated_at`.

## Resultados

| Comprobación | Resultado |
|---|---|
| Suite móvil completa | 289 pruebas, 33 archivos aprobados; base anterior: 233/30 |
| Unidades compartidas afectadas: progreso, historial, calendario, dashboard, evidencia y sesiones | 279 pruebas, 25 archivos aprobados |
| Fixtures de navegador del dashboard | 20 pruebas, 2 archivos aprobados |
| TypeScript móvil | `pnpm mobile:type-check` aprobado |
| ESLint de todos los archivos TS/TSX nuevos y modificados | Aprobado |
| Formato del diff | `git diff --check` aprobado |
| Bundle móvil | `pnpm mobile:build` aprobado |
| Recorrido nuevo sobre bundle con SQLite y red externa bloqueada | 4 escenarios aprobados; 320, 390 y 1440 px |
| Recorrido original sobre el bundle final | Aprobado: onboarding, cinco pestañas, sesión guiada/RPE, recarga, historial, progreso, ocho medidas, catálogo, ajustes, respaldo y 360/390/768 px |
| Revisión independiente | Hallazgo de presentación de series temporizadas corregido; revisión posterior sin hallazgos pendientes |

Los escenarios nuevos comprueban constancia sin ejercicios ni duración inventados, meta semanal, recuperación del borrador desde Inicio, edición sin duplicados, mapa de pecho con una serie real, detalle parcial, reutilización explícita de series, mejora de 60 kg × 8 a 60 kg × 10, nueva sesión separada, validación en inglés, 45 + 30 segundos conservados, navegación del resultado al editor, foco/teclado y etiquetas de calendario. El navegador no reportó errores de página ni desbordamiento horizontal. Se conservó el tema oscuro configurado por Android.

Las pruebas de datos cubren cuenta incorrecta, cierre/cambio de cuenta durante escrituras, versión obsoleta, reintento idempotente, fallos de caché, limpieza tardía del borrador, catálogo histórico, fechas civiles y cambio de horario. Estos límites se verificaron con pruebas automatizadas, no con cuentas reales remotas.

La suite compartida incluye un ajuste del arnés de dos fixtures: ahora resuelven la dependencia directa `node_modules/vite`, en lugar de una ruta interna de pnpm que no existe en una instalación nueva. No cambia el producto.

## Reproducción

```powershell
pnpm mobile:test
pnpm mobile:type-check
pnpm exec vitest run --project unit --maxWorkers=4 src/components/progress src/components/history src/components/calendar src/components/dashboard/__tests__ src/components/evidence/__tests__/freeTrainingSurfaces.test.tsx src/lib/calendar src/lib/session/__tests__
pnpm exec vitest run --project browser-fixtures --maxWorkers=1 src/components/dashboard/__tests__/SecondaryMetricsResponsive.test.tsx src/components/dashboard/__tests__/MusicNowPlayingResponsive.test.tsx
pnpm mobile:build
pnpm exec vite preview --config mobile/vite.config.ts --host 127.0.0.1 --port 4192 --strictPort
```

En otra consola, dentro del mismo worktree:

```powershell
$env:MOBILE_PREVIEW_URL = 'http://127.0.0.1:4192'
node mobile/tests/free-training-regression.mjs
node mobile/tests/original-journey.mjs
```

Capturas, resultados JSON y logs locales: `.artifacts/free-training/` (ignorado por Git). Capturas principales: `01-register-390.png`, `03-partial-form-390.png`, `04-muscle-progress-390.png`, `06-full-result-1440.png`, `08-timed-result-320.png`, `09-timed-history-320.png` y `10-keyboard-390.png`.

## Alcance de la evidencia

La verificación es local sobre el bundle móvil y SQLite de navegador. No se compiló un APK ni se probó un teléfono físico en esta entrega. No se ejecutaron migraciones, publicaciones ni sincronización con cuentas reales; la compatibilidad del respaldo se comprobó mediante contratos y round-trip SQLite. Las columnas móviles están condicionadas a `NEXT_PUBLIC_LOCAL_APP` para conservar las consultas web.

El build conserva avisos existentes de tamaño de chunks, imports dinámicos sin separación, Browserslist y utilidades Tailwind ambiguas. No impidieron compilar ni ejecutar los recorridos.

Esta entrega cubre registro libre y progreso asociado. Metas personales por ejercicio y ampliación del historial del compañero quedan para las siguientes entregas del producto.
