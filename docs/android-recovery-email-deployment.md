# Configuración del correo de recuperación

Proyecto: `duqayqktljywufgxobbl` (`fitness-app`). Revisión del 16 de septiembre de 2026, mediante el acceso a Supabase autorizado por el propietario.

## Resultado verificado

La plantilla remota **Reset password** se actualizó para incluir `{{ .Token }}` visible y las instrucciones de introducirlo en «Recuperar contraseña» de Vekira, en español e inglés. La lectura posterior confirmó que Supabase guardó exactamente el contenido enviado.

| Configuración consultada | Valor observado |
| --- | --- |
| Proveedor de autenticación por correo | Habilitado |
| Longitud del código | 8 dígitos; el formulario admite de 6 a 8 |
| Caducidad del código | 3.600 segundos |
| Site URL | `https://fit-ai-kohl.vercel.app/` |
| Hook de envío de correo | Deshabilitado |
| SMTP propio | Sin host, puerto, usuario, contraseña ni remitente configurados |

La modificación solicitó únicamente `mailer_templates_recovery_content`. La primera respuesta reflejó también un cambio en el mapa `mailer_templates_custom_contents`, que el editor oficial utiliza para indicar las plantillas personalizadas. Los demás campos, incluido el contenido de las otras plantillas, permanecieron idénticos. No se enviaron correos ni se modificaron cuentas.

## Ajuste final preparado

La revisión del flujo detectó que el enlace heredado `{{ .ConfirmationURL }}` no permite completar el cambio de contraseña con esta implementación. `src/lib/auth/passwordRecovery.ts` solicita y verifica el código; el formulario usa un cliente temporal con `detectSessionInUrl: false` y exige esa verificación antes de mostrar la contraseña nueva. El callback general dirige a `/dashboard` y no procesa una recuperación.

La plantilla revisada está en `infra/supabase/templates/recovery.html`: conserva el código y retira ese enlace. **Su publicación final está pendiente de renovar el acceso**: una nueva consulta y la CLI oficial devolvieron `401 Unauthorized` después del guardado inicial. Se solicitó al propietario un nuevo código de acceso. La plantilla remota observada por última vez todavía contiene tanto el código como el enlace heredado.

El cambio de plantilla se aplica mediante la Management API o el panel de Supabase; un commit o un despliegue de Vercel no lo aplica automáticamente.

## Pendiente para correo público

1. Completar la publicación final de la plantilla y comparar su contenido remoto con el archivo revisado.
2. Elegir un proveedor SMTP y un remitente autorizado. El propietario debe indicar qué proveedor y dominio tiene disponibles; no se solicitan contraseñas por chat.
3. Configurar las credenciales en el proveedor/Supabase y comprobar la autenticación del dominio cuando corresponda. Verificar los límites de envío antes de abrir el registro público.
4. Realizar una prueba expresamente autorizada con un correo controlado: recepción, código incorrecto/caducado, reenvío, cambio de contraseña y login con la nueva. Comprobar también que cancelar conserva la cuenta local activa.

El servicio predeterminado de Supabase restringe los destinatarios a direcciones del equipo autorizado y no está destinado a producción. Guardar una plantilla no acredita entrega de correo. Esta revisión no sustituye el recorrido en un dispositivo Android ni habilita por sí sola la publicación en Play Store.

Evidencias locales sin valores secretos: `.artifacts/playstore-deploy-2026-09-16/auth-config-token-addition.json`, `auth-config-final.json` y los archivos de revisión de la plantilla. Los archivos denominados `auth-config-before.json` y `recovery-template-before.html` fueron sobrescritos por una consulta posterior; no deben utilizarse como copia de la configuración original.

Referencias: [plantillas y uso de OTP](https://supabase.com/docs/guides/auth/auth-email-templates), [requisitos de SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [editor oficial de plantillas](https://github.com/supabase/supabase/blob/master/apps/studio/components/interfaces/Auth/EmailTemplates/TemplateEditor.tsx).
