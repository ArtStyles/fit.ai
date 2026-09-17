# Registro claro y ejercicios personales en Android

## Objetivo autorizado

El usuario pidió ordenar Registrar entrenamiento a tu manera, reutilizar el catálogo común y permitir ejercicios privados en sus rutinas sin foto obligatoria, con descripción opcional e ilustraciones musculares genéricas opcionales.

## Experiencia

Una pantalla compacta, con fecha/nombre, ejercicios y series, y un cierre claro para guardar constancia o entrenamiento parcial/completo. Duración, nota, meta semanal y registros anteriores son secundarios, desplegables. Las series añadidas permanecen visibles o se pliegan individualmente; desaparece la lista de catálogo incrustada. El botón Añadir ejercicios abre el mismo ExerciseCatalogDialog de Plan, con imágenes, búsqueda, filtros y selección múltiple confirmada. Abrir/cerrar no altera el borrador.

En ese selector y en Plan personal se habilita Crear ejercicio. Se solicita nombre, registro por repeticiones o tiempo, y opcionalmente músculos, descripción e imagen genérica. Sin músculos no se atribuye actividad al mapa. Las imágenes se eligen entre ilustraciones de Vekira derivadas del mapa MIT ya incluido: una por región representable, sin solicitar fotografía. La ilustración elegida debe corresponder a uno de los músculos indicados y no representa técnica de ejecución.

El ejercicio es privado de la cuenta, reutilizable por su propietario, y se identifica como Solo tú. Crear guarda el ejercicio en la biblioteca personal y lo selecciona en el catálogo; la confirmación añade el lote al entrenamiento o rutina. Cancelar antes de crear no escribe nada; cancelar después no borra un ejercicio ya creado. No se añaden a catálogos públicos ni programas de otros usuarios/entrenadores.

## Datos y permisos

Solo `codex/android-offline`, worktree existente. Ejercicios personales en el estado SQLite de la cuenta con UUID, propietario local e is_public:false. La tabla canónica remota no incorpora columnas ni registros nuevos. Se reutiliza el respaldo privado existente. Contrato de creación idempotente por operationId, con validación de cuenta y versión de sesión dentro de la transacción. Mantener guardas de plan editable/propietario. El selector del entrenador sigue público.

Nombre1..120 y descripción0..2000 caracteres. Músculos únicamente IDs conocidos, sin duplicados; imagen únicamente de la lista local autorizada y consistente con músculos seleccionados. Tipos de registro se reflejan en sesiones y no se confunden peso/repeticiones con tiempo. Ficha e historial admiten ejercicios privados propios y preservan snapshots.

## Verificación

Pruebas SQLite de propietario, cambio de cuenta, idempotencia, inputs inválidos, preservación del catálogo y backup; creación sin descripción/foto; uso en plan y entrenamiento libre; mapa muscular e historial. Pruebas de selector y UI, conservación de borrador/edición y selección múltiple. Navegador ES/EN320/390/1440, teclado/Atrás, imágenes incluidas en bundle. Tipos/lint/tests/compilación firmada, diferenciando publicación Git, migraciones y dispositivo físico.
