# API reference

Base URL: your worker, e.g. `https://campus-market-backend.<you>.workers.dev`.
The in-browser demo backend (`js/local-api.js`) implements the same routes and responses.

**Conventions**

- Request and response bodies are JSON, except sign-up (`multipart/form-data`).
- Authenticated routes need `Authorization: Bearer <token>` (from sign-up or log-in).
- 🔒 = logged in · ✅ = logged in **and** email verified.
- Errors look like `{ "error": "Human-readable message" }` with a 4xx/5xx status.
- Timestamps in responses are milliseconds since the epoch.

---

## Auth

### `POST /api/auth/signup`
`multipart/form-data`: `name`, `rollNumber`, `phone` (10 digits), `collegeEmail` (`.edu`, `.ac.in` or `.edu.in`), `campus`, `password` (8+ chars, a letter and a number), `idCard` (image file).

`201` → `{ token, user, message, demoOtp? }` and a 6-digit code is emailed.
`503` if email isn't configured on the server.

### `POST /api/auth/send-otp`
`{ collegeEmail }` → `{ message, demoOtp? }`. Rate-limited to one code per minute (`429`).

### `POST /api/auth/verify-email`
`{ collegeEmail, code }` → `{ user, message }`. Five wrong codes invalidate the code.

### `POST /api/auth/login`
`{ collegeEmail, password }` → `{ token, user }`.
`401` wrong credentials · `403` account created before passwords existed (use reset).

### `POST /api/auth/reset-password`
`{ collegeEmail, code, password }` → `{ message }`. Get the code from `send-otp` first. Signs out all existing sessions.

### `GET /api/auth/me`
→ `{ user }` (or `{ user: null }`).

### `POST /api/auth/logout` 🔒

> `demoOtp` is only included when the worker runs with `DEMO_OTP=1` (local development). In production the code is only ever emailed.

---

## Listings

A listing:

```json
{
  "id": "a1b2c3d4e5f6",
  "title": "Introduction to Algorithms",
  "description": "3rd edition, barely used",
  "price": 450,
  "category": "textbooks",
  "condition": "Like New",
  "image": "data:image/jpeg;base64,…",
  "images": ["data:image/jpeg;base64,…"],
  "courseCode": "CS201",
  "meetupSpot": "Library",
  "negotiable": true,
  "saleTag": null,
  "status": "active",
  "sellerId": 7,
  "sellerName": "Riya Sharma",
  "createdAt": 1795380571545
}
```

- `category`: `textbooks` · `electronics` · `furniture` · `clothing` · `services` · `other`
- `condition`: `Like New` · `Good` · `Fair` · `Used`
- `status`: `active` · `sold` · `hidden` (hidden after 3 reports)
- `saleTag`: `null` or `"moving-out"`
- `images` (all photos) is only included on the single-listing route; lists carry the cover `image` only, to keep them light.

### `GET /api/listings`
Active listings, newest first → `{ listings }`.

### `GET /api/listings/:id`
→ `{ listing }` with `images`, plus:
- `sellerRating`: `{ average: 4.5 | null, count: 2 }`
- `canRate`: whether the current viewer may rate this seller for this listing

Hidden listings return `404` to everyone except their seller.

### `POST /api/listings` ✅
```json
{ "title": "…", "description": "…", "price": 450, "category": "textbooks", "condition": "Good",
  "images": ["data:image/jpeg;base64,…"], "courseCode": "CS201", "meetupSpot": "Library", "negotiable": true }
```
Limits: title ≤ 100 chars, description ≤ 1000, ≤ 4 images (~500 KB each), course code like `CS201` / `MATH-101`.
`201` → `{ listing }`.

### `POST /api/listings/bulk` ✅ — moving-out sale
```json
{
  "items": [{ "title": "Kettle", "price": 300, "category": "other", "condition": "Good" }],
  "meetupSpot": "Hostel reception",
  "negotiable": true,
  "description": "Leaving on 30th May"
}
```
1–15 items, all tagged `moving-out`. `201` → `{ created, ids }`.

### `GET /api/my-listings` 🔒
All your listings, including sold and hidden → `{ listings }`.

### `POST /api/listings/:id/mark-sold` 🔒 · `DELETE /api/listings/:id` 🔒
Seller only.

---

## Saved items

| Route | |
|---|---|
| `GET /api/saved` 🔒 | `{ listings }` you saved, newest first |
| `POST /api/listings/:id/save` 🔒 | `{ saved: true }` |
| `DELETE /api/listings/:id/save` 🔒 | `{ saved: false }` |

---

## Reports

### `POST /api/listings/:id/report` ✅
`{ reason, details? }` — `reason`: `spam` · `fake` · `prohibited` · `wrong-info` · `other`.
One report per student per listing; you can't report your own. At **3** reports the listing becomes `hidden`.

---

## Ratings

### `POST /api/ratings` ✅
`{ listingId, stars: 1-5, comment? }` → `{ message, sellerRating }`.
Allowed once per listing, only if you started a conversation about it or bought it, and never for your own listing (`403` otherwise).

### `GET /api/users/:id/ratings`
→ `{ summary: { average, count }, ratings: [{ stars, comment, raterName, createdAt }] }` (latest 20).

---

## Wanted posts

### `GET /api/wanted`
Open requests, newest first → `{ posts }`:
```json
{ "id": 3, "userId": 7, "title": "Need a cycle", "description": "", "budget": 1500,
  "category": "other", "courseCode": null, "userName": "Riya Sharma",
  "contact": { "email": "…", "phone": "…" }, "createdAt": 1795380571545 }
```
`contact` is `null` unless the viewer is a verified student.

### `POST /api/wanted` ✅
`{ title, description?, budget?, category, courseCode? }` → `{ id }`. Max 10 open requests per student.

### `DELETE /api/wanted/:id` 🔒
Poster only.

---

## Messages

| Route | |
|---|---|
| `GET /api/conversations` 🔒 | `{ conversations: [{ id, listingId, listingTitle, listingPrice, otherName, lastMessage, lastMessageAt, unread }] }` |
| `POST /api/conversations` 🔒 | `{ listingId }` → `{ conversationId }` (re-uses an existing one) |
| `GET /api/conversations/:id/messages` 🔒 | `{ messages }` — also **marks the conversation as read** |
| `POST /api/conversations/:id/messages` 🔒 | `{ body }` → `{ message }` |
| `GET /api/unread` | `{ count }` of unread messages across all your conversations (`0` when logged out) |

---

## Payments (demo)

### `POST /api/payments` 🔒
`{ listingId }` → records a transaction and marks the listing sold. No real money moves.

## Health

### `GET /api/health`
`{ status: "ok", … }` — the frontend uses this to decide between the real API and demo mode.
