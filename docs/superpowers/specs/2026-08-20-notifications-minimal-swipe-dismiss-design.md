# Notificaciones minimalistas con descarte por gesto

**Fecha:** 2026-08-20  
**Estado:** aprobado para implementacion

## Contexto

La pagina dedicada de notificaciones mezcla actualmente tres superficies grandes:
un resumen de conteo, una seccion de prioridad y el historial. En movil esa
jerarquia repite informacion y hace que un unico aviso ocupe casi toda la
pantalla. El aviso de actualizacion del plan tampoco puede descartarse de forma
duradera: se deriva del plan activo en cada carga y solo deja de mostrarse al
cumplirse su ventana temporal.

## Objetivo

Reducir la pagina a una bandeja clara y movil, y permitir que el usuario descarte
el aviso de la version actual del plan deslizando hacia la izquierda. El descarte
debe persistir entre cargas y dispositivos, pero una version posterior del plan
debe volver a generar un aviso visible.

## Experiencia aprobada

- Se elimina por completo la tarjeta "Centro personal".
- Se eliminan los rotulos "Prioridad" y "Requiere tu atencion".
- El aviso del plan pasa a ser una fila compacta con icono, titulo, nombre del
  plan, resumen de dos lineas y enlace "Ver plan".
- Un deslizamiento hacia la izquierda sigue el dedo y revela una accion
  "Quitar". Superar el umbral descarta el aviso con una salida animada.
- Escritorio, teclado y tecnologias de asistencia conservan una accion explicita
  "Quitar aviso del plan"; no se depende exclusivamente del gesto.
- El descarte es optimista. Si el servidor lo rechaza, la fila reaparece y se
  comunica el error mediante toast y region `aria-live`.
- Con movimiento reducido, la transicion evita desplazamientos amplios.
- El estado vacio del historial deja de vivir dentro de una tarjeta exterior
  adicional. Solo se muestra una superficie vacia compacta cuando no hay avisos.

## Persistencia

Se crea `notification_attention_dismissals`, identificada por
`(user_id, notice_key)`. La clave del aviso del plan se construye con el id y el
`updated_at` de la version activa:

```text
plan-update:<plan-id>:<plan-updated-at>
```

La carga solo considera `ai_notes` cuando la actualizacion es reciente y esa
clave no esta descartada. La accion de descarte vuelve a consultar el plan activo
y solo persiste la clave si coincide con la version vigente. La tabla usa RLS,
propietario predeterminado `auth.uid()` y permisos minimos de lectura e insercion.
No se borra ni modifica el plan.

## Seguridad y errores

- Un usuario solo puede leer e insertar sus propios descartes.
- El cliente no puede elegir `user_id`.
- Una clave malformada o perteneciente a una version anterior no se guarda.
- Repetir el mismo descarte es idempotente.
- Si la consulta de descartes falla, la pagina conserva el aviso para no ocultar
  informacion sin evidencia.

## Pruebas

- pgTAP para estructura, privilegios, RLS, propiedad e idempotencia.
- Acciones de servidor para clave por version, ocultacion persistente, version
  nueva visible, entrada invalida y fallo de escritura.
- Componente para umbral de gesto, salida optimista, restauracion ante error,
  alternativa accesible y movimiento reducido.
- Pagina para confirmar ausencia del resumen y de contenedores redundantes.
- Verificacion responsive real en movil y escritorio.

## Fuera de alcance

- Borrar notificaciones historicas de producto.
- Cambiar preferencias push o sociales.
- Convertir otros avisos de dashboard en elementos descartables.
- Cambiar el contenido o la generacion del plan.
