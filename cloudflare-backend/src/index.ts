import { Context, Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  /** Google Apps Script Web App URL (secret) for sending OTP emails via Gmail. */
  EMAIL_WEBHOOK_URL?: string;
  /** Shared secret (secret) sent to EMAIL_WEBHOOK_URL to authorize requests. */
  EMAIL_WEBHOOK_SECRET?: string;
  /** Resend API key (secret). Fallback when EMAIL_WEBHOOK_URL is not set. */
  RESEND_API_KEY?: string;
  /** Sender, e.g. "Campus Market <noreply@yourdomain.com>" */
  EMAIL_FROM?: string;
  /** "1" = also return codes in API responses. Local development only — never in production. */
  DEMO_OTP?: string;
  /** Comma-separated extra emails (kept for backward compatibility). */
  ALLOWED_TEST_EMAILS?: string;
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): boolean {
  return EMAIL_RE.test((email || '').trim());
}

/** Accept any valid email address (plus any explicitly allow-listed addresses). */
function isAllowedEmail(env: Bindings, email: string): boolean {
  if (validateEmail(email)) return true;
  const allowed = (env.ALLOWED_TEST_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes((email || '').toLowerCase());
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

// ---- Verification code delivery ----
const OTP_TTL_S = 600;
const OTP_RESEND_WAIT_S = 60;
const OTP_MAX_ATTEMPTS = 5;

function emailConfigured(env: Bindings): boolean {
  return Boolean(env.EMAIL_WEBHOOK_URL || env.RESEND_API_KEY) || env.DEMO_OTP === '1';
}

/** Emails the code via Google Apps Script webhook or Resend. Returns demoOtp only in DEMO_OTP mode. */
async function deliverOtp(env: Bindings, to: string, code: string): Promise<{ demoOtp?: string }> {
  const subject = `${code} is your Campus Market code`;
  const text = `Your Campus Market verification code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:420px;margin:auto;padding:24px">
          <h2 style="margin:0 0 8px;color:#1f1a14">Campus Market</h2>
          <p style="color:#475569">Your verification code is</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#ea580c;margin:12px 0">${code}</p>
          <p style="color:#64748b;font-size:13px">It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
        </div>`;

  if (env.EMAIL_WEBHOOK_URL) {
    const res = await fetch(env.EMAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.EMAIL_WEBHOOK_SECRET || '',
        to,
        subject,
        text,
        html,
      }),
    });
    const data = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `Email webhook error (${res.status})`);
    }
  } else if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM || 'Campus Market <onboarding@resend.dev>',
        to: [to],
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) throw new Error(`Email provider error (${res.status})`);
  }
  return env.DEMO_OTP === '1' ? { demoOtp: code } : {};
}

async function storeOtp(db: D1Database, email: string, code: string, now: number) {
  await db
    .prepare(
      `INSERT INTO otp_codes (college_email, code, expires_at, attempts)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(college_email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0`
    )
    .bind(email, code, now + OTP_TTL_S)
    .run();
}

/** Checks a code, counting failed attempts. Returns an error message or null on success. */
async function checkOtp(db: D1Database, email: string, code: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT code, expires_at, attempts FROM otp_codes WHERE college_email = ?')
    .bind(email)
    .first<{ code: string; expires_at: number; attempts: number }>();
  if (!row) return 'No verification code found. Request a new one.';
  if (Date.now() / 1000 > row.expires_at) return 'Verification code expired. Request a new one.';
  if (row.code !== code) {
    if ((row.attempts || 0) + 1 >= OTP_MAX_ATTEMPTS) {
      await db.prepare('DELETE FROM otp_codes WHERE college_email = ?').bind(email).run();
      return 'Too many wrong attempts. Request a new code.';
    }
    await db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE college_email = ?').bind(email).run();
    return 'Invalid verification code.';
  }
  return null;
}

// ---- Listing input validation ----
const CATEGORIES = ['textbooks', 'electronics', 'furniture', 'clothing', 'services', 'other'];
const CONDITIONS = ['Like New', 'Good', 'Fair', 'Used'];
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 700_000; // ~500 KB per photo after base64
const COURSE_CODE_RE = /^[A-Z]{2,5}[ -]?\d{2,4}[A-Z]?$/;
const REPORT_REASONS = ['spam', 'fake', 'prohibited', 'wrong-info', 'other'];
const REPORTS_TO_HIDE = 3;

interface ListingInput {
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  images: string[];
  courseCode: string | null;
  meetupSpot: string | null;
  negotiable: boolean;
}

function readListingInput(json: any, { requireDescription = true } = {}): { error: string } | { value: ListingInput } {
  const title = String(json.title || '').trim();
  const description = String(json.description || '').trim();
  const price = Number(json.price);
  const category = String(json.category || 'other');
  const condition = String(json.condition || 'Good');
  const courseCode = String(json.courseCode || '').trim().toUpperCase() || null;
  const meetupSpot = String(json.meetupSpot || '').trim().slice(0, 60) || null;
  let images: string[] = Array.isArray(json.images) ? json.images : json.image ? [json.image] : [];

  if (!title || title.length > 100) return { error: 'Title is required (max 100 characters).' };
  if (requireDescription && !description) return { error: 'Description is required.' };
  if (description.length > 1000) return { error: 'Description is too long (max 1000 characters).' };
  if (!Number.isFinite(price) || price < 0 || price > 10_000_000) return { error: 'Enter a valid price.' };
  if (!CATEGORIES.includes(category)) return { error: 'Unknown category.' };
  if (!CONDITIONS.includes(condition)) return { error: 'Unknown condition.' };
  if (courseCode && !COURSE_CODE_RE.test(courseCode)) return { error: 'Course code should look like CS201 or MATH-101.' };
  images = images.filter((i) => typeof i === 'string');
  if (images.length > MAX_IMAGES) return { error: `Up to ${MAX_IMAGES} photos per listing.` };
  if (images.some((i) => !i.startsWith('data:image/') || i.length > MAX_IMAGE_CHARS)) {
    return { error: 'One of the photos is invalid or too large.' };
  }
  return {
    value: { title, description, price: Math.round(price), category, condition, images, courseCode, meetupSpot, negotiable: Boolean(json.negotiable) },
  };
}

async function insertListing(db: D1Database, user: UserRow, v: ListingInput, saleTag: string | null, now: number): Promise<string> {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const emoji: Record<string, string> = { textbooks: '📚', electronics: '💻', furniture: '🛋️', clothing: '👕', services: '🛠️', other: '📦' };
  await db
    .prepare(
      `INSERT INTO listings (id, seller_id, title, description, price, category, condition, campus, emoji, image, images,
                             course_code, meetup_spot, negotiable, sale_tag, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, user.id, v.title, v.description, v.price, v.category, v.condition, user.campus, emoji[v.category] || '📦',
      v.images[0] || null, v.images.length ? JSON.stringify(v.images) : null, v.courseCode, v.meetupSpot, v.negotiable ? 1 : 0,
      saleTag, now)
    .run();
  return id;
}

const LISTING_SELECT = `SELECT l.*, u.name AS seller_name, u.college_email AS seller_email,
            u.phone AS seller_phone, u.roll_number AS seller_roll
     FROM listings l
     JOIN users u ON u.id = l.seller_id`;

function sellerOf(row: any) {
  return { name: row.seller_name, college_email: row.seller_email, phone: row.seller_phone, roll_number: row.seller_roll };
}

async function verifiedUser(c: AppContext): Promise<UserRow | Response> {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);
  if (!user.email_verified) return c.json({ error: 'Please verify your email first.' }, 403);
  return user;
}

async function sellerRating(db: D1Database, sellerId: number) {
  const r = await db
    .prepare('SELECT AVG(stars) AS avg, COUNT(*) AS n FROM ratings WHERE seller_id = ?')
    .bind(sellerId)
    .first<{ avg: number | null; n: number }>();
  return { average: r?.avg ? Math.round(r.avg * 10) / 10 : null, count: r?.n || 0 };
}

/** A user may rate a seller for a listing if they chatted about it or bought it, and haven't rated it yet. */
async function canRate(db: D1Database, listingId: string, sellerId: number, userId: number): Promise<boolean> {
  if (sellerId === userId) return false;
  const already = await db.prepare('SELECT 1 FROM ratings WHERE listing_id = ? AND rater_id = ?').bind(listingId, userId).first();
  if (already) return false;
  const engaged = await db
    .prepare(
      `SELECT 1 FROM conversations WHERE listing_id = ? AND buyer_id = ?
       UNION SELECT 1 FROM transactions WHERE listing_id = ? AND buyer_id = ?`
    )
    .bind(listingId, userId, listingId, userId)
    .first();
  return Boolean(engaged);
}

function generateOtp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000;
  return String(100000 + n);
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

function parseImages(row: any): string[] {
  try {
    const arr = row.images ? JSON.parse(row.images) : [];
    if (Array.isArray(arr) && arr.length) return arr;
  } catch {
    /* fall through */
  }
  return row.image ? [row.image] : [];
}

/** `full` includes every photo (detail page); lists only carry the cover photo. */
function listingToDict(row: any, seller?: any, { full = false } = {}) {
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
    courseCode: row.course_code || null,
    meetupSpot: row.meetup_spot || null,
    negotiable: Boolean(row.negotiable),
    saleTag: row.sale_tag || null,
    createdAt: Math.floor(row.created_at * 1000),
  };
  if (full) data.images = parseImages(row);
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
  if (!isAllowedEmail(c.env, collegeEmail)) {
    return c.json({ error: 'Please enter a valid email address.' }, 400);
  }
  if (!emailConfigured(c.env)) {
    return c.json({ error: 'Email verification is not configured on the server yet.' }, 503);
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
  await storeOtp(c.env.DB, collegeEmail, otp, now);
  let delivery: { demoOtp?: string } = {};
  let emailError = '';
  try {
    delivery = await deliverOtp(c.env, collegeEmail, otp);
  } catch {
    emailError = 'Account created, but we could not send the email. Use “Resend code”.';
  }

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
      ...delivery,
      message: emailError || 'Account created. Check your email for the verification code.',
    },
    201
  );
});

// Send OTP
app.post('/api/auth/send-otp', async (c) => {
  const json = await c.req.json().catch(() => ({}));
  const collegeEmail = String(json.collegeEmail || '').trim().toLowerCase();

  if (!isAllowedEmail(c.env, collegeEmail)) {
    return c.json({ error: 'Invalid email address.' }, 400);
  }

  const user = await c.env.DB.prepare('SELECT id FROM users WHERE college_email = ?')
    .bind(collegeEmail)
    .first();

  if (!user) {
    return c.json({ error: 'No account found for this email.' }, 404);
  }

  if (!emailConfigured(c.env)) {
    return c.json({ error: 'Email verification is not configured on the server yet.' }, 503);
  }

  const now = Date.now() / 1000;
  const recent = await c.env.DB.prepare('SELECT expires_at FROM otp_codes WHERE college_email = ?')
    .bind(collegeEmail)
    .first<{ expires_at: number }>();
  if (recent && recent.expires_at - now > OTP_TTL_S - OTP_RESEND_WAIT_S) {
    return c.json({ error: 'Please wait a minute before requesting another code.' }, 429);
  }

  const otp = generateOtp();
  await storeOtp(c.env.DB, collegeEmail, otp, now);
  try {
    const delivery = await deliverOtp(c.env, collegeEmail, otp);
    return c.json({ message: 'Verification code sent to your email.', ...delivery });
  } catch {
    return c.json({ error: 'Could not send the email. Please try again shortly.' }, 502);
  }
});

// Verify Email
app.post('/api/auth/verify-email', async (c) => {
  const json = await c.req.json().catch(() => ({}));
  const collegeEmail = String(json.collegeEmail || '').trim().toLowerCase();
  const code = String(json.code || '').trim();

  const otpError = await checkOtp(c.env.DB, collegeEmail, code);
  if (otpError) {
    return c.json({ error: otpError }, 400);
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

  const otpError = await checkOtp(c.env.DB, collegeEmail, code);
  if (otpError) {
    return c.json({ error: otpError }, 400);
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
  const rows = await c.env.DB.prepare(`${LISTING_SELECT} WHERE l.status = 'active' ORDER BY l.created_at DESC`).all();
  const listings = (rows.results || []).map((row: any) => listingToDict(row, sellerOf(row)));
  return c.json({ listings });
});

// Get single listing (all photos, seller rating, and whether the viewer may rate)
app.get('/api/listings/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`${LISTING_SELECT} WHERE l.id = ?`).bind(id).first<any>();
  const viewer = await getAuthUser(c);

  if (!row || (row.status === 'hidden' && viewer?.id !== row.seller_id)) {
    return c.json({ error: 'Listing not found.' }, 404);
  }

  const listing = listingToDict(row, sellerOf(row), { full: true });
  listing.sellerRating = await sellerRating(c.env.DB, row.seller_id);
  listing.canRate = viewer?.email_verified ? await canRate(c.env.DB, id, row.seller_id, viewer.id) : false;
  return c.json({ listing });
});

// Create listing
app.post('/api/listings', async (c) => {
  const user = await verifiedUser(c);
  if (user instanceof Response) return user;

  const parsed = readListingInput(await c.req.json().catch(() => ({})));
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);

  const id = await insertListing(c.env.DB, user, parsed.value, null, Date.now() / 1000);
  const row = await c.env.DB.prepare(`${LISTING_SELECT} WHERE l.id = ?`).bind(id).first<any>();
  return c.json({ listing: listingToDict(row, sellerOf(row), { full: true }) }, 201);
});

// Moving-out sale: create many listings at once
app.post('/api/listings/bulk', async (c) => {
  const user = await verifiedUser(c);
  if (user instanceof Response) return user;

  const json = await c.req.json().catch(() => ({}));
  const items = Array.isArray(json.items) ? json.items : [];
  if (items.length === 0) return c.json({ error: 'Add at least one item.' }, 400);
  if (items.length > 15) return c.json({ error: 'Up to 15 items at a time.' }, 400);

  const note = String(json.description || '').trim().slice(0, 500);
  const parsedItems: ListingInput[] = [];
  for (const [i, item] of items.entries()) {
    const parsed = readListingInput(
      { ...item, description: item.description || note || 'Moving-out sale.', meetupSpot: json.meetupSpot, negotiable: json.negotiable ?? true },
      { requireDescription: false }
    );
    if ('error' in parsed) return c.json({ error: `Item ${i + 1}: ${parsed.error}` }, 400);
    parsedItems.push(parsed.value);
  }

  const now = Date.now() / 1000;
  const ids: string[] = [];
  for (const v of parsedItems) ids.push(await insertListing(c.env.DB, user, v, 'moving-out', now));
  return c.json({ created: ids.length, ids }, 201);
});

// My Listings (includes sold and hidden ones)
app.get('/api/my-listings', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);

  const rows = await c.env.DB.prepare(`${LISTING_SELECT} WHERE l.seller_id = ? ORDER BY l.created_at DESC`)
    .bind(user.id)
    .all();
  const listings = (rows.results || []).map((row: any) => listingToDict(row, sellerOf(row)));
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
            (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
            (SELECT COUNT(*) FROM messages m
               WHERE m.conversation_id = c.id AND m.sender_id != ?
                 AND m.created_at > COALESCE((SELECT last_read_at FROM conversation_reads r
                                              WHERE r.conversation_id = c.id AND r.user_id = ?), 0)) AS unread
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
    .bind(user.id, user.id, user.id, user.id)
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
      unread: row.unread || 0,
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

  await markRead(c.env.DB, convId, user.id);

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
  await markRead(c.env.DB, convId, user.id);

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

async function markRead(db: D1Database, conversationId: number, userId: number) {
  await db
    .prepare(
      `INSERT INTO conversation_reads (conversation_id, user_id, last_read_at) VALUES (?, ?, ?)
       ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at`
    )
    .bind(conversationId, userId, Date.now() / 1000)
    .run();
}

// Unread message count (header badge)
app.get('/api/unread', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ count: 0 });
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.user_id = ?
     WHERE (c.buyer_id = ? OR c.seller_id = ?) AND m.sender_id != ? AND m.created_at > COALESCE(r.last_read_at, 0)`
  )
    .bind(user.id, user.id, user.id, user.id)
    .first<{ n: number }>();
  return c.json({ count: row?.n || 0 });
});

// ---- Saved listings (wishlist) ----
app.get('/api/saved', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);
  const rows = await c.env.DB.prepare(
    `${LISTING_SELECT}
     JOIN saved_listings s ON s.listing_id = l.id AND s.user_id = ?
     WHERE l.status != 'hidden'
     ORDER BY s.created_at DESC`
  )
    .bind(user.id)
    .all();
  return c.json({ listings: (rows.results || []).map((row: any) => listingToDict(row, sellerOf(row))) });
});

app.post('/api/listings/:id/save', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);
  const id = c.req.param('id');
  const exists = await c.env.DB.prepare('SELECT 1 FROM listings WHERE id = ?').bind(id).first();
  if (!exists) return c.json({ error: 'Listing not found.' }, 404);
  await c.env.DB.prepare('INSERT OR IGNORE INTO saved_listings (user_id, listing_id, created_at) VALUES (?, ?, ?)')
    .bind(user.id, id, Date.now() / 1000)
    .run();
  return c.json({ saved: true });
});

app.delete('/api/listings/:id/save', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);
  await c.env.DB.prepare('DELETE FROM saved_listings WHERE user_id = ? AND listing_id = ?')
    .bind(user.id, c.req.param('id'))
    .run();
  return c.json({ saved: false });
});

// ---- Reports (auto-hide after several) ----
app.post('/api/listings/:id/report', async (c) => {
  const user = await verifiedUser(c);
  if (user instanceof Response) return user;

  const id = c.req.param('id');
  const json = await c.req.json().catch(() => ({}));
  const reason = String(json.reason || '');
  const details = String(json.details || '').trim().slice(0, 300);
  if (!REPORT_REASONS.includes(reason)) return c.json({ error: 'Choose a reason.' }, 400);

  const listing = await c.env.DB.prepare('SELECT seller_id, status FROM listings WHERE id = ?').bind(id).first<any>();
  if (!listing) return c.json({ error: 'Listing not found.' }, 404);
  if (listing.seller_id === user.id) return c.json({ error: "You can't report your own listing." }, 400);

  const ins = await c.env.DB.prepare(
    'INSERT OR IGNORE INTO reports (listing_id, reporter_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(id, user.id, reason, details, Date.now() / 1000)
    .run();
  if (!ins.meta.changes) return c.json({ message: 'You already reported this listing.' });

  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE listing_id = ?').bind(id).first<{ n: number }>();
  if ((n?.n || 0) >= REPORTS_TO_HIDE && listing.status === 'active') {
    await c.env.DB.prepare("UPDATE listings SET status = 'hidden' WHERE id = ?").bind(id).run();
  }
  return c.json({ message: 'Thanks — our team will take a look.' });
});

// ---- Seller ratings ----
app.post('/api/ratings', async (c) => {
  const user = await verifiedUser(c);
  if (user instanceof Response) return user;

  const json = await c.req.json().catch(() => ({}));
  const listingId = String(json.listingId || '');
  const stars = Number(json.stars);
  const comment = String(json.comment || '').trim().slice(0, 300);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return c.json({ error: 'Pick 1 to 5 stars.' }, 400);

  const listing = await c.env.DB.prepare('SELECT seller_id FROM listings WHERE id = ?').bind(listingId).first<any>();
  if (!listing) return c.json({ error: 'Listing not found.' }, 404);
  if (!(await canRate(c.env.DB, listingId, listing.seller_id, user.id))) {
    return c.json({ error: 'You can rate a seller once, after chatting with or buying from them.' }, 403);
  }

  await c.env.DB.prepare(
    'INSERT INTO ratings (listing_id, seller_id, rater_id, stars, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(listingId, listing.seller_id, user.id, stars, comment, Date.now() / 1000)
    .run();
  return c.json({ message: 'Thanks for rating!', sellerRating: await sellerRating(c.env.DB, listing.seller_id) }, 201);
});

app.get('/api/users/:id/ratings', async (c) => {
  const sellerId = Number(c.req.param('id'));
  const rows = await c.env.DB.prepare(
    `SELECT r.stars, r.comment, r.created_at, u.name AS rater_name
     FROM ratings r JOIN users u ON u.id = r.rater_id
     WHERE r.seller_id = ? ORDER BY r.created_at DESC LIMIT 20`
  )
    .bind(sellerId)
    .all();
  return c.json({
    summary: await sellerRating(c.env.DB, sellerId),
    ratings: (rows.results || []).map((r: any) => ({
      stars: r.stars,
      comment: r.comment,
      raterName: r.rater_name,
      createdAt: Math.floor(r.created_at * 1000),
    })),
  });
});

// ---- Wanted posts ----
app.get('/api/wanted', async (c) => {
  const viewer = await getAuthUser(c);
  const showContact = Boolean(viewer?.email_verified);
  const rows = await c.env.DB.prepare(
    `SELECT w.*, u.name AS user_name, u.college_email AS user_email, u.phone AS user_phone
     FROM wanted_posts w JOIN users u ON u.id = w.user_id
     WHERE w.status = 'open' ORDER BY w.created_at DESC LIMIT 100`
  ).all();
  const posts = (rows.results || []).map((w: any) => ({
    id: w.id,
    userId: w.user_id,
    title: w.title,
    description: w.description,
    budget: w.budget,
    category: w.category,
    courseCode: w.course_code,
    userName: w.user_name,
    contact: showContact ? { email: w.user_email, phone: w.user_phone } : null,
    createdAt: Math.floor(w.created_at * 1000),
  }));
  return c.json({ posts });
});

app.post('/api/wanted', async (c) => {
  const user = await verifiedUser(c);
  if (user instanceof Response) return user;

  const json = await c.req.json().catch(() => ({}));
  const title = String(json.title || '').trim();
  const description = String(json.description || '').trim().slice(0, 500);
  const budget = json.budget === '' || json.budget == null ? null : Number(json.budget);
  const category = String(json.category || 'other');
  const courseCode = String(json.courseCode || '').trim().toUpperCase() || null;

  if (!title || title.length > 100) return c.json({ error: 'Say what you are looking for (max 100 characters).' }, 400);
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) return c.json({ error: 'Enter a valid budget.' }, 400);
  if (!CATEGORIES.includes(category)) return c.json({ error: 'Unknown category.' }, 400);
  if (courseCode && !COURSE_CODE_RE.test(courseCode)) return c.json({ error: 'Course code should look like CS201 or MATH-101.' }, 400);

  const open = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM wanted_posts WHERE user_id = ? AND status = 'open'")
    .bind(user.id)
    .first<{ n: number }>();
  if ((open?.n || 0) >= 10) return c.json({ error: 'You can have up to 10 open requests.' }, 400);

  const ins = await c.env.DB.prepare(
    'INSERT INTO wanted_posts (user_id, title, description, budget, category, course_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, title, description, budget === null ? null : Math.round(budget), category, courseCode, Date.now() / 1000)
    .run();
  return c.json({ id: ins.meta.last_row_id }, 201);
});

app.delete('/api/wanted/:id', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Please log in to continue.' }, 401);
  const res = await c.env.DB.prepare('DELETE FROM wanted_posts WHERE id = ? AND user_id = ?')
    .bind(Number(c.req.param('id')), user.id)
    .run();
  if (!res.meta.changes) return c.json({ error: 'Request not found.' }, 404);
  return c.json({ message: 'Request removed.' });
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
