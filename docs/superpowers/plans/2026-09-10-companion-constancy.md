# Companion Constancy Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent tasks; preserve all pre-existing dirty changes.

**Goal:** Integrar el diseño aprobado de un compañero mutuo con resumen semanal y saludo personal limitado.

**Architecture:** RPC autenticado y transaccional en Supabase, contrato TypeScript común y acciones web/Android. Componentes compartidos, tarjeta después del entrenamiento y notificaciones existentes.

**Tech Stack:** Next/React, Capacitor/Vite, SQLite, Supabase PostgreSQL, Vitest/Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-companion-constancy-design.md`

## Global Constraints

- Trabajar en `D:/work/project/.worktrees/android-offline`; conservar cambios anteriores; no commit, push ni despliegue remoto.
- Un vínculo activo o pendiente por persona; código de siete días; un saludo por día UTC y usuario; 120 puntos Unicode después de NFC.
- Identidad y resumen mínimo únicamente; no exponer respaldo, rutina o salud de otra cuenta.
- SQLite y el servidor comparten resultados validados; sin escrituras remotas offline ni caché entre cuentas.

## Task 1: Contrato y validación compartidos

Files: `src/lib/companions/{types,validation,client}.ts`, `src/lib/companions/__tests__/client.test.ts`, `src/app/actions/companions.ts`.

Interfaces: `CompanionResult<T> = {ok:true,value:T}|{ok:false,code:string,error:string}`. `createCompanionClient({rpc,viewerId})` produce loadCompanion, getCompanionCode, previewCompanionCode, sendCompanionInvitation, respondCompanionInvitation, cancelCompanionInvitation, leaveCompanion y sendCompanionGreeting. Las mutaciones devuelven un `CompanionSnapshot` completo y del mismo propietario.

- [x] Escribir pruebas de respuesta ajena/malformada, Unicode y límite, UUID/código inválido, fallos RPC y argumentos de acciones.
- [x] Ejecutar RED, implementar parser/cliente y comprobar GREEN: `pnpm exec vitest run --project unit src/lib/companions/__tests__/client.test.ts`.
- [x] Acciones web usan `requireAppUserContext` y revalidan `/companion`, `/dashboard` y `/notifications` después de mutar.

## Task 2: Persistencia y autorización

Files: `infra/supabase/migrations/20260912010000_companion_constancy.sql`, `mobile/src/original/{run-companion-postgres.mjs,companion-postgres-contract.sql}`.

Interfaces RPC: `get_companion_state`, `get_companion_invite_code`, `preview_companion_invite_code(p_code)`, `request_companion(p_code)`, `respond_companion(p_relationship_id,p_accept)`, `cancel_companion_request(p_relationship_id)`, `leave_companion(p_relationship_id)`, `send_companion_greeting(p_relationship_id,p_message,p_request_id)`.

- [x] Contratos SQL fallan antes de la migración; comprueban `auth.uid()`/ACL, vínculo único, códigos y expiración, saludos y conteo mínimo de ambos orígenes.
- [x] Añadir tablas privadas y funciones con search_path fijo, ACL explícitas, locks ordenados y notificaciones atómicas.
- [x] Ejecutar pruebas PostgreSQL reales y carreras en contenedor dedicado; nunca resetear un stack existente o remoto.

## Task 3: Adaptación Android

Files: `mobile/src/original/companion-actions.ts`, `mobile/src/original/__tests__/companion-actions.test.ts`.

- [x] Escribir pruebas de cuenta/epoch, caché de 24 horas, revalidación, fallo ambiguo y revocación.
- [x] Adaptador obtiene cliente autenticado de la cuenta activa y reutiliza factory compartida. Comprueba la generación de sesión después de cada await antes de publicar resultados.
- [x] Ejecutar suite móvil nueva y `pnpm mobile:test`.

## Task 4: Vistas e integración

Files: `src/components/companions/*`, sus fixtures/tests, `src/app/(app)/companion/{page,loading}.tsx`, `src/components/dashboard/DashboardWeekJourney.tsx`, `src/app/(app)/dashboard/page.tsx`, `mobile/src/original/routes.tsx`, `mobile/vite.config.ts`.

- [x] Probar primero la interacción con acciones de prueba: invitación revisada, aceptación, borrador, duplicados, reintento, desconexión, confirmación de salida y límites.
- [x] Implementar componentes usando PageTopBar y las fuentes/tokens actuales. No añadir otra navegación global.
- [x] Pasar CompanionCard como slot del recorrido después de TodayJourneyCard; añadir ruta y alias de acciones a Android.
- [x] Renderizar a 320/390/1440 px y comprobar foco, teclado, errores y contenido largo; ejecutar las suites relacionadas de dashboard/notificaciones.

## Task 5: Verificación y entrega

- [x] TypeScript web/móvil, lint del alcance y `git diff --check`.
- [x] `pnpm mobile:build` y recorrido sobre el build real con servicios controlados y SQLite.
- [x] Revisión cruzada final de seguridad y contrato; resolver hallazgos antes de informar éxito.
- [x] Documentar comandos, resultados y frontera local/remota en `docs/companion-constancy.md`.

## Entrega posterior autorizada

El usuario pidió desplegar Supabase y generar la APK. El 10 de septiembre se aplicaron las tres migraciones Android/compañeros pendientes, se verificó el ledger de diez entradas y preflight 61, y se entregó la APK firmada 1.1.10-offline (código 12). Los límites de no despliegue anteriores corresponden a la fase de implementación. Evidencia y alcance final en `docs/companion-constancy.md`.
