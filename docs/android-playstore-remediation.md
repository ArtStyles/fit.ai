# Preparación Android para Google Play

Trabajo iniciado el 15 de septiembre de 2026 sobre `codex/android-offline`, a partir de `51888d2` / APK 1.1.25. Candidato local: **1.1.26-offline**, código **28**. Se conservan las cinco pestañas originales.

## Dictamen

Las correcciones están implementadas localmente. **El candidato necesita desplegar y verificar los servicios de cuenta y pasar las pruebas físicas antes de publicarse en producción.** No se han publicado cambios web, aplicado migraciones remotas, enviado correos de recuperación ni eliminado cuentas reales durante esta ejecución.

## Correcciones y cobertura

- Entrenamiento: una constancia libre no consume el cupo de rutina guiada; se mantienen la autorización, la prescripción, el límite de una guiada por día y los reintentos sin duplicados.
- Medidas: crear, editar o borrar peso actualiza el peso del perfil con la misma regla que la web.
- Respaldo: identidad comprobada, vista previa, confirmación, revisión de concurrencia y copia anterior persistente recuperable. El archivo contiene registros guardados; no incluye tokens, borradores ni cachés de servicios conectados.
- Cuenta: recuperación por código y contraseña nueva con sesión temporal independiente; borrado mediante identidad verificada en servidor y limpieza local únicamente después de una respuesta positiva para la misma cuenta.
- Interfaz: contraste, semántica del calendario y métricas, controles separados de catálogo/zoom, foco y Escape en diálogos, idioma de documentos legales.
- Notificaciones: preferencias de recordatorio por cuenta, reconciliación al cambiar agenda y cancelación al salir/cambiar cuenta. Push depende de configuración nativa real y permiso explícito.
- Funciones conectadas: enlaces web explícitos para funciones privilegiadas que no se ejecutan en el paquete; el chat Android no genera respuestas simuladas. No se incluyen credenciales de servicio en el cliente.
- Android: recursos específicos API 27, reglas explícitas de respaldo del sistema y comando de AAB que exige lint y pruebas nativas.

| Hallazgo inicial | Resultado de la corrección |
|---|---|
| A01 · Eliminación | API autenticada, limpieza local condicionada al éxito y migración para las dependencias profesionales. Falta despliegue y prueba remota. |
| A02 · Restauración | Vista previa, confirmación y recuperación duradera; aislamiento de cuentas y conservación del resultado después de sincronizar dos veces. |
| A03 · Libre/guiada | Permite finalizar la guiada después de registrar una constancia libre; conserva autorizaciones y evita duplicados. |
| A04 · Peso | Perfil y medidas coinciden al crear, editar y borrar. |
| A05 · Alta/foto profesional | Apertura explícita de la web; el perfil y servicios editables siguen disponibles. Las credenciales privilegiadas quedan en servidor. |
| A06 · Push | Inicialización y reintentos asociados a la cuenta; desactivado de forma explícita mientras falte Firebase. Recepción física pendiente. |
| A07 · Recordatorios | Preferencias por cuenta, actualización al cambiar agenda y cancelación al salir; incluye protección contra carreras asíncronas. |
| A08 · Recuperación | Flujo visible por código y nueva contraseña, sin reemplazar la sesión local durante la recuperación. SMTP/plantilla pendientes de comprobar. |
| A09 · Lint nativo | Recursos de API 27 separados; el control de release pasa. |
| A10 · Accesibilidad | Contrastes y semántica corregidos, catálogo con controles hermanos y diálogos con foco/Escape comprobados. |
| A11 · Idioma | Documentos y avisos nuevos en español/inglés. Las pantallas profesionales preexistentes mantienen textos en español. |
| A12 · Administración | Destino web explícito y deshabilitado sin conexión. |
| A13 · Chat simulado | Retirado del grafo del paquete; la función se abre en la web con inicio de sesión propio. |

La revisión independiente encontró además y corrigió la pérdida de datos restaurados al sincronizar, el rechazo insuficiente de copias vacías, carreras entre borrado y cambio de cuenta, reintentos de registro push y normalización insegura de destinos de notificación. El borrado profesional se verificó contra el esquema PostgreSQL completo en un contenedor local, no solamente contra respuestas simuladas.

## Repetir las pruebas

```powershell
pnpm mobile:test --maxWorkers=2
pnpm mobile:type-check
pnpm exec vitest run --project unit --maxWorkers=2
pnpm exec vitest run --project browser-fixtures --maxWorkers=1
pnpm type-check
pnpm exec eslint mobile/src src --quiet
pnpm mobile:e2e
node scripts/test-account-deletion-db.mjs
```

`mobile:e2e` prepara y compila el cliente con dominios sintéticos, inicia su propio preview en `127.0.0.1:4178`, ejecuta las suites secuencialmente y cierra el preview. El puerto debe estar libre. Todos los servicios externos de las pruebas se interceptan. No se envían correos ni se borran cuentas reales. Los resultados quedan en `.artifacts/mobile-e2e/results.json`; cada suite conserva evidencia adicional en `.artifacts/`.

Se puede ejecutar una selección, por ejemplo:

```powershell
pnpm mobile:e2e guided-free-regression measurement-weight-regression account-lifecycle-regression
```

Los scripts `offline-journey.mjs` y `ui-surfaces.mjs` corresponden al prototipo anterior y no forman parte de esta suite del cliente actual.

## Construir para Android

```powershell
pnpm android:offline:release
pnpm android:offline:bundle
```

Ambos comandos recompilan con la configuración local de publicación, sincronizan Capacitor y comprueban que no haya un cargador web remoto. Utilizan la identidad de firma existente; no generan claves nuevas. El runner E2E deja un bundle de prueba en `mobile/dist`, por lo que no debe copiarse manualmente para distribuirlo: los comandos Android siempre lo recompilan.

## Configuración y despliegue pendientes de verificar

El usuario confirmó la web **https://fit-ai-kohl.vercel.app**. Los valores locales `VITE_ACCOUNT_API_URL` y `VITE_WEB_APP_URL` usan ese origen HTTPS. No contienen rutas ni tokens.

La comprobación pública del 16 de septiembre devolvió la página de acceso al pedir `/delete-account`, `/recover-password` y `/api/account/delete`: los cambios nuevos todavía necesitan despliegue. La API de borrado requiere las variables de Supabase del servidor, incluidas sus credenciales de servicio exclusivamente en el servidor, y el esquema de eliminación correspondiente. Hay que verificar el resultado con cuentas de prueba que incluyan relaciones profesionales.

La migración requerida es `infra/supabase/migrations/20260916010000_verified_account_deletion.sql`. El borrado conserva las prescripciones e historial que pertenecen a otros clientes, además de la auditoría profesional inmutable con identificadores. Storage, PostgreSQL y Auth no comparten una transacción: un error conserva el estado local y requiere reintento; puede haber archivos o perfil ya eliminados remotamente. No debe presentarse como una operación atómica ni como anonimización total. El procedimiento de despliegue y recuperación se documenta en `docs/android-account-deletion-release.md`.

La plantilla de recuperación de Supabase debe entregar el código `{{ .Token }}` y tener SMTP operativo. Las pruebas HTTP simuladas no validan entrega, caducidad ni configuración remota.

La configuración Firebase nativa no está presente en este equipo. El paquete lo refleja en las preferencias; no se debe prometer recepción push con la app cerrada hasta configurarla y verificarla en un teléfono.

## Antes de enviar a producción

1. Desplegar y verificar servidor, migraciones y páginas públicas, incluida la URL de eliminación para Play Console.
2. Probar en Android físico: actualización desde 1.1.25 conservando datos, reinicio/proceso cerrado, permisos, cámara e imagen QR, música, notificaciones, restauración y cambio de cuenta. Añadir comprobaciones en API mínima y un entorno de páginas de memoria de 16 KB.
3. Verificar AAB, firma/Play App Signing, ficha, política de privacidad, Data safety, declaración de salud y acceso de revisión. Comprobar si la cuenta de Play Console requiere prueba cerrada previa.
4. Hacer una prueba real controlada de recuperación, sincronización y eliminación con cuentas destinadas a pruebas.

La base de datos, la publicación web, Play Console y un teléfono real son verificaciones separadas. Un test con respuestas simuladas o un paquete firmado no confirma esas capas.

## Sugerencias posteriores

- Dar prioridad al ensayo de actualización con datos reales de prueba y a los reintentos tras pérdida de red; son más útiles ahora que añadir nuevas funciones.
- Completar la traducción de las pantallas profesionales si se ofrecen a usuarios en inglés.
- Reducir por fases los chunks grandes del cliente y medir inicio en un teléfono de gama baja; el aviso de tamaño no prueba por sí mismo un fallo de rendimiento.
- Mantener esta batería E2E como requisito de cada versión y conservar sus resultados junto al hash del paquete.

Referencias: [eliminación de cuentas](https://support.google.com/googleplay/android-developer/answer/13327111?hl=es), [Android App Bundles](https://support.google.com/googleplay/android-developer/answer/9859348?hl=es), [bundletool](https://developer.android.com/tools/bundletool), [reglas de respaldo Android](https://developer.android.com/identity/data/autobackup), [memoria de 16 KB](https://developer.android.com/guide/practices/page-sizes).

## Evidencia de esta ejecución

Verificación final: 16 de septiembre de 2026. Evidencias completas en `.artifacts/playstore-remediation-2026-09-15/`. La auditoría inicial se conserva sin reescribir en `.artifacts/playstore-audit-2026-09-15/INFORME.md`; su dictamen describe la versión anterior.

| Comprobación | Resultado y evidencia |
|---|---|
| Unitarias Android | 52 archivos / **394 pruebas aprobadas**. `mobile-tests-final.log`. |
| Unitarias compartidas | 331 archivos / **2.991 pruebas aprobadas**, ejecución final posterior a las correcciones. `shared-tests-final.log`. |
| Interacciones compartidas en navegador | 24 archivos / 349 pruebas: 348 pasaron en el lote; una esperaba el antiguo botón «Guardar». Actualizado al actual «Guardar cambios», las **2 pruebas del archivo pasan**, conservando verificación de errores, reintento y datos. `browser-fixtures-final.log`, `browser-fixture-settings-final.log`. |
| E2E Android compilado | **26 suites con resultado final aprobado**. Lote completo de 25 más la suite conectada nueva y repeticiones de cuenta/notificaciones/logout. `e2e-final-results.json` referencia cada ejecución, incluida la corrección del selector de biografía. |
| UI / axe | **87 estados iniciales** (29 rutas × 360/390/768 px), sin infracciones, errores JS ni overflow. Catálogo también probado en español/inglés, teclado, zoom y foco. No equivale a TalkBack físico ni a toda combinación posible. |
| Eliminación PostgreSQL local | **42/42** comprobaciones con esquema real completo: roles, aislamiento, rollback, prescripciones, historial e idempotencia. `deletion-db-green.log`. |
| Android JVM | 7 suites / **37 pruebas**, cero fallos, ejecutadas de nuevo el 16/09. `native-tests-final.json`. |
| Tipos y lint | Tipos móviles/compartidos y ESLint aprobados. Android `lintRelease`: **0 errores, 30 advertencias**. |
| Compilación web | Aprobada usando los 16 WOFF2 auténticos ya incluidos en el repositorio. La descarga desde Google falló por conexión del entorno; el loader real de Next verificó los hashes de la caché. `web-build-final-verified.log`, `web-font-cache-report.md`. |
| HTTP web local | Eliminación pública ES/EN, recuperación y privacidad devuelven 200; OPTIONS de API 204; intento sin token 401. Destino del enlace de salto de contenido verificado. `web-local-http-results.json`. |
| Paquetes | APK y AAB generados, mismo certificado que 1.1.25. Assets coinciden con el build: 50 posters, 16 fuentes y SQLite; sin cargador remoto ni configuración E2E. |
| Estructura / 16 KB | `bundletool validate` aprobado, configuración `PAGE_ALIGNMENT_16K`, ZIP del APK y APK universal generado desde AAB alineados, segmentos ELF de 64 bits alineados. Pendiente ejecución real en un sistema de 16 KB. |

La suite E2E cubre onboarding, login/registro/OTP, cinco pestañas, generación y calendario, sesiones guiadas/libres y recuperación, historial/progreso/objetivos, medidas, perfil/avatar, copias, cuenta, notificaciones, catálogo/músculos/detalle/zoom, entrenador, compañero y Fitness Card/QR. El decoder QR usa píxeles reales en las pruebas, con cámara simulada y casos de imagen/visibilidad/detector nativo vacío. Los servicios externos se interceptan; no acredita entrega de correos, RLS del entorno remoto, recepción push ni cámara física.

`jarsigner` confirma `jar verified` y el certificado del AAB coincide. Su log conserva advertencias del certificado autofirmado/sin timestamp y del orden del manifiesto para lectores `JarInputStream`; no se ocultan ni sustituyen la verificación de Play Console. El APK universal creado por bundletool tiene firma **debug** y queda únicamente en la carpeta de diagnóstico; no es el APK de entrega.

## Archivos de entrega local

Ambos usan `com.fitai.app`, versión **1.1.26-offline**, código **28**, mínimo API **24** y objetivo **36**.

| Archivo | Tamaño | SHA-256 |
|---|---:|---|
| `.artifacts/Vekira-1.1.26-offline.apk` | 18.076.607 bytes | `edfdbea6307619805ae701243aebe403636fea21a8a2641cbdd84575d8efc702` |
| `.artifacts/Vekira-1.1.26-offline.aab` | 13.926.448 bytes | `aeec2db5ecea99521d9e240215441d3a9823be6c2809e2b98287cd40eaa57855` |

Para el ensayo de actualización, exportar primero una copia y instalar el APK encima de 1.1.25, sin desinstalar. Firma, identidad y aumento de versión son compatibles localmente; la conservación efectiva de datos durante la instalación debe comprobarse en el teléfono. El AAB es el candidato para el proceso de Play Console después de cerrar los requisitos remotos y físicos indicados arriba.
