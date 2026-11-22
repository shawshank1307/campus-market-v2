-- Campus Market v2: photos, course codes, meetup spots, saved items, reports,
-- ratings, wanted posts, unread tracking and OTP attempt limits.
-- Apply after 0001:
--   npx wrangler d1 execute campus-market-db --remote --file=migrations/0002_v2_features.sql

ALTER TABLE listings ADD COLUMN images TEXT;
ALTER TABLE listings ADD COLUMN course_code TEXT;
ALTER TABLE listings ADD COLUMN meetup_spot TEXT;
ALTER TABLE listings ADD COLUMN negotiable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN sale_tag TEXT;

ALTER TABLE otp_codes ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS saved_listings (
  user_id INTEGER NOT NULL,
  listing_id TEXT NOT NULL,
  created_at REAL NOT NULL,
  PRIMARY KEY (user_id, listing_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL,
  reporter_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  created_at REAL NOT NULL,
  UNIQUE (listing_id, reporter_id),
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
);

-- listing_id has no foreign key so ratings survive when a listing is deleted.
CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL,
  seller_id INTEGER NOT NULL,
  rater_id INTEGER NOT NULL,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at REAL NOT NULL,
  UNIQUE (listing_id, rater_id),
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (rater_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ratings_seller ON ratings(seller_id);

CREATE TABLE IF NOT EXISTS wanted_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  budget REAL,
  category TEXT NOT NULL DEFAULT 'other',
  course_code TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at REAL NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_reads (
  conversation_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  last_read_at REAL NOT NULL,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
