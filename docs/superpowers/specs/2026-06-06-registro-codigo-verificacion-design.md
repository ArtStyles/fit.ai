# Registro con código de verificación (OTP) — Diseño

**Fecha:** 2026-06-06
**Estado:** Aprobado para planificación

## Problema

El registro actual confirma la cuenta mediante un **enlace** de verificación que Supabase
envía por correo (`signUp` con `emailRedirectTo` en
`src/app/(auth)/register/RegisterForm.tsx`). Queremos sustituirlo por un **código de 6
dígitos** que el usuario escribe justo después de registrarse, con **10 minutos de validez**.

## Objetivo

- Tras pulsar "Crear cuenta", el usuario recibe un **código de 6 dígitos** por correo.
- En la **misma pantalla** se le pide escribir ese código para confirmar la cuenta.
- El código expira a los **10 minutos**.
- El usuario puede **reenviar** el código con un contador anti-spam.
- El correo muestra **solo el código** (sin enlace de respaldo).

## Enfoque elegido

**OTP nativo de Supabase.** Se reutiliza el `signUp` actual y la verificación se hace con
`supabase.auth.verifyOtp({ type: 'signup', email, token })`. No requiere tablas, endpoints
ni infraestructura nueva. Se descartaron: (B) un sistema de códigos propio con tabla y
endpoint — demasiado código y mantenimiento; (C) `signInWithOtp` — es para login sin
contraseña y no encaja con el registro con contraseña.

## Flujo

1. El usuario llena el formulario y pulsa **Crear cuenta** → `signUp` (igual que hoy, pero
   **sin** `emailRedirectTo`).
2. Supabase envía un correo con un **código de 6 dígitos** (validez 10 min).
3. El formulario se reemplaza, en la misma pantalla, por el paso **"Verifica tu correo"**:
   una sola casilla para el código de 6 dígitos + botón **Verificar**.
4. Al verificar → `verifyOtp({ type: 'signup', email, token })` crea la sesión → se redirige
   a `/onboarding` (mismo destino que hoy cuando hay sesión).
5. Botón **Reenviar código** (`supabase.auth.resend({ type: 'signup', email })`) con contador
   de **45 s** antes de poder volver a pedirlo.

## Configuración en el panel de Supabase (no es código)

Estos cambios los realiza la persona dueña del proyecto en el dashboard de Supabase; sin
ellos el correo seguiría llegando como enlace:

- **Auth → Email Templates → "Confirm signup":** reemplazar `{{ .ConfirmationURL }}` por un
  texto que muestre `{{ .Token }}` (el código de 6 dígitos).
- **Auth → Email OTP expiry:** establecer **600** segundos (10 minutos).
- Mantener **"Confirm email" activado**.

### Notas

- La expiración del OTP en Supabase es **global** para correos (también aplica a
  "restablecer contraseña" y magic links). 10 minutos es razonable también para esos casos,
  así que no supone un problema.
- El correo integrado de Supabase tiene un límite de envíos bajo. Para producción conviene
  configurar un **SMTP propio** (p. ej. Resend). **Fuera de alcance** de este cambio; se
  abordará en un paso posterior.

## Cambios de código

Todo el cambio se concentra en `src/app/(auth)/register/RegisterForm.tsx`.

- Introducir un **estado de paso**: `'form' | 'verify'`, guardando el `email` registrado.
- Quitar `emailRedirectTo` de la llamada a `signUp`.
- Cuando `signUp` responde **sin sesión** (confirmación de correo requerida) → pasar al paso
  `'verify'` en lugar del actual estado `check_email` con enlace.
- Nuevo sub-componente de verificación:
  - **Una sola casilla** de 6 dígitos: `inputMode="numeric"`, `autoComplete="one-time-code"`,
    `maxLength={6}`, estilo consistente con los inputs actuales (alto 44px / `h-11`, mismas
    clases de borde y focus).
  - Botón **Verificar** (con estado de carga, igual que el botón actual).
  - Botón/enlace **Reenviar código** con contador de 45 s.
  - Texto que indica a qué correo se envió el código.
- **Conservar** comportamientos actuales:
  - Cuenta ya existente: `data.user?.identities?.length === 0` → mensaje "Ya existe una
    cuenta con este correo".
  - Si `signUp` devuelve sesión (confirmación desactivada) → directo a `/onboarding`.
- **Eliminar**: el estado/rama `check_email`, su tarjeta de "Revisa tu correo" con enlace y
  el `PendingLink` "Ya confirmé mi correo".

## Manejo de errores

- **Código expirado o incorrecto** (`verifyOtp` error): "El código expiró o no es válido.
  Reenvía uno nuevo."
- **Formato inválido** (no son 6 dígitos): validación en cliente antes de llamar a
  `verifyOtp`.
- **Límite de reenvíos** (rate limit en `resend`): "Espera un momento antes de pedir otro
  código."
- Mantener el mapeo de errores de `signUp` existente (`getRegisterErrorMessage`).

## Pruebas

- **Manual end-to-end:** registro → recibir código en el correo → verificar → llegar a
  `/onboarding`. Casos adicionales: código incorrecto, código expirado, reenvío con contador.
- **Opcional (unitario):** validador del código de 6 dígitos y mapeo de mensajes de error de
  verificación (funciones puras, fáciles de testear).

## Fuera de alcance

- Sustituir el servicio de correo de Supabase por un SMTP propio (paso posterior).
- Cambios en el flujo de login o de restablecimiento de contraseña.
