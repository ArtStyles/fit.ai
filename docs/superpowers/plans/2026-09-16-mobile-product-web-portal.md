# Vekira mobile product and web portal implementation plan

**Goal:** Public download portal on main, complete product UI in codex/android-offline.
**Architecture:** Retain public account support and explicit bearer APIs; bundle original product UI in Android, with remote privileged operations and account-switch protection.
**Tech Stack:** Next.js, React, Supabase, Vite, Capacitor, TypeScript.
**Spec:** docs/superpowers/specs/2026-09-16-mobile-product-web-portal-design.md

## Constraints

- Work in existing main and Android checkouts as requested; preserve unrelated work.
- No mobile screen opens the web for normal product use; public legal/account help remains accessible.
- No service-role or AI secrets in the APK. All administrative authorization remains server-side.
- No live account mutations, migrations, Git push or deployment in this task without authorization.

## Tasks

- [x] Public portal: bilingual landing, real download, support links and route redirection. Files: marketing components/content, src/proxy.ts, root metadata, next.config.mjs and old PWA cleanup. Verify rendered links and HTTP redirects for authenticated/anonymous visitors.
- [x] Preserve account lifecycle: port API/delete/recovery and legal dependencies from Android. Verify missing/invalid bearer rejection and public recovery/deletion availability.
- [x] Shared mobile API: request-scoped verified identity/client, explicit envelopes/CORS, request limits, safe redirects and mobile account/session guards. Verify concurrent identities, invalid tokens, account switches and failures.
- [x] Coach/chat migration: original forms with API adapters for credential uploads, professional photo and AI chat; no handoff links. Delegate ownership of endpoints/adapters only.
- [x] Admin migration: original admin pages and explicit authorized read/write endpoints; no client-side privileges. Delegate ownership of admin endpoints/adapters only.
- [x] Integrate aliases/routes, server files in main, bundle boundary protections; review full diff.
- [x] Validate focused tests, both typechecks/builds, mobile regression suite, browser mobile/desktop journeys and signed APK. Record evidence and delivery boundaries.

## Ownership

Parent: proxy, lifecycle port, shared API, routes/aliases/OriginalApp, PWA, builds/distribution/docs.
Landing agent: marketing components/content/localized page/analytics click target.
Coach/chat agent: coaching/chat endpoint and Android adapters/forms.
Admin agent: admin endpoint and Android adapters/pages.

All agents share the helper signatures communicated in task messages; parent integrates server endpoint files into main. No task may change another task's owned files.

Evidence: docs/operations/2026-09-16-web-portal-android-1.1.27.md. Local implementation and verification complete; publication is a separate step.
