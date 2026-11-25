import { SITE } from "./config.js";
import { SAMPLE_LISTINGS } from "./data.js";
import { hashPassword, verifyPassword, passwordProblem } from "./password.js";

const STORE_KEY = "campus_market_db";

function loadDb() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return seedDb();
}

/** Adds v2 collections to demo databases created by older versions. */
function migrate(db) {
  db.saved ??= [];
  db.reports ??= [];
  db.ratings ??= [];
  db.wanted ??= [];
  db.reads ??= {};
  db.nextWantedId ??= 1;
  return db;
}

function saveDb(db) {
  localStorage.setItem(STORE_KEY, JSON.stringify(db));
}

function seedDb() {
  const now = Date.now();
  const demoSeller = {
    id: 1,
    name: "Demo Seller",
    rollNumber: "DEMO001",
    phone: "9999999999",
    collegeEmail: "demo@college.edu.in",
    campus: SITE.campus,
    emailVerified: true,
    idVerified: true,
    createdAt: now / 1000,
  };

  const listings = SAMPLE_LISTINGS.map((item, i) => ({
    id: item.id,
    sellerId: 1,
    title: item.title,
    description: item.description,
    price: item.price,
    category: item.category,
    condition: item.condition,
    campus: item.campus,
    emoji: item.emoji,
    image: item.image || null,
    status: "active",
    courseCode: item.courseCode || null,
    meetupSpot: item.meetupSpot || null,
    negotiable: Boolean(item.negotiable),
    saleTag: item.saleTag || null,
    createdAt: item.createdAt || now - i * 86400000,
    sellerName: item.sellerName,
    sellerEmail: item.sellerEmail,
    sellerPhone: "9999999999",
    sellerRollNumber: "DEMO001",
  }));

  const db = {
    users: [demoSeller],
    sessions: {},
    otps: {},
    listings,
    conversations: [],
    messages: [],
    saved: [],
    reports: [],
    ratings: [],
    reads: {},
    wanted: [
      { id: 1, userId: 1, title: "Need a scientific calculator for exams", description: "Casio fx-991 or similar, just for this semester.", budget: 600, category: "electronics", courseCode: null, status: "open", createdAt: now - 3600000 * 5 },
      { id: 2, userId: 1, title: "Looking for Operating Systems textbook", description: "Galvin, any recent edition.", budget: 400, category: "textbooks", courseCode: "CS301", status: "open", createdAt: now - 86400000 },
    ],
    nextWantedId: 3,
    nextUserId: 2,
    nextConvId: 1,
    nextMsgId: 1,
  };
  saveDb(db);
  return db;
}

function token() {
  return localStorage.getItem("campusswap_token");
}

function findUser(db, userId) {
  return db.users.find((u) => u.id === userId) || null;
}

function currentUser(db) {
  const t = token();
  if (!t || !db.sessions[t]) return null;
  return findUser(db, db.sessions[t]);
}

function userPublic(user) {
  return {
    id: user.id,
    name: user.name,
    rollNumber: user.rollNumber,
    phone: user.phone,
    collegeEmail: user.collegeEmail,
    campus: user.campus,
    emailVerified: !!user.emailVerified,
    idVerified: !!user.idVerified,
    createdAt: user.createdAt,
  };
}

function listingPublic(row) {
  return {
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
    sellerId: row.sellerId,
    courseCode: row.courseCode || null,
    meetupSpot: row.meetupSpot || null,
    negotiable: Boolean(row.negotiable),
    saleTag: row.saleTag || null,
    createdAt: row.createdAt,
    sellerName: row.sellerName,
    sellerEmail: row.sellerEmail,
    sellerPhone: row.sellerPhone,
    sellerRollNumber: row.sellerRollNumber,
  };
}

function enrichListing(db, listing, { full = false } = {}) {
  const seller = findUser(db, listing.sellerId);
  const out = listingPublic({
    ...listing,
    sellerName: seller?.name || listing.sellerName,
    sellerEmail: seller?.collegeEmail || listing.sellerEmail,
    sellerPhone: seller?.phone || listing.sellerPhone,
    sellerRollNumber: seller?.rollNumber || listing.sellerRollNumber,
  });
  if (full) out.images = listing.images?.length ? listing.images : listing.image ? [listing.image] : [];
  return out;
}

// ---- v2 helpers (mirror cloudflare-backend/src/index.ts) ----
const CATEGORY_IDS = ["textbooks", "electronics", "furniture", "clothing", "services", "other"];
const CONDITION_NAMES = ["Like New", "Good", "Fair", "Used"];
const COURSE_CODE_RE = /^[A-Z]{2,5}[ -]?\d{2,4}[A-Z]?$/;
const REPORT_REASONS = ["spam", "fake", "prohibited", "wrong-info", "other"];

function readListingInput(json, { requireDescription = true } = {}) {
  const title = String(json.title || "").trim();
  const description = String(json.description || "").trim();
  const price = Number(json.price);
  const category = String(json.category || "other");
  const condition = String(json.condition || "Good");
  const courseCode = String(json.courseCode || "").trim().toUpperCase() || null;
  const meetupSpot = String(json.meetupSpot || "").trim().slice(0, 60) || null;
  const images = (Array.isArray(json.images) ? json.images : json.image ? [json.image] : []).filter((i) => typeof i === "string");
  if (!title || title.length > 100) fail("Title is required (max 100 characters).");
  if (requireDescription && !description) fail("Description is required.");
  if (description.length > 1000) fail("Description is too long (max 1000 characters).");
  if (!Number.isFinite(price) || price < 0 || price > 10_000_000) fail("Enter a valid price.");
  if (!CATEGORY_IDS.includes(category)) fail("Unknown category.");
  if (!CONDITION_NAMES.includes(condition)) fail("Unknown condition.");
  if (courseCode && !COURSE_CODE_RE.test(courseCode)) fail("Course code should look like CS201 or MATH-101.");
  if (images.length > 4) fail("Up to 4 photos per listing.");
  return { title, description, price: Math.round(price), category, condition, images, courseCode, meetupSpot, negotiable: Boolean(json.negotiable) };
}

function createListing(db, user, v, saleTag) {
  const emoji = { textbooks: "📚", electronics: "💻", furniture: "🛋️", clothing: "👕", services: "🛠️", other: "📦" };
  const listing = {
    id: generateId(),
    sellerId: user.id,
    ...v,
    image: v.images[0] || null,
    campus: user.campus,
    emoji: emoji[v.category],
    saleTag,
    status: "active",
    createdAt: Date.now(),
  };
  db.listings.unshift(listing);
  return listing;
}

function sellerRating(db, sellerId) {
  const mine = db.ratings.filter((r) => r.sellerId === sellerId);
  const avg = mine.length ? mine.reduce((a, r) => a + r.stars, 0) / mine.length : null;
  return { average: avg === null ? null : Math.round(avg * 10) / 10, count: mine.length };
}

function canRate(db, listingId, sellerId, userId) {
  if (sellerId === userId) return false;
  if (db.ratings.some((r) => r.listingId === listingId && r.raterId === userId)) return false;
  return db.conversations.some((c) => c.listingId === listingId && c.buyerId === userId) ||
    (db.purchases || []).some((p) => p.listingId === listingId && p.buyerId === userId);
}

function unreadIn(db, conv, userId) {
  const lastRead = db.reads[`${conv.id}:${userId}`] || 0;
  return db.messages.filter((m) => m.conversationId === conv.id && m.senderId !== userId && m.createdAt > lastRead).length;
}

function markRead(db, convId, userId) {
  db.reads[`${convId}:${userId}`] = Date.now();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fail(message) {
  const err = new Error(message);
  throw err;
}

function requireUser(db) {
  const user = currentUser(db);
  if (!user) fail("Please log in to continue.");
  if (!user.emailVerified) fail("Please verify your email first.");
  return user;
}

async function readFormFile(file) {
  if (!file) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read ID card photo."));
    reader.readAsDataURL(file);
  });
}

export async function handle(path, options = {}) {
  const db = loadDb();
  const method = (options.method || "GET").toUpperCase();
  let body = options.body;

  if (path === "/api/health") {
    return { status: "ok", mode: "local" };
  }

  if (path === "/api/auth/signup" && method === "POST") {
    if (!(body instanceof FormData)) fail("Invalid signup data.");

    const name = (body.get("name") || "").trim();
    const rollNumber = (body.get("rollNumber") || "").trim().toUpperCase();
    const phone = (body.get("phone") || "").trim();
    const collegeEmail = (body.get("collegeEmail") || "").trim().toLowerCase();
    const campus = (body.get("campus") || SITE.campus).trim();
    const idCard = body.get("idCard");
    const password = body.get("password") || "";

    if (!name || !rollNumber || !phone || !collegeEmail || !campus) {
      fail("All fields are required.");
    }
    if (!validateEmail(collegeEmail)) {
      fail("Please enter a valid email address.");
    }
    if (!/^\d{10}$/.test(phone)) {
      fail("Phone number must be 10 digits.");
    }
    if (!idCard || !idCard.name) {
      fail("College ID card photo is required.");
    }
    const pwError = passwordProblem(password);
    if (pwError) fail(pwError);

    const exists = db.users.some(
      (u) => u.collegeEmail === collegeEmail || u.rollNumber === rollNumber
    );
    if (exists) fail("An account with this email or roll number already exists.");

    const idCardData = await readFormFile(idCard);
    const userId = db.nextUserId++;
    const now = Date.now() / 1000;
    const otp = generateOtp();

    const user = {
      id: userId,
      name,
      rollNumber,
      phone,
      collegeEmail,
      campus,
      emailVerified: false,
      idVerified: false,
      idCardData,
      passwordHash: await hashPassword(password),
      createdAt: now,
    };

    db.users.push(user);
    db.otps[collegeEmail] = { code: otp, expiresAt: Date.now() + 600000 };

    const sessionToken = generateToken();
    db.sessions[sessionToken] = userId;
    saveDb(db);
    localStorage.setItem("campusswap_token", sessionToken);

    return {
      token: sessionToken,
      user: userPublic(user),
      message: "Account created. Verify your email with the OTP sent.",
      demoOtp: otp,
    };
  }

  if (path === "/api/auth/send-otp" && method === "POST") {
    const collegeEmail = (body?.collegeEmail || "").trim().toLowerCase();
    if (!validateEmail(collegeEmail)) fail("Invalid email address.");
    if (!db.users.some((u) => u.collegeEmail === collegeEmail)) {
      fail("No account found for this email.");
    }
    const otp = generateOtp();
    db.otps[collegeEmail] = { code: otp, expiresAt: Date.now() + 600000 };
    saveDb(db);
    return { message: "Verification code sent to your email.", demoOtp: otp };
  }

  if (path === "/api/auth/verify-email" && method === "POST") {
    const collegeEmail = (body?.collegeEmail || "").trim().toLowerCase();
    const code = (body?.code || "").trim();
    const otpRow = db.otps[collegeEmail];
    if (!otpRow) fail("No verification code found. Request a new one.");
    if (Date.now() > otpRow.expiresAt) fail("Verification code expired. Request a new one.");
    if (otpRow.code !== code) fail("Invalid verification code.");

    const user = db.users.find((u) => u.collegeEmail === collegeEmail);
    if (!user) fail("Account not found.");
    user.emailVerified = true;
    user.idVerified = true;
    delete db.otps[collegeEmail];
    saveDb(db);
    return { user: userPublic(user), message: "Email verified successfully!" };
  }

  if (path === "/api/auth/login" && method === "POST") {
    const collegeEmail = (body?.collegeEmail || "").trim().toLowerCase();
    const password = body?.password || "";
    if (!collegeEmail || !password) fail("Email and password are required.");
    const user = db.users.find((u) => u.collegeEmail === collegeEmail);
    if (user && !user.passwordHash) {
      fail("This account has no password yet. Use “Forgot password” to set one.");
    }
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      fail("Incorrect email or password.");
    }

    const sessionToken = generateToken();
    db.sessions[sessionToken] = user.id;
    saveDb(db);
    localStorage.setItem("campusswap_token", sessionToken);
    return { token: sessionToken, user: userPublic(user) };
  }

  if (path === "/api/auth/reset-password" && method === "POST") {
    const collegeEmail = (body?.collegeEmail || "").trim().toLowerCase();
    const code = (body?.code || "").trim();
    const password = body?.password || "";
    const otpRow = db.otps[collegeEmail];
    if (!otpRow || otpRow.code !== code) fail("Invalid verification code.");
    if (Date.now() > otpRow.expiresAt) fail("Verification code expired. Request a new one.");
    const pwError = passwordProblem(password);
    if (pwError) fail(pwError);

    const user = db.users.find((u) => u.collegeEmail === collegeEmail);
    if (!user) fail("Account not found.");
    user.passwordHash = await hashPassword(password);
    user.emailVerified = true;
    delete db.otps[collegeEmail];
    // Sign out every other session for this account.
    for (const [t, uid] of Object.entries(db.sessions)) if (uid === user.id) delete db.sessions[t];
    saveDb(db);
    return { message: "Password updated. You can now log in." };
  }

  if (path === "/api/auth/me") {
    const user = currentUser(db);
    return { user: user ? userPublic(user) : null };
  }

  if (path === "/api/auth/logout" && method === "POST") {
    const t = token();
    if (t) delete db.sessions[t];
    saveDb(db);
    localStorage.removeItem("campusswap_token");
    return { message: "Logged out." };
  }

  if (path === "/api/listings" && method === "GET") {
    const listings = db.listings
      .filter((l) => l.status === "active")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((l) => enrichListing(db, l));
    return { listings };
  }

  if (path === "/api/my-listings" && method === "GET") {
    const user = requireUser(db);
    const listings = db.listings
      .filter((l) => l.sellerId === user.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((l) => enrichListing(db, l));
    return { listings };
  }

  const listingMatch = path.match(/^\/api\/listings\/([^/]+)$/);
  if (listingMatch && method === "GET") {
    const listing = db.listings.find((l) => l.id === listingMatch[1]);
    const viewer = currentUser(db);
    if (!listing || (listing.status === "hidden" && viewer?.id !== listing.sellerId)) fail("Listing not found.");
    const out = enrichListing(db, listing, { full: true });
    out.sellerRating = sellerRating(db, listing.sellerId);
    out.canRate = viewer?.emailVerified ? canRate(db, listing.id, listing.sellerId, viewer.id) : false;
    return { listing: out };
  }

  if (path === "/api/listings" && method === "POST") {
    const user = requireUser(db);
    const listing = createListing(db, user, readListingInput(body || {}), null);
    saveDb(db);
    return { listing: enrichListing(db, listing, { full: true }) };
  }

  if (path === "/api/listings/bulk" && method === "POST") {
    const user = requireUser(db);
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) fail("Add at least one item.");
    if (items.length > 15) fail("Up to 15 items at a time.");
    const note = String(body?.description || "").trim().slice(0, 500);
    const parsed = items.map((item, i) => {
      try {
        return readListingInput(
          { ...item, description: item.description || note || "Moving-out sale.", meetupSpot: body.meetupSpot, negotiable: body.negotiable ?? true },
          { requireDescription: false }
        );
      } catch (err) {
        fail(`Item ${i + 1}: ${err.message}`);
      }
    });
    const ids = parsed.map((v) => createListing(db, user, v, "moving-out").id);
    saveDb(db);
    return { created: ids.length, ids };
  }

  const markSoldMatch = path.match(/^\/api\/listings\/([^/]+)\/mark-sold$/);
  if (markSoldMatch && method === "POST") {
    const user = requireUser(db);
    const listing = db.listings.find((l) => l.id === markSoldMatch[1]);
    if (!listing) fail("Listing not found.");
    if (listing.sellerId !== user.id) fail("You can only update your own listings.");
    listing.status = "sold";
    saveDb(db);
    return { message: "Item marked as sold.", listing: enrichListing(db, listing) };
  }

  if (listingMatch && method === "DELETE") {
    const user = requireUser(db);
    const idx = db.listings.findIndex((l) => l.id === listingMatch[1]);
    if (idx === -1) fail("Listing not found.");
    if (db.listings[idx].sellerId !== user.id) fail("You can only delete your own listings.");
    db.listings.splice(idx, 1);
    saveDb(db);
    return { message: "Listing deleted." };
  }

  if (path === "/api/conversations" && method === "GET") {
    const user = requireUser(db);
    const conversations = db.conversations
      .filter((c) => c.buyerId === user.id || c.sellerId === user.id)
      .map((c) => {
        const listing = db.listings.find((l) => l.id === c.listingId);
        const buyer = findUser(db, c.buyerId);
        const seller = findUser(db, c.sellerId);
        const msgs = db.messages.filter((m) => m.conversationId === c.id);
        const last = msgs[msgs.length - 1];
        const otherName = c.buyerId === user.id ? seller?.name : buyer?.name;
        return {
          id: c.id,
          listingId: c.listingId,
          listingTitle: listing?.title || "Listing",
          listingPrice: listing?.price || 0,
          otherName: otherName || "User",
          lastMessage: last?.body || "No messages yet",
          lastMessageAt: last?.createdAt || c.createdAt,
          unread: unreadIn(db, c, user.id),
        };
      })
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    return { conversations };
  }

  if (path === "/api/conversations" && method === "POST") {
    const user = requireUser(db);
    const listingId = body?.listingId;
    const listing = db.listings.find((l) => l.id === listingId);
    if (!listing) fail("Listing not found.");
    if (listing.sellerId === user.id) fail("You cannot message yourself.");

    let conv = db.conversations.find(
      (c) => c.listingId === listingId && c.buyerId === user.id
    );
    if (!conv) {
      conv = {
        id: db.nextConvId++,
        listingId,
        buyerId: user.id,
        sellerId: listing.sellerId,
        createdAt: Date.now(),
      };
      db.conversations.push(conv);
      saveDb(db);
    }
    return { conversationId: conv.id };
  }

  const messagesMatch = path.match(/^\/api\/conversations\/(\d+)\/messages$/);
  if (messagesMatch && method === "GET") {
    const user = requireUser(db);
    const conversationId = parseInt(messagesMatch[1], 10);
    const conv = db.conversations.find((c) => c.id === conversationId);
    if (!conv || (conv.buyerId !== user.id && conv.sellerId !== user.id)) {
      fail("Conversation not found.");
    }
    markRead(db, conversationId, user.id);
    saveDb(db);
    const messages = db.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => {
        const sender = findUser(db, m.senderId);
        return {
          id: m.id,
          body: m.body,
          senderId: m.senderId,
          senderName: sender?.name || "User",
          isMine: m.senderId === user.id,
          createdAt: m.createdAt,
        };
      });
    return { messages, conversationId };
  }

  if (messagesMatch && method === "POST") {
    const user = requireUser(db);
    const conversationId = parseInt(messagesMatch[1], 10);
    const conv = db.conversations.find((c) => c.id === conversationId);
    if (!conv || (conv.buyerId !== user.id && conv.sellerId !== user.id)) {
      fail("Conversation not found.");
    }
    const text = (body?.body || "").trim();
    if (!text) fail("Message cannot be empty.");

    const message = {
      id: db.nextMsgId++,
      conversationId,
      senderId: user.id,
      body: text,
      createdAt: Date.now(),
    };
    db.messages.push(message);
    markRead(db, conversationId, user.id);
    saveDb(db);
    return {
      message: {
        id: message.id,
        body: text,
        senderId: user.id,
        senderName: user.name,
        isMine: true,
        createdAt: message.createdAt,
      },
    };
  }

  if (path === "/api/payments" && method === "POST") {
    const user = requireUser(db);
    const listing = db.listings.find((l) => l.id === body?.listingId);
    if (!listing || listing.status !== "active") fail("Listing unavailable.");
    if (listing.sellerId === user.id) fail("You cannot buy your own listing.");
    listing.status = "sold";
    (db.purchases ||= []).push({ listingId: listing.id, buyerId: user.id, createdAt: Date.now() });
    saveDb(db);
    return {
      transaction: {
        id: generateId(),
        listingId: listing.id,
        amount: listing.price,
        status: "completed",
        createdAt: Date.now(),
      },
      message: "Payment successful! Contact the seller to arrange pickup.",
    };
  }

  if (path === "/api/unread") {
    const user = currentUser(db);
    if (!user) return { count: 0 };
    const count = db.conversations
      .filter((c) => c.buyerId === user.id || c.sellerId === user.id)
      .reduce((n, c) => n + unreadIn(db, c, user.id), 0);
    return { count };
  }

  if (path === "/api/saved" && method === "GET") {
    const user = requireUser(db);
    const listings = db.saved
      .filter((s) => s.userId === user.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((s) => db.listings.find((l) => l.id === s.listingId))
      .filter((l) => l && l.status !== "hidden")
      .map((l) => enrichListing(db, l));
    return { listings };
  }

  const saveMatch = path.match(/^\/api\/listings\/([^/]+)\/save$/);
  if (saveMatch) {
    const user = requireUser(db);
    const id = saveMatch[1];
    if (method === "POST") {
      if (!db.listings.some((l) => l.id === id)) fail("Listing not found.");
      if (!db.saved.some((s) => s.userId === user.id && s.listingId === id)) {
        db.saved.push({ userId: user.id, listingId: id, createdAt: Date.now() });
      }
      saveDb(db);
      return { saved: true };
    }
    if (method === "DELETE") {
      db.saved = db.saved.filter((s) => !(s.userId === user.id && s.listingId === id));
      saveDb(db);
      return { saved: false };
    }
  }

  const reportMatch = path.match(/^\/api\/listings\/([^/]+)\/report$/);
  if (reportMatch && method === "POST") {
    const user = requireUser(db);
    const listing = db.listings.find((l) => l.id === reportMatch[1]);
    if (!REPORT_REASONS.includes(body?.reason)) fail("Choose a reason.");
    if (!listing) fail("Listing not found.");
    if (listing.sellerId === user.id) fail("You can't report your own listing.");
    if (db.reports.some((r) => r.listingId === listing.id && r.reporterId === user.id)) {
      return { message: "You already reported this listing." };
    }
    db.reports.push({ listingId: listing.id, reporterId: user.id, reason: body.reason, details: String(body.details || "").slice(0, 300), createdAt: Date.now() });
    if (db.reports.filter((r) => r.listingId === listing.id).length >= 3 && listing.status === "active") {
      listing.status = "hidden";
    }
    saveDb(db);
    return { message: "Thanks — our team will take a look." };
  }

  if (path === "/api/ratings" && method === "POST") {
    const user = requireUser(db);
    const stars = Number(body?.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) fail("Pick 1 to 5 stars.");
    const listing = db.listings.find((l) => l.id === body?.listingId);
    if (!listing) fail("Listing not found.");
    if (!canRate(db, listing.id, listing.sellerId, user.id)) {
      fail("You can rate a seller once, after chatting with or buying from them.");
    }
    db.ratings.push({ listingId: listing.id, sellerId: listing.sellerId, raterId: user.id, stars, comment: String(body.comment || "").trim().slice(0, 300), createdAt: Date.now() });
    saveDb(db);
    return { message: "Thanks for rating!", sellerRating: sellerRating(db, listing.sellerId) };
  }

  const ratingsMatch = path.match(/^\/api\/users\/(\d+)\/ratings$/);
  if (ratingsMatch) {
    const sellerId = Number(ratingsMatch[1]);
    const ratings = db.ratings
      .filter((r) => r.sellerId === sellerId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map((r) => ({ stars: r.stars, comment: r.comment, raterName: findUser(db, r.raterId)?.name || "Student", createdAt: r.createdAt }));
    return { summary: sellerRating(db, sellerId), ratings };
  }

  if (path === "/api/wanted" && method === "GET") {
    const viewer = currentUser(db);
    const posts = db.wanted
      .filter((w) => w.status === "open")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((w) => {
        const poster = findUser(db, w.userId);
        return {
          id: w.id,
          userId: w.userId,
          title: w.title,
          description: w.description,
          budget: w.budget,
          category: w.category,
          courseCode: w.courseCode,
          userName: poster?.name || "Student",
          contact: viewer?.emailVerified ? { email: poster?.collegeEmail, phone: poster?.phone } : null,
          createdAt: w.createdAt,
        };
      });
    return { posts };
  }

  if (path === "/api/wanted" && method === "POST") {
    const user = requireUser(db);
    const title = String(body?.title || "").trim();
    const budget = body?.budget === "" || body?.budget == null ? null : Number(body.budget);
    const category = String(body?.category || "other");
    const courseCode = String(body?.courseCode || "").trim().toUpperCase() || null;
    if (!title || title.length > 100) fail("Say what you are looking for (max 100 characters).");
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) fail("Enter a valid budget.");
    if (!CATEGORY_IDS.includes(category)) fail("Unknown category.");
    if (courseCode && !COURSE_CODE_RE.test(courseCode)) fail("Course code should look like CS201 or MATH-101.");
    if (db.wanted.filter((w) => w.userId === user.id && w.status === "open").length >= 10) {
      fail("You can have up to 10 open requests.");
    }
    const id = db.nextWantedId++;
    db.wanted.push({ id, userId: user.id, title, description: String(body?.description || "").trim().slice(0, 500), budget: budget === null ? null : Math.round(budget), category, courseCode, status: "open", createdAt: Date.now() });
    saveDb(db);
    return { id };
  }

  const wantedMatch = path.match(/^\/api\/wanted\/(\d+)$/);
  if (wantedMatch && method === "DELETE") {
    const user = requireUser(db);
    const idx = db.wanted.findIndex((w) => w.id === Number(wantedMatch[1]) && w.userId === user.id);
    if (idx === -1) fail("Request not found.");
    db.wanted.splice(idx, 1);
    saveDb(db);
    return { message: "Request removed." };
  }

  fail("Unknown API route.");
}
