# Puerta operativa del piloto de entrenadores

## Estado de salida

**BLOQUEADO.** No invitar entrenadores ni clientes hasta que el proyecto remoto tenga las migraciones 040–058 en orden, incluidas `056_trainer_template_exercise_batch_append.sql`, `057_trainer_assignment_decline.sql` y `058_training_profile_consent_regrant.sql`, `trainer_security_preflight() = 58`, las divergencias ISO profesionales sean `0`, el journey E2E real termine en verde y todas las firmas de la tabla **Aprobación previa al lanzamiento** estén completas. Que la migración esté confirmada en Git no demuestra su aplicación remota. Las revisiones de los días 7 y 14 se firman después de iniciar el piloto y no forman parte de la puerta previa.

El piloto mantiene `COMMUNITY_ENABLED=false`. El código y los datos de Comunidad se conservan detrás de su bandera, sin eliminarlos. Precios, planes comerciales, checkout, pagos, mensajería privada y reseñas permanecen ocultos; los servicios del piloto son gratuitos. El `/chat` actual de IA no se considera mensajería privada entrenador-cliente.

## Entrada obligatoria

- [ ] Seleccionar entre 3 y 5 entrenadores con cuenta activa y verificación administrativa terminada.
- [ ] Revisar cada credencial contra la fuente emisora y registrar evidencia/código de verificación sin copiar documentos ni contacto privado a tickets.
- [ ] Coordinar por contacto externo cualquier entrevista técnica necesaria; registrar fecha, medio, estado y resultado separando nota pública de nota interna.
- [ ] Confirmar que cada cliente recibió la explicación del piloto y otorgó consentimiento informado de perfil de entrenamiento antes de aceptar una solicitud.
- [ ] Confirmar que el consentimiento de medidas es independiente, opcional y revocable con efecto en la siguiente lectura.
- [ ] Asignar un canal de soporte operativo y un responsable titular de incidentes con suplente.
- [ ] Verificar respaldo/restauración, migraciones 040–058, `trainer_security_preflight() = 58`, `056_trainer_template_exercise_batch_append.sql`, `057_trainer_assignment_decline.sql`, `058_training_profile_consent_regrant.sql`, divergencias ISO profesionales `= 0`, matriz de autorización, seguridad x3, accesibilidad, aceptación responsiva del editor, build, auditoría y journey E2E conforme al [runbook](./trainer-marketplace-runbook.md).
- [ ] Ejecutar `pnpm test:db:trainers` en base Docker fresca y, solo después del preflight remoto 58 y de confirmar divergencias ISO profesionales `= 0`, `pnpm test:e2e:trainer-marketplace`; no usar el Playwright genérico ni reutilizar un servidor existente para este journey destructivo.
- [ ] Antes de reanudar invitaciones, completar una propuesta y una revisión sintéticas que incluyan lunes (`1`) y domingo (`7`), y confirmar que la auditoría ISO sigue en `0`.
- [ ] Obtener aprobación conjunta de operación, privacidad y seguridad.

## Evidencia funcional previa

- [ ] Solicitud profesional: borrador, credencial, envío, cambios, reenvío, entrevista externa registrada y aprobación.
- [ ] Directorio: solo perfiles activos; servicios gratuitos sin precio, moneda, plan o checkout.
- [ ] Solicitudes abiertas: varias pendientes y una sola aceptación; las competidoras quedan canceladas y solo existe una relación activa.
- [ ] Rutina profesional: propuesta, rechazo opcional e idempotente con un solo aviso/audit y carrera aceptar frente a rechazar con un único ganador en `pnpm test:db:trainers`; aceptación y materialización ISO en el journey E2E remoto; plan principal de solo lectura y ejecución sin controles de edición. No presentar la cobertura DB del rechazo como si el E2E remoto ya la ejecutara.
- [ ] Editor de plantilla: en Day A añadir Prensa y Gemelos juntos, añadir Zancada después, editarla a 4 × 8, RPE 8 y 90 s, reordenarla sobre Gemelos, recargar y confirmar persistencia; al cambiar el nombre, la asignación se bloquea hasta «Guardar detalles», después se abre asignación y publicación de revisión; a 390 px no hay desbordamiento horizontal.
- [ ] Evidencia: sesión y resultados asociados a la versión autorizada; una revisión concurrente no altera la sesión iniciada.
- [ ] Revocación: medidas ocultas en la siguiente lectura; finalizar relación corta el acceso del entrenador sin borrar el historial del cliente.
- [ ] Suspensión/reanudación: administrador autenticado suspende, cuenta y perfil se restablecen atómicamente, y solo el cliente reanuda con consentimiento nuevo.
- [ ] Exclusiones visibles: `/feed` redirige a `/trainers`; sin Comunidad, pagos/precios/planes, checkout, mensajería privada, reseñas ni edición cliente de una rutina profesional.

## Seguimiento semanal

Registrar solo agregados sin emails, teléfonos, notas libres, medidas, IDs de storage ni identificadores de clientes.

- [ ] Errores por código de dominio y tasa de journeys fallidos.
- [ ] Adherencia agregada: sesiones prescritas, completadas y omitidas.
- [ ] Privacidad: revocaciones efectivas, intentos denegados, incidentes y accesos administrativos.
- [ ] Integridad: asignaciones activas duplicadas, versiones incongruentes, planes profesionales mutados y logs perdidos; todos deben ser cero.
- [ ] Revisar resultados y feedback el día 7.
- [ ] Revisar continuidad, privacidad y decisión de ampliar/cerrar el día 14.

## Criterios de parada inmediata

Detener nuevas solicitudes y publicaciones, suspender al actor cuando corresponda y ejecutar el runbook si ocurre cualquiera de estos eventos:

- acceso no autorizado, IDOR o lectura posterior a revocación/suspensión;
- corrupción, doble activación o mutación cliente de un plan profesional;
- pérdida, alteración o imposibilidad de correlacionar logs/auditoría;
- consentimiento ausente o revocación que no surte efecto en la siguiente operación;
- fuga de contacto, credenciales, notas, medidas o rutas de storage en analytics/logs.

Rollback: conservar datos/migraciones 040–058 y corregir solo hacia delante; en un entorno ya desplegado no repetir la 045 ni la secuencia histórica 040–058 sobre evidencia posterior a la 058. No restaurar la sustracción defectuosa de días, no borrar tablas, columnas, auditoría ni ejercicios anexados, ni reescribir el historial de migraciones. Seguir [Respuesta a incidentes y Rollback](./trainer-marketplace-runbook.md#respuesta-a-incidentes).

## Aprobación previa al lanzamiento (completar manualmente)

| Puerta | Responsable | Fecha UTC | Evidencia no sensible | Firma/aprobación |
|---|---|---|---|---|
| Migraciones 040–058, `056_trainer_template_exercise_batch_append.sql`, `057_trainer_assignment_decline.sql`, `058_training_profile_consent_regrant.sql`, preflight 58 y divergencias ISO profesionales 0 |  |  |  |  |
| Journey E2E real |  |  |  |  |
| Credenciales e entrevistas (3–5) |  |  |  |  |
| Consentimiento y privacidad |  |  |  |  |
| Soporte e incidentes |  |  |  |  |
| Respaldo, restauración y rollback |  |  |  |  |

## Seguimiento posterior al lanzamiento (mantener en blanco hasta la fecha)

| Revisión | Responsable | Fecha UTC | Evidencia no sensible | Firma/aprobación |
|---|---|---|---|---|
| Revisión día 7 |  |  |  |  |
| Revisión día 14 / cierre |  |  |  |  |

Las tablas vacías no constituyen aprobación. El piloto sigue bloqueado hasta completar todas las filas previas al lanzamiento y adjuntar evidencia verificable no sensible. Las filas de seguimiento se completan solo cuando llegue cada fecha.
