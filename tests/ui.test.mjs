// Browser test: drives the real site through every feature and saves screenshots.
//   npm install            (installs playwright-core)
//   python3 -m http.server 5500     (in the repo root, in another terminal)
//   BROWSER="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:ui
// Screenshots go to tests/output/.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const dir = root + "tests/output";
mkdirSync(dir + "/shots", { recursive: true });
const photo = (n) => root + "assets/jklu/" + ["campus-1-md.jpg", "campus-3-md.jpg"][n];
const browser = await chromium.launch({
  executablePath: process.env.BROWSER || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_CONNECTION_REFUSED|8787/.test(m.text()) && errors.push("console: " + m.text()));
const shot = (n, full = false) => page.screenshot({ path: `${dir}/shots/${n}.png`, fullPage: full });
const step = async (name, fn) => { try { await fn(); console.log("ok   -", name); } catch (e) { console.log("FAIL -", name, "→", e.message.split("\n")[0]); errors.push(name); } };
const BASE = process.env.BASE_URL || "http://127.0.0.1:5500/";

await step("splash bloom plays", async () => {
  await page.goto(BASE);
  await page.waitForTimeout(1300);
  await shot("01-splash");
  await page.waitForSelector("#splash", { state: "detached", timeout: 6000 });
});
await step("home (logged out)", async () => { await page.waitForSelector(".card"); await page.waitForTimeout(900); await shot("02-home", true); });
await step("signup step 1", async () => {
  await page.goto(BASE + "#/signup");
  await page.fill("#name", "Riya Sharma"); await page.fill("#rollNumber", "22BCS1042"); await page.fill("#phone", "9876543210");
  await page.fill("#collegeEmail", "riya@college.edu.in"); await page.fill("#password", "Secret123!"); await page.fill("#password-confirm", "Secret123!");
  await shot("03-signup");
  await page.click("#signup-step1 button[type=submit]");
});
await step("signup step 2 (ID upload)", async () => {
  if (await page.locator("#capture-photo").isVisible()) throw new Error("Capture button visible before camera is on");
  await page.setInputFiles("#id-upload", photo(0));
  await page.waitForSelector("#to-step3:not([disabled])");
  await page.click("#to-step3");
});
await step("signup step 3 (verify code)", async () => {
  const code = await page.textContent("#demo-otp-notice strong", { timeout: 5000 });
  await page.fill("#otp", code.trim());
  await page.click("#signup-verify button[type=submit]");
  await page.waitForSelector(".account-btn", { timeout: 5000 });
});
await step("header shows account, no login button", async () => {
  if (await page.locator("a[href='#/login']").count()) throw new Error("login button still visible");
  await page.waitForTimeout(800); await shot("04-home-loggedin");
});
await step("save a listing (heart)", async () => {
  await page.locator(".save-btn").first().click();
  await page.waitForSelector(".save-btn.on");
});
await step("sell with 2 photos, course code, meetup, negotiable", async () => {
  await page.goto(BASE + "#/sell");
  await page.fill("#title", "Data Structures by Cormen"); await page.fill("#price", "450");
  await page.selectOption("#category", "textbooks"); await page.fill("#course", "cs201");
  await page.selectOption("#meetup", "Library"); await page.check("#negotiable", { force: true });
  await page.fill("#description", "Barely used, no markings.");
  await page.setInputFiles("#images", [photo(0), photo(1)]);
  await page.waitForSelector(".photo-slot:nth-child(2)");
  await page.waitForTimeout(700); await shot("05-sell", true);
  await page.click("#sell-form button[type=submit]");
  await page.waitForSelector(".gallery-thumbs", { timeout: 5000 });
  await page.waitForTimeout(600); await shot("06-detail-own", true);
});
await step("malicious listing title can't run scripts (XSS)", async () => {
  await page.goto(BASE + "#/sell");
  await page.fill("#title", `x" onload="window.__xss=1" a="<img src=z onerror=window.__xss=2>`);
  await page.fill("#price", "1"); await page.fill("#description", "<script>window.__xss=3</script>");
  await page.setInputFiles("#images", [photo(0)]);
  await page.waitForSelector(".photo-slot");
  await page.click("#sell-form button[type=submit]");
  await page.waitForSelector(".gallery-main img");
  await page.goto(BASE + "#/"); await page.waitForSelector(".card"); await page.waitForTimeout(500);
  const xss = await page.evaluate(() => window.__xss);
  if (xss) throw new Error("script ran: " + xss);
});
await step("moving-out bulk sale", async () => {
  await page.goto(BASE + "#/sell/bulk");
  const rows = page.locator(".bulk-row");
  for (const [i, [t, p]] of [["Electric kettle", "300"], ["Study lamp", "200"], ["Mattress", "900"]].entries()) {
    await rows.nth(i).locator("[name=title]").fill(t); await rows.nth(i).locator("[name=price]").fill(p);
  }
  await page.waitForTimeout(700); await shot("07-bulk", true);
  await page.click("#bulk-form button[type=submit]");
  await page.waitForURL(/#\/profile/);
});
await step("wanted: post a request", async () => {
  await page.goto(BASE + "#/wanted");
  await page.waitForSelector(".wanted-card");
  await page.click(".wanted-form-panel summary").catch(() => {});
  await page.fill("#w-title", "Need a cycle for one semester"); await page.fill("#w-budget", "1500");
  await page.click("#wanted-form button[type=submit]");
  await page.waitForSelector("text=Need a cycle for one semester");
  const visibleBefore = await page.locator(".wanted-contact:visible").count();
  if (visibleBefore !== 0) throw new Error(`${visibleBefore} contact boxes visible before clicking Contact`);
  await page.locator("[data-contact]").first().click();
  const visibleAfter = await page.locator(".wanted-contact:visible").count();
  if (visibleAfter !== 1) throw new Error(`expected 1 contact box after click, got ${visibleAfter}`);
  await page.waitForTimeout(500); await shot("08-wanted", true);
});
await step("message seller → unread/rating flow", async () => {
  await page.goto(BASE + "#/item/1");
  await page.click("#message-btn");
  await page.waitForSelector("#chat-body");
  await page.fill("#chat-body", "Hi! Is this still available?");
  await page.click("#chat-form button[type=submit]");
  await page.waitForSelector(".bubble.mine");
  await shot("09-messages");
});
await step("rate seller after chatting", async () => {
  await page.goto(BASE + "#/item/1");
  await page.waitForSelector("#rate-panel");
  await page.click("[data-star='5']");
  await page.fill("#rate-comment", "Quick and friendly!");
  await page.click("#rate-submit");
  await page.waitForSelector(".rate-thanks");
  await page.waitForTimeout(400); await shot("10-rated", true);
});
await step("report dialog", async () => {
  await page.click("#report-btn");
  await page.waitForSelector("#report-dialog[open]");
  await page.waitForTimeout(400); await shot("11-report");
  await page.click("#report-form button[type=submit]");
});
await step("saved items page", async () => {
  await page.goto(BASE + "#/saved");
  await page.waitForSelector(".card");
  await page.waitForTimeout(800); await shot("12-saved");
});
await step("profile with listings + reviews", async () => {
  await page.goto(BASE + "#/profile");
  await page.waitForSelector(".profile-card");
  await page.waitForTimeout(900); await shot("13-profile", true);
});
await step("moving-out filter chip", async () => {
  await page.goto(BASE + "#/");
  await page.click("[data-category='moving-out']");
  await page.waitForTimeout(900);
  const n = await page.locator("#listing-results .card").count();
  if (n < 3) throw new Error("expected moving-out items, got " + n);
});
await step("search by course code", async () => {
  await page.fill("#search-input", "cs 201");
  await page.click("[data-category='all']");
  await page.waitForTimeout(700);
  const titles = await page.locator(".card-title").allTextContents();
  if (!titles.some((t) => /Cormen/.test(t))) throw new Error("course search missed: " + titles.join(", "));
  await page.fill("#search-input", "");
});
await step("dark mode ink transition", async () => {
  const btn = page.locator("[data-theme-toggle]");
  await btn.click();
  await page.waitForTimeout(350); await shot("14-ink-mid");
  await page.waitForTimeout(1200);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (theme !== "dark") throw new Error("theme is " + theme);
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(500); await shot("15-dark-home", true);
  await page.goto(BASE + "#/item/1"); await page.waitForTimeout(900); await shot("16-dark-detail");
  await btn.click(); await page.waitForTimeout(1500);
});
await step("mobile layout", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "#/"); await page.waitForTimeout(1200); await shot("17-mobile-home");
  await page.goto(BASE + "#/sell/bulk"); await page.waitForTimeout(800); await shot("18-mobile-bulk", true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (overflow) throw new Error("horizontal overflow on mobile");
});
console.log("\nErrors:", errors.length ? errors : "none");
await browser.close();
process.exit(errors.length ? 1 : 0);
