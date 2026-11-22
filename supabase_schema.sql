-- ==============================================================================
-- JKLU Swap / Campus Marketplace — Supabase PostgreSQL Schema
-- ==============================================================================
-- How to run:
-- 1. Go to your Supabase Project Dashboard: https://supabase.com/dashboard
-- 2. Navigate to "SQL Editor" on the left sidebar
-- 3. Click "New Query", paste the content of this file, and click "Run"
-- ==============================================================================

-- 1. Enable UUID extension (useful for Supabase utilities)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- TABLE: users
-- ==============================================================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  roll_number TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  college_email TEXT NOT NULL UNIQUE,
  campus TEXT NOT NULL DEFAULT 'JKLU Campus',
  id_card_path TEXT NOT NULL,
  id_card_data BYTEA,
  email_verified INTEGER NOT NULL DEFAULT 0,
  id_verified INTEGER NOT NULL DEFAULT 0,
  created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- Index for authentication lookup by email & roll number
CREATE INDEX IF NOT EXISTS idx_users_college_email ON users(college_email);
CREATE INDEX IF NOT EXISTS idx_users_roll_number ON users(roll_number);

-- ==============================================================================
-- TABLE: sessions
-- ==============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- ==============================================================================
-- TABLE: otp_codes
-- ==============================================================================
CREATE TABLE IF NOT EXISTS otp_codes (
  college_email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at DOUBLE PRECISION NOT NULL
);

-- ==============================================================================
-- TABLE: listings
-- ==============================================================================
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  category TEXT NOT NULL,
  condition TEXT NOT NULL,
  campus TEXT NOT NULL DEFAULT 'JKLU Campus',
  emoji TEXT,
  image TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);

CREATE INDEX IF NOT EXISTS idx_listings_seller_id ON listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);

-- ==============================================================================
-- TABLE: conversations
-- ==============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  UNIQUE (listing_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_listing_id ON conversations(listing_id);
CREATE INDEX IF NOT EXISTS idx_conversations_buyer_id ON conversations(buyer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_seller_id ON conversations(seller_id);

-- ==============================================================================
-- TABLE: messages
-- ==============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);

-- ==============================================================================
-- TABLE: transactions
-- ==============================================================================
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);

CREATE INDEX IF NOT EXISTS idx_transactions_listing_id ON transactions(listing_id);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer_id ON transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller_id ON transactions(seller_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) SETTINGS FOR SUPABASE
-- ==============================================================================
-- If your Flask backend connects directly via DATABASE_URL (psycopg2),
-- it runs as the postgres user and bypasses RLS automatically.
--
-- If you also want to query tables directly via the Supabase Javascript Client
-- or Supabase REST APIs, uncomment the policies below to enable public read/write access:

-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Allow all access to users" ON users FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all access to sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all access to otp_codes" ON otp_codes FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all access to listings" ON listings FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all access to conversations" ON conversations FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all access to messages" ON messages FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all access to transactions" ON transactions FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- OPTIONAL: INITIAL SEED DATA
-- ==============================================================================
-- Creates default demo user and initial sample marketplace items

INSERT INTO users (id, name, roll_number, phone, college_email, campus, id_card_path, email_verified, id_verified, created_at)
VALUES (
  1,
  'Demo Seller',
  'DEMO001',
  '9999999999',
  'demo@jklu.edu.in',
  'JKLU Campus',
  'seed',
  1,
  1,
  EXTRACT(EPOCH FROM NOW())
)
ON CONFLICT (college_email) DO NOTHING;

-- Reset sequence for users so next inserted user starts at id = 2
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(MAX(id), 1)) FROM users;

-- Seed initial sample listings
INSERT INTO listings (id, seller_id, title, description, price, category, condition, campus, emoji, status, created_at)
VALUES
  ('1', 1, 'Engineering Mathematics — Grewal', 'Used for B.Tech Sem 1. Minimal highlighting.', 350, 'textbooks', 'Good', 'JKLU Campus', '📚', 'active', EXTRACT(EPOCH FROM NOW()) - 172800),
  ('2', 1, 'MacBook Air M1 — Perfect for CSE', 'Battery health 92%. Comes with charger.', 45000, 'electronics', 'Like New', 'JKLU Campus', '💻', 'active', EXTRACT(EPOCH FROM NOW()) - 86400),
  ('3', 1, 'Study Desk + Chair — Hostel Ready', 'Compact desk with chair.', 2500, 'furniture', 'Good', 'JKLU Campus', '🛋️', 'active', EXTRACT(EPOCH FROM NOW()) - 345600),
  ('4', 1, 'DSA & OS Tutoring — ₹300/hr', 'CSE 3rd year. Evenings at JKLU campus.', 300, 'services', 'Like New', 'JKLU Campus', '🛠️', 'active', EXTRACT(EPOCH FROM NOW()) - 43200),
  ('5', 1, 'JKLU Hoodie — Size M', 'Official JKLU merch, worn twice.', 800, 'clothing', 'Like New', 'JKLU Campus', '👕', 'active', EXTRACT(EPOCH FROM NOW()) - 259200),
  ('6', 1, 'Mini Fridge for Hostel Room', 'Works perfectly. Quiet compressor.', 3500, 'other', 'Good', 'JKLU Campus', '📦', 'active', EXTRACT(EPOCH FROM NOW()) - 432000)
ON CONFLICT (id) DO NOTHING;
