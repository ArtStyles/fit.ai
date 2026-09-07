# Baseline trazable de migraciones Supabase — Diseño

**Fecha:** 2026-09-06
**Estado:** Implementado y verificado; integración Git final pendiente

## Problema confirmado

El esquema remoto estaba al día con el contrato de seguridad más reciente
(`trainer_security_preflight() = 59`), pero el proyecto remoto no tenía la tabla
`supabase_migrations.schema_migrations`. Supabase no conservaba, por tanto, un
ledger consultable de lo aplicado y un `db push` futuro no podía distinguir el
estado actual de migraciones pendientes.

El directorio histórico `supabase/migrations/` tampoco podía convertirse
directamente en la fuente activa del CLI:

- contiene 61 SQL con versiones cortas (`001`…`059`) y versiones duplicadas
  (`004`, `005`);
- incluye rollbacks que README excluye de una instalación normal;
- incluye `009_reset_test_accounts.sql`, que borra datos y es solo para
  desarrollo;
- varias migraciones ejecutan seeds, backfills o reparaciones de datos;
- numerosos tests y scripts leen esos archivos por su ruta actual, así que
  moverlos introduciría un cambio amplio y ajeno al objetivo.

## Decisión

Se creó una línea canónica aislada bajo `infra/`, con una única migración inicial
timestamped derivada del esquema remoto. El árbol histórico se conserva intacto
como evidencia y fixture de pruebas, pero queda fuera de toda operación de
producción del CLI.

No se marcaron `001`…`059` como aplicadas porque no existe evidencia de que cada
archivo se ejecutara literalmente y en ese orden. Tampoco se reescribió ni movió
el historial: ambas alternativas habrían producido trazabilidad ficticia o
ruido sin reducir el riesgo.

## Arquitectura resultante

```text
infra/
└── supabase/
    ├── config.toml
    ├── README.md
    └── migrations/
        └── 20260906233340_remote_schema_baseline.sql

supabase/
└── migrations/                     # legado/auditoría/fixtures; no usar con db push/reset
```

Los comandos mantenidos por el repositorio pasan por
`scripts/lib/supabase-migration-workdir.mjs`, que fija `supabase@2.116.0` y añade
siempre `--workdir infra`. Esto evita enviar accidentalmente los rollbacks o el
reset de cuentas del árbol histórico.

## Captura y contenido del baseline

El preestado remoto confirmó que `supabase_migrations.schema_migrations` no
existía. `supabase db pull` y `supabase db dump` agotaron el tiempo de espera, por
lo que la captura se realizó con PostgreSQL 17 `pg_dump --schema-only` sobre los
esquemas `public` y `private`.

El SQL resultante:

- conserva DDL, funciones, triggers, políticas, grants y comentarios del esquema
  de aplicación;
- no contiene filas de usuarios, entrenamientos, solicitudes ni otras tablas de
  negocio;
- incorpora solo cinco filas sanitizadas de configuración de buckets mediante
  un UPSERT idempotente;
- excluye mutaciones de privilegios por defecto del rol administrado
  `supabase_admin`;
- neutraliza al inicio los defaults heredados de tablas y funciones para
  `postgres` y restaura al final los defaults capturados;
- no crea secuencias, porque el esquema remoto tenía cero.

## Reproducción y equivalencia local

El baseline se reprodujo desde cero con los CLI 2.101, 2.112 y 2.116. La
verificación final usó el CLI fijado 2.116.0 y la imagen PostgreSQL 17.6.1.121,
igual a la remota. En local se confirmó:

- una sola versión aplicada: `20260906233340`;
- `trainer_security_preflight() = 59`;
- configuración exacta de los cinco buckets;
- privilegios por defecto equivalentes;
- esquemas `public` y `private` reproducibles.

Los dumps `public`/`private` normalizados del local y del remoto solo difirieron
en el token aleatorio de restricción de `pg_dump` y en el formato semánticamente
equivalente de una condición `AND`. No apareció ninguna diferencia de objetos de
aplicación.

## Registro remoto ejecutado

Se registró únicamente la versión `20260906233340` mediante
`migration repair --status applied`. La operación creó/concilió el ledger; no
ejecutó el DDL del baseline sobre el esquema remoto existente.

El postestado confirmó exactamente una fila con nombre
`remote_schema_baseline` y `1155` sentencias almacenadas. `migration list` alineó
la versión local y la remota, y `db push --dry-run` informó que no había nada
pendiente (`upToDate: true`). Un dump posterior al repair fue idéntico al
preestado, salvo el token aleatorio de `pg_dump`. No hizo falta revertir la marca
y no se realizó un `db push` real.

## CLI, autenticación y conexiones

El runner usa exactamente `supabase@2.116.0`. La regresión de `link` introducida
en 2.112 fue corregida a partir de 2.113. Durante la verificación final, la sesión
de Management API disponible en esta máquina respondió `Unauthorized` con los
CLI 2.101 y 2.116; por eso los comandos `--linked` requieren renovar el
login antes de usarse. Un fallo de autenticación no constituye evidencia sobre
el contenido del ledger.

La conexión preferida para migraciones es directa y, cuando solo hay IPv4, el
pooler en modo sesión. En este entorno, el puerto de sesión 5432 agotó el tiempo
de espera. El pooler de transacciones 6543 se verificó como fallback explícito
con los CLI 2.112 y 2.116, mientras que 2.101 colisionó al usar prepared
statements. Como el modo transacción no soporta prepared statements, solo se
documenta como excepción con 2.116 y una URL entregada de forma efímera; nunca se
versionan ni se imprimen URLs o credenciales.

## Ledger y alcance de la trazabilidad

`supabase_migrations.schema_migrations` contiene las columnas `version`,
`statements` y `name`. No registra operador, fecha de despliegue, SHA de Git,
aprobación, checksum ni SQL manual. El timestamp del nombre representa la
creación de la migración, no su despliegue.

La trazabilidad completa exige correlacionar la versión/archivo del ledger con
el SHA de Git que contiene ese SQL exacto y un log de despliegue sanitizado. Ese
log debe conservar entorno, aprobación, comandos y resultado sin URLs de
conexión, contraseñas ni tokens. No es correcto afirmar que una migración está
aplicada basándose solo en Git o en la presencia de objetos del esquema.

## Datos y seeds

El baseline es deliberadamente de esquema. Los seeds y backfills históricos
permanecen en `supabase/migrations/` para auditoría y para los harnesses que los
usan explícitamente. No existe seed automático en el workdir activo. La carga
del catálogo de ejercicios sigue siendo una operación explícita y separada con
`pnpm seed:exercises`; nunca se infiere copiando datos de producción.

## Flujo futuro

1. Crear migraciones nuevas, con timestamp de 14 dígitos, exclusivamente bajo
   `infra/supabase/migrations/`.
2. Validar el árbol y reconstruir la base local con `db reset --local`.
3. Renovar el login y enlazar el proyecto remoto de forma autenticada.
4. Ejecutar `migration list` y `db push --dry-run`.
5. Revisar y autorizar el `db push`; después volver a ejecutar `migration list`.
6. Conservar el SHA y un log sanitizado como evidencia de la operación.

`infra/supabase/.temp/` e `infra/supabase/.branches/` permanecen ignorados por
Git. Nunca se usa `db reset --linked`.

## Fallos y reversión

`migration repair` queda reservado para reconciliaciones de emergencia cuando
el esquema ya se verificó por otro medio; no es parte del despliegue normal. Si
un repair marca una versión incorrecta, `migration repair --status reverted`
elimina solo la fila del ledger. No deshace DDL ni datos.

Ante una discrepancia entre `migration list`, el dry-run y el contrato real del
esquema, se debe revertir la marca incorrecta y detener el proceso. No se repara
en bloque ni se modifica el esquema remoto para forzar coincidencia.

## Criterios de aceptación verificados

- [x] El workdir activo contiene una única versión canónica, timestamped y sin
  duplicados.
- [x] El baseline se reproduce desde cero en Supabase local.
- [x] El contrato crítico local equivale al remoto y pasa el preflight 59.
- [x] El remoto registra exactamente la versión del baseline.
- [x] `migration list` muestra la misma versión local y remota.
- [x] `db push --dry-run` informa que no hay migraciones pendientes.
- [x] El dump remoto no cambia durante el registro del ledger.
- [x] El historial legado sigue disponible, claramente rotulado y fuera del
  flujo productivo.

## Fuera de alcance

- Afirmar retrospectivamente qué operador ejecutó cada SQL histórico.
- Volver a ejecutar seeds, backfills o reparaciones históricas.
- Activar backups físicos/PITR del proyecto Supabase.
- Copiar datos remotos a Git o a una base local.
