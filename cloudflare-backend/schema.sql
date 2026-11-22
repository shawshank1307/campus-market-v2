-- Cloudflare D1 Database Schema for Campus Market

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  roll_number TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  college_email TEXT NOT NULL UNIQUE,
  campus TEXT NOT NULL DEFAULT 'JKLU Campus',
  id_card_path TEXT NOT NULL,
  id_card_data TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  id_verified INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT,
  created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at REAL NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS otp_codes (
  college_email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  seller_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price REAL NOT NULL,
  category TEXT NOT NULL,
  condition TEXT NOT NULL,
  campus TEXT NOT NULL,
  emoji TEXT,
  image TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at REAL NOT NULL,
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL,
  buyer_id INTEGER NOT NULL,
  seller_id INTEGER NOT NULL,
  created_at REAL NOT NULL,
  UNIQUE(listing_id, buyer_id),
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at REAL NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  buyer_id INTEGER NOT NULL,
  seller_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at REAL NOT NULL,
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Seed Initial Demo User & Listings
INSERT OR IGNORE INTO users (id, name, roll_number, phone, college_email, campus, id_card_path, email_verified, id_verified, created_at)
VALUES (1, 'Demo Seller', 'DEMO001', '9999999999', 'demo@jklu.edu.in', 'JKLU Campus', 'seed.jpg', 1, 1, strftime('%s', 'now'));

INSERT OR IGNORE INTO listings (id, seller_id, title, description, price, category, condition, campus, emoji, status, created_at)
VALUES
  ('1', 1, 'Engineering Mathematics — Grewal', 'Used for B.Tech Sem 1. Minimal highlighting.', 350, 'textbooks', 'Good', 'JKLU Campus', '📚', 'active', strftime('%s', 'now') - 172800),
  ('2', 1, 'MacBook Air M1 — Perfect for CSE', 'Battery health 92%. Comes with charger.', 45000, 'electronics', 'Like New', 'JKLU Campus', '💻', 'active', strftime('%s', 'now') - 86400),
  ('3', 1, 'Study Desk + Chair — Hostel Ready', 'Compact desk with chair.', 2500, 'furniture', 'Good', 'JKLU Campus', '🛋️', 'active', strftime('%s', 'now') - 345600),
  ('4', 1, 'DSA & OS Tutoring — ₹300/hr', 'CSE 3rd year. Evenings at JKLU campus.', 300, 'services', 'Like New', 'JKLU Campus', '🛠️', 'active', strftime('%s', 'now') - 43200),
  ('5', 1, 'JKLU Hoodie — Size M', 'Official JKLU merch, worn twice.', 800, 'clothing', 'Like New', 'JKLU Campus', '👕', 'active', strftime('%s', 'now') - 259200),
  ('6', 1, 'Mini Fridge for Hostel Room', 'Works perfectly. Quiet compressor.', 3500, 'other', 'Good', 'JKLU Campus', '📦', 'active', strftime('%s', 'now') - 432000);
