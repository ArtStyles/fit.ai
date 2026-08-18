# Informe de corrección final — Settings Foundation and General Preferences

**Fecha:** 2026-08-16  
**Rama:** `codex/settings-quality-redesign`  
**Base de esta ola:** `647fab21a1492aff00bef1bf144d78070a68ace8`  
**Veredicto:** PASS con una limitación de entorno: pgTAP no pudo ejecutarse porque Docker Desktop no está disponible. La migración y el pgTAP se revisaron estáticamente y las fronteras de aplicación equivalentes sí tienen pruebas unitarias GREEN.

## Veredicto de los hallazgos, en orden

### 1. Critical — upsert y privilegios de `user_id`

**RESUELTO.** La causa era que el payload de PostgREST incluía `user_id`, por lo que la rama `ON CONFLICT DO UPDATE` podía exigir privilegio de actualización sobre esa columna aunque el usuario solo modificara preferencias.

- `src/app/actions/notifications.ts`: el upsert conserva `onConflict: 'user_id'`, pero envía solo `professional_enabled` y `push_enabled`.
- `supabase/migrations/040_trainer_foundations.sql`: `user_id` tiene `DEFAULT auth.uid()` en instalaciones nuevas.
- `supabase/migrations/047_product_notification_preferences_insert.sql`: aplica el default a instalaciones existentes, revoca expresamente `INSERT(user_id)` y concede `INSERT` únicamente sobre las dos columnas de preferencias. La política `WITH CHECK (auth.uid() = user_id)` permanece.
- `supabase/tests/047_product_notification_preferences_insert_test.sql`: 9 aserciones pgTAP reproducen el `INSERT ... ON CONFLICT` real para fila ausente, fila existente y un intento de propietario cruzado; también verifican default y privilegios mínimos.
- `src/app/actions/__tests__/notificationPreferences.test.ts` y `src/app/actions/__tests__/notifications.test.ts`: verifican payload sin propietario y un doble que aplica el default autenticado/RLS.

**RED:** la prueba de acción recibió todavía `user_id: 'user-1'` y falló.  
**GREEN:** la prueba crítica combinada pasó 3/3; el fake integral pasó 12/12 después de modelar `DEFAULT auth.uid()`.

### 2. Critical — React 18 y `useActionState`

**RESUELTO.** `ProfileNameForm` importa y usa `useFormState` desde `react-dom`, compatible con React/ReactDOM 18.3.1 y Next 14. Se eliminó el mock de una API inexistente y se mockea la API real.

- Archivos: `src/components/settings/ProfileNameForm.tsx`, `src/components/settings/__tests__/profileNameForm.test.tsx`.
- `rg` no encuentra referencias restantes a `useActionState`.

**RED:** ambos casos fallaron con `TypeError: useActionState is not a function`.  
**GREEN:** los dos casos del formulario y la prueba de upsert pasaron 3/3 en el comando crítico combinado.

### 3. Important — serialización, propagación y compensación de recordatorios

**RESUELTO.** La UI usa un único `createSingleFlight`; el selector horario y el switch quedan deshabilitados durante cualquier operación. Activación, desactivación, hidratación y cambio horario capturan errores reales. El estado y `localStorage` solo se consolidan después del éxito y el cambio horario revierte al valor anterior ante fallo.

La capa nativa ahora:

- obtiene las notificaciones pendientes antes de reemplazarlas;
- filtra exclusivamente los IDs reservados 7101–7107;
- propaga fallos de cancelación;
- limpia una programación nueva parcial si `schedule` falla;
- vuelve a programar exactamente la configuración pendiente previa;
- lanza el error original, o un `AggregateError` si también falla la restauración.

Archivos principales: `src/components/settings/WorkoutReminders.tsx`, `src/components/settings/notificationPreferenceFeedback.ts`, `src/lib/native/notifications.ts` y sus pruebas nuevas/actualizadas.

**RED:** tras corregir un literal de fixture mal codificado, la suite nativa mostró 3 fallos/1 pase (inglés, compensación y cancelación); las pruebas de helper/controles mostraron 3 fallos/3 pases (excepción absorbida, helper ausente y controles no bloqueados).  
**GREEN:** 10/10 pruebas nativas, de orquestación y controles; regresiones de notificaciones+i18n 121/121.

### 4. Important — errores accesibles e indicador no cromático

**RESUELTO.** `SettingsField` deriva `aria-invalid="true"` cuando existe error. `SettingsChoiceGroup` acepta un id opcional, genera uno estable con `useId` si falta, conecta `aria-describedby` con el error y muestra un icono `Check` para la opción seleccionada. `ProfileNameForm` hereda automáticamente `aria-invalid`.

- Archivos: `SettingsField.tsx`, `SettingsChoiceGroup.tsx`, `settingsPrimitives.test.tsx`, `profileNameForm.test.tsx`.

**RED:** 4 de 9 aserciones/casos fallaron por ausencia de `aria-invalid`, asociación del error, indicador y formulario extraído.  
**GREEN:** 9/9.

### 5. Important — copy nativo ES/EN

**RESUELTO.** `scheduleWorkoutReminders` recibe `AppLanguage` y resuelve título/cuerpo mediante `translate`. Todas las rutas de programación de `WorkoutReminders` pasan el idioma actual.

- Español: `¡Hora de entrenar! 💪` / `Tu sesión de hoy te espera. Vamos a por ella.`
- Inglés: `Time to work out! 💪` / `Today's session is waiting. Let's get moving.`
- Archivos: `src/lib/native/notifications.ts`, `src/lib/i18n/index.ts`, `src/lib/native/__tests__/notifications.test.ts`.

**RED:** español ya pasaba; inglés recibía todavía los dos textos en español.  
**GREEN:** ambos idiomas programan el payload esperado.

### 6. Minor — anuncios duplicados de Idioma

**RESUELTO.** Se retiraron la región viva oculta permanente y el toast de este flujo. `LanguageFeedback` renderiza un único `SettingsStatus` solo cuando existe feedback; por tanto hay un solo camino de anuncio para pendiente, éxito o error.

- Archivos: `LanguageSelector.tsx`, `LanguageSelector.test.tsx`.

**RED:** el render inicial contenía `role="status"` vacío y los cinco casos nuevos fallaron.  
**GREEN:** 5/5; el feedback de éxito contiene exactamente un `role="status"` y un `aria-live="polite"`.

### 7. Minor — loading detail shell y copy inglés

**RESUELTO.** `SettingsDetailShell` localiza regreso a Ajustes y `aria-label="Loading {title}"`. Perfil localiza título/nombre; Notificaciones localiza título, Recordatorios, Hora preferida, Días activos y Avisos de Vekira; Cuenta conserva sus secciones localizadas y ahora recibe shell inglés.

- Archivos: `src/components/feedback/RouteLoading.tsx`, su prueba y `src/lib/i18n/index.ts`.

**RED:** la prueba recibía `aria-label="Cargando Perfil"`, `Ajustes`, `Perfil` y `Nombre` en el render inglés.  
**GREEN:** 21/21 casos de loading, incluida cobertura conductual inglesa de Perfil, Notificaciones y Cuenta.

### 8. Minor — garantías de skeleton por markup

**RESUELTO.** Las garantías de Ajustes ya no leen el texto fuente: renderizan `SettingsLoading`, localizan cada `data-loading-group` y cuentan `data-loading-row="true"`.

- Conteos verificados: Tu perfil 3, Tu entrenamiento 1, Aplicación 2, Acceso y seguridad 1.
- Se verifica que no aparece Administración ni en español ni en inglés.
- También se convirtieron a render real las garantías de Perfil, Notificaciones, Cuenta, detalles y estado de Idioma que podían comprobarse sin leer el fuente.

**RED:** el markup no exponía grupos/filas contables.  
**GREEN:** 21/21.

### 9. Minor — cobertura conductual de `LanguageSelector`

**RESUELTO.** Se añadieron `languageSelectionReducer` y `persistLanguageSelection`, usados por el componente y probados directamente para:

- selección optimista y estado pendiente/bloqueado;
- éxito y exactamente un `router.refresh()`;
- error del servidor y rollback;
- rechazo de la acción y fallback;
- ausencia de refresh ante fallo;
- feedback por una sola región viva.

La navegación por teclado continúa delegada a inputs radio nativos con un único `name`; no existe handler de teclado personalizado que duplicar o simular. Vitest usa entorno Node y el repositorio no incluye una librería DOM de interacción, por lo que esta ola no añade un evento de teclado de navegador. La prueba ya no afirma “navegación por teclado” solo a partir de atributos estáticos.

**RED:** 5/5 casos nuevos fallaron contra la implementación anterior.  
**GREEN:** 5/5.

### 10. Minor — input de confirmación de 44 px

**RESUELTO.** La vista real `DeleteAccountConfirmationForm`, usada por `DeleteAccountSection`, renderiza `confirmText` con `h-11`. La acción, palabra de confirmación, estado, cancelación y botones no cambiaron.

- Archivos: `DeleteAccountSection.tsx`, `DeleteAccountSection.test.tsx`.

**RED:** el formulario aislable no existía y el input original era `h-10`.  
**GREEN:** la prueba de markup real verifica `h-11`; incluida en el 9/9 de accesibilidad.

## Comandos y resultados

### Pruebas enfocadas

- Críticos: `pnpm exec vitest run src/app/actions/__tests__/notificationPreferences.test.ts src/components/settings/__tests__/profileNameForm.test.tsx` — RED 3/3; GREEN 3/3.
- Nativo: `pnpm exec vitest run src/lib/native/__tests__/notifications.test.ts` — RED real 3 fallos/1 pase; GREEN dentro del conjunto 10/10.
- Orquestación/controles: `pnpm exec vitest run ...notificationPreferenceFeedback.test.ts ...WorkoutReminders.test.tsx` — RED 3 fallos/3 pases; GREEN dentro del conjunto 10/10.
- Accesibilidad/cuenta: comando de tres archivos — RED 4 fallos/5 pases; GREEN 9/9.
- Idioma: archivo enfocado — RED 5/5; GREEN 5/5.
- Loading: archivo enfocado — RED 2 fallos/19 pases; GREEN 21/21.
- Consolidación de Ajustes: 14 archivos, 173/173 tests GREEN.

### Verificación final

- `pnpm type-check` — exit 0 en el árbol definitivo.
- `pnpm lint` — primera ejecución exit 0 con 1 warning (`ReactNode` sin usar en `SettingsField.tsx`); se eliminó el import. Ejecución final: exit 0, 0 warnings.
- `pnpm test` — primera ejecución: 218/219 archivos y 1784/1785 tests; falló un fake que aún dependía de `payload.user_id`. Se corrigió para modelar default autenticado y RLS, y su archivo pasó 12/12. Ejecución final: 219/219 archivos, 1785/1785 tests, exit 0.
- `git diff --check 647fab21a1492aff00bef1bf144d78070a68ace8` — exit 0.
- `pnpm test:db` — exit 1 antes de ejecutar pgTAP: Docker Desktop Linux Engine no está disponible en `npipe:////./pipe/dockerDesktopLinuxEngine`.

Vitest imprime un warning repetido indicando que Vite ya soporta `resolve.tsconfigPaths` y que en el futuro podría retirarse `vite-tsconfig-paths`. Es preexistente, no afecta el exit code y no se modificó configuración fuera de alcance.

## Auto-revisión de alcance y seguridad

- No se modificaron `package.json` ni `pnpm-lock.yaml`; no hay dependencias nuevas.
- No se modificaron páginas de Administración ni archivos del plan activo.
- No se cambiaron rutas públicas.
- No se tocaron acciones de username/onboarding ni datos `username`/`is_private`; el feature gate de Comunidad permanece intacto.
- El único propietario posible del upsert normal es `auth.uid()`; el cliente no puede insertar `user_id`; RLS mantiene aislamiento por propietario; UPDATE continúa limitado a `professional_enabled` y `push_enabled`.
- Next 14/React 18 se conservan; no quedan referencias a `useActionState`.
- Copy nuevo y modificado tiene ES/EN.
- Controles modificados conservan o alcanzan 44 px.
- Los IDs nativos ajenos a 7101–7107 no se cancelan ni restauran.

## Commits de implementación

- `fix(settings): secure preference upserts on React 18`
- `fix(settings): make native reminders recoverable`
- `fix(settings): expose accessible field states`
- `fix(settings): verify localized preference feedback`

## Preocupaciones y limitaciones restantes

1. pgTAP no se ejecutó por ausencia de Docker Desktop. Debe correrse `pnpm test:db` en un entorno con Docker antes de promover la migración.
2. No se ejecutó un evento de teclado real en navegador para Idioma; la UI usa radios nativos y toda la lógica propia de pendiente/éxito/error/rollback/refresh está cubierta en Vitest.
3. Esta ola siguió la batería final pedida (`type-check`, `lint`, `test`, `diff --check`); no ejecutó build ni Playwright.
4. El warning deprecatorio de `vite-tsconfig-paths` permanece como deuda preexistente de configuración.
