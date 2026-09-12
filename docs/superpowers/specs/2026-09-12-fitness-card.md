# Fitness Card

Approved scope: an attractive personal fitness identity, a collection of cards shared by companions, and explicit owner-controlled access requests and revocation. This is a private in-app feature, not a public feed or an exported image.

## Experience

- Preserve the five global navigation tabs. Add a compact entry in Progreso and the personal account menu; `/fitness-card` is a dedicated page.
- Hub tabs: Mi tarjeta, Colección, Accesos. Opening another card presents the same cover and internal Marcas, Mapa, Fotos tabs.
- Cover uses Vekira typography, dark violet identity, crisp graphic framing, profile avatar, full name, existing @username, and optional artistic name. Three deliberate color treatments; no invented ranks or scores.
- Marcas shows best actual recorded sets across available history, with dates and units. Mapa counts distinct completed sessions per muscle over the last 12 weeks, with exact dates. Partial records contribute only supported evidence; attendance alone contributes no muscles or records.
- Up to three selected photos, with real preview, replace/remove, and full-screen viewing. Photo editing and sharing require a connected account. An offline/unlinked user can view their own local training projection and sees a clear connection action.
- Use existing accessible Radix tabs, dialogs, and selects; support 320px, 390px and desktop layouts, keyboard, Android Back, English and Spanish, reduced motion.

## Data and consent

- Reuse profiles.username and immutable user IDs. A share action by the owner grants access to the chosen @username. A request from a viewer stays pending until the owner approves. Cancel, reject, revoke and leave are explicit operations on an exact request ID.
- Only card preferences, a minimal projection of self-recorded training, and three photos are shared. No complete history, health information, measurements or backups are returned to viewers.
- New private card/access tables and a private storage bucket. Every protected read and image download checks active accounts and accepted access. Photos use authenticated downloads and short-lived in-memory blob URLs, never public or signed URLs.
- Realtime uses an own-row revision signal. Revocation notifies the removed viewer too. Events invalidate the visible card before authoritative refetch. Revalidate on focus/reconnect and periodically; clear viewer content on offline, hidden document, expired read lease, auth/account change or failed authorization. Never persist received card content.
- Owner creates the card explicitly. After creation, local training changes publish only the minimal validated projection while online. Serialized publication and expected revision checks prevent stale requests overwriting subsequent edits. Records describe recorded evidence, not externally verified achievements.
- Remote migration/deployment and real-account/device verification must be reported separately from local tests.
