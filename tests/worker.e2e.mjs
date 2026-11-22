// End-to-end tests for the Cloudflare worker API.
// Run the worker locally first (with DEMO_OTP=1 in cloudflare-backend/.dev.vars):
//   cd cloudflare-backend && npm run db:init:local && npx wrangler dev
// then:  node tests/worker.e2e.mjs http://127.0.0.1:8787
const BASE = process.argv[2] || "http://127.0.0.1:8787";
let pass = 0, fail = 0;
const check = (cond, label, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "ok  " : "FAIL"} - ${label}${cond ? "" : "  " + extra}`); };
async function call(path, { method = "GET", body, token, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
async function makeUser(tag) {
  const f = new FormData();
  f.append("name", `User ${tag}`); f.append("rollNumber", `22BCS${tag}${Date.now() % 10000}`); f.append("phone", "98765" + String(Math.floor(Math.random()*1e5)).padStart(5,"0"));
  const email = `${tag.toLowerCase()}${Date.now()}@college.edu.in`;
  f.append("collegeEmail", email); f.append("campus", "Main"); f.append("password", "secret123");
  f.append("idCard", new Blob(["x"], { type: "image/jpeg" }), "id.jpg");
  const s = await call("/api/auth/signup", { method: "POST", form: f });
  const v = await call("/api/auth/verify-email", { method: "POST", body: { collegeEmail: email, code: s.data.demoOtp } });
  return { token: s.data.token, id: s.data.user?.id, email, verified: v.data.user?.emailVerified };
}

const A = await makeUser("A"), B = await makeUser("B"), C = await makeUser("C"), D = await makeUser("D");
check(A.token && A.verified && B.verified && C.verified && D.verified, "4 users sign up and verify via code");
const login = await call("/api/auth/login", { method: "POST", body: { collegeEmail: A.email, password: "secret123" } });
check(login.status === 200 && login.data.token, "password login works");

// Listings
const bad1 = await call("/api/listings", { method: "POST", token: A.token, body: { title: "X", description: "d", price: 10, category: "textbooks", condition: "Good", courseCode: "not a code!" } });
check(bad1.status === 400, "invalid course code rejected", JSON.stringify(bad1.data));
const bad2 = await call("/api/listings", { method: "POST", token: A.token, body: { title: "X", description: "d", price: 10, category: "textbooks", condition: "Good", images: [IMG, IMG, IMG, IMG, IMG] } });
check(bad2.status === 400, "5 photos rejected (max 4)");
const created = await call("/api/listings", { method: "POST", token: A.token, body: { title: "DSA book", description: "Clean copy", price: 300, category: "textbooks", condition: "Good", images: [IMG, IMG], courseCode: "cs201", meetupSpot: "Library", negotiable: true } });
const L = created.data.listing;
check(created.status === 201 && L.images.length === 2 && L.courseCode === "CS201" && L.meetupSpot === "Library" && L.negotiable === true, "listing with 2 photos, course code, meetup, negotiable", JSON.stringify(created.data).slice(0, 200));
const bulk = await call("/api/listings/bulk", { method: "POST", token: A.token, body: { items: [{ title: "Kettle", price: 200, category: "other", condition: "Good" }, { title: "Lamp", price: 150, category: "furniture", condition: "Fair" }, { title: "Mattress", price: 900, category: "furniture", condition: "Used" }], meetupSpot: "Hostel reception", description: "Leaving campus" } });
check(bulk.status === 201 && bulk.data.created === 3, "moving-out bulk sale creates 3 listings", JSON.stringify(bulk.data));
const list = await call("/api/listings");
const inList = list.data.listings.find((l) => l.id === L.id);
check(inList && inList.images === undefined && inList.image, "public list has cover photo only (light payload)");
check(list.data.listings.filter((l) => l.saleTag === "moving-out").length >= 3, "bulk items tagged moving-out");

// Saved
await call(`/api/listings/${L.id}/save`, { method: "POST", token: B.token });
let saved = await call("/api/saved", { token: B.token });
check(saved.data.listings.some((l) => l.id === L.id), "save to wishlist");
await call(`/api/listings/${L.id}/save`, { method: "DELETE", token: B.token });
saved = await call("/api/saved", { token: B.token });
check(!saved.data.listings.some((l) => l.id === L.id), "remove from wishlist");

// Ratings gated on engagement
let det = await call(`/api/listings/${L.id}`, { token: B.token });
check(det.data.listing.canRate === false && det.data.listing.sellerRating.count === 0, "can't rate before chatting");
const early = await call("/api/ratings", { method: "POST", token: B.token, body: { listingId: L.id, stars: 5 } });
check(early.status === 403, "rating without chatting rejected");

// Messages + unread
const conv = await call("/api/conversations", { method: "POST", token: B.token, body: { listingId: L.id } });
await call(`/api/conversations/${conv.data.conversationId}/messages`, { method: "POST", token: B.token, body: { body: "Is this available?" } });
await call(`/api/conversations/${conv.data.conversationId}/messages`, { method: "POST", token: B.token, body: { body: "Can do 250?" } });
let unread = await call("/api/unread", { token: A.token });
check(unread.data.count === 2, "seller sees 2 unread", JSON.stringify(unread.data));
const convs = await call("/api/conversations", { token: A.token });
check(convs.data.conversations[0].unread === 2, "conversation shows unread count");
const bUnread = await call("/api/unread", { token: B.token });
check(bUnread.data.count === 0, "sender's own messages are not unread");
await call(`/api/conversations/${conv.data.conversationId}/messages`, { token: A.token });
unread = await call("/api/unread", { token: A.token });
check(unread.data.count === 0, "opening chat marks it read");

det = await call(`/api/listings/${L.id}`, { token: B.token });
check(det.data.listing.canRate === true, "buyer can rate after chatting");
const rate = await call("/api/ratings", { method: "POST", token: B.token, body: { listingId: L.id, stars: 4, comment: "Smooth deal" } });
check(rate.status === 201 && rate.data.sellerRating.average === 4 && rate.data.sellerRating.count === 1, "rating saved, average 4.0");
const again = await call("/api/ratings", { method: "POST", token: B.token, body: { listingId: L.id, stars: 1 } });
check(again.status === 403, "can't rate same listing twice");
const selfRate = await call("/api/ratings", { method: "POST", token: A.token, body: { listingId: L.id, stars: 5 } });
check(selfRate.status === 403, "seller can't rate themselves");
const reviews = await call(`/api/users/${A.id}/ratings`);
check(reviews.data.ratings[0]?.comment === "Smooth deal", "public reviews list");

// Reports → auto-hide at 3
const selfReport = await call(`/api/listings/${L.id}/report`, { method: "POST", token: A.token, body: { reason: "spam" } });
check(selfReport.status === 400, "can't report own listing");
for (const u of [B, C]) await call(`/api/listings/${L.id}/report`, { method: "POST", token: u.token, body: { reason: "fake" } });
const dup = await call(`/api/listings/${L.id}/report`, { method: "POST", token: B.token, body: { reason: "fake" } });
check(/already/.test(dup.data.message), "duplicate report ignored");
let still = await call("/api/listings");
check(still.data.listings.some((l) => l.id === L.id), "2 reports: still visible");
await call(`/api/listings/${L.id}/report`, { method: "POST", token: D.token, body: { reason: "prohibited" } });
still = await call("/api/listings");
check(!still.data.listings.some((l) => l.id === L.id), "3 reports: hidden from browse");
const hiddenForB = await call(`/api/listings/${L.id}`, { token: B.token });
const hiddenForA = await call(`/api/listings/${L.id}`, { token: A.token });
check(hiddenForB.status === 404 && hiddenForA.status === 200 && hiddenForA.data.listing.status === "hidden", "hidden listing: 404 for others, visible to owner");

// Wanted
const w = await call("/api/wanted", { method: "POST", token: B.token, body: { title: "Need OS textbook", budget: 400, category: "textbooks", courseCode: "CS301" } });
check(w.status === 201, "post a wanted request");
const wAnon = await call("/api/wanted");
const wVer = await call("/api/wanted", { token: C.token });
check(wAnon.data.posts[0].contact === null && wVer.data.posts[0].contact?.email === B.email, "contact hidden from logged-out, shown to verified");
const wDelOther = await call(`/api/wanted/${w.data.id}`, { method: "DELETE", token: C.token });
const wDel = await call(`/api/wanted/${w.data.id}`, { method: "DELETE", token: B.token });
check(wDelOther.status === 404 && wDel.status === 200, "only the poster can remove a request");

// OTP protections
const resend = await call("/api/auth/send-otp", { method: "POST", body: { collegeEmail: A.email } });
const resend2 = await call("/api/auth/send-otp", { method: "POST", body: { collegeEmail: A.email } });
check(resend.status === 200 && resend2.status === 429, "resend is rate-limited (1/min)");
let last;
for (let i = 0; i < 5; i++) last = await call("/api/auth/reset-password", { method: "POST", body: { collegeEmail: A.email, code: "000000", password: "hacked123" } });
const afterLock = await call("/api/auth/reset-password", { method: "POST", body: { collegeEmail: A.email, code: resend.data.demoOtp, password: "hacked123" } });
check(/Too many/.test(last.data.error) && afterLock.status === 400, "5 wrong codes burn the code (brute force blocked)", JSON.stringify(last.data));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
