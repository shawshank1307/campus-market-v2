# Contributing to Campus Market

Thanks for helping make campus trading easier!

## Getting started

```bash
python3 -m http.server 5500      # site on http://localhost:5500 (demo mode)
```

To work on the API, see [Run the API locally](docs/DEPLOYMENT.md#run-the-api-locally).

## Ground rules

- **Keep it build-free.** Plain HTML, CSS and ES modules — no frameworks or bundlers in the frontend.
- **Change both backends.** `js/local-api.js` (demo) must mirror `cloudflare-backend/src/index.ts` — same routes, rules and error messages.
- **Escape everything** from users with `escapeHtml()`, and image sources with `safeSrc()`.
- **Respect reduced motion** for any new animation.
- **Database changes** need a new numbered file in `cloudflare-backend/migrations/` *and* an update to `schema.sql`.

## Before opening a pull request

```bash
npm test                                          # demo backend
node tests/worker.e2e.mjs http://127.0.0.1:8787   # API (with wrangler dev running)
npm run test:ui                                   # browser journeys
```

Then:

1. Create a branch (`git checkout -b feature/my-feature`).
2. Commit with a clear message.
3. Open a pull request describing what changed and how you tested it.
