# Compañero de constancia

Diseño aprobado por el usuario el 10 de septiembre de 2026, incluida la vista de saludo personal. Referencia visual: `companero-constancia.html` de esta conversación. Implementación en el worktree Android existente; sin publicar ni modificar datos remotos en esta fase.

## Experiencia

- Una tarjeta compacta en Inicio, inmediatamente después del entrenamiento de hoy. Las cinco pestañas se conservan.
- `/companion` presenta invitación, aceptación, resumen semanal y saludo; enlaces a `?view=message` y `?view=invite` abren esas vistas.
- Un compañero mutuo por persona; una invitación pendiente ocupa el vínculo hasta cancelación, rechazo o vencimiento. Un código aleatorio caduca en siete días. Antes de enviar se revisa nombre y foto del destinatario; aceptar explica nombre, foto, resumen semanal y saludos.
- Comparten únicamente sesiones completadas y objetivo de la semana, nombre, foto y un saludo opcional. No se transmiten detalles de rutinas, medidas ni datos médicos.
- Saludo de texto opcional de hasta 120 caracteres Unicode, medido igual en cliente y PostgreSQL (puntos Unicode, sin contar unidades UTF-16 como caracteres). Se normaliza NFC; vacío o espacios envía `👏 ¡Bien hecho!`. Se muestra como texto, nunca HTML.
- Un envío por usuario y día UTC; la interfaz muestra la próxima hora local disponible. El cambio de compañero no reinicia el límite. Idempotencia por UUID protege reintentos y doble pulsación. Sólo el éxito confirmado consume el cupo.
- El borrador se conserva en memoria al cancelar o fallar. Se elimina al desvincularse, desmontar la vista o cambiar de cuenta. Sin conexión se puede escribir, pero no aceptar, invitar, desvincular ni enviar.
- Invitaciones y saludos usan la campanita existente. Notificaciones de compañero se sustituyen por tipo/destinatario para mantener almacenamiento acotado; no se agrega un feed, chat, archivos o respuestas encadenadas.

## Datos y seguridad

Las funciones PostgreSQL autenticadas gestionan códigos, relación y cupo diario de forma atómica. Las tablas auxiliares privadas no admiten acceso directo desde el cliente. Cada función deriva el usuario de `auth.uid()`, comprueba participación y bloquea filas de usuarios en orden estable. No se acepta un propietario indicado por el cliente.

El resumen se calcula en servidor mediante sesiones canónicas y el respaldo privado de Android, con deduplicación por sesión y lectura defensiva del JSON. No se descarga el respaldo de la otra persona. Semana y meta se presentan con su zona horaria y fecha de actualización.

Una capa compartida valida argumentos, propietario y respuestas RPC; las acciones web y el adaptador Android reutilizan este contrato. Android conserva una caché por cuenta durante un máximo de 24 horas, marcada como resumen anterior. Una respuesta tardía tras salir/cambiar de cuenta no actualiza la caché ni la interfaz. Revocaciones confirmadas invalidan el vínculo local.

## Verificación

Pruebas PostgreSQL reales en contenedor desechable: permisos, cruces de solicitudes, carreras de aceptación/envío, vencimiento, cancelación, revocación, límites, deduplicación e integración de sesiones web/APK. Pruebas de contrato y adaptador con respuestas inválidas, sesión cambiada y red fallida. Pruebas de vistas en móvil y escritorio para invitación, consentimiento, saludo, error, desconexión y foco.

La entrega distinguirá código/build local, migración pendiente de aplicación y comportamiento en dispositivo físico. No se afirmará que la función está disponible entre cuentas reales antes de desplegar la migración y comprobarla.
