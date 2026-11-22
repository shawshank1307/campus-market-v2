# Campus Market

Campus Market lets verified students buy and sell textbooks, electronics, furniture and more with people on your campus.

## Features

- **Verified accounts:** college email code plus a student ID photo at sign-up
- **Password login:** passwords are hashed with PBKDF2-SHA256, never stored in plain text; "Forgot password" uses an emailed code
- **Listings:** browse, search, filter by category, sort by price or date
- **In-app messaging** between buyers and sellers
- **Demo checkout**
- JKLU orange theme, glass UI, campus photo hero, smooth page and scroll transitions
- **Opening animation:** the JKLU emblem blooms open like a flower (once per session)
- **Dark mode** with an ink-bleed transition that spreads from where you click
- **A friendly stickman** who walks along the bottom of the screen (hover = wave, click = jump + tip, double-click = hide)
- All motion respects the system "reduce motion" setting

## Run locally

No build step. Serve the folder with any static server:

```bash
python3 -m http.server 5500
```

Then open http://localhost:5500.

If no backend is running, the app switches to a **demo mode** that stores data in your browser's localStorage. Verification codes are shown on screen.

## Backend (Cloudflare Workers + D1)

The production API lives in `cloudflare-backend/`.

```bash
cd cloudflare-backend
npm install
npx wrangler dev          # local API on :8787
npx wrangler deploy       # deploy
```

**Upgrading an existing database** to support passwords:

```bash
npx wrangler d1 execute campus-market-db --remote --file=migrations/0001_add_password_hash.sql
```

Accounts created before passwords existed can set one using **Forgot password**.

## Credits

The dark-mode ink transition is inspired by [Ink Bleed](https://github.com/codemure-official/ink-bleed-theme-changer) by Codemure (MIT License). This version is a lightweight re-implementation using the browser's View Transitions API instead of WebGL snapshots.

## Project layout

```
index.html          App shell
css/styles.css      All styles
js/app.js           Views and router
js/api.js           API client (falls back to demo mode)
js/local-api.js     In-browser demo backend
js/password.js      Password hashing and validation
js/theme.js         Light/dark theme + ink-bleed transition
js/stickman.js      The walking stickman
js/config.js        Site name, photos, API URL
cloudflare-backend/ Production API (Hono on Workers + D1)
backend/            Legacy Flask API
```
