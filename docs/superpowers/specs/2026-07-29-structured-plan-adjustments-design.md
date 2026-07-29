# Ajustes estructurados del plan

## Objetivo

Reemplazar el flujo “Pedir ajuste al coach” por “Ajustar plan”, una interfaz
estructurada que envía instrucciones directamente al motor determinista de
planes. La IA seguirá disponible para conversación y explicaciones, pero no
interpretará ni aplicará cambios en planes.

## Alcance

El usuario podrá solicitar un ajuste por operación para el plan activo:

- cambiar la cantidad de días semanales;
- cambiar la duración de las sesiones;
- reducir o aumentar la intensidad;
- marcar equipamiento como temporalmente no disponible;
- cambiar las modalidades de cardio preferidas para el plan;
- sustituir un ejercicio existente.

Los cambios afectan solamente al plan activo. Las preferencias permanentes se
seguirán administrando desde Perfil y serán la base de futuras regeneraciones.

No se incluyen intenciones compuestas, edición manual de cada prescripción ni
cambios relacionados con dolor, lesión o síntomas.

## Experiencia de usuario

La acción del menú se llamará “Ajustar plan” y usará iconografía neutral, sin
referencias al coach ni a IA.

Al activarla se abrirá un único diálogo. El usuario elegirá una categoría y
verá únicamente los controles necesarios para esa categoría:

- días: selector entre 2 y 6;
- duración: selector de 30, 45, 60 o 90 minutos;
- intensidad: “más suave” o “más intensa”;
- equipamiento: selección múltiple limitada al equipamiento disponible;
- cardio: selección múltiple entre modalidades compatibles;
- ejercicio: selector de ejercicios presentes en el plan.

Solo se podrá enviar una categoría por operación. Después de seleccionar un
valor, el usuario solicitará una vista previa. La vista previa mostrará el
resumen de diferencias que ya produce el motor: días antes y después,
ejercicios añadidos o retirados, prescripciones modificadas y advertencias.

El usuario podrá volver a editar el ajuste o confirmarlo. La confirmación
reemplazará el plan activo completo por la versión validada.

## Arquitectura

### Interfaz

`PlanAdjustButton` conservará la responsabilidad de abrir el diálogo y manejar
los estados de selección, carga, vista previa, error y confirmación. Recibirá
desde la página del plan las opciones que ya fueron consultadas en el servidor:
equipamiento disponible, modalidades de cardio y ejercicios del plan.

La interfaz construirá un `PlanAdjustmentIntent` tipado. No enviará texto libre.

### Acciones del servidor

La acción de vista previa recibirá `planId` y un valor desconocido. Antes de
invocar al motor:

1. autenticará al usuario;
2. comprobará que el plan le pertenece y está activo;
3. validará en tiempo de ejecución el tipo y los valores de la intención;
4. restringirá equipamiento y ejercicios a los valores permitidos por el
   perfil y el plan activos;
5. ejecutará `generatePlan` en modo `plan_adjustment` con `previewOnly`.

La acción de aplicación repetirá las validaciones. No confiará en la intención
devuelta al navegador ni en una vista previa anterior.

Los ajustes estructurados no consumirán límites ni presupuesto de IA.

### Motor

El contrato `PlanAdjustmentIntent` y `previewPlanAdjustment` seguirán siendo el
límite entre la interfaz y el motor. El motor continuará controlando selección
de ejercicios, volumen, duración, equipamiento, restricciones, preparación y
calidad.

`weekly_regeneration` permanecerá separado: adapta automáticamente la siguiente
semana mediante el historial de adherencia y esfuerzo. `plan_adjustment`
aplicará una decisión explícita del usuario al plan activo.

### Eliminación del intérprete de IA

Se retirará `planAdjustmentIntent.ts` y sus pruebas. `adjustPlan.ts` dejará de
importar el cliente, modelos, registro de consumo o límites de IA para los
ajustes semanales.

El coach conversacional y los ajustes locales de una rutina individual quedan
fuera de este cambio. El alcance se limita a la acción semanal mostrada en
“Acciones del plan”.

## Seguridad y errores

- Una intención mal formada devolverá un error explícito y no llegará al motor.
- Un ejercicio o equipo ajeno al contexto activo será rechazado.
- Si el plan cambió entre vista previa y aplicación, la aplicación se
  revalidará contra el estado actual.
- Si el motor rechaza el resultado, se mostrará su error sin persistir cambios.
- Los cambios relacionados con salud no se ofrecerán en el diálogo. El flujo de
  preparación existente seguirá siendo la vía para revisar esas condiciones.
- La ausencia de opciones válidas deshabilitará la categoría correspondiente.

## Internacionalización y accesibilidad

Todos los textos nuevos tendrán traducción en español e inglés. Los grupos de
opciones usarán etiquetas accesibles, estado seleccionado visible, navegación
por teclado y mensajes de carga y error anunciables.

## Pruebas

Las pruebas unitarias cubrirán:

- validación de cada variante de `PlanAdjustmentIntent`;
- rechazo de valores, equipamiento y ejercicios no permitidos;
- construcción de intenciones desde los controles;
- vista previa y aplicación sin llamar a servicios de IA;
- textos localizados y ausencia de referencias al coach en esta acción;
- comportamiento del motor para los seis tipos de ajuste ya soportados.

La verificación final incluirá pruebas focalizadas, suite completa, comprobación
de tipos y lint. Cuando el entorno lo permita, se comprobará visualmente el
diálogo en viewport móvil y escritorio.

## Criterios de aceptación

1. “Acciones del plan” muestra “Ajustar plan” y no “Pedir ajuste al coach”.
2. El diálogo no contiene texto libre ni lenguaje relacionado con IA.
3. Cada opción produce una intención estructurada validada por el servidor.
4. Vista previa y aplicación pasan únicamente por el motor determinista.
5. El flujo no llama a Anthropic ni consume límites o presupuesto de IA.
6. “Regenerar semana” conserva su comportamiento adaptativo independiente.
7. Los datos manipulados desde el cliente son rechazados antes de llegar al
   motor.
8. Las pruebas y comprobaciones estáticas relevantes pasan.
