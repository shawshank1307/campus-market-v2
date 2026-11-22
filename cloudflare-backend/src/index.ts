import { Context, Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
};

type Variables = {
  user?: UserRow;
};

interface UserRow {
  id: number;
  name: string;
  roll_number: string;
  phone: string;
  college_email: string;
  campus: string;
  id_card_path: string;
  id_card_data?: string | null;
  email_verified: number;
  id_verified: number;
  password_hash?: string | null;
  created_at: number;
}

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

const COLLEGE_EMAIL_RE = /^[a-zA-Z0-9._%+-]+@(?!gmail\.com|yahoo\.com|hotmail\.com|outlook\.com)[a-zA-Z0-9.-]+\.(edu|ac\.in|edu\.in)$/i;

function validateCollegeEmail(email: string): boolean {
  return COLLEGE_EMAIL_RE.test(email || '');
}

// ---- Passwords: PBKDF2-SHA256, stored as pbkdf2$<iter>$<salt b64>$<hash b64> ----
const PBKDF2_ITERATIONS = 100000; // Workers' maximum

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

async function verifyPassword(password: string, stored?: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, iter, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const hash = new Uint8Array(await pbkdf2(password, fromB64(saltB64), Number(iter)));
  const expected = fromB64(hashB64);
  if (hash.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i];
  return diff === 0;
}

function passwordProblem(password: string): string {
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return '';
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function userToDict(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    rollNumber: row.roll_number,
    phone: row.phone,
    collegeEmail: row.college_email,
    campus: row.campus,
    emailVerified: Boolean(row.email_verified),
    idVerified: Boolean(row.id_verified),
    createdAt: row.created_at,
  };
}

function listingToDict(row: any, seller?: any) {
  const data: any = {
    id: row.id,
    title: row.title,
    description: row.description,
    price: row.price,
    category: row.category,
    condition: row.condition,
    campus: row.campus,
    emoji: row.emoji,
    image: row.image,
    status: row.status,
    sellerId: row.seller_id,
    createdAt: Math.floor(row.created_at * 1000),
  };
  if (seller) {
    data.sellerName = seller.name;
    data.sellerEmail = seller.college_email;
    data.sellerPhone = seller.phone;
    data.sellerRollNumber = seller.roll_number;
  }
  return data;
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Enable CORS for all frontend clients
app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Authorization', 'X-Auth-Token'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
);

// Auth helper middleware
async function getAuthUser(c: AppContext): Promise<UserRow | null> {
  const authHeader = c.req.header('Authorization') || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : c.req.header('X-Auth-Token');
  if (!token) return null;

  const row = (await c.env.DB.prepare(
    `SELECT u.* FROM users u
     JOIN sessions s ON s.user_id = u.id
     WHERE s.token = ?`
  )
    .bind(token)
    .first()) as UserRow | null;

  return row || null;
}

// Health Check
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    platform: 'Cloudflare Workers & D1',
    timestamp: Date.now(),
  });
});

// Sign Up
app.post('/api/auth/signup', async (c) => {
  let name = '';
  let rollNumber = '';
  let phone = '';
  let collegeEmail = '';
  let campus = 'JKLU Campus';
  let idCardData: string | null = null;
  let filename = '';
  let password = '';

  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody();
    name = String(body['name'] || '').trim();
    rollNumber = String(body['rollNumber'] || '').trim().toUpperCase();
    phone = String(body['phone'] || '').trim();
    collegeEmail = String(body['collegeEmail'] || '').trim().toLowerCase();
    campus = String(body['campus'] || 'JKLU Campus').trim();
    password = String(body['password'] || '');

    const idCard = body['idCard'];
    if (idCard instanceof File) {
      const buffer = await idCard.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // Convert to base64
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      idCardData = `data:${idCard.type || 'image/jpeg'};base64,${btoa(binary)}`;
      const ext = idCard.name.split('.').pop() || 'jpg';
      filename = `${crypto.randomUUID().slice(0, 16)}.${ext}`;
    }
  } else {
    const json = await c.req.json().catch(() => ({}));
    name = String(json.name || '').trim();
    rollNumber = String(json.rollNumber || '').trim().toUpperCase();
    phone = String(json.phone || '').trim();
    collegeEmail = String(json.collegeEmail || '').trim().toLowerCase();
    campus = String(json.campus || 'JKLU Campus').trim();
    password = String(json.password || '');
    filename = 'default_id.jpg';
  }

  if (!name || !rollNumber || !phone || !collegeEmail || !campus) {
    return c.json({ error: 'All fields are required.' }, 400);
  }
  if (!validateCollegeEmail(collegeEmail)) {
    return c.json({ error: 'Use a valid college email (.edu or .ac.in).' }, 400);
  }
  if (!/^\d{10}$/.test(phone)) {
    return c.json({ error: 'Phone number must be 10 digits.' }, 400);
  }
  const pwError = passwordProblem(password);
  if (pwError) {
    return c.json({ error: pwError }, 400);
  }

  // Check existing
  const existing = await c.env.DB.prepare(
    'SELECT college_email, roll_number FROM users WHERE college_email = ? OR roll_number = ?'
  )
    .bind(collegeEmail, rollNumber)
    .first();

  if (existing) {
    return c.json({ error: 'An account with this email or roll number already exists.' }, 409);
  }

  const now = Date.now() / 1000;
  const insertUser = await c.env.DB.prepare(
    `INSERT INTO users (name, roll_number, phone, college_email, campus, id_card_path, id_card_data, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(name, rollNumber, phone, collegeEmail, campus, filename || 'id.jpg', idCardData, await hashPassword(password), now)
    .run();

  const userId = insertUser.meta.last_row_id;
  const otp = generateOtp();

  // Save OTP
  await c.env.DB.prepare(
    `INSERT INTO otp_codes (college_email, code, expires_at)
     VALUES (?, ?, ?)
     ON CONFLICT(college_email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at`
  )
    .bind(collegeEmail, otp, now + 600)
    .run();

  // Create session
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await c.env.DB.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .bind(token, userId, now)
    .run();

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>();

  return c.json(
    {
      token,
      user: user ? userToDict(user) : null,
      demoOtp: otp,
      message: 'Account created. Use the verification code to activate your account.',
    },
    201
  );
});

// Send OTP
app.post('/api/auth/send-otp', async (c) => {
  const json = await c.req.json().catch(() => ({}));
  const collegeEmail = String(json.collegeEmail || '').trim().toLowerCase();

  if (!validateCollegeEmail(collegeEmail)) {
    return c.json({ error: 'Invalid college email.' }, 400);
  }

  const user = await c.env.DB.prepare('SELECT id FROM users WHERE college_email = ?')
    .bind(collegeEmail)
    .first();

  if (!user) {
    return c.json({ error: 'No account found for this email.' }, 404);
  }

  const otp = generateOtp();
  const now = Date.now() / 1000;

  await c.env.DB.prepare(
    `INSERT INTO otp_codes (college_email, code, expires_at)
     VALUES (?, ?, ?)
     ON CONFLICT(college_email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at`
  )
    .bind(collegeEmail, otp, now + 600)
    .run();

  return c.json({
    message: 'Verification code sent.',
    demoOtp: otp,
  });
});

// Verify Email
app.post('/api/auth/verify-email', async (c) => {
  const json = await c.req.json().catch(() => ({}));
  const collegeEmail = String(json.collegeEmail || '').trim().toLowerCase();
  const code = String(json.code || '').trim();

  const otpRow = await c.env.DB.prepare('SELECT code, expires_at FROM otp_codes WHERE college_email = ?')
    .bind(collegeEmail)
    .first<{ code: string; expires_at: number }>();

  if (!otpRow) {
    return c.json({ error: 'No verification code found. Request a new one.' }, 404);
  }

  const now = Date.now() / 1000;
  if (now > otpRow.expires_at) {
    return c.json({ error: 'Verification code expired. Request a new one.' }, 400);
  }
  if (otpRow.code !== code) {
    return c.json({ error: 'Invalid verification code.' }, 400);
  }

  await c.env.DB.prepare('UPDATE users SET email_verified = 1, id_verified = 1 WHERE college_email = ?')
    .bind(collegeEmail)
    .run();

  await c.env.DB.prepare('DELETE FROM otp_codes WHERE college_email = ?').bind(collegeEmail).run();

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE college_email = ?')
    .bind(collegeEmail)
    .first<UserRow>();

  return c.json({
    user: user ? userToDict(user) : null,
    message: 'Email verified successfully!',
  });
});

// Login (email + password)
app.post('/api/auth/login', async (c) => {
  const json = await c.req.json().catch(() => ({}));
  const collegeEmail = String(json.collegeEmail || '').trim().toLowerCase();
  const password = String(json.password || '');

  if (!collegeEmail || !password) {
    return c.json({ error: 'Email and password are required.' }, 400);
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE college_email = ?')
    .bind(collegeEmail)
    .first<UserRow>();

  if (user && !user.password_hash) {
    return c.json({ error: 'This account has no password yet. Use “Forgot password” to set one.' }, 403);
  }
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Incorrect email or password.' }, 401);
  }

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const now = Date.now() / 1000;

  await c.env.DB.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .bind(token, user.id, now)
    .run();

  return c.json({
    token,
    user: userToDict(user),
  });
});

// Reset password with an emailed code
app.post('/api/auth/reset-password', async (c) => {
  const json = await c.req.json().catch(() => ({}));
  const collegeEmail = String(json.collegeEmail || '').trim().toLowerCase();
  const code = String(json.code || '').trim();
  const password = String(json.password || '');

  const otpRow = await c.env.DB.prepare('SELECT code, expires_at FROM otp_codes WHERE college_email = ?')
    .bind(collegeEmail)
    .first<{ code: string; expires_at: number }>();
  if (!otpRow || otpRow.code !== code) {
    return c.json({ error: 'Invalid verification code.' }, 400);
  }
  if (Date.now() / 1000 > otpRow.expires_at) {
    return c.json({ error: 'Verification code expired. Request a new one.' }, 400);
  }
  const pwError = passwordProblem(password);
  if (pwError) {
    return c.json({ error: pwError }, 400);
  }

  const user = await c.env.DB.prepare('SELECT id FROM users WHERE college_email = ?')
    .bind(collegeEmail)
    .first<{ id: number }>();
  if (!user) {
    return c.json({ error: 'Account not found.' }, 404);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?').bind(await hashPassword(password), user.id),
    c.env.DB.prepare('DELETE FROM otp_codes WHERE college_email = ?').bind(collegeEmail),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
  ]);

  return c.json({ message: 'Password updated. You can now log in.' });
});

// Get Current User (Me)
app.get('/api/auth/me', async (c) => {
  const user = await getAuthUser(c);
  return c.json({ user: user ? userToDict(user) : null });
});

// Logout
app.post('/api/auth/logout', async (c) => {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : c.req.header('X-Auth-Token');
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }
  return c.json({ message: 'Logged out.' });
});

// Listings: Public list
app.get('/api/listings', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT l.*, u.name AS seller_name, u.college_email AS seller_email,
            u.phone AS seller_phone, u.roll_number AS seller_roll
     FROM listings l
     JOIN users u ON u.id = l.seller_id
     WHERE l.status = 'active'
     ORDER BY l.created_at DESC`
  ).all();

  const listings = (rows.results || []).map((row: any) => {
    const seller = {
      name: row.seller_name,
      college_email: row.seller_email,
      phone: row.seller_phone,
      roll_number: row.seller_roll,
    };
    return listingToDict(row, seller);
  });

  return c.json({ listings });
});

// Get single listing
app.get('/api/listings/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT l.*, u.name AS seller_name, u.college_email AS seller_email,
            u.phone AS seller_phone, u.roll_number AS seller_roll
     FROM listings l
     JOIN users u ON u.id = l.seller_id
     WHERE l.id = ?`
  )
    .bind(id)
    .first<any>();

  if (!row) {
    return c.json({ error: 'Listing not found.' }, 404);
  }

  const seller = {
    name: row.seller_name,
    college_email: row.seller_email,
    phone: row.seller_phone,
    roll_number: row.seller_roll,
  };

  return c.json({ listing: listingToDict(row, seller) });
});

// Create listing (auth required)
app.post('/api/listings', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);
  if (!user.email_verified) return c.json({ error: 'Please verify your college email first.' }, 403);

  const json = await c.req.json().catch(() => ({}));
  const listingId = crypto.randomUUID().slice(0, 10);
  const now = Date.now() / 1000;

  await c.env.DB.prepare(
    `INSERT INTO listings (id, seller_id, title, description, price, category, condition, campus, emoji, image, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      listingId,
      user.id,
      String(json.title || '').trim(),
      String(json.description || '').trim(),
      Number(json.price || 0),
      json.category || 'other',
      json.condition || 'Good',
      json.campus || user.campus,
      json.emoji || '📦',
      json.image || null,
      now
    )
    .run();

  // Return the created listing
  const row = await c.env.DB.prepare(
    `SELECT l.*, u.name AS seller_name, u.college_email AS seller_email,
            u.phone AS seller_phone, u.roll_number AS seller_roll
     FROM listings l
     JOIN users u ON u.id = l.seller_id
     WHERE l.id = ?`
  )
    .bind(listingId)
    .first<any>();

  const seller = {
    name: row.seller_name,
    college_email: row.seller_email,
    phone: row.seller_phone,
    roll_number: row.seller_roll,
  };

  return c.json({ listing: listingToDict(row, seller) }, 201);
});

// My Listings
app.get('/api/my-listings', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);

  const rows = await c.env.DB.prepare(
    `SELECT l.*, u.name AS seller_name, u.college_email AS seller_email,
            u.phone AS seller_phone, u.roll_number AS seller_roll
     FROM listings l
     JOIN users u ON u.id = l.seller_id
     WHERE l.seller_id = ?
     ORDER BY l.created_at DESC`
  )
    .bind(user.id)
    .all();

  const listings = (rows.results || []).map((row: any) => {
    const seller = {
      name: row.seller_name,
      college_email: row.seller_email,
      phone: row.seller_phone,
      roll_number: row.seller_roll,
    };
    return listingToDict(row, seller);
  });

  return c.json({ listings });
});

// Mark Sold
app.post('/api/listings/:id/mark-sold', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);

  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(id).first<any>();
  if (!row) return c.json({ error: 'Listing not found.' }, 404);
  if (row.seller_id !== user.id) return c.json({ error: 'You can only update your own listings.' }, 403);

  if (row.status === 'sold') {
    return c.json({ message: 'Already marked as sold.', listing: listingToDict(row) });
  }

  await c.env.DB.prepare("UPDATE listings SET status = 'sold' WHERE id = ?").bind(id).run();

  const updated = await c.env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(id).first<any>();
  return c.json({ message: 'Item marked as sold.', listing: listingToDict(updated) });
});

// Delete Listing
app.delete('/api/listings/:id', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);

  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT seller_id FROM listings WHERE id = ?').bind(id).first<any>();
  if (!row) return c.json({ error: 'Listing not found.' }, 404);
  if (row.seller_id !== user.id) return c.json({ error: 'You can only delete your own listings.' }, 403);

  await c.env.DB.prepare('DELETE FROM listings WHERE id = ?').bind(id).run();
  return c.json({ message: 'Listing deleted.' });
});

// Conversations: List
app.get('/api/conversations', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);

  const rows = await c.env.DB.prepare(
    `SELECT c.*, l.title AS listing_title, l.price AS listing_price,
            buyer.name AS buyer_name, seller.name AS seller_name,
            (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
     FROM conversations c
     JOIN listings l ON l.id = c.listing_id
     JOIN users buyer ON buyer.id = c.buyer_id
     JOIN users seller ON seller.id = c.seller_id
     WHERE c.buyer_id = ? OR c.seller_id = ?
     ORDER BY COALESCE(
       (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
       c.created_at
     ) DESC`
  )
    .bind(user.id, user.id)
    .all();

  const conversations = (rows.results || []).map((row: any) => {
    const otherName = row.buyer_id === user.id ? row.seller_name : row.buyer_name;
    return {
      id: row.id,
      listingId: row.listing_id,
      listingTitle: row.listing_title,
      listingPrice: row.listing_price,
      otherName,
      lastMessage: row.last_message || 'No messages yet',
      lastMessageAt: Math.floor((row.last_message_at || row.created_at) * 1000),
    };
  });

  return c.json({ conversations });
});

// Conversations: Start
app.post('/api/conversations', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);

  const json = await c.req.json().catch(() => ({}));
  const listingId = json.listingId;

  const listing = await c.env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(listingId).first<any>();
  if (!listing) return c.json({ error: 'Listing not found.' }, 404);
  if (listing.seller_id === user.id) return c.json({ error: 'You cannot message yourself.' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM conversations WHERE listing_id = ? AND buyer_id = ?')
    .bind(listingId, user.id)
    .first<any>();

  if (existing) {
    return c.json({ conversationId: existing.id });
  }

  const now = Date.now() / 1000;
  const ins = await c.env.DB.prepare(
    'INSERT INTO conversations (listing_id, buyer_id, seller_id, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(listingId, user.id, listing.seller_id, now)
    .run();

  return c.json({ conversationId: ins.meta.last_row_id }, 201);
});

// Messages: Get
app.get('/api/conversations/:id/messages', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);

  const convId = Number(c.req.param('id'));
  const conv = await c.env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(convId).first<any>();

  if (!conv || (user.id !== conv.buyer_id && user.id !== conv.seller_id)) {
    return c.json({ error: 'Conversation not found.' }, 404);
  }

  const rows = await c.env.DB.prepare(
    `SELECT m.*, u.name AS sender_name
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ?
     ORDER BY m.created_at ASC`
  )
    .bind(convId)
    .all();

  const messages = (rows.results || []).map((row: any) => ({
    id: row.id,
    body: row.body,
    senderId: row.sender_id,
    senderName: row.sender_name,
    isMine: row.sender_id === user.id,
    createdAt: Math.floor(row.created_at * 1000),
  }));

  return c.json({ messages, conversationId: convId });
});

// Messages: Send
app.post('/api/conversations/:id/messages', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);

  const convId = Number(c.req.param('id'));
  const conv = await c.env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(convId).first<any>();

  if (!conv || (user.id !== conv.buyer_id && user.id !== conv.seller_id)) {
    return c.json({ error: 'Conversation not found.' }, 404);
  }

  const json = await c.req.json().catch(() => ({}));
  const body = String(json.body || '').trim();
  if (!body) return c.json({ error: 'Message cannot be empty.' }, 400);

  const now = Date.now() / 1000;
  const ins = await c.env.DB.prepare(
    'INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(convId, user.id, body, now)
    .run();

  return c.json(
    {
      message: {
        id: ins.meta.last_row_id,
        body,
        senderId: user.id,
        senderName: user.name,
        isMine: true,
        createdAt: Math.floor(now * 1000),
      },
    },
    201
  );
});

// Payments
app.post('/api/payments', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);

  const json = await c.req.json().catch(() => ({}));
  const listingId = json.listingId;

  const listing = await c.env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(listingId).first<any>();
  if (!listing || listing.status !== 'active') {
    return c.json({ error: 'Listing unavailable.' }, 404);
  }
  if (listing.seller_id === user.id) {
    return c.json({ error: 'You cannot buy your own listing.' }, 400);
  }

  const txnId = crypto.randomUUID().slice(0, 12);
  const now = Date.now() / 1000;

  await c.env.DB.prepare(
    'INSERT INTO transactions (id, listing_id, buyer_id, seller_id, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(txnId, listingId, user.id, listing.seller_id, listing.price, now)
    .run();

  await c.env.DB.prepare("UPDATE listings SET status = 'sold' WHERE id = ?").bind(listingId).run();

  return c.json({
    transaction: {
      id: txnId,
      listingId,
      amount: listing.price,
      status: 'completed',
      createdAt: Math.floor(now * 1000),
    },
    message: 'Payment successful! Contact the seller to arrange pickup.',
  });
});

// ID card image serve
app.get('/uploads/id_cards/:filename', async (c) => {
  const filename = c.req.param('filename');
  const user = await c.env.DB.prepare('SELECT id_card_data FROM users WHERE id_card_path = ?')
    .bind(filename)
    .first<{ id_card_data?: string }>();

  if (!user || !user.id_card_data) {
    return c.text('Image not found', 404);
  }

  // If stored as data URI
  if (user.id_card_data.startsWith('data:')) {
    const [header, base64Data] = user.id_card_data.split(',');
    const mime = header.split(';')[0].replace('data:', '');
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Response(bytes, {
      headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' },
    });
  }

  return c.text('Invalid image data', 400);
});

export default app;
