# Arquitectura local (Opción B) + reducción de coste de Vercel

> **Documento de decisión y referencia.** No es un plan de ejecución todavía.
> Sirve para retomar el tema "con calma" más adelante.

- **Fecha:** 2026-06-25
- **Estado:** Decisión tomada · ejecución aplazada (post-lanzamiento)
- **Decisión:**
  1. **Mantener Supabase** (NO migrar a Express).
  2. **Implementar la Opción B más adelante** (app estática empaquetada en el APK)
     por dos motivos: **bajar coste de Vercel** y **ganar UX local/offline**.
  3. Cuando se haga B, el cliente hablará **directo con Supabase** (sin Vercel en medio).

---

## Índice

1. [Resumen ejecutivo (TL;DR)](#1-resumen-ejecutivo-tldr)
2. [Punto de partida: cómo está montado hoy](#2-punto-de-partida-cómo-está-montado-hoy)
3. [El objetivo real: coste + UX local](#3-el-objetivo-real-coste--ux-local)
4. [Qué te cobra Vercel de verdad](#4-qué-te-cobra-vercel-de-verdad)
5. [Por qué cachear el HTML en local NO baja la factura](#5-por-qué-cachear-el-html-en-local-no-baja-la-factura)
6. [Opción A vs Opción B](#6-opción-a-vs-opción-b)
7. [Decisión: seguir con Supabase](#7-decisión-seguir-con-supabase)
8. [Por qué NO migrar a Express](#8-por-qué-no-migrar-a-express)
9. [Qué implica la Opción B (alcance del trabajo)](#9-qué-implica-la-opción-b-alcance-del-trabajo)
10. [El caso especial de la IA](#10-el-caso-especial-de-la-ia)
11. [Roadmap por fases (cuando se aborde B)](#11-roadmap-por-fases-cuando-se-aborde-b)
12. [Reality check antes de empezar](#12-reality-check-antes-de-empezar)
13. [Decisiones pendientes](#13-decisiones-pendientes)

---

## 1. Resumen ejecutivo (TL;DR)

- **El cache local de HTML NO reduce el coste de Vercel.** Solo puede cachear sin
  riesgo los assets estáticos (que ya son baratos y van por CDN). Lo que cuesta
  dinero —SSR + middleware personalizado por usuario— es justo lo que NO se puede
  cachear con seguridad.
- **Lo que baja la factura es eliminar el cómputo de servidor**, y eso lo hace la
  **Opción B** (export estático empaquetado en el APK): sin SSR, sin middleware,
  sin Server Actions. El usuario nativo no le pide **nada** a Vercel; los datos van
  del cliente **directo a Supabase**. Factura de Vercel por usuarios de la app → ~$0.
- **B también da el offline "de regalo"**: el cascarón vive dentro del APK, así que
  navegar entre secciones es 100% local por naturaleza.
- **Coste y offline convergen en B.** Las dos cosas que quieres se resuelven con la
  misma decisión.
- **No hace falta abandonar Supabase para nada de esto.** B funciona perfectamente
  con Supabase-directo. Migrar a Express sería un proyecto enorme, delicado en
  seguridad, y **no ahorraría dinero** (probablemente costaría más). → **Se descarta.**
- **Timing:** B es una reescritura grande. Tiene sentido hacerlo **cuando el coste
  sea real** (hoy, pre-lanzamiento, probablemente estás dentro del plan gratis).

---

## 2. Punto de partida: cómo está montado hoy

| Pieza | Estado actual |
|---|---|
| **Frontend** | Next.js 14 **App Router** + React 18 |
| **Render** | Server Components + **Server Actions** (≈35 archivos en `src/app/actions/`) |
| **Auth** | Supabase Auth vía `@supabase/ssr` + `src/middleware.ts` (OTP por email, sesiones por cookie) |
| **Datos** | Supabase (Postgres) — **164 llamadas `.from(...)`** repartidas en 35 archivos |
| **Autorización** | **RLS** en la base de datos (`020_social_rls.sql` + políticas en todo el esquema) |
| **Storage** | Supabase Storage — buckets de avatares y de posts (`018`, `021`) |
| **Realtime** | **No se usa** |
| **IA** | `@anthropic-ai/sdk` server-side en `src/lib/anthropic/client.ts` (necesita API key secreta) |
| **Empaquetado móvil** | Capacitor (Android) |
| **Carga en el móvil** | **Remota**: `capacitor.config.ts` → `server.url: https://fit-ai-kohl.vercel.app`. El APK **no lleva el HTML dentro**; abre la web en vivo desde Vercel |
| **PWA** | `@ducanh2912/next-pwa` configurado en `next.config.mjs`, **pero** `public/sw.js` es un *kill-switch* (borra cachés, se desregistra). El cacheo está **apagado a propósito** |

**Consecuencia clave del modelo remoto:** hoy, sin internet, la app prácticamente
no abre. Es ~100% dependiente de conexión. Y cada navegación pasa por Vercel.

---

## 3. El objetivo real: coste + UX local

Dos motivaciones, en orden de prioridad declarado:

1. **Reducir coste de servidor** → menos peticiones / menos cómputo en Vercel.
2. **Ganar experiencia de usuario local** → que la app abra y navegue con poca o
   nula dependencia de conexión.

> Nota importante: la idea inicial era "cachear todo el HTML en local". Eso ataca
> sobre todo el objetivo #2 (y solo a medias), pero **no** el #1. Ver siguiente sección.

---

## 4. Qué te cobra Vercel de verdad

Vercel **no** cobra por "cargar páginas" en general. Cobra por **cómputo de servidor**:

- **Invocaciones de función** (cada render SSR / Server Action).
- **Ejecuciones de middleware** (`src/middleware.ts` corre `supabase.auth.getUser()`
  en **cada navegación**).
- Los **assets estáticos** (JS/CSS/imágenes) salen del CDN y son baratísimos.

En el setup actual, cada navegación de un usuario ≈ **1 middleware + 1 SSR**, por
usuario, por página. Eso es la factura.

> El `matcher` del middleware (`src/middleware.ts`) **ya excluye** los estáticos
> (`_next/static`, imágenes, `sw.js`, `manifest.json`). Esa parte ya está bien
> optimizada; no hay nada que rascar ahí.

---

## 5. Por qué cachear el HTML en local NO baja la factura

La trampa, en una frase: **lo que se puede cachear sin riesgo es lo barato; lo caro
es lo que no se puede cachear.**

- Un Service Worker **puede** cachear assets estáticos → pero esos **ya son gratis**
  (CDN + ya excluidos del middleware). Ahorro: un poco de ancho de banda. Calderilla.
- Las peticiones **caras** (SSR + middleware personalizado por usuario) **no se
  pueden cachear con seguridad**: dependen del usuario logueado y de la sesión.
  Cachearlas = arriesgar datos obsoletos o del usuario equivocado. (Esto es
  exactamente lo que llevó a poner el *kill-switch* en `public/sw.js`.)

**Conclusión:** el cache local reduce el *número* de peticiones, pero solo elimina
las baratas. Como estrategia de **coste**, no mueve la aguja. Como estrategia de
**UX offline** sí aporta algo, pero parcial.

---

## 6. Opción A vs Opción B

| | **Opción A — Remoto + Service Worker** | **Opción B — Export estático en el APK** |
|---|---|---|
| **¿Baja el coste de Vercel?** | Casi nada (solo ancho de banda) | **Sí, drásticamente** (elimina SSR + middleware) |
| **¿Navegación offline real?** | A medias (cascarón sí, navegación fluida limitada) | **Sí, de lleno** (SPA local) |
| **Esfuerzo** | Bajo | Alto (reescritura grande) |
| **Riesgo** | Bajo | Medio |
| **Mantiene deploy "solo Vercel"** | ✅ Sí | ❌ No — recompilar APK en cada cambio de UI |
| **Conserva RSC + middleware + Server Actions** | ✅ Sí | ❌ No — todo pasa a cliente |
| **Peticiones a Vercel (usuario nativo)** | Todas | **~0** (datos van directo a Supabase) |

**Veredicto:** para los dos objetivos (coste + offline), **B es la respuesta**.
A no resuelve el coste, que es la prioridad.

---

## 7. Decisión: seguir con Supabase

Supabase se **mantiene**. Es el backend (Postgres + Auth + Storage + RLS) y seguirá
siéndolo en la Opción B. La diferencia con hoy: en B el **cliente habla directo con
Supabase**, sin pasar por Vercel.

Punto clave: **el ahorro de B viene de matar el cómputo de Vercel, NO de cambiar de
backend.** Son decisiones independientes. B + Supabase-directo es el punto óptimo de
coste y de trabajo.

---

## 8. Por qué NO migrar a Express

Se evaluó migrar Supabase → servidor Express. **Se descarta.** Razones:

**Salir de Supabase no es "cambiar de servidor", es reconstruir ~5 servicios:**

| Pieza | Esfuerzo de replicar en Express |
|---|---|
| Base de datos (164 queries) | 🟢 Fácil — Supabase *es* Postgres (`pg_dump` → restore) |
| **Auth** (OTP, sesiones, JWT) | 🔴 Difícil — reconstruir un producto entero, sensible a seguridad |
| **RLS → autorización en app** | 🔴 **El mayor riesgo** — hoy la autorización vive en la DB; cada endpoint tendría que comprobar a mano "este usuario solo toca sus filas" en los 164 sitios. Uno olvidado = fuga de datos |
| Storage (avatares, posts) | 🟡 Medio — mover a S3/R2 + migrar archivos |
| Realtime | 🟢 No se usa |
| IA | ⚪ Necesita servidor igual (ver §10) |

**Y sobre todo: no ahorra dinero.** Supabase (gratis/Pro $25) incluye DB + auth +
storage + API. Express = VPS + Postgres gestionado + almacenamiento + **tu tiempo
manteniéndolo para siempre** (parches, backups, uptime, escalado). Para un objetivo
de **coste**, va en dirección contraria.

> Express solo tendría sentido por *lock-in* o por necesitar lógica de servidor que
> Supabase no cubre — pero eso es una decisión de arquitectura, **no de coste**, y no
> es el caso ahora.

---

## 9. Qué implica la Opción B (alcance del trabajo)

`output: 'export'` genera HTML/JS estático (sin servidor en runtime). Eso es
**incompatible** con varias cosas que usas hoy, así que B = reescritura de la capa
servidor a cliente:

1. **Server Actions → llamadas cliente.** Los ≈35 archivos de `src/app/actions/`
   no funcionan en export. Cada acción pasa a ser una llamada del cliente a Supabase
   (o a una función serverless para casos especiales como IA).
2. **Middleware fuera.** No existe en export. La protección de rutas y el refresco de
   sesión pasan a hacerse **en cliente** (cliente de Supabase en el navegador/WebView).
3. **Auth en cliente.** El login/registro/OTP usan el cliente JS de Supabase
   directamente (ya lo haces en parte, p.ej. `VerifyCodeStep.tsx`).
4. **Datos en cliente.** Los 164 `.from(...)` se ejecutan desde el cliente contra
   Supabase. Conviene una capa de fetching/cache en cliente (p.ej. React Query/SWR,
   o ampliar Zustand con persistencia en `@capacitor/preferences`).
5. **RLS pasa a ser imprescindible.** Al llamar a Supabase desde el cliente, la
   seguridad la sostiene **enteramente RLS**. Hay que **auditar todas las políticas**
   antes de exponer el acceso directo. (Esto ya existe, pero hay que revisarlo a fondo.)
6. **Capacitor: de remoto a bundle.** Quitar `server.url` y empaquetar el export en
   `webDir`. A partir de ahí, cada cambio de UI requiere **recompilar el APK**
   (se pierde el flujo "solo deploy Vercel" para la app nativa).
7. **PWA / offline.** Reactivar un Service Worker real (quitar el *kill-switch*) o
   apoyarse en que el bundle ya es local. Definir estrategia de cache de datos.

> **Beneficio colateral de seguridad a vigilar:** hoy parte de la lógica vive en
> Server Actions (servidor, no manipulable por el cliente). Al moverla a cliente,
> cualquier validación/regla de negocio sensible debe quedar respaldada por **RLS o
> por la función serverless de IA**, nunca solo por código cliente.

---

## 10. El caso especial de la IA

`@anthropic-ai/sdk` usa una **API key secreta** → **no puede vivir en un cliente
estático** (la expondrías). En la Opción B sigues necesitando *algún* backend mínimo
solo para los endpoints de IA (coach, generación de planes, chat).

**No es un servidor completo.** Opciones:

- **Supabase Edge Functions** (encaja bien si te quedas en el ecosistema Supabase).
- Una o pocas **funciones serverless** (Vercel u otro) solo para IA.

Toda la lógica asociada (rate limits, usage tracking, filtros, carga de contexto del
coach — hoy en `src/lib/ai/*`) se movería a ese backend mínimo.

---

## 11. Roadmap por fases (cuando se aborde B)

> Orden sugerido para hacerlo incremental y con red de seguridad. Cada fase debería
> poder validarse antes de pasar a la siguiente.

- **Fase 0 — Verificar que hay problema de coste.** Mirar el dashboard de uso de
  Vercel. Si estás lejos de los límites, aplazar (ver §12).
- **Fase 1 — Auditoría de RLS.** Revisar TODAS las políticas para que el acceso
  directo desde cliente sea seguro. Es el prerequisito de todo lo demás.
- **Fase 2 — Backend mínimo de IA.** Mover Anthropic a Edge Function / serverless.
- **Fase 3 — Migrar la capa de datos a cliente.** Convertir Server Actions → llamadas
  Supabase desde cliente, con una capa de cache (React Query/SWR/Zustand persistido).
  Hacerlo por dominios (p.ej. perfil → feed → planes → sesiones).
- **Fase 4 — Auth en cliente + quitar middleware.** Protección de rutas en cliente.
- **Fase 5 — `output: 'export'` + Capacitor bundle.** Quitar `server.url`, empaquetar.
- **Fase 6 — Estrategia offline de datos.** Service Worker real / persistencia local /
  cola de sincronización para escrituras offline (p.ej. registrar entreno sin señal).

> Idea de alto valor independiente de todo: **offline-first solo en el flujo de
> registrar entrenamiento** (guardar local + sincronizar al recuperar señal). Los
> gimnasios tienen mala cobertura; esto puede valer más que el offline genérico y se
> puede priorizar.

---

## 12. Reality check antes de empezar

**¿Hay un problema de coste hoy, o es prevención?** Pre-lanzamiento y con poco
tráfico, lo más probable es que estés dentro del plan gratis o de los límites
incluidos de Vercel. Reescribir la app para ahorrar en una factura que hoy es ~$0
sería **optimización prematura**.

**Acción concreta antes de tocar nada:** abrir el dashboard de uso de Vercel y mirar
invocaciones de función + middleware + ancho de banda. Si no estás cerca de ningún
límite, este es un proyecto de "cuando crezca", no de ahora.

---

## 13. Decisiones pendientes

- [ ] ¿Capa de fetching/cache en cliente: React Query, SWR, o ampliar Zustand?
- [ ] ¿Backend de IA: Supabase Edge Functions o funciones serverless sueltas?
- [ ] ¿Se mantiene también una versión web (Vercel) además del APK, o solo nativo?
- [ ] ¿Estrategia de escrituras offline (cola de sync) o solo lectura offline?
- [ ] ¿Se prioriza el offline del flujo "registrar entreno" antes que B completo?
