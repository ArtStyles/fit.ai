# Diseño — Descubrimiento de usuarios (buscar + sugeridos)

- **Fecha:** 2026-06-26
- **Estado:** Aprobado para planificar
- **Autor:** ArtStyles (con Claude)
- **Depende de:** Red social Fases 1-2 (en `main`).

## 1. Contexto y objetivo

Hoy a los perfiles solo se llega tocando el autor de un post en el feed. Falta una forma de
**encontrar gente para seguir**. Este sub-proyecto añade búsqueda de usuarios + una lista de
sugeridos. Es independiente de "cuentas privadas" (sub-proyecto aparte que vendrá después);
reutiliza el `FollowButton` y los datos existentes, así que cuando cambie la privacidad lo
heredará casi sin retoques.

No requiere tablas nuevas: usa la vista `public_profiles`, `posts` y `follows` ya existentes.

## 2. Decisiones tomadas (brainstorming)

- **Alcance:** búsqueda + sugeridos.
- **Criterio de sugeridos:** usuarios **recientemente activos** (que han publicado posts hace
  poco). Bootstrapea bien aunque nadie tenga seguidores aún.
- **Acceso:** icono de lupa en la cabecera de `/feed` → página dedicada `/buscar`.

## 3. Datos / Server Actions (sin migración)

Lógica pura en `src/lib/social/discovery.ts` (testeable):
- `sanitizeSearch(raw: string): string` — recorta y elimina caracteres que rompen el filtro
  `.or(...)` de PostgREST o permiten inyección en él (`, ( ) * %` y espacios sobrantes).
  Devuelve `''` si no queda nada útil.
- `dedupePreservingOrder(ids: string[]): string[]` — quita duplicados conservando el primer
  orden de aparición (para sugeridos a partir de posts recientes).

Acciones en `src/app/actions/users.ts`:
- `searchUsers(rawQuery: string): Promise<SuggestedUser[]>`
  - `q = sanitizeSearch(rawQuery)`; si `q === ''` → `[]`.
  - `public_profiles` con `.or('username.ilike.%q%,full_name.ilike.%q%')`, `.neq('id', me)`,
    `.limit(20)`.
  - Excluye usuarios bloqueados (cualquier dirección) consultando `user_blocks` y filtrando.
  - Calcula `isFollowing` para los ids resultantes (una consulta a `follows`).
- `getSuggestedUsers(): Promise<SuggestedUser[]>`
  - Toma `user_id` de los `posts` más recientes (`order created_at desc`, `limit 50`),
    `dedupePreservingOrder`, excluye a uno mismo, a quienes ya sigo y a bloqueados, corta a 10,
    carga sus `public_profiles`. `isFollowing = false` (ya excluidos los seguidos).

Tipo compartido en `src/lib/social/types.ts`:
```ts
export type SuggestedUser = PostAuthor & { isFollowing: boolean }
```

## 4. UI

- **`/feed`** (`src/app/(app)/feed/page.tsx`): añadir un icono de lupa enlazado a `/buscar` en
  la cabecera, junto a "Publicar".
- **`/buscar`** (`src/app/(app)/buscar/page.tsx`, server component): ejecuta
  `getSuggestedUsers()` y renderiza `UserSearch` con esa lista inicial.
- **`UserSearch.tsx`** (cliente): caja de búsqueda con **debounce (~300 ms)** que llama a
  `searchUsers`. Caja vacía → muestra los **sugeridos** (prop inicial); con texto → resultados.
  Estados de carga y "sin resultados". Cabecera con botón Volver.
- **`UserRow.tsx`** (cliente o server según necesidad): fila reutilizable — avatar + nombre +
  `@usuario`, enlace a `/u/[username]`, y el **`FollowButton`** existente a la derecha
  (`targetId`, `initialFollowing`).

## 5. Testing

- **Unit (vitest):** `sanitizeSearch` (recorta, quita `,()*%`, vacíos) y
  `dedupePreservingOrder` — funciones puras, TDD.
- **Acciones/UI:** `pnpm type-check` + `pnpm build`.
- **Checklist manual:**
  1. Buscar por nombre y por `@usuario` devuelve resultados.
  2. La búsqueda excluye a uno mismo y a usuarios bloqueados.
  3. Seguir/dejar de seguir desde un resultado funciona (actualiza el botón).
  4. Con la caja vacía se ven sugeridos = quienes publicaron hace poco (sin incluirme ni a los
     que ya sigo).
  5. Una query con caracteres raros (`a, b ( c )`) no rompe la búsqueda.

## 6. Despliegue

Solo web/UI + acciones de lectura. **Sin migración**, sin tocar nativo → deploy Vercel.

## 7. Fuera de alcance

- Búsqueda de posts / hashtags.
- Historial de búsquedas recientes.
- Ranking avanzado de sugeridos (por afinidad, etc.).
- Paginación de resultados (con ~20 / ~10 basta para v1).
- Cualquier cosa de cuentas privadas (sub-proyecto aparte).

## 8. Notas

- `searchUsers`/`getSuggestedUsers` leen `public_profiles` (solo columnas no sensibles) y
  respetan el bloqueo filtrando contra `user_blocks`. Cuando se implementen cuentas privadas,
  estas acciones podrán enriquecer el estado del botón (seguir/solicitar) reutilizando el mismo
  `FollowButton`.
