# Registro libre en Android

El usuario aprobó el recorrido y pidió crear una rama desde `codex/android-offline` y comenzar. Base verificada: `826315b`; implementación aislada en `codex/android-free-training`. Se conserva la interfaz y navegación Android actuales.

## Primera entrega aprobada

Inicio ofrece «Registrar entrenamiento» incluso sin plan. Una pantalla permite confirmar fecha (hoy por defecto), nombre, duración y nota opcionales, y guardar solo constancia. «Añadir ejercicios» permite guardar una parte o la totalidad de la sesión con series, peso/repeticiones o segundos. El catálogo y el último registro sirven de referencia; nada se marca como realizado automáticamente. Un resultado muestra lo que se guardó, comparación trazable si existe y enlaces a progreso/historial. El registro admite edición posterior por su identidad original.

La pantalla no pide crear un plan ni iniciar la sesión guiada. Registra trabajo ya realizado. No crea prescripciones ni autorizaciones ficticias y no modifica rutinas del entrenador. Las metas personales de ejercicios y el historial del compañero son entregas posteriores.

## Evidencia y datos

- Nuevo contrato `mobile/src/original/free-training/types.ts`. Escritura atómica de `progress_logs` y `exercise_logs`; `workout_id:null`, `mobile_session_kind:'free'`, instantánea V1 con `plan:null`. Metadatos adicionales fuera de la instantánea estricta.
- Niveles `attendance`, `partial`, `complete`. Solo constancia no crea series, volumen ni duración inventados. Un registro parcial se identifica en resultado, historial y Progreso. El mapa deriva únicamente de las series confirmadas.
- UUID de sesión estable, UUID de operación para reintentos y versión esperada para edición. Reintentar una operación no duplica filas. Edición concurrente obsoleta informa conflicto. Solo se editan registros libres de la cuenta capturada; otra cuenta o un registro guiado se rechazan.
- Fecha civil válida, sin fechas futuras, traducida a la zona horaria del perfil. Una edición sin cambio de fecha conserva la fecha/hora original. Se permiten sesiones libres reales distintas el mismo día; calendario agrupa días y el compañero mantiene su semántica existente de sesiones semanales. Una nueva sesión se elige explícitamente, completar detalles edita la anterior. La política de inicio de las sesiones guiadas se conserva.
- Los ejercicios existentes se conservan con su instantánea histórica al editar aunque hayan salido del catálogo; nuevas incorporaciones necesitan un ejercicio del catálogo local público. Validación de límites numéricos, UUID, duplicados, longitudes y modos temporizados.
- Borrador privado por cuenta y sesión en caché SQLite; recuperación después de recargar o volver desde Inicio. La entrada por defecto recupera el último borrador pendiente; «Registrar otra sesión» inicia una identidad nueva explícita. Cambiar de cuenta no guarda ni muestra el borrador ajeno. El fallo de persistencia conserva los campos y comunica el error.
- Meta semanal personal de 1–7 entrenamientos para cuentas sin plan activo, mediante `profiles.days_per_week` y `updated_at`; un plan activo conserva su meta. No cambia el plan al registrar.
- El respaldo privado Android existente transporta estos datos sin nueva migración. La huella del coordinador incluye edición para sincronizar cambios a una misma sesión. El compañero recibe la constancia después de sincronizar; no se comparte el detalle.

## Diseño y acceso

Tipografía, fondo y acento violeta existentes, ancho cómodo y campos grandes. Detalles progresivos; nombre y fecha visibles, duración y nota secundarios. Interacción táctil de al menos 44 px, foco y etiquetas accesibles, sin bloquear scroll/zoom. ES/EN. Reutilizar cabeceras y componentes del producto. Ruta móvil `/registrar`, edición `/registrar?log=<uuid>`; visibilidad de acceso condicionada a Android.

## Verificación

Base: `pnpm mobile:test` 233 pruebas/30 archivos aprobadas. Probar primero contratos de guardado, autoría, reintento, edición y datos incompletos; después componentes y recorrido real sobre bundle móvil con SQLite en 320/390/1440 px, red externa bloqueada, recarga, enlaces a calendario/mapa y edición sin duplicados. Ejecutar suite móvil, type-check, lint dirigido, build y recorrido original. Revisión independiente del diff. No afirmar prueba física, migración remota, push o APK compilada sin su propia evidencia.
