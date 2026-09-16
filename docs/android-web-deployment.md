# Despliegue web para Android 1.1.26

Fecha: 16 de septiembre de 2026. Autorización del propietario: desplegar los cambios pendientes de la auditoría Android.

## Resultado

- URL pública verificada: <https://fit-ai-kohl.vercel.app/>.
- Proyecto Vercel: `frank-james-hernandezs-projects/fit-ai`.
- Despliegue de producción: `dpl_2saQ9dA2YBFD1rqnA3V6n7LMAKb5`, estado **Ready** y promoción completada.
- Código de producto: commit `1aca8e5d648c62a70565b9285d1778acf661617b`, rama `codex/android-offline`. Los commits de exclusiones de despliegue posteriores no cambian la aplicación.
- Fuente: despliegue de GitHub reconstruido con el entorno **production**. Primero se creó con `autoAssignCustomDomains=false`; se promovió después de verificar el ledger y los objetos SQL de la migración.
- Supabase: `duqayqktljywufgxobbl`. Migración `20260916010000_verified_account_deletion.sql` aplicada; recibo detallado en `android-account-deletion-deployment.md`.

## Comprobaciones públicas

Resultado: **8/8** comprobaciones correctas el 16/09/2026 a las 17:12 UTC, directamente sobre el dominio público, sin seguir redirecciones a login.

| Comprobación | Resultado |
|---|---|
| `/delete-account`, español e inglés | 200 y contenido correspondiente |
| `/recover-password`, español e inglés | 200 y formulario correspondiente |
| `/es/privacidad` | 200 y texto actualizado de retención |
| `OPTIONS /api/account/delete` | 204 y CORS `*` |
| `POST /api/account/delete` sin token | 401, `auth_required` y CORS `*` |
| `POST /api/account/delete` con token inválido | 401, `auth_required` y CORS `*` |

La página de eliminación también se comprobó en navegador: título, contenido de retención, enlace a login, recuperación, privacidad y destino del enlace para saltar al contenido presentes.

La página de recuperación del candidato compilado con variables de producción devuelve 200 y contiene el proyecto público Supabase esperado. Vercel confirma la existencia de `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en producción. Sus valores secretos no se exportaron ni imprimieron. Las pruebas sin identidad válida no ejecutan la limpieza ni demuestran un borrado integral real.

## Límites y pendientes

- El panel de Supabase requiere iniciar sesión para comprobar/configurar SMTP y la plantilla de recuperación con `{{ .Token }}`. El formulario publicado no prueba entrega de correo.
- No se enviaron correos ni se eliminaron cuentas reales. Sigue pendiente un recorrido con cuentas dedicadas a pruebas.
- No se publicó en Play Console ni se probó un teléfono físico. APK/AAB 1.1.26 conservan los hashes del informe de remediación.
- Firebase nativo continúa sin configurar; no se promete recepción push con la app cerrada.
- El remoto `main` no se modificó. La publicación de producción se realizó explícitamente desde la rama Android autorizada; un despliegue futuro de `main` debe incorporar estas correcciones para conservarlas.

Evidencia local: `.artifacts/playstore-deploy-2026-09-16/web-production-smoke.json`, `vercel-production-created.json`, `vercel-production-promote.log`, `vercel-production-inspect.log` y los recibos de Supabase.
