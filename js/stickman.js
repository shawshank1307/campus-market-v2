// A little stick figure that strolls along the bottom of the screen.
// Hover: he waves. Click: he jumps and says something. Double-click: he goes home.

const MESSAGES = [
  "Hi there! 👋",
  "Got old books? Sell them here!",
  "Try searching for “laptop”",
  "Meet on campus, stay safe!",
  "Tap “Sell an item” to list your stuff",
  "Try the moon button for dark mode 🌙",
  "Hostel cleanup? List it all!",
  "Double-click me to send me home",
];

const SVG = `
<svg viewBox="0 0 40 72" aria-hidden="true">
  <g class="sm-body">
    <rect class="sm-pack" x="11" y="21" width="7" height="14" rx="2.5" />
    <g class="sm-limb sm-arm-back"><line x1="20" y1="24" x2="20" y2="39" /></g>
    <g class="sm-limb sm-leg-back"><line x1="20" y1="42" x2="20" y2="66" /></g>
    <line x1="20" y1="17" x2="20" y2="42" />
    <g class="sm-limb sm-leg-front"><line x1="20" y1="42" x2="20" y2="66" /></g>
    <g class="sm-limb sm-arm-front"><line x1="20" y1="24" x2="20" y2="39" /></g>
    <circle class="sm-head" cx="20" cy="10" r="7" />
    <circle class="sm-eye" cx="23.2" cy="9" r="1" />
    <path class="sm-scarf" d="M14.5 17.5 Q20 21 25.5 17.5 L25 20 Q20 23 15 20 Z" />
  </g>
</svg>`;

export function initStickman() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    if (localStorage.getItem("cm_stickman_hidden")) return;
  } catch {
    /* storage unavailable */
  }

  const el = document.createElement("div");
  el.className = "stickman";
  el.title = "Hi! Click me";
  el.innerHTML = `<div class="sm-bubble" role="status"></div><div class="sm-figure">${SVG}</div>`;
  document.body.appendChild(el);

  const figure = el.querySelector(".sm-figure");
  const bubble = el.querySelector(".sm-bubble");

  let x = Math.random() * (window.innerWidth - 80);
  let dir = Math.random() < 0.5 ? -1 : 1;
  let state = "walk";
  let stateUntil = performance.now() + 4000 + Math.random() * 4000;
  let last = performance.now();
  let bubbleTimer = 0;
  let msgIndex = 0;
  const SPEED = 46; // px per second

  const setState = (next, ms) => {
    state = next;
    stateUntil = performance.now() + ms;
    el.dataset.state = next;
  };

  const say = (text) => {
    bubble.textContent = text;
    bubble.classList.add("show");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove("show"), 2600);
  };

  setState("walk", 5000);

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const maxX = window.innerWidth - 56;

    if (state === "walk") {
      x += dir * SPEED * dt;
      if (x <= 8) {
        x = 8;
        dir = 1;
      } else if (x >= maxX) {
        x = maxX;
        dir = -1;
      }
      if (now > stateUntil) {
        // Pause to look around, sometimes wave.
        Math.random() < 0.35 ? setState("wave", 1600) : setState("idle", 1500 + Math.random() * 2000);
      }
    } else if (now > stateUntil) {
      if (state === "idle" && Math.random() < 0.3) dir *= -1;
      setState("walk", 5000 + Math.random() * 6000);
    }

    el.style.transform = `translateX(${x}px)`;
    figure.style.transform = `scaleX(${dir})`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  el.addEventListener("mouseenter", () => {
    if (state === "walk" || state === "idle") setState("wave", 1400);
  });

  el.addEventListener("click", () => {
    setState("jump", 650);
    say(MESSAGES[msgIndex++ % MESSAGES.length]);
  });

  el.addEventListener("dblclick", () => {
    say("Bye! 👋");
    try {
      localStorage.setItem("cm_stickman_hidden", "1");
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 600);
    }, 900);
  });
}
