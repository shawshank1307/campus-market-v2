# Security policy

## Reporting a vulnerability

Please **don't** open a public issue for security problems. Instead, contact the maintainer privately through their GitHub profile ([@shawshank1307](https://github.com/shawshank1307)) with steps to reproduce. We aim to respond within 7 days.

## How Campus Market protects students

The full design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#security-design). In short:

- **Passwords** are hashed with PBKDF2-SHA256 (100,000 iterations, random salt) and compared in constant time.
- **Verification codes** are only ever emailed in production, expire in 10 minutes, are rate-limited, and are destroyed after 5 wrong attempts.
- **Resetting a password** signs the account out everywhere.
- **All user content is escaped** before rendering, including inside HTML attributes; image sources are restricted to uploaded photos and `https` URLs. A browser test checks this on every run.
- **Only verified students** can list, message, rate, report or see contact details.
- **Abuse controls**: ratings require a real interaction, and three reports hide a listing automatically.

## Operator checklist

- [ ] `RESEND_API_KEY` is set as a Wrangler **secret** (not in `wrangler.jsonc`).
- [ ] `DEMO_OTP` is **not** set in production.
- [ ] Sample data from `schema.sql` has been removed.
- [ ] D1 backups are exported before running migrations.
