# Local product demo captures

Run from the repository root:

```powershell
pnpm exec tsx scripts/marketing-demo/capture.ts
```

This bundles the existing `SessionClient`, `DashboardPrimaryFlow` / `DashboardHeader` / `DashboardWeekJourney`, and `ProgressHub` components. Their actual Zustand store, view models, `I18nProvider`, `ToastProvider`, Tailwind styles and app fonts are used. Only Next framework adapters, remote server actions and the wake-lock hardware boundary are replaced in this local bundle. The script never loads an environment file, authenticates, creates an account, seeds a database, or runs the account-based screenshot script.

Requirements are the repository's installed dependencies, its Playwright Chromium, and the app's cached Plus Jakarta Sans / Barlow Condensed font files in `.artifacts/auth-ui` with `local-fonts.css`. `MARKETING_DEMO_FONT_DIR` can point to another local directory containing the same font files and stylesheet. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium executable. No dependency or font download occurs during capture.

The HTTP server binds only to `127.0.0.1` on an available ephemeral port and closes after capture. Browser traffic outside that local origin is blocked, and the capture fails on browser errors, blocked requests, missing images, spinners or placeholder account labels. An import check prevents production Supabase/server-action code from entering the bundle.

`fixture-data.ts` is the single source of the fictional bilingual data: Alex, three strength workouts per week, twenty-four completed sessions over eight weeks, two modest personal records, and an active upper-body session after two bench-press sets. The selected four-week range compares eleven recent completed sessions against twelve in the preceding period; today is an unfinished Monday session. Both periods have realistic volumes, so comparison uses sufficient history instead of an artificially small baseline. Dates and elapsed time are fixed. Values come from props and the real view models; charts and controls are never redrawn.

Outputs are the six `public/marketing/demo-{session,dashboard,progress}-{es,en}.webp` assets. Session/dashboard use a real 390px-wide viewport; session height grows if necessary to show the entire active set above its fixed action dock. Progress uses a 760px-wide viewport so the real weekly chart fits without horizontal cropping. The first two complete progress cards are captured at their natural height. Every capture uses device pixel ratio 2 to preserve readable text on retina displays, so image pixel dimensions are twice the logical viewport dimensions. PNG review copies, exact dimensions and an input manifest are saved to `.artifacts/marketing-demo`. Landing captions must identify these as example data.
