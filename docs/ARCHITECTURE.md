# Architecture

## The big picture

```
 Browser
 ┌──────────────────────────────────────────────────────────────┐
 │  index.html ── css/styles.css                                 │
 │      │                                                        │
 │  js/app.js  (hash router: #/, #/item/:id, #/sell, #/wanted…)  │
 │      │                                                        │
 │  js/api.js ──── GET /api/health ok? ──┬── yes ──► Cloudflare   │
 │                                       │           Worker (Hono)│──► D1 (SQLite)
 │                                       │                │       │
 │                                       └── no ───► js/local-api.js  ──► localStorage
 │                                                   (demo backend)│
 └──────────────────────────────────────────────────────────────┘
                                                      Resend ◄── verification emails
```

- **No build step.** The browser loads ES modules directly. Anything you change is live on refresh.
- **One API, two implementations.** `js/local-api.js` mirrors every route of `cloudflare-backend/src/index.ts`, including validation rules and error messages. That's what makes demo mode work offline, and it's why both have their own test suite.
- **Hash routing.** URLs look like `/#/item/abc123`, so any static host can serve the site without rewrite rules.

## Frontend

| File | Responsibility |
|---|---|
| `js/app.js` | Router, every screen, header state, saved items, unread polling, page and scroll animations |
| `js/api.js` | Picks the real API or demo mode, attaches the session token, normalises errors |
| `js/auth.js` | Current user + login/logout |
| `js/theme.js` | Light/dark theme, persisted in `localStorage`; ink-bleed transition via the View Transitions API with a crossfade fallback |
| `js/password.js` | PBKDF2 hashing (demo backend) and the shared password rules + strength meter |
| `js/image-utils.js` | Resizes photos to ≤ 1000 px JPEG in the browser before upload |

Rendering is plain template strings into `#app`. Every value from users goes through `escapeHtml()` before it touches the DOM.

### Motion

- The **splash** is pure CSS (it runs even before JavaScript loads) and is skipped on later visits in the same tab and for reduced-motion users.
- **Page transitions**: `#app` gets a short fade/slide/blur-in on each route change.
- **Cards** fade up as they scroll into view (`IntersectionObserver`), staggered.
- **Theme switch**: the browser snapshots the old and new page; the new one is revealed through an SVG ink-blot mask (`feTurbulence` + `feDisplacementMap`) that grows from the click point.
- Everything respects `prefers-reduced-motion`.

## Backend

Hono on Cloudflare Workers with a D1 database. Every route is in `cloudflare-backend/src/index.ts`.

### Data model

```
users ─┬─< sessions
       ├─< listings ─┬─< conversations ─┬─< messages
       │             │                  └─< conversation_reads (per user)
       │             ├─< saved_listings
       │             ├─< reports
       │             └─< transactions
       ├─< ratings     (seller_id, rater_id, listing_id — survives listing deletion)
       └─< wanted_posts
otp_codes (one row per email: code, expiry, failed attempts)
```

Key columns added in v2: `listings.images` (JSON array), `course_code`, `meetup_spot`, `negotiable`, `sale_tag`, `status = 'hidden'`; `otp_codes.attempts`.

### Rules enforced on the server (not just the UI)

| Rule | Where |
|---|---|
| Only verified students can list, message, report, rate or post wanted requests | `verifiedUser()` |
| Listing input limits (title, description, price, category, ≤ 4 photos, course-code format) | `readListingInput()` |
| A rating requires a conversation or purchase on that listing, once per listing, never your own | `canRate()` |
| 3 distinct reports → listing hidden; hidden listings 404 for everyone but the seller | report route, `GET /api/listings/:id` |
| Wanted-post contact details only for verified viewers | `GET /api/wanted` |
| Unread = messages from others newer than your `last_read_at` | `conversation_reads`, `markRead()` |

## Security design

| Threat | Mitigation |
|---|---|
| Logging into someone else's account | Password required (roll numbers are guessable); PBKDF2-SHA256, 100k iterations, 16-byte random salt, constant-time compare |
| Stealing an account through "forgot password" | Codes are **only emailed** in production (`DEMO_OTP` is local-only); the API refuses to run auth flows without an email provider |
| Brute-forcing a 6-digit code | 5 wrong attempts burns the code; resend limited to once a minute; codes expire after 10 minutes; codes come from `crypto.getRandomValues` |
| Old sessions after a reset | Resetting a password deletes all of that user's sessions |
| Cross-site scripting | All user content is escaped before rendering |
| Oversized uploads | Photos are compressed client-side and size-checked server-side |
| Scam listings | Verified-only accounts, ratings gated on real interactions, auto-hide after reports |

Known limitations worth knowing about:

- Sessions don't expire on their own; logging out deletes the session.
- Login attempts aren't rate-limited yet (Cloudflare's rate-limiting rules can be added in front of the worker).
- Photos are stored as data URLs in D1. That's fine for a single campus; for larger scale move them to R2.
- Student ID photos are reviewed manually — the API stores them but doesn't verify them automatically.
