// Visuele effecten: vonken, zwevende labels, oplopende cijfers en trillen.
// Alles is puur decoratie; bij "verminder beweging" gebeurt er niets.

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
export const motionOk = () => !reduced.matches;

const TONES = {
  punt: ['#ff4d61', '#ff8f7a', '#ffd0c8'],
  pro: ['#2ff0a1', '#8dffd0', '#eafff6'],
};

let canvas = null;
let ctx = null;
let parts = [];
let frame = 0;
let last = 0;

function setup() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'fx';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  ctx = canvas.getContext('2d');
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function tick(now) {
  const dt = Math.min((now - last) / 16.67, 3);
  last = now;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  parts = parts.filter((p) => p.age < p.life);
  for (const p of parts) {
    p.age += 16.67 * dt;
    p.vx *= 0.985 ** dt;
    p.vy = p.vy * 0.985 ** dt + p.gravity * dt;
    const x0 = p.x;
    const y0 = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const t = Math.max(1 - p.age / p.life, 0);
    ctx.globalAlpha = t * t;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.size * (0.4 + 0.6 * t);
    ctx.beginPath();
    ctx.moveTo(x0 - p.vx * 1.6, y0 - p.vy * 1.6);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (parts.length) frame = requestAnimationFrame(tick);
  else {
    frame = 0;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

// Vonken vanaf (x, y). dir 'up' spat omhoog uiteen, 'down' valt als fiches naar beneden.
export function burst(x, y, { tone = 'pro', count = 34, dir = 'up', spread = 0 } = {}) {
  if (!motionOk()) return;
  setup();
  resize();
  const colors = TONES[tone];
  for (let i = 0; i < count; i += 1) {
    const up = dir === 'up';
    const angle = up ? -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5 : Math.PI / 2 + (Math.random() - 0.5) * 1.5;
    const speed = up ? 3 + Math.random() * 8 : 1 + Math.random() * 4.5;
    parts.push({
      x: x + (Math.random() - 0.5) * spread,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: up ? 0.22 : 0.32,
      size: 1.6 + Math.random() * 2.6,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 550 + Math.random() * 550,
      age: 0,
    });
  }
  if (!frame) {
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }
}

// Een labeltje dat opstijgt en vervaagt, bv. "+€ 50".
export function floatLabel(text, x, y, tone) {
  if (!motionOk()) return;
  const el = document.createElement('div');
  el.className = `fx-label ${tone}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.setAttribute('aria-hidden', 'true');
  document.body.append(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 2000);
}

// Laat een getal van `from` naar `to` lopen; `format` maakt er tekst van.
const running = new WeakMap();
export function countTo(el, from, to, format, ms = 700) {
  cancelAnimationFrame(running.get(el));
  if (!motionOk() || from === to) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / ms, 1);
    const eased = 1 - (1 - t) ** 4;
    if (t >= 1 || !el.isConnected) {
      el.textContent = format(to);
      return;
    }
    el.textContent = format(Math.round((from + (to - from) * eased) / 100) * 100);
    running.set(el, requestAnimationFrame(step));
  };
  el.textContent = format(Math.round(from / 100) * 100);
  running.set(el, requestAnimationFrame(step));
}

// Speelt een CSS-animatieklasse één keer af.
export function pulse(el, cls) {
  if (!el || !motionOk()) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

export function buzz(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}
