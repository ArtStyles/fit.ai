# Renovación integral de Ajustes

**Fecha:** 2026-08-16
**Estado:** aprobado para implementación

## Contexto

Las pantallas de Ajustes funcionan, pero fueron creciendo como formularios y
tarjetas independientes. El resultado carece de una jerarquía común y contiene
contratos distintos para los mismos datos. En móvil esto se percibe como una
sucesión de campos poco explicados; además, varias decisiones de la interfaz no
coinciden con las reglas reales de Supabase o del motor de entrenamiento.

La auditoría del código y de las capturas confirmó estos problemas:

- Entrenamiento guarda el equipo mediante texto separado por comas, mientras el
  onboarding y el motor trabajan con identificadores de un catálogo cerrado.
- El control de duración acepta cualquier entero entre 20 y 120, pero la base de
  datos solo admite 30, 45, 60 o 90 minutos.
- La frecuencia y los días preferidos pueden contradecirse; el generador descarta
  silenciosamente los días sobrantes al ordenar y recortar el arreglo.
- Las acciones de Ajustes dependen principalmente de las restricciones de la
  base de datos y convierten errores diferentes en `save_failed`.
- Al desactivar Comunidad, Perfil todavía expone nombre de usuario, privacidad y
  acceso al perfil público. La ruta pública conserva además un regreso a
  Comunidad.
- El peso del perfil, utilizado para personalización, no se actualiza al registrar
  medidas corporales, por lo que puede diferir del peso más reciente.
- Medidas aparece dentro de Ajustes, pero vuelve siempre al Dashboard y usa una
  composición visual, textos y estados diferentes del resto del módulo.
- Las preferencias de notificaciones de producto muestran valores por defecto
  aunque todavía no exista una fila; la acción actual usa `update`, por lo que
  puede informar éxito sin haber persistido nada.
- Hay textos de Ajustes que no pasan por i18n y controles de 40 px que no alcanzan
  el objetivo táctil usado en el resto de la aplicación.

## Objetivo

Convertir Ajustes en un centro coherente, profesional y predecible sin convertirlo
en una única pantalla ni reescribir silenciosamente el plan activo. La renovación
debe:

- dar jerarquía y contexto a la portada y a cada sección;
- compartir componentes visuales, estados y comportamiento de guardado;
- impedir combinaciones que el producto no pueda utilizar correctamente;
- respetar el apagado de Comunidad en toda la superficie de Perfil;
- establecer una única fuente operativa para el peso actual;
- conservar las rutas existentes y los datos compatibles;
- funcionar en español e inglés, móvil y escritorio, teclado y lector de pantalla.

## Enfoque seleccionado

Se conservará la navegación por rutas y se introducirá un sistema compartido de
componentes de Ajustes. Es un punto medio entre un retoque cosmético —que dejaría
la deuda lógica— y una pantalla monolítica con guardado automático —que tendría
demasiada densidad y riesgo de regresión—.

Los formularios con varios campos conservarán una acción explícita de guardado.
Las preferencias atómicas, como un idioma o un interruptor de notificaciones,
se guardarán al cambiar y mostrarán su estado. Ninguna mutación se presentará como
correcta hasta que el servidor confirme la persistencia.

## Arquitectura de experiencia

### Portada de Ajustes

La cabecera mantendrá el correo como contexto de cuenta. Debajo habrá grupos
semánticos en lugar de una sola lista indiferenciada:

1. **Tu perfil:** Perfil, Datos personales y Medidas.
2. **Tu entrenamiento:** Entrenamiento.
3. **Aplicación:** Notificaciones e Idioma.
4. **Acceso y seguridad:** Cuenta.
5. **Administración:** visible únicamente para administradores.

Cada fila tendrá un icono único, título, descripción breve, indicador de navegación
y un área táctil mínima de 44 px. Administración conservará su ruta y composición
de mayor ancho; solo se renovará su entrada en Ajustes. La portada no ejecutará
consultas adicionales únicamente para adornar filas con datos dinámicos.

### Estructura común de las subpáginas

`SettingsScreen` seguirá proporcionando la barra superior y el ancho de lectura,
pero añadirá soporte para una introducción opcional y un espaciado inferior seguro.
Sobre esta base se crearán primitivas compartidas:

- `SettingsSection`: título, descripción opcional y contenido relacionado;
- `SettingsField`: etiqueta, ayuda, error, unidades y asociación accesible;
- `SettingsChoiceGroup`: selección simple o múltiple mediante botones accesibles;
- `SettingsSwitchRow`: título, descripción, icono, estado y zona táctil consistente;
- `SettingsSaveBar`: acción explícita, estado pendiente y espacio seguro en móvil;
- `SettingsStatus`: éxito, advertencia o explicación sin depender solo del color.

Estas primitivas no conocerán Supabase ni reglas de dominio. Las páginas y
formularios especializados les suministrarán estado y controlarán la persistencia.

## Diseño por sección

### Perfil

La pantalla mostrará una tarjeta de identidad con avatar, nombre y correo. El
avatar continuará guardándose inmediatamente y el nombre conservará un botón
explícito. Los mensajes, botones de quitar foto y estados pendientes se
localizarán.

El servidor resolverá `isCommunityEnabled()` antes de renderizar controles
sociales:

- con Comunidad desactivada no se renderizarán `UsernameField`, `PrivacyToggle`
  ni “Ver mi perfil”;
- con Comunidad activa esos tres controles conservarán su comportamiento;
- desactivar la función no borrará `username`, `is_private` ni contenido social;
- las acciones de nombre de usuario seguirán disponibles porque el onboarding
  todavía las utiliza como parte del alta; Ajustes no las invocará mientras
  Comunidad esté apagada. Las rutas y lecturas públicas continuarán protegidas
  por el feature flag existente.

### Datos personales y Medidas

Datos personales agrupará nacimiento, género y altura con ayudas y unidades
claras. Los tres campos podrán quedar vacíos para conservar la compatibilidad de
perfiles incompletos. Cuando tengan valor, la fecha deberá representar una edad
entre 18 y 100 años, la altura estará entre 100 y 250 cm y el género pertenecerá
al catálogo existente, igual que en el onboarding. El servidor repetirá estas
validaciones; los atributos HTML serán solo una ayuda de interfaz.

El peso dejará de editarse como un campo independiente en Datos personales. Esa
pantalla mostrará el peso actual y dirigirá a Medidas para registrarlo. Se aplicará
este contrato:

- el peso inicial del onboarding permanece en `profiles.weight_kg` hasta que el
  usuario registre una medida con peso;
- la medida más reciente con `weight_kg` no nulo pasa a ser el peso actual y se
  copia a `profiles.weight_kg`;
- crear, editar o eliminar una medida recalcula el peso actual;
- al eliminar la última medida que contenga peso, `profiles.weight_kg` pasa a
  `NULL`, porque el usuario eliminó la fuente vigente;
- una migración sincronizará perfiles existentes que ya tengan medidas con peso,
  sin modificar perfiles que nunca hayan registrado una medida.

La sincronización se implementará en la base de datos mediante una función y un
trigger sobre `measurements`, de modo que la escritura de la medida y la
actualización del perfil pertenezcan a la misma transacción. Una inserción sin
peso no borrará el peso inicial: el trigger recalculará únicamente al insertar o
eliminar una medida con peso, o cuando una actualización cambie su valor de peso.
El motor seguirá leyendo `profiles.weight_kg` y no necesitará cambios.

Medidas seguirá siendo `/medidas` porque es también una herramienta de seguimiento,
no solo una preferencia. El enlace desde Ajustes incluirá `?from=settings`; la
barra superior volverá a Ajustes en ese caso y al Dashboard en accesos normales.
La pantalla adoptará `PageTopBar`, tokens visuales e i18n compartidos. Registrar,
editar y eliminar tendrán validación de servidor, errores legibles y reversión
visual si una eliminación falla. Eliminar requerirá confirmación y nunca se
considerará correcto por anticipado.

### Entrenamiento

La pantalla se convertirá en un formulario cliente especializado dividido en
cuatro bloques. Objetivo, nivel, frecuencia, duración, lugar y la selección exacta
de días serán obligatorios; el equipo y las lesiones podrán quedar vacíos.

#### Objetivo y experiencia

Objetivo y nivel usarán selectores con opciones tipadas compartidas con el
onboarding. No se aceptarán valores fuera del catálogo.

#### Disponibilidad

- Frecuencia: botones para 2, 3, 4, 5 o 6 sesiones.
- Duración: botones para 30, 45, 60 o 90 minutos.
- Semana: siete botones con nombres localizados y no solo iniciales ambiguas.
- La cantidad de días seleccionados deberá coincidir exactamente con la
  frecuencia antes de guardar.
- Cambiar la frecuencia no borrará días automáticamente. La interfaz mostrará
  cuántos faltan o sobran y deshabilitará Guardar hasta resolverlo.
- Los arreglos se deduplicarán y ordenarán en el servidor.

Este contrato evita que el generador recorte preferencias silenciosamente y hace
que los recordatorios utilicen exactamente los días programados.

#### Espacio y equipo

El lugar de entrenamiento será una selección visual entre casa sin equipo, casa
con equipo básico y gimnasio completo. Para los dos últimos casos se mostrará un
selector múltiple con el catálogo canónico:

- mancuernas;
- barra;
- banco;
- kettlebell;
- bandas;
- polea o cable;
- barra de dominadas;
- TRX.

Los valores persistidos seguirán siendo los identificadores que utiliza el motor.
“Casa sin equipo” ocultará el selector y guardará un arreglo vacío. No habrá texto
“Otro”, porque el motor no puede garantizar compatibilidad con valores arbitrarios.
Los valores históricos desconocidos se ignorarán visualmente y se eliminarán al
guardar, sin bloquear la apertura de la pantalla.

#### Seguridad y alcance

“Lesiones o limitaciones” se presentará como una sección de seguridad con ayuda
clara y conservará el campo `injuries` existente. La pantalla mostrará también un
resumen no editable de `readiness_status`; la edición completa del cribado médico
y de `movement_limitations` no se duplicará dentro de este formulario. Esta
renovación no modifica diagnósticos ni concede autorizaciones médicas.

Antes de Guardar se explicará que las preferencias alimentan próximas generaciones
y ajustes. Guardar no alterará ejercicios, programación ni prescripciones de un
plan activo. Después de guardar, un enlace separado a `/plan` permitirá revisar o
adaptar el plan mediante los flujos explícitos existentes. Los planes asignados y
bloqueados por un entrenador conservarán sus restricciones.

### Notificaciones

Recordatorios, avisos de Vekira y preferencias sociales usarán el mismo patrón de
fila e interruptor. Los recordatorios mantendrán la persistencia local y las APIs
nativas actuales, pero todos sus textos, días y mensajes pasarán por i18n.

La acción de preferencias de producto cambiará de `update` a `upsert` con
`user_id`, para que el estado inicial mostrado pueda persistirse aun cuando no
exista una fila. Una migración concederá inserción únicamente sobre las columnas
de preferencias y una política RLS exigirá `auth.uid() = user_id`; no se ampliará
el acceso de lectura o modificación entre cuentas. Las preferencias sociales solo
se consultarán y renderizarán con Comunidad activa. Cada error restaurará el
estado anterior y se anunciará mediante toast y región accesible.

### Idioma

Las opciones seguirán guardándose automáticamente. Cada fila mostrará nombre
nativo, descripción localizada y un indicador de selección. Mientras la acción
esté pendiente no se aceptará otra selección; un estado accesible comunicará
guardado o error y la interfaz restaurará el idioma anterior si falla.

### Cuenta

La pantalla se dividirá en:

- identidad de la cuenta: correo de acceso;
- sesión: cerrar sesión;
- documentos: Privacidad y Términos;
- zona peligrosa: eliminación de cuenta con confirmación existente.

Las acciones destructivas conservarán separación, color semántico y confirmación.
No se añadirán cambios de contraseña ni correo porque esos flujos no existen en el
producto actual.

## Catálogos y validación

Objetivos, niveles, espacios, duraciones, frecuencia, días y equipo vivirán en un
módulo de dominio compartido por onboarding, Ajustes y validadores. Las etiquetas
se localizarán en la capa de presentación; los identificadores persistidos no se
traducirán.

Las acciones usarán validadores puros y tipados antes de escribir:

- enumeraciones exactas para objetivo, nivel, género, espacio y equipo;
- enteros cerrados para frecuencia y duración;
- fecha y altura dentro de los límites del onboarding;
- días ISO únicos, ordenados y con longitud igual a `days_per_week`;
- nombre normalizado con un máximo de 100 caracteres y lesiones con un máximo de
  1.000 caracteres;
- medidas opcionales dentro de estos límites: peso 30–300 kg, grasa corporal
  1–75 %, masa muscular 5–200 kg, perímetros 10–300 cm y notas de hasta 500
  caracteres;
- al registrar una medida se exigirá al menos un valor o una nota no vacía.

Los errores de validación no llegarán a Supabase. Los formularios mostrarán un
resumen general y errores junto a los campos; los errores inesperados conservarán
los valores introducidos y ofrecerán reintento. Las redirecciones genéricas se
mantendrán únicamente para fallos de autenticación o navegación fuera del flujo.

## Flujo de datos

1. La página servidor carga usuario, perfil, idioma y feature flags.
2. Convierte los valores persistidos a un modelo inicial tipado.
3. El formulario cliente administra selección, validación inmediata y estado
   pendiente sin duplicar reglas finales.
4. La acción servidor vuelve a analizar todo el payload con el catálogo canónico.
5. Solo un payload válido llega a Supabase.
6. El resultado devuelve errores de campo o confirmación; al guardar se revalidan
   Ajustes, Dashboard y Plan cuando corresponda.
7. Ninguna acción de perfil modifica el plan activo.

Las preferencias atómicas siguen el mismo flujo sin botón final: actualización
optimista, persistencia, confirmación o reversión.

## Responsive, accesibilidad e i18n

- El contenido principal conservará un ancho legible; la portada podrá usar dos
  columnas en escritorio, pero el orden semántico será el mismo que en móvil.
- Campos y acciones tendrán al menos 44 px de alto y foco visible.
- `fieldset` y `legend` agruparán selecciones; los botones expondrán
  `aria-pressed` y los interruptores `role="switch"` con `aria-checked`.
- Los errores se asociarán mediante `aria-describedby` y `aria-invalid`.
- Los estados pendientes y resultados se anunciarán sin depender del toast.
- No se usará color como único indicador de selección, error o peligro.
- Español e inglés cubrirán portada, formularios, ayudas, unidades, medidas,
  recordatorios y estados vacíos.
- Los esqueletos de carga reproducirán los nuevos grupos y no mostrarán controles
  sociales cuando no puedan conocerse todavía.

## Manejo de compatibilidad

- No se renombrarán rutas públicas ni columnas existentes.
- Los datos sociales se conservarán al ocultar Comunidad.
- Los valores de equipo canónicos existentes se seleccionarán automáticamente.
- Valores de equipo libres o desconocidos no romperán el formulario y se
  normalizarán al siguiente guardado.
- Perfiles con días preferidos inconsistentes podrán abrir la pantalla; se les
  pedirá corregir la selección antes del próximo guardado.
- La migración del peso solo sobrescribirá perfiles que tengan al menos una medida
  con peso.

## Pruebas

### Unitarias y de componentes

- catálogos compartidos y validación de cada límite y enumeración;
- coincidencia entre frecuencia y cantidad de días, orden y deduplicación;
- normalización y limpieza de equipo según espacio;
- Perfil oculta todos los controles sociales con Comunidad desactivada y los
  muestra con la función activa;
- formularios conservan valores y asocian errores accesibles;
- selector de idioma anuncia pendiente, éxito y reversión;
- preferencias de notificaciones crean una fila ausente mediante `upsert`;
- Medidas revierte una eliminación fallida.

### Base de datos

- insertar una medida con peso actualiza `profiles.weight_kg`;
- editar el peso recalcula el perfil;
- editar una medida sin peso usa la medida con peso más reciente restante;
- eliminar la medida más reciente recupera la anterior;
- eliminar la última medida con peso limpia el perfil;
- la migración no altera perfiles sin historial de peso.

### Integración y navegación

- cada entrada de la portada llega a la ruta correcta;
- Medidas vuelve a Ajustes con `from=settings` y mantiene Dashboard como regreso
  predeterminado;
- guardar Entrenamiento actualiza el perfil, pero no las tablas del plan activo;
- los recordatorios reciben los mismos días que el perfil validado;
- las páginas mantienen funcionamiento en español e inglés.

### Verificación final

- pruebas focalizadas nuevas;
- suite Vitest completa;
- type-check y lint;
- build de producción;
- Playwright responsive en viewport móvil de las capturas y escritorio;
- revisión de accesibilidad de Ajustes, Entrenamiento, Perfil y Medidas.

## Criterios de aceptación

- Ningún usuario introduce equipo mediante CSV.
- Todo equipo guardado pertenece al catálogo utilizado por el motor.
- Frecuencia, duración y días no pueden persistirse en una combinación inválida.
- Comunidad desactivada no deja controles ni enlaces sociales en Perfil.
- Registrar o modificar peso en Medidas actualiza el peso consumido por el motor.
- Las preferencias de notificaciones se persisten incluso sin una fila previa.
- Cada sección tiene contexto, jerarquía, estados de interacción y diseño coherente.
- Los cambios de Entrenamiento nunca reescriben automáticamente el plan activo.
- Ajustes y Medidas funcionan en ambos idiomas, teclado, lector de pantalla y los
  tamaños móvil y escritorio soportados.

## Fuera de alcance

- Reactivar Comunidad o borrar sus datos almacenados.
- Rediseñar las páginas internas de Administración.
- Crear un editor completo del cribado médico dentro de Ajustes.
- Cambiar el motor de generación, los algoritmos de evidencia o la estructura del
  plan activo.
- Cambiar correo, contraseña o proveedor de autenticación.
- Añadir nuevos tipos de equipo que el motor todavía no reconoce.
- Convertir Ajustes en una pantalla única o añadir navegación inferior nueva.
