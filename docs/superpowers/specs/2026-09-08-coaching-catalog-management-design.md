# Corrección de catálogo y gestión de acompañamientos

El usuario aprobó avanzar con los hallazgos del diagnóstico. Este trabajo corrige el rechazo engañoso de rutinas con ejercicios retirados y presenta varios acompañamientos por persona. La preparación inicial fue local, sin publicación ni cambios en cuentas reales. Una autorización posterior incluye integrar, aplicar las migraciones, hacer commit y push a main; sus comprobaciones se registran en `docs/operations/coaching-catalog-management.md`.

## Rutinas y ejercicios retirados

Una plantilla con todos sus días puede contener referencias históricas a ejercicios que Catálogo V1 retiró. El entrenador puede leer esas referencias, pero no enviarlas como una prescripción nueva. Se conservará esa separación: ninguna sustitución automática, ampliación general a ejercicios privados ni modificación de sesiones/versiones históricas.

La asignación y la publicación de revisiones distinguirán `TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE` (días o ejercicios realmente faltantes) de `TRAINER_ASSIGNMENT_TEMPLATE_EXERCISE_UNAVAILABLE` (referencia ausente o no pública). La traducción de este último será: `La rutina contiene ejercicios que ya no están disponibles. Sustitúyelos antes de enviarla.` El servidor seguirá validando cuentas, relación, consentimiento, propiedad, claves idempotentes y catálogo.

El editor consultará `is_public` para cada referencia. Cada ejercicio retirado tendrá una indicación visible y una acción explícita para sustituirlo. El selector conservará la identidad actual aunque no forme parte de las opciones públicas: editar series o notas nunca elegirá silenciosamente el primer ejercicio de la lista. Hasta elegir y guardar una sustitución válida, la referencia persistida y todos sus parámetros permanecerán intactos. La nueva selección conservará id de fila, orden, series, repeticiones, peso, RPE, descanso y notas salvo cambios expresos del entrenador.

El envío/publicación se bloqueará con una explicación visible mientras haya referencias retiradas, cambios sin guardar o mutaciones estructurales pendientes. Las comprobaciones del servidor seguirán siendo definitivas ante datos que cambien después de cargar la página. Los contadores distinguirán días, ejercicios y series con los datos guardados; no se inventará una causa para la diferencia de pantalla 3×3 frente a la lectura remota 1/2/3.

## Lista profesional de acompañamientos

`/coach/requests` conservará la cola de solicitudes pendientes, con identidad, servicio, mensaje, fecha y Aceptar/Rechazar. La gestión de relaciones pasará a `/coach/clients`, con enlaces y contadores independientes. No habrá bloques anónimos de Finalizar debajo de solicitudes.

Cada acompañamiento actual (activo o pausado) se representará una vez por `relationshipId`: foto/iniciales, nombre y @usuario si existe, servicio, estado e inicio. Móvil: tarjetas apiladas, nombre completo visible y controles de al menos 44 px. Escritorio: filas amplias con identidad a la izquierda y acciones a la derecha, sin desplazamiento horizontal. Se conservarán la evidencia profesional, cumplimiento, alertas y filtro de atención existentes para las relaciones donde el entrenador tiene acceso de seguimiento; no habrá una segunda lista duplicada de las mismas personas.

Ver cliente y Asignar rutina estarán disponibles solo cuando la relación y las cuentas estén activas y exista consentimiento de entrenamiento. Finalizar será secundario y su confirmación identificará a la persona y el servicio; cancelación, espera, mensajes e idempotencia serán propios de cada fila. Sin identidad utilizable, se mostrará el problema y no habrá finalización anónima accionable. Reanudar seguirá siendo una acción del cliente. Se mantiene un entrenador activo por cliente y varios clientes por entrenador. No se añade historial de finalizadas, búsqueda ni nuevos estados de ciclo de vida.

Una nueva RPC de lectura devolverá exclusivamente metadatos mínimos de gestión de las relaciones propias del entrenador autenticado, incluidas pausadas o sin consentimiento. Validará cuenta y perfil profesional activos. No expondrá medidas, progreso, historial personal, prescripción ni campos privados de perfil; tampoco ampliará RLS ni el helper de acceso al seguimiento. La identidad procederá de la proyección pública existente. Un fallo del resumen de seguimiento no ocultará relaciones que se pueden gestionar; un fallo de gestión no se interpretará como cero relaciones.

Los contadores de solicitudes pendientes, acompañamientos activos y pausados tendrán semánticas explícitas. Aceptar/finalizar/cambiar consentimiento revalidará `/coach`, `/coach/requests` y `/coach/clients` cuando corresponda. Los datos de progreso seguirán sujetos a las comprobaciones existentes del servidor, aunque cambie el estado después de renderizar la tarjeta.

## Verificación y límites

Se probará el recorrido completo cambio V1 → lectura de una plantilla 3×3 → asignación/revisión/reemplazo explícito, usando la identidad real de API en una base desechable. Se probará gestión con tres clientes, cuentas inactivas, otro entrenador, consentimiento revocado, pausa, homónimos y ausencia de identidad; las respuestas de gestión no contendrán datos de progreso. Se verificará cada finalización por su identificador exacto sin modificar relaciones reales.

Se renderizarán las pantallas afectadas a 390 y 1280 px y se comprobarán teclado, foco, nombres visibles y ausencia de desbordamiento. Habrá un único ejecutor Vite/Vitest de Vekira a la vez, coordinado con las tareas de auth y notificaciones. Se crearán migraciones nuevas en `infra/supabase/migrations`; no se editarán las ya publicadas ni se aplicarán al remoto en esta fase.
