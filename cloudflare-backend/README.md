# Campus Market — Cloudflare Workers & D1 Edge Backend

High-performance, edge-deployed serverless REST API for Campus Market built with **Cloudflare Workers**, **Hono**, and **Cloudflare D1** (distributed SQLite at the edge).

## 🚀 Why Cloudflare Workers & D1?

- **Ultra-low latency**: Global edge network with <10ms response times worldwide.
- **Zero cold starts**: Unlike Render free tier which sleeps and takes 50+ seconds to spin up, Cloudflare Workers start instantly (0ms).
- **Global edge database**: Cloudflare D1 brings SQLite databases directly to the edge next to the user.
- **Generous Free Tier**: 100,000 requests/day, 5M D1 reads/day completely free.

---

## 🛠️ Project Structure

```
cloudflare-backend/
├── src/
│   └── index.ts          # Complete Hono API (Auth, Listings, Chat, Payments, Health)
├── schema.sql            # D1 database schema with initial seed data
├── wrangler.jsonc        # Cloudflare Wrangler configuration
├── package.json
└── tsconfig.json
```

---

## 💻 Local Development

### 1. Initialize Local D1 Database
Execute the schema and initial seed listings on the local Miniflare D1 database:

```bash
cd cloudflare-backend
npm run db:init:local
```

### 2. Start Local Worker Dev Server
Start the local Worker on `http://localhost:8787`:

```bash
npm run dev
```

Test the health endpoint:
```bash
curl http://localhost:8787/api/health
```

---

## 🌐 Deploying to Cloudflare (Step-by-Step)

### Step 1: Login to Cloudflare
In your terminal, authorize Wrangler with your Cloudflare account:

```bash
npx wrangler login
```
*(This opens a browser tab for one-click authorization).*

### Step 2: Create Remote D1 Database
Create the production D1 database on your Cloudflare account:

```bash
npx wrangler d1 create campus-market-db
```

Wrangler will output the `database_id`. Open `wrangler.jsonc` and paste your `database_id`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "campus-market-db",
    "database_id": "<PASTE-YOUR-DATABASE-ID-HERE>"
  }
]
```

### Step 3: Run Database Migrations on Cloudflare
Execute the schema and seed data on the production database:

```bash
npm run db:init:remote
```

### Step 4: Deploy the Worker
Deploy the API to Cloudflare edge:

```bash
npm run deploy
```

You will get an instant live URL such as:
```
https://campus-market-backend.<your-subdomain>.workers.dev
```

---

## 🌍 Connecting a Free Domain (DigitalPlat FreeDomain)

To connect a free custom domain using [DigitalPlat FreeDomain](https://github.com/DigitalPlatDev/FreeDomain):

1. **Claim your free domain**:
   - Go to [DigitalPlat FreeDomain Dashboard](https://dash.domain.digitalplat.org/).
   - Register a free domain with your preferred extension (`.dpdns.org`, `.us.kg`, `.qzz.io`, `.xx.kg`, `.qd.je`).
2. **Add to Cloudflare**:
   - In your [Cloudflare Dashboard](https://dash.cloudflare.com/), click **Add site** and enter your registered free domain.
   - Cloudflare will provide two nameservers (e.g. `adam.ns.cloudflare.com` and `eve.ns.cloudflare.com`).
   - In DigitalPlat FreeDomain dashboard, update your domain's Custom Nameservers to Cloudflare's nameservers.
3. **Bind to your Worker**:
   - In Cloudflare Dashboard, navigate to **Compute (Workers) > campus-market-backend > Settings > Domains & Routes**.
   - Click **Add Custom Domain** and enter e.g. `api.yourdomain.dpdns.org`.
4. **Update Frontend Configuration**:
   - In `campus-market/js/config.js`, update `PRODUCTION_API_URL` with your new custom domain or `workers.dev` URL:
     ```javascript
     export const PRODUCTION_API_URL = "https://api.yourdomain.dpdns.org";
     ```
