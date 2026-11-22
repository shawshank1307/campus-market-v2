import {
  CATEGORIES,
  CONDITIONS,
  getCategoryLabel,
  formatPrice,
  timeAgo,
} from "./data.js";
import { SITE, CAMPUS_PHOTOS, LOGO, photoUrl } from "./config.js";
import { processListingImage } from "./image-utils.js";
import { passwordProblem, passwordStrength } from "./password.js";
import { toggleTheme, currentTheme } from "./theme.js";
import { api } from "./api.js";
import {
  getUser,
  isVerified,
  loadSession,
  login,
  logout,
  setUser,
  requireAuth,
} from "./auth.js";

const app = document.getElementById("app");
const toastEl = document.getElementById("toast");
const nav = document.getElementById("main-nav");
const menuToggle = document.getElementById("menu-toggle");
const headerActions = document.getElementById("header-actions");

const state = { search: "", category: "all", sort: "newest" };

let listingsCache = [];
let myListingsCache = [];
let signupDraft = { campus: SITE.campus };
let cameraStream = null;
let toastTimer = null;
let heroTimer = null;
let revealObserver = null;
let resetDraft = { step: 1 };
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Icons (inline SVG, stroke-based) ---------- */

const svg = (d) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const ICONS = {
  all: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  textbooks: svg('<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2.5z"/><path d="M19 17v4H6.5"/>'),
  electronics: svg('<rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>'),
  furniture: svg('<path d="M5 11V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4"/><path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v4H3z"/><path d="M6 17v3M18 17v3"/>'),
  clothing: svg('<path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/>'),
  services: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'),
  other: svg('<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  pin: svg('<path d="M12 21s7-6.1 7-11a7 7 0 0 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  chat: svg('<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  logout: svg('<path d="M15 17l5-5-5-5"/><path d="M20 12H9"/><path d="M12 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/>'),
  chevron: svg('<path d="M6 9l6 6 6-6"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  check: svg('<path d="M5 12l5 5 9-10"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>'),
  upload: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  share: svg('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
};

const categoryIcon = (id) => ICONS[id] || ICONS.other;

/* ---------- Utilities ---------- */

function showToast(message, duration = 3200) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), duration);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function firstName(name) {
  return (name || "").split(" ")[0];
}

function parseRoute() {
  const hash = location.hash.slice(1) || "/";
  const [path, query] = hash.split("?");
  return { path, params: new URLSearchParams(query || "") };
}

function navigate(path) {
  location.hash = path;
}

function pageHeader(title, subtitle = "", extra = "") {
  return `
    <div class="page-header">
      <div>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${extra}
    </div>`;
}

function listingThumb(listing, extraClass = "") {
  if (listing.image) {
    return `<div class="thumb ${extraClass}"><img src="${listing.image}" alt="${escapeHtml(listing.title)}" loading="lazy" /></div>`;
  }
  return `<div class="thumb thumb-placeholder cat-${escapeHtml(listing.category)} ${extraClass}">${categoryIcon(listing.category)}</div>`;
}

/* ---------- Motion ---------- */

function stopHero() {
  clearInterval(heroTimer);
  heroTimer = null;
}

function animatePageIn() {
  if (reduceMotion) return;
  app.classList.remove("page-enter");
  void app.offsetWidth; // restart the animation
  app.classList.add("page-enter");
}

function revealCards(root = document) {
  const cards = root.querySelectorAll(".card:not(.revealed)");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    cards.forEach((c) => c.classList.add("revealed"));
    return;
  }
  revealObserver ??= new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("revealed");
        revealObserver.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -40px 0px" }
  );
  cards.forEach((card, i) => {
    card.style.setProperty("--delay", `${Math.min(i % 8, 7) * 45}ms`);
    revealObserver.observe(card);
  });
}

function startHeroSlideshow() {
  stopHero();
  const slides = document.querySelectorAll(".hero-slide");
  const dots = document.querySelectorAll(".hero-dot");
  if (slides.length < 2) return;
  let current = 0;
  const show = (i) => {
    slides[current].classList.remove("active");
    dots[current]?.classList.remove("active");
    current = i;
    slides[current].classList.add("active");
    dots[current]?.classList.add("active");
  };
  dots.forEach((dot, i) =>
    dot.addEventListener("click", () => {
      show(i);
      startTimer();
    })
  );
  const startTimer = () => {
    clearInterval(heroTimer);
    if (!reduceMotion) heroTimer = setInterval(() => show((current + 1) % slides.length), 6000);
  };
  startTimer();
}

/* ---------- Password fields ---------- */

function passwordField(id, label, { autocomplete = "current-password", meter = false, placeholder = "" } = {}) {
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <div class="password-wrap">
        <input class="input" id="${id}" type="password" required autocomplete="${autocomplete}" placeholder="${placeholder}" />
        <button type="button" class="pw-toggle" data-target="${id}" aria-label="Show password">${ICONS.eye}</button>
      </div>
      ${meter ? `<div class="pw-meter" id="${id}-meter" data-score="0" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <p class="hint" id="${id}-hint">At least 8 characters, with a letter and a number.</p>` : ""}
    </div>`;
}

const STRENGTH_LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"];

function bindPasswordFields() {
  document.querySelectorAll(".pw-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });
  document.querySelectorAll(".pw-meter").forEach((meter) => {
    const id = meter.id.replace(/-meter$/, "");
    const input = document.getElementById(id);
    const hint = document.getElementById(`${id}-hint`);
    input.addEventListener("input", () => {
      const value = input.value;
      const score = value ? (passwordProblem(value) ? Math.min(passwordStrength(value), 1) : Math.max(passwordStrength(value), 2)) : 0;
      meter.dataset.score = String(score);
      hint.textContent = value
        ? passwordProblem(value) || `Strength: ${STRENGTH_LABELS[score]}`
        : "At least 8 characters, with a letter and a number.";
    });
  });
}

/** Validates the password + confirmation inputs; returns the password or null. */
function readNewPassword(id, confirmId) {
  const password = document.getElementById(id).value;
  const problem = passwordProblem(password);
  if (problem) {
    showToast(problem);
    return null;
  }
  if (password !== document.getElementById(confirmId).value) {
    showToast("Passwords don't match.");
    return null;
  }
  return password;
}

/* ---------- Header ---------- */

function setActiveNav(path) {
  document.querySelectorAll(".nav-link").forEach((link) => {
    const route = link.dataset.route;
    const active =
      route === path ||
      (route === "/" && (path.startsWith("/item") || path.startsWith("/checkout")));
    link.classList.toggle("active", active);
  });
}

function updateHeader() {
  const user = getUser();

  nav.innerHTML = user
    ? `<a href="#/" class="nav-link" data-route="/">Browse</a>
       <a href="#/messages" class="nav-link" data-route="/messages">Messages</a>
       <a href="#/profile" class="nav-link" data-route="/profile">My listings</a>`
    : `<a href="#/" class="nav-link" data-route="/">Browse</a>`;

  const themeBtn = `
    <button type="button" class="icon-btn theme-toggle" data-theme-toggle aria-pressed="${currentTheme() === "dark"}" aria-label="${currentTheme() === "dark" ? "Switch to light mode" : "Switch to dark mode"}">
      <span class="ti ti-sun">${ICONS.sun}</span><span class="ti ti-moon">${ICONS.moon}</span>
    </button>`;

  if (user) {
    headerActions.innerHTML = `
      ${themeBtn}
      <a href="#/sell" class="btn btn-primary btn-sm">${ICONS.plus}<span>Sell an item</span></a>
      <div class="account">
        <button class="account-btn" id="account-btn" aria-haspopup="true" aria-expanded="false">
          <span class="avatar avatar-sm">${initials(user.name)}</span>
          <span class="account-name">${escapeHtml(firstName(user.name))}</span>
          ${ICONS.chevron}
        </button>
        <div class="account-menu" id="account-menu" role="menu">
          <div class="account-menu-head">
            <strong>${escapeHtml(user.name)}</strong>
            <span>${escapeHtml(user.collegeEmail || "")}</span>
          </div>
          <a href="#/profile" role="menuitem">${ICONS.user}Profile</a>
          <a href="#/messages" role="menuitem">${ICONS.chat}Messages</a>
          <button type="button" role="menuitem" id="logout-btn">${ICONS.logout}Log out</button>
        </div>
      </div>`;

    const btn = document.getElementById("account-btn");
    const menu = document.getElementById("account-menu");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
    menu.addEventListener("click", () => menu.classList.remove("open"));
    document.getElementById("logout-btn").addEventListener("click", async () => {
      await logout();
      showToast("You've been logged out");
      updateHeader();
      navigate("#/");
      render();
    });
  } else {
    headerActions.innerHTML = `
      ${themeBtn}
      <a href="#/login" class="btn btn-ghost btn-sm">Log in</a>
      <a href="#/signup" class="btn btn-primary btn-sm">Sign up</a>`;
  }

  headerActions.querySelector("[data-theme-toggle]").addEventListener("click", (e) => {
    const point = e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : null;
    toggleTheme(point || centerOf(e.currentTarget));
  });

  setActiveNav(parseRoute().path);
}

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/* ---------- Opening splash ---------- */

function initSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return Promise.resolve();
  if (document.documentElement.classList.contains("no-splash")) {
    splash.remove();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      if (!splash.isConnected) return;
      splash.remove();
      resolve();
    };
    // CSS plays the bloom and fades the splash out; remove it once that finishes.
    splash.addEventListener("animationend", (e) => e.target === splash && done());
    splash.addEventListener("click", () => {
      splash.classList.add("skip");
      setTimeout(done, 400);
    });
    setTimeout(done, 4000); // safety net
  });
}

document.addEventListener("click", () => {
  document.getElementById("account-menu")?.classList.remove("open");
});

/* ---------- Data ---------- */

async function fetchListings() {
  try {
    const data = await api.getListings();
    listingsCache = data.listings || [];
  } catch {
    listingsCache = [];
    showToast("Could not load listings. Please refresh the page.");
  }
  return listingsCache;
}

async function fetchMyListings() {
  try {
    const data = await api.getMyListings();
    myListingsCache = data.listings || [];
  } catch {
    myListingsCache = [];
  }
  return myListingsCache;
}

function filterListings(listings) {
  let result = listings.filter((l) => l.status !== "sold");
  if (state.category !== "all") {
    result = result.filter((l) => l.category === state.category);
  }
  const q = state.search.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        (l.description || "").toLowerCase().includes(q) ||
        (l.sellerName || "").toLowerCase().includes(q)
    );
  }
  switch (state.sort) {
    case "price-low":
      result.sort((a, b) => a.price - b.price);
      break;
    case "price-high":
      result.sort((a, b) => b.price - a.price);
      break;
    default:
      result.sort((a, b) => b.createdAt - a.createdAt);
  }
  return result;
}

/* ---------- Listing card ---------- */

function renderListingCard(listing, { showActions = false } = {}) {
  const isSold = listing.status === "sold";
  const suffix = listing.category === "services" ? "<small>/hr</small>" : "";

  let actions = "";
  if (showActions) {
    actions = isSold
      ? `<div class="card-actions"><button class="btn btn-danger-ghost btn-sm" data-action="remove" data-id="${listing.id}">Remove</button></div>`
      : `<div class="card-actions">
           <button class="btn btn-secondary btn-sm" data-action="mark-sold" data-id="${listing.id}">Mark sold</button>
           <button class="btn btn-danger-ghost btn-sm" data-action="delete" data-id="${listing.id}">Delete</button>
         </div>`;
  }

  return `
    <article class="card ${isSold ? "is-sold" : ""}">
      <a href="#/item/${listing.id}" class="card-link">
        <div class="card-media">
          ${listingThumb(listing)}
          ${isSold ? `<span class="badge badge-dark card-badge">Sold</span>` : ""}
        </div>
        <div class="card-body">
          <div class="card-price">${formatPrice(listing.price)}${suffix}</div>
          <h3 class="card-title">${escapeHtml(listing.title)}</h3>
          <div class="card-meta">
            <span>${escapeHtml(listing.condition)}</span>
            <span aria-hidden="true">·</span>
            <span>${timeAgo(listing.createdAt)}</span>
          </div>
        </div>
      </a>
      ${actions}
    </article>`;
}

/* ---------- Home ---------- */

function renderHome() {
  const user = getUser();

  const slides = CAMPUS_PHOTOS.map(
    (p, i) => `<div class="hero-slide ${i === 0 ? "active" : ""}" style="background-image:url('${photoUrl(p)}')"></div>`
  ).join("");
  const dots = CAMPUS_PHOTOS.map(
    (_, i) => `<button type="button" class="hero-dot ${i === 0 ? "active" : ""}" aria-label="Show photo ${i + 1}"></button>`
  ).join("");

  const heroCopy = user
    ? `<h1>Welcome back, ${escapeHtml(firstName(user.name))}</h1>
       <p class="lead">See what's new from students on campus, or list something you no longer need.</p>
       <div class="hero-actions">
         <a href="#/sell" class="btn btn-primary btn-lg">${ICONS.plus}Sell an item</a>
         <a href="#listings" class="btn btn-glass btn-lg" id="browse-btn">Browse listings</a>
       </div>`
    : `<h1>Buy and sell with students on your campus</h1>
       <p class="lead">Textbooks, electronics, hostel essentials and more — from people you can meet in person. Every account is verified with a college email and student ID.</p>
       <div class="hero-actions">
         <a href="#/signup" class="btn btn-primary btn-lg">Create free account</a>
         <a href="#listings" class="btn btn-glass btn-lg" id="browse-btn">Browse listings</a>
       </div>`;

  const intro = `
    <section class="hero ${user ? "hero-compact" : ""}">
      <div class="hero-media" aria-hidden="true">${slides}</div>
      <div class="hero-scrim" aria-hidden="true"></div>
      <div class="container hero-inner">
        <div class="glass hero-card">
          <div class="hero-brand">
            <span class="logo-tile"><img src="${LOGO.large}" alt="JK Lakshmipat University logo" /></span>
            <span class="eyebrow">Campus Market</span>
          </div>
          ${heroCopy}
        </div>
        ${user ? "" : `
        <ul class="glass trust-list">
          <li>${ICONS.shield}<div><strong>Verified students</strong><span>College email and ID checked at sign-up.</span></div></li>
          <li>${ICONS.pin}<div><strong>Meet on campus</strong><span>No shipping — hand over items in person.</span></div></li>
          <li>${ICONS.chat}<div><strong>Chat in-app</strong><span>Agree on price and pickup before you meet.</span></div></li>
        </ul>`}
      </div>
      <div class="hero-dots">${dots}</div>
    </section>`;

  const chips = CATEGORIES.map(
    (cat) =>
      `<button class="chip ${state.category === cat.id ? "active" : ""}" data-category="${cat.id}">${categoryIcon(cat.id)}${cat.label}</button>`
  ).join("");

  app.innerHTML = `
    ${intro}
    <section class="container listings-section" id="listings">
      <div class="toolbar">
        <label class="search">
          ${ICONS.search}
          <input type="search" id="search-input" placeholder="Search for books, laptops, furniture…" value="${escapeHtml(state.search)}" aria-label="Search listings" />
        </label>
        <select id="sort-filter" class="select" aria-label="Sort listings">
          <option value="newest" ${state.sort === "newest" ? "selected" : ""}>Newest first</option>
          <option value="price-low" ${state.sort === "price-low" ? "selected" : ""}>Price: low to high</option>
          <option value="price-high" ${state.sort === "price-high" ? "selected" : ""}>Price: high to low</option>
        </select>
      </div>
      <div class="chips" role="tablist">${chips}</div>
      <div id="listing-results"></div>
    </section>`;

  renderResults();
  bindFilterEvents();
  startHeroSlideshow();

  document.getElementById("browse-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("listings")?.scrollIntoView({ behavior: "smooth" });
  });
}

function renderResults() {
  const el = document.getElementById("listing-results");
  if (!el) return;
  const listings = filterListings(listingsCache);
  const count = `${listings.length} ${listings.length === 1 ? "item" : "items"}`;

  el.innerHTML = listings.length
    ? `<p class="results-count">${count}</p>
       <div class="grid">${listings.map((l) => renderListingCard(l)).join("")}</div>`
    : `<div class="empty">
         <div class="empty-icon">${ICONS.search}</div>
         <h3>No matching items</h3>
         <p>Try a different search or category${getUser() ? ", or list something yourself." : "."}</p>
         ${getUser() ? `<a href="#/sell" class="btn btn-primary">Sell an item</a>` : ""}
       </div>`;
  revealCards(el);
}

function bindFilterEvents() {
  document.getElementById("search-input")?.addEventListener("input", (e) => {
    state.search = e.target.value;
    renderResults();
  });
  document.getElementById("sort-filter")?.addEventListener("change", (e) => {
    state.sort = e.target.value;
    renderResults();
  });
  document.querySelectorAll("[data-category]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.category = btn.dataset.category;
      document.querySelectorAll("[data-category]").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      renderResults();
    });
  });
}

/* ---------- Auth layout ---------- */

function renderAuthShell(formHtml, photoIndex = 0) {
  const photo = CAMPUS_PHOTOS[photoIndex % CAMPUS_PHOTOS.length];
  return `
    <div class="auth">
      <aside class="auth-aside" style="background-image:url('${photoUrl(photo)}')">
        <div class="glass auth-aside-inner">
          <span class="logo-tile"><img src="${LOGO.large}" alt="JK Lakshmipat University logo" /></span>
          <h2>${escapeHtml(SITE.tagline)}</h2>
          <ul class="auth-points">
            <li>${ICONS.check}Only verified students can buy, sell or message</li>
            <li>${ICONS.check}Your account is protected by a password</li>
            <li>${ICONS.check}Meet and hand over items on campus</li>
          </ul>
        </div>
      </aside>
      <div class="auth-main">
        <div class="auth-card">${formHtml}</div>
      </div>
    </div>`;
}

function stepIndicator(current, labels) {
  return `<ol class="steps">${labels
    .map(
      (label, i) =>
        `<li class="${i + 1 < current ? "done" : i + 1 === current ? "current" : ""}"><span>${i + 1 < current ? ICONS.check : i + 1}</span>${label}</li>`
    )
    .join("")}</ol>`;
}

function demoOtpHtml(code) {
  return code
    ? `<div class="notice">Demo mode — your verification code is <strong>${escapeHtml(String(code))}</strong></div>`
    : "";
}

/* ---------- Camera ---------- */

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
}

async function startCamera(videoEl) {
  stopCamera();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    videoEl.srcObject = cameraStream;
    videoEl.classList.add("visible");
    await videoEl.play();
    return true;
  } catch {
    showToast("Camera access was denied. You can upload a photo instead.");
    return false;
  }
}

/* ---------- Sign up ---------- */

const SIGNUP_STEPS = ["Details", "Student ID", "Verify email"];

function renderSignup(step = 1) {
  stopCamera();
  let content = "";

  if (step === 1) {
    content = `
      ${stepIndicator(1, SIGNUP_STEPS)}
      <h1>Create your account</h1>
      <p class="muted">Use the details on your college records.</p>
      <form id="signup-step1" class="form">
        <div class="field"><label for="name">Full name</label><input class="input" id="name" required autocomplete="name" placeholder="Rahul Sharma" value="${escapeHtml(signupDraft.name || "")}" /></div>
        <div class="field-row">
          <div class="field"><label for="rollNumber">Roll number</label><input class="input" id="rollNumber" required placeholder="22BCS1042" value="${escapeHtml(signupDraft.rollNumber || "")}" /></div>
          <div class="field"><label for="phone">Phone</label><input class="input" id="phone" type="tel" required pattern="[0-9]{10}" autocomplete="tel" placeholder="10-digit mobile" value="${escapeHtml(signupDraft.phone || "")}" /></div>
        </div>
        <div class="field"><label for="collegeEmail">College email</label><input class="input" id="collegeEmail" type="email" required autocomplete="email" placeholder="${SITE.emailPlaceholder}" value="${escapeHtml(signupDraft.collegeEmail || "")}" /><p class="hint">We'll send a verification code to this address.</p></div>
        ${passwordField("password", "Password", { autocomplete: "new-password", meter: true })}
        ${passwordField("password-confirm", "Confirm password", { autocomplete: "new-password" })}
        <button type="submit" class="btn btn-primary btn-block">Continue</button>
      </form>
      <p class="auth-switch">Already have an account? <a href="#/login">Log in</a></p>`;
  } else if (step === 2) {
    content = `
      ${stepIndicator(2, SIGNUP_STEPS)}
      <h1>Verify your student ID</h1>
      <p class="muted">Take or upload a clear photo of your college ID card. It's only used to confirm you're a student.</p>
      <div class="id-capture">
        <video id="id-video" class="id-video" playsinline autoplay muted></video>
        <canvas id="id-canvas" hidden></canvas>
        <div class="id-preview" id="id-preview">${signupDraft.idPreview ? `<img src="${signupDraft.idPreview}" alt="ID preview" />` : `${ICONS.camera}<span>No photo yet</span>`}</div>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-secondary" id="start-camera">${ICONS.camera}Use camera</button>
        <button type="button" class="btn btn-secondary" id="capture-photo" hidden>Capture</button>
        <label class="btn btn-secondary" for="id-upload">${ICONS.upload}Upload photo<input type="file" id="id-upload" accept="image/*" hidden /></label>
      </div>
      <div class="form-footer">
        <button type="button" class="btn btn-ghost" id="back-step1">Back</button>
        <button type="button" class="btn btn-primary" id="to-step3" ${signupDraft.idFile ? "" : "disabled"}>Continue</button>
      </div>`;
  } else {
    content = `
      ${stepIndicator(3, SIGNUP_STEPS)}
      <h1>Check your email</h1>
      <p class="muted">Enter the 6-digit code we sent to <strong>${escapeHtml(signupDraft.collegeEmail || "")}</strong>.</p>
      <div id="demo-otp-notice">${demoOtpHtml(signupDraft.demoOtp)}</div>
      <form id="signup-verify" class="form">
        <div class="field"><label for="otp">Verification code</label><input class="input otp-input" id="otp" required maxlength="6" pattern="[0-9]{6}" placeholder="000000" inputmode="numeric" autocomplete="one-time-code" /></div>
        <button type="submit" class="btn btn-primary btn-block">Verify and finish</button>
      </form>
      <p class="auth-switch">Didn't get it? <button type="button" class="link-btn" id="resend-otp">Resend code</button></p>`;
  }

  app.innerHTML = renderAuthShell(content, step - 1);
  bindPasswordFields();

  if (step === 1) {
    document.getElementById("signup-step1").addEventListener("submit", (e) => {
      e.preventDefault();
      const password = readNewPassword("password", "password-confirm");
      if (!password) return;
      signupDraft = {
        ...signupDraft,
        password,
        name: document.getElementById("name").value.trim(),
        rollNumber: document.getElementById("rollNumber").value.trim().toUpperCase(),
        phone: document.getElementById("phone").value.trim(),
        collegeEmail: document.getElementById("collegeEmail").value.trim().toLowerCase(),
        campus: SITE.campus,
      };
      renderSignup(2);
      animatePageIn();
    });
  }

  if (step === 2) {
    const preview = document.getElementById("id-preview");
    const video = document.getElementById("id-video");
    const canvas = document.getElementById("id-canvas");
    const toStep3 = document.getElementById("to-step3");
    const captureBtn = document.getElementById("capture-photo");

    const setPreview = (src) => {
      signupDraft.idPreview = src;
      preview.innerHTML = `<img src="${src}" alt="ID preview" />`;
      toStep3.disabled = false;
    };

    document.getElementById("start-camera").addEventListener("click", async () => {
      if (await startCamera(video)) captureBtn.hidden = false;
    });

    captureBtn.addEventListener("click", () => {
      if (!cameraStream) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          signupDraft.idFile = new File([blob], "id-card.jpg", { type: "image/jpeg" });
          setPreview(canvas.toDataURL("image/jpeg"));
          stopCamera();
          video.classList.remove("visible");
          captureBtn.hidden = true;
        },
        "image/jpeg",
        0.85
      );
    });

    document.getElementById("id-upload").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      signupDraft.idFile = file;
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result);
      reader.readAsDataURL(file);
    });

    document.getElementById("back-step1").addEventListener("click", () => {
      renderSignup(1);
      animatePageIn();
    });
    toStep3.addEventListener("click", async () => {
      if (!signupDraft.password) {
        showToast("Please set your password again.");
        return renderSignup(1);
      }
      toStep3.disabled = true;
      try {
        const formData = new FormData();
        formData.append("name", signupDraft.name);
        formData.append("rollNumber", signupDraft.rollNumber);
        formData.append("phone", signupDraft.phone);
        formData.append("collegeEmail", signupDraft.collegeEmail);
        formData.append("campus", signupDraft.campus);
        formData.append("idCard", signupDraft.idFile);
        formData.append("password", signupDraft.password || "");

        const data = await api.signup(formData);
        api.setToken(data.token);
        setUser(data.user);
        signupDraft.demoOtp = data.demoOtp;
        delete signupDraft.password; // don't keep it in memory longer than needed
        updateHeader();
        renderSignup(3);
        animatePageIn();
      } catch (err) {
        toStep3.disabled = false;
        showToast(err.message);
      }
    });
  }

  if (step === 3) {
    bindOtpForm("signup-verify", signupDraft.collegeEmail, "Your account is ready");
  }
}

function bindOtpForm(formId, email, successMessage) {
  document.getElementById(formId).addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await api.verifyEmail(email, document.getElementById("otp").value.trim());
      setUser(data.user);
      updateHeader();
      showToast(successMessage);
      navigate("#/");
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById("resend-otp").addEventListener("click", async () => {
    try {
      const data = await api.sendOtp(email);
      if (data.demoOtp) {
        signupDraft.demoOtp = data.demoOtp;
        document.getElementById("demo-otp-notice").innerHTML = demoOtpHtml(data.demoOtp);
      }
      showToast("A new code is on its way");
    } catch (err) {
      showToast(err.message);
    }
  });
}

/* ---------- Log in / verify ---------- */

function renderLogin() {
  app.innerHTML = renderAuthShell(`
    <h1>Log in</h1>
    <p class="muted">Welcome back. Use your college email and password.</p>
    <form id="login-form" class="form">
      <div class="field"><label for="login-email">College email</label><input class="input" id="login-email" type="email" required autocomplete="email" placeholder="${SITE.emailPlaceholder}" /></div>
      ${passwordField("login-password", "Password")}
      <a href="#/reset" class="forgot-link">Forgot password?</a>
      <button type="submit" class="btn btn-primary btn-block">Log in</button>
    </form>
    <p class="auth-switch">New here? <a href="#/signup">Create an account</a></p>`, 1);
  bindPasswordFields();

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submit = e.target.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      await login(
        document.getElementById("login-email").value.trim().toLowerCase(),
        document.getElementById("login-password").value
      );
      updateHeader();
      if (!isVerified()) {
        signupDraft.collegeEmail = getUser().collegeEmail;
        navigate("#/verify");
      } else {
        showToast(`Welcome back, ${firstName(getUser().name)}`);
        navigate("#/");
      }
    } catch (err) {
      submit.disabled = false;
      document.getElementById("login-password").value = "";
      showToast(err.message);
    }
  });
}

/* ---------- Forgot password ---------- */

function renderReset() {
  if (resetDraft.step === 1) {
    app.innerHTML = renderAuthShell(`
      <a href="#/login" class="back-link">${ICONS.back}Back to log in</a>
      <h1>Reset your password</h1>
      <p class="muted">Enter your college email and we'll send you a 6-digit code.</p>
      <form id="reset-request" class="form">
        <div class="field"><label for="reset-email">College email</label><input class="input" id="reset-email" type="email" required autocomplete="email" placeholder="${SITE.emailPlaceholder}" value="${escapeHtml(resetDraft.email || "")}" /></div>
        <button type="submit" class="btn btn-primary btn-block">Send code</button>
      </form>`, 2);

    document.getElementById("reset-request").addEventListener("submit", async (e) => {
      e.preventDefault();
      const submit = e.target.querySelector("button[type=submit]");
      submit.disabled = true;
      const email = document.getElementById("reset-email").value.trim().toLowerCase();
      try {
        const data = await api.sendOtp(email);
        resetDraft = { step: 2, email, demoOtp: data.demoOtp };
        renderReset();
        animatePageIn();
      } catch (err) {
        submit.disabled = false;
        showToast(err.message);
      }
    });
    return;
  }

  app.innerHTML = renderAuthShell(`
    <button type="button" class="back-link link-plain" id="reset-back">${ICONS.back}Use a different email</button>
    <h1>Choose a new password</h1>
    <p class="muted">Enter the code sent to <strong>${escapeHtml(resetDraft.email)}</strong> and pick a new password.</p>
    <div id="demo-otp-notice">${demoOtpHtml(resetDraft.demoOtp)}</div>
    <form id="reset-form" class="form">
      <div class="field"><label for="otp">Verification code</label><input class="input otp-input" id="otp" required maxlength="6" pattern="[0-9]{6}" placeholder="000000" inputmode="numeric" autocomplete="one-time-code" /></div>
      ${passwordField("new-password", "New password", { autocomplete: "new-password", meter: true })}
      ${passwordField("new-password-confirm", "Confirm new password", { autocomplete: "new-password" })}
      <button type="submit" class="btn btn-primary btn-block">Update password</button>
    </form>`, 2);
  bindPasswordFields();

  document.getElementById("reset-back").addEventListener("click", () => {
    resetDraft = { step: 1, email: resetDraft.email };
    renderReset();
    animatePageIn();
  });

  document.getElementById("reset-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = readNewPassword("new-password", "new-password-confirm");
    if (!password) return;
    const submit = e.target.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      await api.resetPassword(resetDraft.email, document.getElementById("otp").value.trim(), password);
      resetDraft = { step: 1 };
      showToast("Password updated. Log in with your new password.");
      navigate("#/login");
    } catch (err) {
      submit.disabled = false;
      showToast(err.message);
    }
  });
}

function renderVerify() {
  const user = getUser();
  if (!user) return navigate("#/login");
  if (isVerified()) return navigate("#/");

  app.innerHTML = renderAuthShell(`
    <h1>Verify your email</h1>
    <p class="muted">Enter the 6-digit code sent to <strong>${escapeHtml(user.collegeEmail)}</strong>.</p>
    <div id="demo-otp-notice"></div>
    <form id="verify-form" class="form">
      <div class="field"><label for="otp">Verification code</label><input class="input otp-input" id="otp" required maxlength="6" placeholder="000000" inputmode="numeric" autocomplete="one-time-code" /></div>
      <button type="submit" class="btn btn-primary btn-block">Verify email</button>
    </form>
    <p class="auth-switch">Didn't get it? <button type="button" class="link-btn" id="resend-otp">Resend code</button></p>`, 2);

  bindOtpForm("verify-form", user.collegeEmail, "Email verified");
}

/* ---------- Listing detail ---------- */

async function renderDetail(id) {
  let listing;
  try {
    listing = (await api.getListing(id)).listing;
  } catch {
    listing = listingsCache.find((l) => l.id === id);
  }

  if (!listing) {
    app.innerHTML = `<div class="container page"><div class="empty"><h3>This listing isn't available</h3><p>It may have been sold or removed.</p><a href="#/" class="btn btn-primary">Back to browse</a></div></div>`;
    return;
  }

  const user = getUser();
  const isOwner = user && listing.sellerId === user.id;
  const isSold = listing.status === "sold";
  const suffix = listing.category === "services" ? "<small>/hr</small>" : "";

  let actions;
  if (isSold && isOwner) {
    actions = `<p class="muted">This item is marked as sold.</p>
               <button class="btn btn-danger-ghost btn-block" id="remove-sold-btn">Remove listing</button>`;
  } else if (isSold) {
    actions = `<p class="muted">This item has been sold.</p>`;
  } else if (isOwner) {
    actions = `<p class="muted">This is your listing.</p>
               <button class="btn btn-secondary btn-block" id="mark-sold-btn">Mark as sold</button>
               <button class="btn btn-danger-ghost btn-block" id="delete-listing-btn">Delete listing</button>`;
  } else if (user && isVerified()) {
    actions = `<a href="#/checkout/${listing.id}" class="btn btn-primary btn-block btn-lg">Buy now</a>
               <button class="btn btn-secondary btn-block" id="message-btn">${ICONS.chat}Message seller</button>`;
  } else {
    actions = `<a href="#/login" class="btn btn-primary btn-block btn-lg">Log in to buy</a>
               <p class="hint center">Only verified students can contact sellers.</p>`;
  }

  app.innerHTML = `
    <div class="container page">
      <a href="#/" class="back-link">${ICONS.back}All listings</a>
      <div class="detail">
        <div class="detail-media">${listingThumb(listing, "thumb-lg")}</div>
        <div class="detail-info">
          <div class="tags">
            <span class="badge">${escapeHtml(getCategoryLabel(listing.category))}</span>
            <span class="badge">${escapeHtml(listing.condition)}</span>
            ${isSold ? `<span class="badge badge-dark">Sold</span>` : ""}
          </div>
          <h1>${escapeHtml(listing.title)}</h1>
          <div class="detail-price">${formatPrice(listing.price)}${suffix}</div>
          <p class="detail-posted">Listed ${timeAgo(listing.createdAt)}</p>

          <div class="panel actions-panel">${actions}</div>

          <h2 class="subheading">Description</h2>
          <p class="detail-desc">${escapeHtml(listing.description)}</p>

          <h2 class="subheading">Seller</h2>
          <div class="seller">
            <span class="avatar">${initials(listing.sellerName)}</span>
            <div>
              <div class="seller-name">${escapeHtml(listing.sellerName)}
                ${listing.sellerRollNumber ? `<span class="verified">${ICONS.shield}Verified student</span>` : ""}
              </div>
              ${user && isVerified() && listing.sellerPhone ? `<div class="muted">${escapeHtml(listing.sellerPhone)}</div>` : ""}
            </div>
          </div>
          ${!isOwner && !isSold ? `<button class="link-btn share-btn" id="share-btn">${ICONS.share}Copy link</button>` : ""}
        </div>
      </div>
    </div>`;

  document.getElementById("message-btn")?.addEventListener("click", async () => {
    try {
      const data = await api.startConversation(listing.id);
      navigate(`#/messages/${data.conversationId}`);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById("share-btn")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      showToast("Link copied");
    } catch {
      showToast("Could not copy the link");
    }
  });

  document.getElementById("mark-sold-btn")?.addEventListener("click", async () => {
    if (!confirm("Mark this item as sold? It will be hidden from browse.")) return;
    try {
      await api.markListingSold(listing.id);
      await fetchListings();
      showToast("Marked as sold");
      renderDetail(id);
    } catch (err) {
      showToast(err.message);
    }
  });

  const removeHandler = async (question, message) => {
    if (!confirm(question)) return;
    try {
      await api.deleteListing(listing.id);
      await fetchListings();
      showToast(message);
      navigate("#/profile");
    } catch (err) {
      showToast(err.message);
    }
  };
  document.getElementById("remove-sold-btn")?.addEventListener("click", () =>
    removeHandler("Remove this listing permanently?", "Listing removed")
  );
  document.getElementById("delete-listing-btn")?.addEventListener("click", () =>
    removeHandler("Delete this listing?", "Listing deleted")
  );
}

/* ---------- Sell ---------- */

function renderSell() {
  if (!requireAuth((reason) => navigate(reason === "verify" ? "#/verify" : "#/login"))) return;

  const categoryOptions = CATEGORIES.filter((c) => c.id !== "all")
    .map((c) => `<option value="${c.id}">${c.label}</option>`)
    .join("");
  const conditionOptions = CONDITIONS.map((c) => `<option value="${c}">${c}</option>`).join("");

  app.innerHTML = `
    <div class="container page page-narrow">
      ${pageHeader("Sell an item", "Listings are free and visible to verified students only.")}
      <form class="panel form" id="sell-form">
        <div class="field"><label for="title">Title</label><input class="input" id="title" required maxlength="100" placeholder="e.g. Engineering Mathematics by B.S. Grewal" /></div>
        <div class="field-row">
          <div class="field"><label for="price">Price (₹)</label><input class="input" id="price" type="number" required min="0" step="1" placeholder="0" /></div>
          <div class="field"><label for="category">Category</label><select class="select" id="category" required>${categoryOptions}</select></div>
          <div class="field"><label for="condition">Condition</label><select class="select" id="condition" required>${conditionOptions}</select></div>
        </div>
        <div class="field"><label for="description">Description</label><textarea class="input" id="description" required maxlength="500" rows="5" placeholder="Condition details, what's included, where to pick it up…"></textarea></div>
        <div class="field">
          <label>Photo <span class="optional">optional</span></label>
          <label class="dropzone" for="image" id="dropzone">
            ${ICONS.upload}
            <span><strong>Click to upload</strong> a photo</span>
            <span class="hint">A plain background works best.</span>
            <input id="image" type="file" accept="image/*" hidden />
          </label>
          <div class="upload-preview" id="image-preview" hidden></div>
        </div>
        <div class="form-footer">
          <a href="#/" class="btn btn-ghost">Cancel</a>
          <button type="submit" class="btn btn-primary">Publish listing</button>
        </div>
      </form>
    </div>`;

  let imageData = null;
  const preview = document.getElementById("image-preview");
  const dropzone = document.getElementById("dropzone");

  document.getElementById("image").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      imageData = await processListingImage(file);
      preview.hidden = false;
      dropzone.hidden = true;
      preview.innerHTML = `<img src="${imageData}" alt="Preview" /><button type="button" class="btn btn-secondary btn-sm" id="remove-image">Remove photo</button>`;
      document.getElementById("remove-image").addEventListener("click", () => {
        imageData = null;
        preview.hidden = true;
        preview.innerHTML = "";
        dropzone.hidden = false;
        e.target.value = "";
      });
    } catch (err) {
      showToast(err.message || "Could not process that image");
    }
  });

  document.getElementById("sell-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submit = e.target.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      const category = document.getElementById("category").value;
      const data = await api.createListing({
        title: document.getElementById("title").value.trim(),
        description: document.getElementById("description").value.trim(),
        price: parseFloat(document.getElementById("price").value),
        category,
        condition: document.getElementById("condition").value,
        campus: SITE.campus,
        emoji: CATEGORIES.find((c) => c.id === category)?.emoji,
        image: imageData,
      });
      await fetchListings();
      showToast("Your listing is live");
      navigate(`#/item/${data.listing.id}`);
    } catch (err) {
      submit.disabled = false;
      showToast(err.message);
    }
  });
}

/* ---------- Profile ---------- */

function renderProfile() {
  if (!requireAuth((reason) => navigate(reason === "verify" ? "#/verify" : "#/login"))) return;

  const user = getUser();
  const active = myListingsCache.filter((l) => l.status !== "sold");
  const sold = myListingsCache.filter((l) => l.status === "sold");

  const activeGrid = active.length
    ? `<div class="grid">${active.map((l) => renderListingCard(l, { showActions: true })).join("")}</div>`
    : `<div class="empty compact"><p>You have no active listings.</p><a href="#/sell" class="btn btn-primary btn-sm">Sell an item</a></div>`;

  app.innerHTML = `
    <div class="container page">
      <div class="profile">
        <aside class="panel profile-card">
          <span class="avatar avatar-lg">${initials(user.name)}</span>
          <h1>${escapeHtml(user.name)}</h1>
          <dl class="profile-details">
            <div><dt>Email</dt><dd>${escapeHtml(user.collegeEmail)}</dd></div>
            <div><dt>Roll number</dt><dd>${escapeHtml(user.rollNumber)}</dd></div>
            <div><dt>Phone</dt><dd>${escapeHtml(user.phone)}</dd></div>
          </dl>
          <div class="tags">
            ${user.emailVerified ? `<span class="badge badge-success">${ICONS.check}Email verified</span>` : ""}
            ${user.idVerified ? `<span class="badge badge-success">${ICONS.check}ID verified</span>` : ""}
          </div>
          <div class="profile-stats">
            <div><strong>${active.length}</strong><span>Active</span></div>
            <div><strong>${sold.length}</strong><span>Sold</span></div>
          </div>
        </aside>
        <section>
          ${pageHeader("My listings", "", `<a href="#/sell" class="btn btn-primary btn-sm">${ICONS.plus}New listing</a>`)}
          <h2 class="subheading">Active</h2>
          ${activeGrid}
          ${sold.length ? `
            <h2 class="subheading">Sold</h2>
            <p class="hint">Sold items are hidden from browse. Remove them when you no longer need them.</p>
            <div class="grid">${sold.map((l) => renderListingCard(l, { showActions: true })).join("")}</div>` : ""}
        </section>
      </div>
    </div>`;

  bindListingActions();
  revealCards(app);
}

function bindListingActions() {
  const handlers = {
    delete: { confirm: "Delete this listing?", run: (id) => api.deleteListing(id), done: "Listing deleted" },
    "mark-sold": { confirm: "Mark this item as sold? It will be hidden from browse.", run: (id) => api.markListingSold(id), done: "Marked as sold" },
    remove: { confirm: "Remove this listing permanently?", run: (id) => api.deleteListing(id), done: "Listing removed" },
  };
  document.querySelectorAll("[data-action]").forEach((btn) => {
    const h = handlers[btn.dataset.action];
    if (!h) return;
    btn.addEventListener("click", async () => {
      if (!confirm(h.confirm)) return;
      try {
        await h.run(btn.dataset.id);
        await Promise.all([fetchListings(), fetchMyListings()]);
        showToast(h.done);
        renderProfile();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

/* ---------- Messages ---------- */

async function renderMessages(conversationId) {
  if (!requireAuth((reason) => navigate(reason === "verify" ? "#/verify" : "#/login"))) return;

  let conversations = [];
  try {
    conversations = (await api.getConversations()).conversations || [];
  } catch (err) {
    showToast(err.message);
  }

  const activeId = conversationId ? parseInt(conversationId, 10) : null;
  const activeConv = conversations.find((c) => c.id === activeId);
  let messagesHtml = "";

  if (activeConv) {
    try {
      const data = await api.getMessages(conversationId);
      messagesHtml = (data.messages || [])
        .map(
          (m) =>
            `<div class="bubble ${m.isMine ? "mine" : "theirs"}"><p>${escapeHtml(m.body)}</p><time>${timeAgo(m.createdAt)}</time></div>`
        )
        .join("");
    } catch (err) {
      messagesHtml = `<p class="muted center">${escapeHtml(err.message)}</p>`;
    }
  }

  const convList = conversations.length
    ? conversations
        .map(
          (c) => `
          <a href="#/messages/${c.id}" class="conv ${c.id === activeId ? "active" : ""}">
            <span class="avatar avatar-sm">${initials(c.otherName)}</span>
            <div class="conv-text">
              <div class="conv-top"><strong>${escapeHtml(c.otherName)}</strong></div>
              <span class="conv-listing">${escapeHtml(c.listingTitle)}</span>
              <p>${escapeHtml(c.lastMessage || "")}</p>
            </div>
          </a>`
        )
        .join("")
    : `<div class="empty compact"><p>No conversations yet.</p><p class="hint">Open a listing and choose “Message seller” to start one.</p></div>`;

  app.innerHTML = `
    <div class="container page">
      ${pageHeader("Messages")}
      <div class="messages ${activeConv ? "has-active" : ""}">
        <aside class="conv-list">${convList}</aside>
        <section class="chat">
          ${activeConv ? `
            <header class="chat-header">
              <a href="#/messages" class="chat-back" aria-label="Back to conversations">${ICONS.back}</a>
              <div>
                <strong>${escapeHtml(activeConv.otherName)}</strong>
                <a href="#/item/${activeConv.listingId}" class="muted">${escapeHtml(activeConv.listingTitle)} · ${formatPrice(activeConv.listingPrice)}</a>
              </div>
            </header>
            <div class="chat-body" id="chat-messages">${messagesHtml || '<p class="muted center">Say hello to start the conversation.</p>'}</div>
            <form class="chat-input" id="chat-form">
              <input class="input" id="chat-body" placeholder="Write a message…" required autocomplete="off" />
              <button type="submit" class="btn btn-primary">Send</button>
            </form>` : `
            <div class="chat-empty">${ICONS.chat}<p>Select a conversation</p></div>`}
        </section>
      </div>
    </div>`;

  const chatMessages = document.getElementById("chat-messages");
  if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;

  document.getElementById("chat-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-body");
    const body = input.value.trim();
    if (!body) return;
    try {
      await api.sendMessage(conversationId, body);
      await renderMessages(conversationId);
      document.getElementById("chat-body")?.focus();
    } catch (err) {
      showToast(err.message);
    }
  });
}

/* ---------- Checkout ---------- */

async function renderCheckout(listingId) {
  if (!requireAuth((reason) => navigate(reason === "verify" ? "#/verify" : "#/login"))) return;

  let listing;
  try {
    listing = (await api.getListing(listingId)).listing;
  } catch {
    showToast("Listing not found");
    navigate("#/");
    return;
  }

  app.innerHTML = `
    <div class="container page page-narrow">
      <a href="#/item/${listing.id}" class="back-link">${ICONS.back}Back to listing</a>
      ${pageHeader("Checkout")}
      <div class="checkout">
        <form class="panel form" id="payment-form">
          <h2 class="subheading">Payment details</h2>
          <div class="notice">Demo checkout — no real payment is taken.</div>
          <div class="field"><label for="cc-number">Card number</label><input class="input" id="cc-number" required placeholder="4242 4242 4242 4242" maxlength="19" inputmode="numeric" autocomplete="cc-number" /></div>
          <div class="field-row">
            <div class="field"><label for="cc-exp">Expiry</label><input class="input" id="cc-exp" required placeholder="MM/YY" maxlength="5" autocomplete="cc-exp" /></div>
            <div class="field"><label for="cc-cvc">CVV</label><input class="input" id="cc-cvc" required placeholder="123" maxlength="3" type="password" inputmode="numeric" autocomplete="cc-csc" /></div>
          </div>
          <div class="field"><label for="cc-name">Name on card</label><input class="input" id="cc-name" required autocomplete="cc-name" /></div>
          <button type="submit" class="btn btn-primary btn-block btn-lg">${ICONS.lock}Pay ${formatPrice(listing.price)}</button>
        </form>
        <aside class="panel summary">
          <h2 class="subheading">Order summary</h2>
          <div class="summary-item">
            ${listingThumb(listing, "thumb-sm")}
            <div><strong>${escapeHtml(listing.title)}</strong><span class="muted">${escapeHtml(listing.sellerName)}</span></div>
          </div>
          <div class="summary-row"><span>Item</span><span>${formatPrice(listing.price)}</span></div>
          <div class="summary-row"><span>Service fee</span><span>₹0</span></div>
          <div class="summary-row total"><span>Total</span><span>${formatPrice(listing.price)}</span></div>
          <p class="hint">After paying, message the seller to arrange a pickup on campus.</p>
        </aside>
      </div>
    </div>`;

  document.getElementById("payment-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submit = e.target.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      await api.createPayment(listingId);
      await fetchListings();
      showToast("Payment complete. Message the seller to arrange pickup.");
      navigate("#/messages");
    } catch (err) {
      submit.disabled = false;
      showToast(err.message);
    }
  });
}

/* ---------- Router ---------- */

async function render() {
  stopCamera();
  stopHero();
  const { path } = parseRoute();
  const user = getUser();
  setActiveNav(path);

  // Logged-in users never see the login / sign-up / reset screens again.
  if (user && (path === "/login" || path === "/signup" || path === "/reset")) {
    navigate(isVerified() ? "#/" : "#/verify");
    return;
  }

  await route(path);
  window.scrollTo({ top: 0, behavior: "instant" });
  animatePageIn();
}

async function route(path) {
  if (path.startsWith("/item/")) return renderDetail(path.slice("/item/".length));
  if (path.startsWith("/messages")) return renderMessages(path.split("/messages/")[1] || null);
  if (path.startsWith("/checkout/")) return renderCheckout(path.slice("/checkout/".length));

  switch (path) {
    case "/signup":
      return renderSignup(1);
    case "/login":
      return renderLogin();
    case "/reset":
      resetDraft = { step: 1 };
      return renderReset();
    case "/verify":
      return renderVerify();
    case "/sell":
      return renderSell();
    case "/profile":
      await fetchMyListings();
      return renderProfile();
    default:
      await fetchListings();
      return renderHome();
  }
}

menuToggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(open));
});
nav?.addEventListener("click", () => nav.classList.remove("open"));
window.addEventListener("hashchange", render);

async function init() {
  initSplash();
  await loadSession();
  updateHeader();
  render();
}

init();
