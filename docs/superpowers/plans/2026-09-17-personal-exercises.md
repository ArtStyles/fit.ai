# Registro claro y ejercicios privados — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Each unit has scoped ownership and cross-review before integration.

**Goal:** Facilitar registrar entrenamientos y añadir ejercicios propios sin fotos.

**Architecture:** Mantener borradores y guardado existentes, usar ExerciseCatalogDialog compartido, plataforma de creación solo Android, SQLite transaccional e ilustraciones vectoriales locales del mapa actual.

**Tech Stack:** React, TypeScript, SVG, SQLite, Vitest, Playwright, Capacitor.

**Spec:** `docs/superpowers/specs/2026-09-17-personal-exercises-design.md`.

## Restricciones

- No modificar main ni catálogo público/remoto. Solo Android y datos privados de la cuenta.
- Conservar navegación, borradores, idempotencia y permisos. Foto y descripción opcionales.
- Reutilizar componentes, geometría/licencia y estilos existentes. ES/EN, móvil y offline.

## Unidades

- [x] Persistencia privada y adaptadores: contrato/platform, SQLite, catálogo personal, ficha, guards Plan/free, backup y pruebas de privacidad.
- [x] Selector compartido: localizar, activar creación solo en contexto personal, formulario opcional y retorno con selección pendiente; pruebas.
- [x] Registro libre: jerarquía compacta, opcionales plegados y selector común con batches sin perder campos/borrador; pruebas.
- [x] Ilustraciones genéricas: regiones existentes, assets SVG locales, allowlist y licencia, validar visualmente.
- [x] Integración: revisión cruzada, recorridos de navegador, datos/filtros/foco/edición/persistencia, tipos/lint/tests.
- [x] Entrega Android: versión, APK firmada, verificación assets/firma y documentación; integración en la rama Android.

Evidencia y límites: `docs/android-personal-exercises.md`. Prueba física pendiente.
