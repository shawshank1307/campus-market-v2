# Changelog

## v2.0.0 — Campus Market v2

### New features
- **Wanted board** — post what you're looking for; sellers respond with *I have this* (pre-filled listing) or *Contact*.
- **Course-code search** — tag books with a course code (`CS201`) and find them with any spacing or dashes.
- **Unread messages badge** — in the header, the browser tab title and each conversation; refreshes every 30 s.
- **Seller ratings** — 1–5 stars with an optional comment, only after chatting with or buying from the seller, once per listing.
- **Safe meetup spots** — sellers pick a public place on campus for the hand-over.
- **Saved items** — ♥ any listing and find it later under *Saved items*.
- **Moving-out sale** — list up to 15 items at once, with their own tag and filter chip.
- **Up to 4 photos per listing**, with a gallery on the listing page.
- **Report a listing** — three reports from different students hide it automatically.
- **Negotiable** tag.

### Security
- Verification codes are **emailed via Resend** and never returned by the production API (`DEMO_OTP` is for local development only). Auth flows refuse to run if email isn't configured, instead of leaking codes.
- One-time codes: 5 wrong attempts burn the code, resend limited to once a minute, codes generated with `crypto.getRandomValues`.
- Fixed an **XSS vulnerability**: text inserted into HTML attributes (e.g. a listing title in an image's `alt`) wasn't escaping quotes, so a crafted title could run scripts in other users' browsers. Image sources are now also restricted to uploaded photos and `https` URLs.
- Server-side validation for every listing field (length, price range, category, photo count and size, course-code format).

### Fixes & polish
- The `hidden` attribute is now always respected (contact details on the Wanted board and the camera *Capture* button were showing when they shouldn't).
- Lists only send cover photos; full galleries load on the listing page.
- Older demo databases in `localStorage` upgrade automatically.

### Removed
- The legacy Flask backend, Render config and unused Supabase settings — the Cloudflare worker is the only API.

### Developer
- Test suites: API end-to-end (31 checks), demo backend (21), browser journeys incl. an XSS regression test (20).
- New docs: feature tour, API reference, deployment guide, architecture.
- D1 migration `0002_v2_features.sql`.

## v1.1 — Campus Market (pro)
- JKLU orange theme, emblem in the header, blooming-emblem opening animation.
- Dark mode with an ink-bleed transition.
- Password login with strength meter and forgot-password flow (PBKDF2-SHA256).
- Cream background with a subtle paper grain.

## v1.0 — Campus Market
- Full professional redesign of JKLU Swap: one consistent design system, glass UI, campus-photo hero, page and scroll transitions.
- Account menu replaces the login buttons after you sign in.

## v0 — JKLU Swap
- The original college marketplace: listings, sign-up with college ID, email codes, messages, demo checkout.
