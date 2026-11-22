// Tests the in-browser demo backend (js/local-api.js) in Node — no server needed.
//   node tests/demo-backend.test.mjs
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] };
globalThis.FileReader = class { readAsDataURL() { this.result = "data:x"; setTimeout(() => this.onload()); } };
const { handle } = await import(new URL("../js/local-api.js", import.meta.url));

let pass = 0, fail = 0;
const check = (c, l) => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} - ${l}`); };
const call = async (u, path, method = "GET", body) => {
  u ? localStorage.setItem("campusswap_token", u.token) : localStorage.removeItem("campusswap_token");
  return handle(path, { method, body });
};
const err = async (...a) => { try { await call(...a); return null; } catch (e) { return e.message; } };
const IMG = "data:image/png;base64,AAAA";

async function user(tag, password = "secret123") {
  const f = new FormData();
  const email = `${tag}@college.edu.in`;
  for (const [k, v] of Object.entries({ name: `User ${tag}`, rollNumber: `R${tag}`, phone: "9876543210", collegeEmail: email, campus: "Main", password })) f.append(k, v);
  f.append("idCard", new File(["x"], "id.jpg", { type: "image/jpeg" }));
  const s = await handle("/api/auth/signup", { method: "POST", body: f });
  await handle("/api/auth/verify-email", { method: "POST", body: { collegeEmail: email, code: s.demoOtp } });
  return { token: s.token, id: s.user.id, email };
}

// Passwords
const weak = new FormData();
for (const [k, v] of Object.entries({ name: "W", rollNumber: "W1", phone: "9876543210", collegeEmail: "w@college.edu.in", campus: "M", password: "short" })) weak.append(k, v);
weak.append("idCard", new File(["x"], "id.jpg", { type: "image/jpeg" }));
check(/at least 8/.test(await handle("/api/auth/signup", { method: "POST", body: weak }).catch((e) => e.message)), "weak password rejected");

const A = await user("a"), B = await user("b"), C = await user("c"), D = await user("d");
check(A.token && D.token, "sign up + verify");
check(/Incorrect/.test(await err(null, "/api/auth/login", "POST", { collegeEmail: A.email, password: "wrongpass1" })), "wrong password rejected");
check(!!(await call(null, "/api/auth/login", "POST", { collegeEmail: A.email, password: "secret123" })).token, "correct password logs in");
check(!JSON.stringify(store).includes("secret123"), "passwords are never stored in plain text");

// Listings
check(/Course code/.test(await err(A, "/api/listings", "POST", { title: "X", description: "d", price: 1, category: "textbooks", condition: "Good", courseCode: "??" })), "bad course code rejected");
check(/Up to 4/.test(await err(A, "/api/listings", "POST", { title: "X", description: "d", price: 1, category: "other", condition: "Good", images: [IMG, IMG, IMG, IMG, IMG] })), "max 4 photos");
const { listing: L } = await call(A, "/api/listings", "POST", { title: "DSA book", description: "Clean", price: 300, category: "textbooks", condition: "Good", images: [IMG, IMG], courseCode: "cs201", meetupSpot: "Library", negotiable: true });
check(L.images.length === 2 && L.courseCode === "CS201" && L.negotiable && L.meetupSpot === "Library", "listing with photos, course code, meetup, negotiable");
check((await call(A, "/api/listings/bulk", "POST", { items: [{ title: "Kettle", price: 200, category: "other", condition: "Good" }, { title: "Lamp", price: 150, category: "furniture", condition: "Fair" }] })).created === 2, "moving-out bulk sale");

// Saved
await call(B, `/api/listings/${L.id}/save`, "POST");
check((await call(B, "/api/saved")).listings[0]?.id === L.id, "save");
await call(B, `/api/listings/${L.id}/save`, "DELETE");
check((await call(B, "/api/saved")).listings.length === 0, "unsave");

// Messages, unread, ratings
check(/rate a seller once/.test(await err(B, "/api/ratings", "POST", { listingId: L.id, stars: 5 })), "can't rate before chatting");
const { conversationId } = await call(B, "/api/conversations", "POST", { listingId: L.id });
await call(B, `/api/conversations/${conversationId}/messages`, "POST", { body: "hi" });
await new Promise((r) => setTimeout(r, 5));
await call(B, `/api/conversations/${conversationId}/messages`, "POST", { body: "250?" });
check((await call(A, "/api/unread")).count === 2 && (await call(B, "/api/unread")).count === 0, "unread counts");
await new Promise((r) => setTimeout(r, 5));
await call(A, `/api/conversations/${conversationId}/messages`);
check((await call(A, "/api/unread")).count === 0, "opening a chat marks it read");
const r = await call(B, "/api/ratings", "POST", { listingId: L.id, stars: 4, comment: "Smooth" });
check(r.sellerRating.average === 4 && r.sellerRating.count === 1, "rating after chatting");
check(!!(await err(B, "/api/ratings", "POST", { listingId: L.id, stars: 4 })), "no double rating");

// Reports
check(/own listing/.test(await err(A, `/api/listings/${L.id}/report`, "POST", { reason: "spam" })), "can't report own listing");
for (const u of [B, C, D]) await call(u, `/api/listings/${L.id}/report`, "POST", { reason: "fake" });
check(!(await call(null, "/api/listings")).listings.some((l) => l.id === L.id), "3 reports hide a listing");

// Wanted
const { id: wid } = await call(B, "/api/wanted", "POST", { title: "Need OS book", budget: 400, category: "textbooks", courseCode: "CS301" });
const anon = (await call(null, "/api/wanted")).posts.find((p) => p.id === wid);
const ver = (await call(C, "/api/wanted")).posts.find((p) => p.id === wid);
check(anon.contact === null && ver.contact.email === B.email, "wanted contact only for verified students");
check(!!(await err(C, `/api/wanted/${wid}`, "DELETE")) && !(await err(B, `/api/wanted/${wid}`, "DELETE")), "only the poster can remove a request");

// Reset password
const o = await call(null, "/api/auth/send-otp", "POST", { collegeEmail: A.email });
await call(null, "/api/auth/reset-password", "POST", { collegeEmail: A.email, code: o.demoOtp, password: "newpass123" });
check(!!(await err(null, "/api/auth/login", "POST", { collegeEmail: A.email, password: "secret123" })), "old password stops working after reset");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
