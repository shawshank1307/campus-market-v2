# Campus Market API — Cloudflare Workers + D1

The production API for Campus Market: [Hono](https://hono.dev) running on Cloudflare Workers, with Cloudflare D1 (SQLite) for storage and [Resend](https://resend.com) for verification emails.

```
src/index.ts        Every route (auth, listings, saved, reports, ratings, wanted, messages, payments)
schema.sql          Full schema + sample data for a fresh database
migrations/         Upgrades for existing databases — apply in order
wrangler.jsonc      Worker + D1 binding config
.dev.vars.example   Local-only settings (copy to .dev.vars)
```

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars     # DEMO_OTP=1 → codes returned in API responses (local only!)
npm run db:init:local
npx wrangler dev                   # http://localhost:8787
```

Test it from the repo root: `node tests/worker.e2e.mjs http://127.0.0.1:8787` (31 checks).

## Configuration

| Name | Type | Purpose |
|---|---|---|
| `DB` | D1 binding | The database (`wrangler.jsonc`) |
| `RESEND_API_KEY` | **secret** | Sends verification codes — `npx wrangler secret put RESEND_API_KEY` |
| `EMAIL_FROM` | var | Sender, e.g. `Campus Market <noreply@your-domain.com>` |
| `DEMO_OTP` | var | `1` returns codes in responses. **Local development only.** |

Without `RESEND_API_KEY` or `DEMO_OTP`, sign-up and code requests return `503` instead of leaking codes.

## Deploying

See the [deployment guide](../docs/DEPLOYMENT.md). Full endpoint docs: [API reference](../docs/API.md).
