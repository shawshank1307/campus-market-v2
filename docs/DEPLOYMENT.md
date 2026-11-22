# Deployment guide

Campus Market has two parts:

| Part | What it is | Where it runs |
|---|---|---|
| **Frontend** | Static files (`index.html`, `css/`, `js/`, `assets/`) | Any static host — GitHub Pages, Cloudflare Pages, Netlify |
| **API** | `cloudflare-backend/` (Hono + D1) | Cloudflare Workers |

You need: a Cloudflare account (free), Node.js 18+, and a [Resend](https://resend.com) account (free) for email.

---

## Run the API locally

```bash
cd cloudflare-backend
npm install
cp .dev.vars.example .dev.vars        # DEMO_OTP=1 → codes are returned in responses
npm run db:init:local                 # creates a local SQLite database
npx wrangler dev                      # API on http://localhost:8787
```

Then serve the frontend (`python3 -m http.server 5500` in the repo root). On `localhost` the frontend automatically uses `http://localhost:8787` when it's up, and demo mode when it isn't.

Run the API tests against it:

```bash
node tests/worker.e2e.mjs http://127.0.0.1:8787
```

---

## Deploy the API

### 1. Create the database (first time only)

```bash
cd cloudflare-backend
npx wrangler login
npx wrangler d1 create campus-market-db
```

Copy the printed `database_id` into `wrangler.jsonc`, then load the schema:

```bash
npm run db:init:remote
```

`schema.sql` also inserts a demo seller and six sample listings so the site isn't empty. Remove them when you launch:

```bash
npx wrangler d1 execute campus-market-db --remote --command "DELETE FROM listings WHERE seller_id = 1; DELETE FROM users WHERE id = 1;"
```

### 1b. …or upgrade an existing database

If you already ran an older version, apply the migrations **in order** instead of the schema:

```bash
npx wrangler d1 execute campus-market-db --remote --file=migrations/0001_add_password_hash.sql
npx wrangler d1 execute campus-market-db --remote --file=migrations/0002_v2_features.sql
```

> ⚠️ This changes your live database. Export a backup first:
> `npx wrangler d1 export campus-market-db --remote --output=backup.sql`

Accounts created before passwords existed can set one with **Forgot password** on the login page.

### 2. Set up email (Resend)

1. Sign up at [resend.com](https://resend.com) and create an API key.
2. To email any address, verify a domain you own in Resend (*Domains → Add domain*). Without a domain, Resend only delivers to your own account email — fine for testing.
3. Store the key as a secret — it never goes in the code:

```bash
npx wrangler secret put RESEND_API_KEY
```

4. Set the sender in `wrangler.jsonc`:

```jsonc
"vars": { "EMAIL_FROM": "Campus Market <noreply@your-domain.com>" }
```

> **Never set `DEMO_OTP=1` in production.** It makes the API return verification codes in responses, which would let anyone verify or reset any account.
> Without `RESEND_API_KEY` (and without `DEMO_OTP`), sign-up and code requests are refused with a clear error, rather than silently leaking codes.

### 3. Deploy

```bash
npx wrangler deploy
```

Check it: `https://campus-market-backend.<you>.workers.dev/api/health`.

### 4. Point the frontend at it

In `js/config.js`:

```js
export const PRODUCTION_API_URL = "https://campus-market-backend.<you>.workers.dev";
```

---

## Deploy the frontend

### GitHub Pages

The repo includes `.github/workflows/pages.yml`, which publishes the site on every push to `main`.

1. *Settings → Pages → Build and deployment → Source: GitHub Actions*.
2. Push to `main`. The site appears at `https://<you>.github.io/<repo>/`.

GitHub Pages on a **private** repository needs a paid GitHub plan; make the repo public or use Cloudflare Pages / Netlify instead.

### Cloudflare Pages / Netlify

Point them at the repo with **no build command** and the repo root as the output directory.

---

## Customising

| What | Where |
|---|---|
| Site name, tagline | `js/config.js` → `SITE`, plus `index.html` (title, header, footer) |
| Campus photos, logo | `assets/jklu/` and `js/config.js` → `CAMPUS_PHOTOS`, `LOGO` |
| Meetup spots | `js/data.js` → `MEETUP_SPOTS` |
| Categories | `js/data.js` and `CATEGORIES` in `cloudflare-backend/src/index.ts` (keep them in sync) |
| Accepted email domains | `COLLEGE_EMAIL_RE` in `cloudflare-backend/src/index.ts` |
| Colours | `:root` tokens at the top of `css/styles.css` |
