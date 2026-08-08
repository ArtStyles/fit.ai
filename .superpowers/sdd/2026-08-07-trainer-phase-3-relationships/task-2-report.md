# Phase 3 — Task 2 report: servicios profesionales sin superficie comercial

## Alcance entregado

- Validación de los seis campos del servicio: nombre, descripción, modalidad, duración, contenido y cupo.
- Acciones de crear, editar y activar/desactivar protegidas por `requireActiveTrainerContext`.
- Propiedad verificada contra el `trainer_profile_id` activo del servidor; los identificadores inyectados en el formulario no forman parte de los writes.
- Cada write fija `billing_mode: 'free_preview'` y los tres valores comerciales a `null`.
- Rechazo explícito de `price`, `priceMinor`, `price_minor`, `currency`, `billingInterval`, `billing_interval`, `billingMode` y `billing_mode`.
- Formulario y props sin valores ni controles comerciales; Servicios se enlaza secundariamente desde Perfil profesional. La navegación principal conserva exactamente Resumen, Clientes, Rutinas, Solicitudes y Perfil.

## RED

Comando:

```text
pnpm vitest run src/lib/coaching/__tests__/serviceValidation.test.ts src/app/actions/__tests__/trainerServices.test.ts src/components/coaching/__tests__/trainerServiceForm.test.tsx
```

Resultado esperado antes de implementar: `exit 1`; tres archivos fallaron. Dos suites no pudieron cargar porque aún no existían `serviceValidation` y `TrainerServiceForm`, y las cinco pruebas de acciones fallaron porque aún no existía `trainerServices`.

## GREEN y verificación

```text
pnpm vitest run src/lib/coaching/__tests__/serviceValidation.test.ts src/app/actions/__tests__/trainerServices.test.ts src/components/coaching/__tests__/trainerServiceForm.test.tsx
```

Resultado: `3 passed`, `17 passed`.

```text
pnpm type-check
pnpm lint
git diff --check
```

Resultado: todos terminaron con `exit 0`.

```text
pnpm test
```

Resultado final: `147 passed`, `1254 passed`, `exit 0`.

## Archivos

- `src/lib/coaching/serviceValidation.ts`
- `src/lib/coaching/__tests__/serviceValidation.test.ts`
- `src/app/actions/trainerServices.ts`
- `src/app/actions/__tests__/trainerServices.test.ts`
- `src/app/(app)/coach/services/page.tsx`
- `src/components/coaching/TrainerServiceForm.tsx`
- `src/components/coaching/__tests__/trainerServiceForm.test.tsx`
- `src/app/(app)/coach/profile/page.tsx`
- `src/components/navigation/appNavigation.ts`

## Auto-revisión y concerns

- Confirmado: ningún prop/query de la ruta de servicios selecciona o expone precio, moneda, intervalo o modalidad de facturación.
- Confirmado: las escrituras hacen verificación explícita de propiedad antes de `update`, además de las políticas de la base de datos.
- Confirmado: el id de edición procede únicamente de `serviceId`; los campos `id`, `trainerProfileId` y `trainerUserId` inyectados no se propagan al write.
- Concern no bloqueante: Vitest informa la advertencia preexistente sobre `vite-tsconfig-paths`; no genera errores y no se modifica en esta tarea.
