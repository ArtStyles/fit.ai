# Baseline trazable de migraciones Supabase — Diseño

**Fecha:** 2026-09-06  
**Estado:** Aprobado por el usuario (`hazlo`)

## Problema confirmado

El esquema remoto está al día con el contrato de seguridad más reciente (preflight 59), pero
el proyecto remoto no tiene la tabla `supabase_migrations.schema_migrations`. Por eso Supabase
no conserva un ledger consultable de lo aplicado y un `db push` futuro no puede distinguir el
estado actual de las migraciones pendientes.

El directorio histórico `supabase/migrations/` tampoco puede convertirse directamente en la
fuente activa del CLI:

- usa versiones cortas (`001`…`059`) y contiene versiones duplicadas (`004`, `005`);
- incluye rollbacks que README excluye de una instalación normal;
- incluye `009_reset_test_accounts.sql`, que borra datos y es solo para desarrollo;
- varias migraciones ejecutan seeds, backfills o reparaciones de datos;
- numerosos tests y scripts leen esos archivos por su ruta actual, así que moverlos introduciría
  un cambio amplio y ajeno al objetivo.

## Objetivo

Crear una línea canónica de migraciones para producción a partir del esquema remoto real,
registrar un único baseline en el ledger oficial de Supabase y hacer que las migraciones futuras
se creen y desplieguen exclusivamente desde esa línea.

La operación no debe volver a ejecutar migraciones históricas, copiar datos de producción ni
modificar tablas de negocio.

## Alternativas consideradas

### 1. Marcar `001`…`059` como aplicadas

Rechazada. No existe evidencia suficiente para afirmar que cada archivo histórico se ejecutó
literalmente y en ese orden. Las versiones duplicadas son ambiguas para el CLI y marcar
migraciones como aplicadas sin comprobarlas produciría una trazabilidad ficticia.

### 2. Reescribir o mover todo el historial

Rechazada. Haría posible un árbol único, pero obligaría a modificar muchas pruebas y herramientas
que usan los SQL históricos como fixtures. El riesgo y el ruido de revisión no aportan valor a la
trazabilidad remota.

### 3. Línea activa aislada con baseline remoto

Elegida. Se crea un workdir de Supabase separado bajo `infra/`, con una única migración inicial
timestamped generada desde el esquema remoto. El árbol histórico existente se conserva intacto
como evidencia y fixture de pruebas, pero deja de ser una entrada válida para operaciones de
producción del CLI.

## Arquitectura

```text
infra/
└── supabase/
    ├── config.toml                 # configuración del CLI
    └── migrations/
        └── <timestamp>_remote_schema_baseline.sql

supabase/
└── migrations/                     # legado/auditoría/fixtures; no usar con db push
```

Los comandos mantenidos por el repositorio siempre fijan `--workdir infra`. De este modo, un
operador no depende del directorio actual ni puede enviar accidentalmente los rollbacks o el
reset de cuentas incluido en el árbol histórico.

## Creación segura del baseline

1. Capturar el estado previo del historial remoto y confirmar que está vacío.
2. Generar el SQL desde el esquema remoto mediante `supabase db pull`, sin marcarlo todavía como
   aplicado.
3. Revisar que el archivo contiene DDL, funciones, políticas y grants, pero no filas ni secretos.
4. Levantar el stack local con Docker y ejecutar `supabase db reset` sobre el nuevo workdir.
5. Comparar contratos críticos del baseline local con el remoto, incluido el preflight 59.
6. Registrar únicamente la versión del baseline con `supabase migration repair --status applied`.
7. Verificar que `migration list` alinea local/remoto y que `db push --dry-run` no propone SQL.

`migration repair` actualiza solo el ledger; no ejecuta el baseline sobre la base remota que ya
posee ese esquema.

## Datos y migraciones históricas

El baseline es deliberadamente de esquema. No se descarga ni versiona información de usuarios,
entrenamientos, solicitudes ni otras filas remotas. Los seeds y backfills históricos permanecen
en `supabase/migrations/` para auditoría y para los harnesses que explícitamente los usan.

Una instalación nueva obtiene la estructura vigente desde el baseline. Si necesita datos de
referencia, deben mantenerse como seeds sanitizados y explícitos; nunca se infieren copiando
datos de producción.

## Trazabilidad futura

- Todas las migraciones nuevas usan el timestamp de 14 dígitos generado por el CLI.
- Solo se añaden bajo `infra/supabase/migrations/`.
- La ruta soportada es: crear migración, probar con reset local, revisar `db push --dry-run`,
  desplegar y confirmar con `migration list`.
- README distingue expresamente la línea activa del archivo histórico.
- `infra/supabase/.temp/` y los metadatos locales de enlace quedan ignorados por Git.
- No se usa `db reset --linked` contra la base remota.

## Fallos y reversión

Antes de registrar el baseline se guarda evidencia de que el historial era inexistente o vacío.
Si después del repair el listado no coincide o el dry-run propone cambios, se revierte únicamente
esa entrada con `migration repair --status reverted <timestamp>` y se detiene el proceso. No se
intenta reparar en bloque ni se modifica el esquema o los datos remotos para forzar coincidencia.

## Criterios de aceptación

- El workdir activo contiene una única versión canónica, timestamped y sin duplicados.
- El baseline se reproduce desde cero en Supabase local.
- El contrato crítico local equivale al remoto y pasa el preflight 59.
- El remoto registra exactamente la versión del baseline.
- `migration list` muestra la misma versión local y remota.
- `db push --dry-run` informa que no hay migraciones pendientes.
- No cambian filas ni objetos de negocio en el remoto durante el registro.
- El historial legado sigue disponible, claramente rotulado y fuera del flujo productivo.

## Fuera de alcance

- Afirmar retrospectivamente qué operador ejecutó cada SQL histórico.
- Volver a ejecutar seeds, backfills o reparaciones históricas.
- Activar backups físicos/PITR del proyecto Supabase.
- Copiar datos remotos a Git o a una base local.
