# Progreso organizado y objetivos personales

El usuario aprobó reorganizar Progreso antes de integrar objetivos. Se trabaja en `codex/android-free-training`, base de esta entrega `782efba`, manteniendo las cinco pestañas principales. La implementación sigue local y sin publicación remota.

## Layout aprobado

Tres vistas internas con componentes Radix: Resumen, Rendimiento y Medidas. Resumen contiene selector de periodo compacto 1/4/12/24 semanas, una fila de métricas y mapa muscular. Se elimina el hero genérico y se unifican las advertencias de registros parciales. La carga semanal y el detalle de constancia son desplegables. Rendimiento fusiona ejercicios destacados y marcas recientes en una sola lista; incorpora los objetivos sin duplicar sus tarjetas. Medidas conserva peso, grasa, cintura y tendencia con enlace a registrar o consultar el historial existente. Estados vacíos breves, sin métricas inventadas.

El mapa mantiene sus siluetas, escala, actividad registrada y acceso por teclado. Su lista completa de músculos queda bajo «Explorar músculos»; tocar la figura sigue abriendo el detalle. Los aportes y sesiones se consultan al explorar una zona. Desde un ejercicio se podrá abrir su objetivo en Rendimiento.

## Primera versión de objetivos

Hasta tres ejercicios elegidos por la persona. Cada uno permite seguir su evolución sin meta numérica o añadir una meta explícita: peso y repeticiones de una misma serie, o segundos por serie. Crear, editar meta y quitar seguimiento requieren acciones claras; quitar un objetivo conserva sesiones y ejercicios históricos.

Tarjetas con primer registro disponible, último resultado y mejor marca; detalle cronológico con enlaces a sesiones reales. Los objetivos consideran todo el historial disponible en el dispositivo y lo indican expresamente, independientemente del periodo del resumen. Una meta se alcanza solo si una misma serie registrada satisface sus condiciones; no se combinan máximos de series distintas ni se calculan capacidades estimadas. Una meta ya alcanzada en el pasado se describe como alcanzada en los registros. No se infiere crecimiento muscular, recuperación ni progreso a partir de constancia sin series.

Los registros temporizados conservan su medida en segundos por serie; los totales antiguos sin desglose no se convierten en series inventadas. Los registros editados recalculan la evolución, y una meta sin evidencia muestra un estado vacío.

## Persistencia e integración

Tabla privada `mobile_exercise_goals` dentro del estado SQLite existente, con dueño obligatorio, UUID estable, versión esperada, ejercicio y metadatos históricos, objetivo opcional y fechas. Máximo tres, sin ejercicios duplicados. Validar campos y sesión antes de mutar; no cruzar cuentas durante esperas. El respaldo privado transporta esta tabla, una descarga web no la elimina y su huella dispara respaldo después de cambios. No requiere columnas web ni una migración remota.

`PersonalGoalsSlot` es un límite vacío en web, sustituido mediante alias Vite por la implementación móvil. Así Progreso conserva un componente de presentación compartido y los objetivos utilizan únicamente datos de la cuenta móvil.

## Verificación

Refactorizar y verificar primero el layout; integrar después el slot de objetivos. Probar selección de vistas y periodo, accesibilidad, scroll/contención en 320/390/1440 px, estados vacíos/parciales, mapa/desglose, alta/edición/borrado de objetivos, identidad y versiones, series comparables, fechas, respaldo y recuperación offline. Ejecutar pruebas móviles y unidades afectadas, TypeScript, lint, build y recorridos de navegador sobre bundle real. Revisar independientemente. La evidencia física Android y la sincronización con cuentas reales no se presuponen.
