# Registro libre y ejercicios privados

Entrega Android 1.1.29-offline, 2026-09-17. Rama `codex/android-offline`.

## Uso

«Registrar entrenamiento a tu manera» organiza fecha/nombre, ejercicios/series y guardado. Duración, nota, meta semanal y registros anteriores son secundarios; cada ejercicio se puede plegar sin cambiar el borrador. «Añadir ejercicios» abre el mismo `ExerciseCatalogDialog` de Plan, con imágenes, búsqueda, filtros y selección múltiple.

Desde ese selector, o desde Plan → sesión → Editar estructura → Agregar ejercicio, usar **Crear ejercicio**. Solo el nombre es obligatorio. La descripción, los músculos y la imagen son opcionales. Se puede registrar por repeticiones o por tiempo. Las 16 ilustraciones genéricas de Vekira muestran un músculo seleccionado; no son demostraciones del movimiento. Se derivan de la geometría MuscleMap ya incluida, con atribución MIT preservada.

Crear guarda el ejercicio privado y lo deja seleccionado para añadirlo. Cerrar sin confirmar no añade series ni ejercicios al entrenamiento; el ejercicio creado sigue disponible al volver al selector. La ficha identifica el ejercicio como personal. En una rutina, los ejercicios por tiempo se prescriben y editan en segundos, y usan el temporizador de Entrenar.

## Persistencia y alcance

- SQLite guarda los ejercicios en el estado de la cuenta con dueño, `is_public: false` y `source: mobile-personal`. El respaldo existente conserva el registro íntegro. No se insertan en el catálogo SQL público.
- El catálogo privado se habilita expresamente para registro libre y edición personal de Plan. No aparece en plantillas de entrenador ni rutas conectadas de coaching.
- Las lecturas filtran por dueño; las escrituras verifican cuenta y versión de sesión también dentro de la transacción. Reintentar una creación con el mismo identificador no duplica el ejercicio.
- La actividad muscular usa únicamente los músculos indicados y las series realizadas. Dejar músculos vacíos no inventa atribuciones. Elegir una ilustración no agrega series ni modifica el catálogo público.
- Los fallos al añadir, reemplazar, editar o quitar una prescripción se propagan al componente. El selector mantiene la selección si no pudo guardar; quitar conserva la fila hasta confirmar persistencia.
- No se modifica `main`, no se publica servidor ni se requieren migraciones remotas. La creación/edición de metadatos de un ejercicio público no forma parte de esta función.

## Verificación

- Suite móvil: **512 pruebas / 67 archivos**, correctos. Incluye SQLite real, aislamiento por dueño, cambios de cuenta/ruta, idempotencia, respaldo, errores de disco y prescripciones temporizadas.
- Componentes y lectores compartidos: **137 pruebas / 16 archivos**, correctos; TypeScript móvil, ESLint de archivos afectados y `git diff --check` correctos.
- Navegador: ocho recorridos de registro libre y cinco de ejercicios privados, ES/EN y 320/390/1440 px. Creación sin foto/descripción, crear/cancelar/reabrir, selección por lote, filtros, recuperación de borrador, guardado, ficha, mapa y rutina temporizada completada. Red externa bloqueada, cuentas sintéticas y SQLite real. Capturas en `.artifacts/free-training/` y `.artifacts/personal-exercises/`.
- Compilación release firmada, `lintRelease` y **37 pruebas JVM** correctos. El APK incluye SQLite, 50 pósteres, 16 fuentes y las 16 ilustraciones, con hashes de assets iguales al bundle final y sin cargador remoto.
- APK: `.artifacts/Vekira-1.1.29-offline.apk`, **18.457.413 bytes (17,60 MiB)**, `com.fitai.app`, versionCode **31**, minSdk 24 / targetSdk 36.
- SHA-256: `d0590d02709561c5cd9108f4cff30e6de78e841004bb1c12087e3417f4de7b15`.
- Firma v2, certificado original SHA-256: `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.
- `adb devices -l`: ningún dispositivo conectado. Prueba física y sincronización entre teléfonos con una cuenta real pendientes; la evidencia anterior es local.

Instalar como actualización, sin desinstalar, para conservar la base local.

## Comandos

```powershell
pnpm mobile:test
pnpm mobile:type-check
pnpm android:offline:release
./scripts/verify-android-offline.ps1
# Con el preview móvil en 4184:
$env:MOBILE_PREVIEW_URL='http://127.0.0.1:4184'
node mobile/tests/free-training-regression.mjs
node mobile/tests/personal-exercises-regression.mjs
```
