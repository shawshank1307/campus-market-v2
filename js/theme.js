// Light/dark theme with an "ink bleed" transition: the new theme spreads from the click
// point as an organic ink blot. Concept inspired by Codemure's Ink Bleed (MIT):
// https://github.com/codemure-official/ink-bleed-theme-changer
// This version uses the browser's View Transitions API instead of WebGL snapshots.

const KEY = "cm_theme";
const root = document.documentElement;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const DURATION = 1100;

export function currentTheme() {
  return root.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable */
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0b0f17" : "#ea580c");
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(theme === "dark"));
    btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  });
}

function farthestCorner(x, y) {
  const w = root.clientWidth;
  const h = root.clientHeight;
  return Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y));
}

/** Plain colour cross-fade (no View Transitions support, or reduced motion). */
function crossFade(theme) {
  root.classList.add("theme-fade");
  applyTheme(theme);
  setTimeout(() => root.classList.remove("theme-fade"), 500);
}

let busy = false;

export function toggleTheme(origin) {
  const to = currentTheme() === "dark" ? "light" : "dark";
  if (busy) return;

  if (!document.startViewTransition || reduceMotion.matches) {
    crossFade(to);
    return;
  }

  const x = origin?.x ?? window.innerWidth - 40;
  const y = origin?.y ?? 32;
  const size = farthestCorner(x, y) / 0.22; // blot core is ~22% of its box

  busy = true;
  root.classList.add("ink-transition");
  const transition = document.startViewTransition(() => applyTheme(to));

  transition.ready
    .then(() => {
      const keyframes = {
        maskSize: ["0px 0px", `${size}px ${size}px`],
        webkitMaskSize: ["0px 0px", `${size}px ${size}px`],
        maskPosition: [`${x}px ${y}px`, `${x - size / 2}px ${y - size / 2}px`],
        webkitMaskPosition: [`${x}px ${y}px`, `${x - size / 2}px ${y - size / 2}px`],
      };
      root.animate(keyframes, {
        duration: DURATION,
        easing: "cubic-bezier(0.33, 1, 0.68, 1)",
        pseudoElement: "::view-transition-new(root)",
      });
    })
    .catch(() => {});

  transition.finished.finally(() => {
    root.classList.remove("ink-transition");
    busy = false;
  });
}
