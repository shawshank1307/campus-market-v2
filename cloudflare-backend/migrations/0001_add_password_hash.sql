-- Adds password support to existing databases.
-- Apply with: npx wrangler d1 execute campus-market-db --remote --file=migrations/0001_add_password_hash.sql
ALTER TABLE users ADD COLUMN password_hash TEXT;
