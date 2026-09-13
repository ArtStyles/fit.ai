# Fitness Card social profiles and QR exchange

> Execute in the existing Android worktree. Keep each implementation responsibility separate, then verify the complete flow before release.

**Goal:** Show configured Instagram, X and Facebook profile icons; flip the card to a real QR and let another Vekira user request access by scanning it.

**Architecture:** Social links are canonical HTTPS profile URLs stored with the private card and saved atomically with its style. The QR carries only a stable owner ID in a validated Vekira link. Scanning resolves minimal identity and consent status, then requires an explicit request; existing owner approval and revocation remain authoritative.

**Constraints:** Preserve the matte card and accent animation, five app tabs, offline personal training, account boundaries, old APK compatibility, and reduced-motion support. Never nest social links or action buttons inside another button. No private card evidence or photo URLs go in the QR. A custom Vekira link plus the in-app scanner provides exchange without inventing a live website route.

- [x] Backend/shared contracts: migration `20260913010000_fitness_card_social_qr.sql`, safe social normalizer, parsers, versioned save RPC, invite lookup and stable-owner request RPC. Verify canonical URLs, atomic conflicts, old save preservation, pending/accepted/revoked behavior and grants in disposable PostgreSQL.
- [x] Cover: optional social icons, separate click targets, accessible front/back faces, real QR SVG with four-module margin, focus restoration, reduced motion and legible narrow layouts.
- [x] Scanning/native entry: lazy local QR decoder, camera and image import, cleanup on close/hidden/unmount, strict URI parser, bounded pending invite across sign-in and cold/warm Android link delivery.
- [x] Integration: editor fields and revision protection, hub scanner and explicit invite confirmation, existing collection/detail actions, disabled draft QR, account/offline clearing.
- [x] Validation: focused tests, mobile/web types and scoped lint; browser 320/390/1440 with real generated-QR image decoding, unsafe links, hidden icons, flip/focus, scanner cancellation, consent flow, regressions and reduced motion.
- [x] Release: review the new migration, inspect remote predecessor ledger and dry run, apply only the feature migration, verify live schema/ACL/function bodies; build and verify a signed Android update with production settings and record activation/build evidence.

Primary implementation references: [qrcode.react](https://github.com/zpao/qrcode.react), [qr-scanner](https://github.com/nimiq/qr-scanner), [Capacitor deep links](https://capacitorjs.com/docs/guides/deep-links).
