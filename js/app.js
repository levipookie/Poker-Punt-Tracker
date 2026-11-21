import * as C from './core.js';
import * as FX from './fx.js';
import * as Cloud from './cloud.js';

const STORE_KEY = 'ppt.v1';
const SEEN_KEY = 'ppt.seen';
const view = document.getElementById('view');
const toastEl = document.getElementById('toast');
const alarmEl = document.getElementById('alarm');
const cheerEl = document.getElementById('cheer');
const importInput = document.getElementById('import-file');

let { entries, settings } = load();
let draft = null; // het formulier dat open staat
let cameFromApp = false; // true als het scherm via een tik in de app is geopend
let logScroll = 0;
const ov = { mode: 'week', offset: 0, bar: null, from: 0 };
const MODES = ['week', 'month', 'all'];
const TABS = ['home', 'overview', 'log'];
const SYSTEM = ['start', 'stop', 'pauze', 'stopadvies']; // entries die de app zelf aanmaakt
const RANK = { groen: 0, oranje: 1, rood: 2 };
const ZONE = { groen: 'Sharp', oranje: 'Break', rood: 'Stop' };
const shown = new Map(); // laatst getoonde waarde per teller, voor het oplopen
let pendingFx = null; // entry die net is gelogd en nog gevierd moet worden
let lastAdded = null; // { id, at } van de laatst gelogde entry, als oorzaak van een stopadvies
let alarm = null; // het schermvullende advies dat open staat: { kind, rank, until }
let cheer = null; // nieuw level dat nog gevierd moet worden, zodra er geen advies open staat
const acc = { mode: 'in', busy: false, error: '', notice: '', confirm: null }; // het accountscherm

/* ---------- opslag ---------- */

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = C.parseBackup(raw);
      return { entries: data.entries, settings: data.settings || { ...C.DEFAULT_SETTINGS } };
    }
  } catch {
    // Onleesbare opslag: begin leeg in plaats van te crashen.
  }
  return { entries: [], settings: { ...C.DEFAULT_SETTINGS } };
}

function saveLocal() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, entries, settings }));
    return true;
  } catch {
    toast("Couldn't save: this device's storage is full or blocked.");
    return false;
  }
}

// Opslaan op dit toestel, en als je bent ingelogd kort daarna synchroniseren.
function persist() {
  if (!saveLocal()) return false;
  Cloud.noteSettings(settings);
  Cloud.schedule();
  return true;
}

Cloud.attach({
  get: () => ({ entries, settings }),
  set: (nextEntries, nextSettings) => {
    entries = nextEntries;
    settings = nextSettings;
    saveLocal();
  },
  // Er kwam iets binnen van een ander toestel: opnieuw tekenen, maar nooit midden in een formulier.
  changed: () => {
    if (!draft && !['rules', 'account'].includes(route().name)) render();
  },
});

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function make(type, fields = {}, at = Date.now()) {
  return { id: newId(), type, ts: new Date(at).toISOString(), note: '', updated: Date.now(), ...fields };
}

const table = (now = Date.now()) => C.tableState(entries, now, settings);
const prog = (now = Date.now()) => C.progress(entries, now);
const num = (n) => n.toLocaleString('en-IE');

// Vergelijkt de voortgang van voor en na een actie: hoeveel XP kwam erbij, en is er een level bij?
function reward(before) {
  const after = prog();
  if (after.level > before.level) cheer = after;
  return { gained: after.xp - before.xp, after };
}

/* ---------- weergavehulpjes ---------- */

const eur0 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const money = (cents) => (cents % 100 === 0 ? eur0 : eur2).format(cents / 100);

const fmtDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDayYear = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const fmtMonth = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

const thisYear = () => C.sessionDay(Date.now()).getFullYear();
const dayLabel = (day) => (day.getFullYear() === thisYear() ? fmtDay : fmtDayYear).format(day).replace(/,/g, '');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function spanLabel(first, last) {
  const year = last.getFullYear() === thisYear() ? '' : ` ${last.getFullYear()}`;
  const from = first.getMonth() === last.getMonth() ? String(first.getDate()) : fmtShort.format(first);
  return `${from} – ${fmtShort.format(last)}${year}`;
}

function toLocalInput(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${C.dayKey(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function plainAmount(cents) {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

function systemLabel(e) {
  if (e.type === 'start') return 'Session started';
  if (e.type === 'stop') return e.advice ? 'Left the table on a stop warning' : 'Session ended';
  if (e.type === 'pauze') return 'Break taken';
  return 'Stop warning from the tilt meter';
}

function describe(e) {
  if (e.type === 'punt') return `${money(e.cents)} · ${C.labelOf(C.REASONS, e.reason)}`;
  if (e.type === 'pro') return C.labelOf(C.KINDS, e.kind);
  if (e.type === 'klap') return C.labelOf(C.SIZES, e.size);
  return systemLabel(e);
}

const NAMES = { punt: 'Punt', pro: 'Pro play', klap: 'Hit' };

/* ---------- routing ---------- */

function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (['punt', 'pro', 'hit', 'rules', 'progress', 'account', 'overview', 'log'].includes(name)) return { name };
  if (name === 'edit') return { name, id: decodeURIComponent(arg || '') };
  return { name: 'home' };
}

function onRoute() {
  const r = route();
  draft = null;
  if (r.name !== 'account') Object.assign(acc, { confirm: null, error: '', notice: '' });
  if (r.name === 'punt') {
    draft = { mode: 'new', type: 'punt', cents: null, custom: '', reason: null, note: '' };
  } else if (r.name === 'pro') {
    draft = { mode: 'new', type: 'pro', kind: null, note: '' };
  } else if (r.name === 'hit') {
    draft = { mode: 'new', type: 'klap', size: null, note: '' };
  } else if (r.name === 'edit') {
    const e = entries.find((x) => x.id === r.id);
    if (!e) {
      location.replace('#/log');
      return;
    }
    draft = { ...e, mode: 'edit', when: toLocalInput(e.ts) };
    if (e.type === 'punt') draft.custom = C.QUICK_AMOUNTS.includes(e.cents) ? '' : plainAmount(e.cents);
  }
  const fx = r.name === 'home' ? pendingFx : null;
  pendingFx = null;
  // Tellers lopen opnieuw op bij een nieuw scherm, maar niet na een formulier: dan telt het cijfer door.
  if (!fx && !draft) shown.clear();
  render(true);
  window.scrollTo(0, r.name === 'log' ? logScroll : 0);
  if (fx) celebrate(fx.entry, fx.gained);
  // Laat eerst het cijfer oplopen; daarna pas het eventuele advies, en als laatste een nieuw level.
  if (r.name === 'home') {
    setTimeout(() => {
      checkTable();
      flushCheer();
    }, fx && FX.motionOk() ? 800 : 0);
  }
}

function closeForm(fallback = '#/') {
  if (cameFromApp) {
    cameFromApp = false;
    history.back();
  } else {
    location.replace(fallback);
  }
}

function render(animate = false) {
  const r = route();
  const full = Boolean(draft) || ['rules', 'progress', 'account'].includes(r.name);
  document.body.classList.toggle('is-form', full);
  document.body.dataset.tone = draft ? draft.type : '';
  const nav = document.querySelector('.tabbar');
  if (TABS.includes(r.name)) nav.style.setProperty('--i', TABS.indexOf(r.name));
  for (const a of nav.querySelectorAll('a')) {
    if (a.dataset.tab === r.name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  view.classList.toggle('animate', animate && FX.motionOk());
  if (draft) view.innerHTML = formFor(draft.type);
  else if (r.name === 'rules') view.innerHTML = rulesView();
  else if (r.name === 'account') view.innerHTML = accountView();
  else if (r.name === 'progress') view.innerHTML = progressView();
  else if (r.name === 'overview') view.innerHTML = overviewView();
  else if (r.name === 'log') view.innerHTML = logView();
  else view.innerHTML = homeView();
  for (const area of view.querySelectorAll('textarea')) autoGrow(area);
  afterRender();
}

// Sfeer en beweging na elke render: achtergrondgloed, oplopende cijfers, meter en schuivende keuzeknop.
function afterRender() {
  const week = C.summarize(entries.filter((e) => C.inRange(e, C.periodRange('week', 0, Date.now()))));
  const st = table();
  const root = document.documentElement.style;
  root.setProperty('--heat', Math.max(Math.min(week.lost / 50000, 1), st.active ? st.pct / 100 : 0).toFixed(3));
  root.setProperty('--cool', Math.min(week.pros / 4, 1).toFixed(3));
  document.body.dataset.zone = st.active ? st.zone : '';

  for (const el of view.querySelectorAll('[data-count]')) {
    const to = Number(el.dataset.count);
    const from = shown.has(el.dataset.key) ? shown.get(el.dataset.key) : 0;
    shown.set(el.dataset.key, to);
    FX.countTo(el, from, to, money);
  }
  const gauge = view.querySelector('.gauge');
  if (gauge) {
    shown.set('gauge', Number(gauge.dataset.p));
    requestAnimationFrame(() => gauge.style.setProperty('--p', gauge.dataset.p));
  }
  for (const bar of view.querySelectorAll('.xpbar i')) {
    shown.set('xp', Number(bar.dataset.w));
    requestAnimationFrame(() => bar.style.setProperty('--w', bar.dataset.w));
  }
  const seg = view.querySelector('.seg');
  if (seg) requestAnimationFrame(() => seg.style.setProperty('--i', seg.dataset.i));
}

// Na het loggen: vonken en een zwevend label bij het cijfer dat verandert.
function celebrate(entry, gained = 0) {
  const amount = view.querySelector('[data-key="home-week"]');
  if (!amount) return;
  const card = amount.closest('.card');
  if (gained) FX.pulse(view.querySelector('.prog'), 'hit-xp');
  const meter = view.querySelector('.table'); // tijdens een sessie zijn de weekkaarten klein
  if (entry.type === 'punt') {
    const box = amount.getBoundingClientRect();
    FX.floatLabel(`+${money(entry.cents)}`, Math.min(box.right + (meter ? 6 : 10), window.innerWidth - 110), box.top + 4, meter ? 'punt small' : 'punt');
    FX.burst(box.left + box.width / 2, box.bottom - 8, { tone: 'punt', dir: 'down', count: 28, spread: box.width });
    FX.pulse(card, 'hit-punt');
    FX.buzz(40);
  } else if (entry.type === 'pro' && meter) {
    const box = meter.querySelector('.gauge').getBoundingClientRect();
    FX.floatLabel(gained ? `+${gained} XP` : '+1 pro play', box.right - 30, box.top + box.height * 0.3, 'pro');
    FX.burst(box.left + box.width / 2, box.top + box.height * 0.55, { tone: 'pro', count: 44 });
    FX.pulse(meter, 'hit-pro');
    FX.buzz([15, 50, 15]);
  } else if (entry.type === 'pro') {
    const box = card.querySelector('[data-pro]').getBoundingClientRect();
    FX.floatLabel(gained ? `+${gained} XP` : '+1 pro play', Math.min(box.right + 12, window.innerWidth - 130), box.top + 2, 'pro');
    FX.burst(box.left + 14, box.top + box.height / 2, { tone: 'pro', count: 44 });
    FX.pulse(card, 'hit-pro');
    FX.buzz([15, 50, 15]);
  } else if (entry.type === 'klap') {
    if (!meter) return;
    const box = meter.querySelector('.gauge').getBoundingClientRect();
    if (gained) FX.floatLabel(`+${gained} XP`, box.right - 30, box.top + box.height * 0.3, 'klap');
    FX.burst(box.left + box.width / 2, box.top + box.height * 0.55, { tone: 'klap', count: entry.size === 'stack' ? 46 : 30 });
    FX.pulse(meter, 'hit-klap');
    FX.buzz(entry.size === 'stack' ? [30, 40, 30] : 30);
  }
}

/* ---------- home ---------- */

function weekStrip(now) {
  const today = C.sessionDay(now);
  const start = C.weekStart(today);
  const cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((letter, i) => {
    const day = C.addDays(start, i);
    const key = C.dayKey(day);
    const list = entries.filter((e) => C.dayKey(C.sessionDay(e.ts)) === key);
    const count = (type) => Math.min(list.filter((e) => e.type === type).length, 3);
    const dots = '<i class="punt"></i>'.repeat(count('punt')) + '<i class="pro"></i>'.repeat(count('pro'));
    const state = key === C.dayKey(today) ? ' class="today"' : day > today ? ' class="future"' : '';
    return `<li${state}><span class="cell">${dots}</span><span class="d">${letter}</span></li>`;
  });
  return `<ol class="weekstrip" aria-hidden="true">${cells.join('')}</ol>`;
}

const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.4 2.5c.6 3.1-.9 4.9-2.4 6.6C8.5 10.8 7 12.5 7 15c0 2.9 2.2 5.5 5 5.5s5-2.4 5-5.5c0-1.7-.6-3.2-1.6-4.4-.3 1.2-1 2.1-2 2.6.6-3.6-.1-7.5-1-10.7z"/></svg>';

// Het logo: een ring die de verhouding punts / pro plays van deze week laat zien.
function ring(punts, pros) {
  const total = punts + pros;
  const share = total ? Math.round((punts / total) * 100) : 50;
  return `
    <svg class="ring${total ? '' : ' idle'}" viewBox="0 0 36 36" aria-hidden="true">
      <circle class="pro" cx="18" cy="18" r="15.9155"/>
      <circle class="punt" cx="18" cy="18" r="15.9155" stroke-dasharray="${share} ${100 - share}"/>
    </svg>`;
}

function whyLine(st) {
  if (st.redAt) return `Stop warning since ${fmtTime.format(new Date(st.redAt))}. Time to go.`;
  if (st.reasons.length) return st.reasons.join(' · ');
  return 'All good so far. Log every hit and the meter keeps track.';
}

// De tiltmeter van de lopende sessie.
function tableCard(st, mult) {
  const from = shown.has('gauge') ? shown.get('gauge') : 0;
  return `
    <section class="card table" data-zone="${st.zone}">
      <header>
        <h2>At the table</h2>
        ${mult > 1 ? `<p class="combo">Combo ×${mult}</p>` : ''}
        <p class="timer">${C.duration(st.minutes)}</p>
      </header>
      <div class="gauge" style="--p:${from}" data-p="${st.pct}">
        <svg viewBox="0 0 200 110" aria-hidden="true">
          <defs>
            <linearGradient id="gauge-zones" gradientUnits="userSpaceOnUse" x1="16" y1="0" x2="184" y2="0">
              <stop offset="0" stop-color="#2ff0a1"/>
              <stop offset="0.5" stop-color="#ffb224"/>
              <stop offset="1" stop-color="#ff4d61"/>
            </linearGradient>
          </defs>
          <path class="track" d="M16 100A84 84 0 0 1 184 100" pathLength="100"/>
          <path class="fill" d="M16 100A84 84 0 0 1 184 100" pathLength="100"/>
          <path class="mark" d="M100 2v7"/>
          <g class="knob"><circle cx="16" cy="100" r="7.5"/></g>
        </svg>
        <div class="read">
          <strong>${ZONE[st.zone]}</strong>
          <span>tilt meter <b>${st.pct}%</b></span>
        </div>
      </div>
      <p class="why">${esc(whyLine(st))}</p>
      <div class="pair">
        <button type="button" class="btn plain${st.zone === 'rood' ? ' pro' : ''}" data-act="stop-session">${st.zone === 'rood' ? 'Leave the table' : 'End session'}</button>
        <a class="btn plain" href="#/rules" data-nav>Rules</a>
      </div>
    </section>`;
}

function homeView() {
  const now = Date.now();
  const sum = (mode) => C.summarize(entries.filter((e) => C.inRange(e, C.periodRange(mode, 0, now))));
  const week = sum('week');
  const month = sum('month');
  const st = table(now);
  const p = prog(now);
  const amount = (s, key) => `<p class="amount${s.lost ? ' is-punt' : ''}" data-count="${s.lost}" data-key="${key}">${money(s.lost)}</p>`;
  const card = (title, s, cls, key, extra = '') => `
      <section class="card stat ${cls}">
        <h2>${title}</h2>
        ${amount(s, key)}
        <p class="sub">lost to punts</p>
        <ul class="counts">
          <li><span class="dot punt"></span>${plural(s.punts, 'punt', 'punts')}</li>
          <li data-pro><span class="dot pro"></span>${plural(s.pros, 'pro play', 'pro plays')}</li>
        </ul>
        ${extra}
      </section>`;
  const mini = (title, s, key) => `
      <section class="card stat">
        <h2>${title}</h2>
        ${amount(s, key)}
        <p class="line"><span>${plural(s.punts, 'punt', 'punts')}</span> · <span data-pro>${plural(s.pros, 'pro play', 'pro plays')}</span></p>
      </section>`;
  const body = st.active ? `
      ${tableCard(st, p.mult)}
      <div class="stats mini">
        ${mini('This week', week, 'home-week')}
        ${mini('This month', month, 'home-month')}
      </div>` : `
      <div class="stats">
        ${card('This week', week, 'hero', 'home-week', weekStrip(now))}
        ${card('This month', month, 'month', 'home-month')}
      </div>
      <button type="button" class="startbar" data-act="start-session">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>
        <span><strong>Start session</strong><small>Turn on the tilt meter when you sit down</small></span>
      </button>`;
  return `
    <div class="home${st.active ? ' at-table' : ''}">
      <header class="top">
        <h1>${ring(week.punts, week.pros)}<span><b>Punt</b> Tracker</span></h1>
        <a class="prog" href="#/progress" data-nav aria-label="Level ${p.level}, ${p.title}. Streak ${p.streak}. Open progress">
          <span class="streak${p.streak ? '' : ' cold'}">${FLAME}${p.streak}</span>
          <span class="lv">Lv ${p.level}</span>
          <span class="xpbar"><i style="--w:${shown.has('xp') ? shown.get('xp') : 0}" data-w="${p.pct}"></i></span>
        </a>
      </header>
      ${body}
      <div class="actions">
        <a class="big klap" href="#/hit" data-nav>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 3 5 13.5h6L10.5 21 19 10.5h-6z"/></svg>
          <strong>Hit</strong>
          <span>Beat or cooler</span>
        </a>
        <a class="big punt" href="#/punt" data-nav>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5 10 14l3.5-3.5 7 7M20.5 12.5v5h-5"/></svg>
          <strong>Punt</strong>
          <span>Bad play</span>
        </a>
        <a class="big pro" href="#/pro" data-nav>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.2 6.3 6.3 2.2-6.3 2.2-2.2 6.3-2.2-6.3L3.5 12l6.3-2.2z"/></svg>
          <strong>Pro play</strong>
          <span>+EV play</span>
        </a>
      </div>
    </div>`;
}

// Werkt de meter bij zonder het hele scherm opnieuw te tekenen (elke 20 seconden).
function refreshTable() {
  const card = view.querySelector('.table');
  const st = table();
  if (!card || !st.active || card.dataset.zone !== st.zone) {
    render();
    return;
  }
  card.querySelector('.timer').textContent = C.duration(st.minutes);
  card.querySelector('.read b').textContent = `${st.pct}%`;
  card.querySelector('.why').textContent = whyLine(st);
  card.querySelector('.gauge').style.setProperty('--p', st.pct);
  shown.set('gauge', st.pct);
}

/* ---------- formulieren ---------- */

function formHead(title) {
  return `
    <header class="formhead">
      <button type="button" class="back" data-act="close" aria-label="Back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5 8 12l6.5 7"/></svg>
      </button>
      <h1>${title}</h1>
    </header>`;
}

function chip(act, val, label, on, tone) {
  return `<button type="button" class="chip ${tone}" data-act="${act}" data-val="${val}" aria-pressed="${on}">${label}</button>`;
}

function whenField() {
  return `
    <div class="field">
      <label class="legend" for="when">Time</label>
      <input class="input" id="when" type="datetime-local" value="${esc(draft.when)}">
    </div>`;
}

function noteField(placeholder, rows = 1, optional = true) {
  return `
    <div class="field">
      <label class="legend" for="note">Note${optional ? ' <small>optional</small>' : ''}</label>
      <textarea class="input" id="note" rows="${rows}" placeholder="${placeholder}">${esc(draft.note)}</textarea>
    </div>`;
}

function editButtons(tone) {
  return `
    <p class="error" id="form-error" hidden></p>
    <button type="button" class="btn ${tone}" data-act="save">Save</button>
    <button type="button" class="btn ghost" data-act="delete">Delete</button>`;
}

function formFor(type) {
  if (type === 'punt') return puntForm();
  if (type === 'pro') return proForm();
  if (type === 'klap') return klapForm();
  return systemForm();
}

function puntForm() {
  const d = draft;
  const edit = d.mode === 'edit';
  const amount = `
    <div class="field" id="f-amount">
      <p class="legend">Amount</p>
      <div class="chips four">
        ${C.QUICK_AMOUNTS.map((c) => chip('pick-amount', c, money(c), !d.custom && d.cents === c, 'punt')).join('')}
      </div>
      <label class="money">
        <span>€</span>
        <input id="custom" inputmode="decimal" autocomplete="off" enterkeyhint="done"
          placeholder="Other amount" aria-label="Other amount in euros" value="${esc(d.custom)}">
      </label>
      <p class="hint">What the mistake cost at the moment you decided, no matter how the hand ran out.</p>
      <p class="error" id="amount-error" hidden>Pick an amount first.</p>
    </div>`;
  const note = noteField('What happened?');
  const reason = `
    <div class="field">
      <p class="legend">Reason${edit ? '' : ' <small>tap to save</small>'}</p>
      <div class="chips two">
        ${C.REASONS.map(([k, label]) => chip('pick-reason', k, label, d.reason === k, 'punt')).join('')}
      </div>
    </div>`;
  return `
    ${formHead(edit ? 'Edit punt' : 'Log punt')}
    <form class="form" novalidate>
      ${edit ? amount + reason + note + whenField() + editButtons('punt') : amount + note + reason}
    </form>`;
}

function proForm() {
  const d = draft;
  const edit = d.mode === 'edit';
  return `
    ${formHead(edit ? 'Edit pro play' : 'Log pro play')}
    <form class="form" novalidate>
      <div class="field">
        <p class="legend">Type</p>
        <div class="chips two">
          ${C.KINDS.map(([k, label]) => chip('pick-kind', k, label, d.kind === k, 'pro')).join('')}
        </div>
      </div>
      ${noteField('What did you do, and why?', 4, false)}
      ${edit ? whenField() + editButtons('pro') : `
        <p class="error" id="form-error" hidden></p>
        <button type="button" class="btn pro" data-act="save">Save pro play</button>`}
    </form>`;
}

function klapForm() {
  const d = draft;
  const edit = d.mode === 'edit';
  const size = `
    <div class="field">
      <p class="legend">How bad?${edit ? '' : ' <small>tap to save</small>'}</p>
      <div class="chips two tall">
        ${C.SIZES.map(([k, label]) => chip('pick-size', k, label, d.size === k, 'klap')).join('')}
      </div>
    </div>`;
  return `
    ${formHead(edit ? 'Edit hit' : 'Log hit')}
    <form class="form" novalidate>
      <p class="hint lead">A bad beat or cooler: you played it right and lost anyway. It's not a punt, but it does count toward your tilt meter.</p>
      ${edit ? size + noteField('What happened?') + whenField() + editButtons('klap') : noteField('What happened?') + size}
    </form>`;
}

function systemForm() {
  return `
    ${formHead(systemLabel(draft))}
    <form class="form" novalidate>
      <p class="hint lead">The app logged this line itself. You can change the time or delete it.</p>
      ${whenField()}
      ${editButtons('plain')}
    </form>`;
}

function rulesView() {
  const s = settings;
  const pick = (key, val, label) => `<button type="button" class="chip rule" data-act="set-rule" data-key="${key}" data-val="${val}" aria-pressed="${s[key] === val}">${label}</button>`;
  return `
    ${formHead('Table rules')}
    <div class="form">
      <p class="hint lead">Set these rules with a clear head. At the table the meter decides, not how you feel in the moment.</p>
      <div class="field">
        <p class="legend">Stop-loss</p>
        <div class="chips four">${pick('stopLoss', 2, '2')}${pick('stopLoss', 3, '3')}${pick('stopLoss', 4, '4')}${pick('stopLoss', 0, 'Off')}</div>
        <p class="hint">Lose this many stacks in one session and you stop, however you feel.</p>
      </div>
      <div class="field">
        <p class="legend">Max session length</p>
        <div class="chips four">${pick('maxHours', 4, '4 h')}${pick('maxHours', 6, '6 h')}${pick('maxHours', 8, '8 h')}${pick('maxHours', 0, 'Off')}</div>
        <p class="hint">During the last two hours the meter already climbs from fatigue.</p>
      </div>
      <div class="field">
        <p class="legend">Sensitivity</p>
        <div class="chips three">${pick('sens', 'streng', 'Strict')}${pick('sens', 'normaal', 'Normal')}${pick('sens', 'los', 'Loose')}</div>
        <p class="hint">Strict and normal: a tilt punt or a second punt in one session is an instant stop. Loose: only at the third punt, and the meter reacts later.</p>
      </div>
      <div class="field">
        <label class="legend" for="message">Note to self</label>
        <textarea class="input" id="message" rows="3" maxlength="400" placeholder="What do you want to tell yourself when the meter hits red?">${esc(s.message)}</textarea>
        <p class="hint">You'll see this with every stop warning.</p>
      </div>
      <div class="field how">
        <p class="legend">How the meter works</p>
        <ul>
          <li>Every <b>hit</b> (bad beat or cooler) and every <b>punt</b> adds up. Losing a stack counts more than losing a pot.</li>
          <li>Points fade slowly: after 2.5 hours a hit weighs half as much.</li>
          <li><b>Orange</b>: 10 minutes away from the table. <b>Red</b>: session over.</li>
          <li>The app can only warn you when you open it or log something. So log every hit right away.</li>
        </ul>
      </div>
    </div>`;
}

function progressView() {
  const p = prog();
  const recent = p.events.slice(-6).reverse();
  const rows = recent.length
    ? `<ul class="list wins">${recent.map((ev) => `
        <li>
          <span class="when">${fmtShort.format(C.sessionDay(ev.ts))}</span>
          <span class="what">${esc(ev.label)}${ev.mult > 1 ? ` <small>combo ×${ev.mult}</small>` : ''}</span>
          <b>+${ev.xp}</b>
        </li>`).join('')}</ul>`
    : '<p class="empty">No wins yet. Your first good decision shows up here.</p>';
  const ladder = C.LEVELS.map((l) => `
        <li class="${l.level === Math.min(p.level, C.LEVELS.length) ? 'now' : p.level > l.level ? 'done' : ''}" style="--n:${l.level}">
          <span class="n">${l.level}</span><span class="t">${l.title}</span><span class="x">${num(l.xp)} XP</span>
        </li>`).join('');
  return `
    ${formHead('Progress')}
    <div class="form">
      <section class="card levelcard">
        <p class="eyebrow">Level ${p.level}</p>
        <p class="rank">${p.title}</p>
        <div class="xpbar wide"><i style="--w:${shown.has('xp') ? shown.get('xp') : 0}" data-w="${p.pct}"></i></div>
        <p class="sub"><b>${num(p.xp)} XP</b> · ${num(p.toNext)} to ${p.nextTitle === p.title ? `level ${p.level + 1}` : p.nextTitle}</p>
      </section>
      <div class="tiles">
        <div class="card tile"><h2>Streak</h2><p>${p.streak}</p></div>
        <div class="card tile"><h2>Best streak</h2><p>${p.bestStreak}</p></div>
        <div class="card tile"><h2>Best combo</h2><p>×${p.bestMult}</p></div>
      </div>
      <div class="field">
        <p class="legend">Recent wins</p>
        ${rows}
      </div>
      <div class="field how">
        <p class="legend">How you earn XP</p>
        <ul>
          <li><b>+${C.XP.leave}</b> leaving the table on a stop warning.</li>
          <li><b>+${C.XP.break}</b> taking the break when the meter turns orange.</li>
          <li><b>+${C.XP.clean}</b> a clean exit: ending a session of ${C.CLEAN_MINUTES} minutes or more without a stop warning.</li>
          <li><b>+${C.XP.pro}</b> every pro play.</li>
          <li><b>+${C.XP.hit}</b> every hit you log instead of steaming over it.</li>
          <li><b>Combo</b>: each win in a row in one session adds ×0.5 to hits and pro plays, up to ×${C.MAX_MULT}. A punt resets it.</li>
          <li><b>Streak</b>: sessions in a row where you played by your rules. Only playing on after a stop warning breaks it. Logging a punt never does.</li>
        </ul>
      </div>
      <div class="field">
        <p class="legend">Levels</p>
        <ol class="ladder">${ladder}</ol>
      </div>
    </div>`;
}

/* ---------- account ---------- */

function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `on ${fmtShort.format(new Date(ms))}`;
}

function syncLine() {
  if (!Cloud.ready()) return '';
  const waiting = Cloud.pending(entries);
  if (Cloud.status.syncing) return 'Syncing…';
  if (Cloud.status.error) {
    if (Cloud.status.error.code === 'offline') return waiting ? `Offline · ${plural(waiting, 'change', 'changes')} waiting` : 'Offline';
    return `Sync failed: ${Cloud.status.error.message}`;
  }
  if (waiting) return `${plural(waiting, 'change', 'changes')} waiting to sync`;
  return Cloud.lastSync() ? `Synced ${ago(Cloud.lastSync())}` : 'Not synced yet';
}

function accountBlock() {
  if (!Cloud.enabled) return '';
  const u = Cloud.user();
  if (u && Cloud.ready()) {
    return `
    <section class="block account">
      <h2>Account</h2>
      <a class="card acct" href="#/account" data-nav>
        <span class="who"><b>${esc(u.email)}</b><small data-sync>${syncLine()}</small></span>
        <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5 16 12l-6.5 7"/></svg>
      </a>
    </section>`;
  }
  return `
    <section class="block account">
      <h2>Account</h2>
      <p class="hint">${Cloud.status.expired ? 'Your session expired. Sign in again to keep syncing.' : 'Sign in to keep your log safe and in sync on all your devices.'}</p>
      <a class="btn plain" href="#/account" data-nav>Sign in or create account</a>
    </section>`;
}

function accountView() {
  if (!Cloud.enabled) {
    return `${formHead('Account')}
      <div class="form"><p class="hint lead">Accounts aren't set up for this app yet.</p></div>`;
  }
  const u = Cloud.user();
  // Net ingelogd op een toestel met een log zonder account.
  if (u && Cloud.needsClaim(entries.length)) {
    return `${formHead('Account')}
      <div class="form">
        <section class="card acct-card">
          <p class="eyebrow">Signed in as</p>
          <p class="mail">${esc(u.email)}</p>
        </section>
        <p class="hint lead">This phone already has <b>${plural(entries.length, 'entry', 'entries')}</b> that aren't in an account. Add them to ${esc(u.email)}? Anything already in the account stays too.</p>
        <button type="button" class="btn pro" data-act="acc-claim">Add them to my account</button>
        <button type="button" class="btn ghost" data-act="acc-cancel">Cancel and sign out</button>
      </div>`;
  }
  if (u && Cloud.ready()) {
    const c = acc.confirm;
    const waiting = Cloud.pending(entries);
    return `${formHead('Account')}
      <div class="form">
        <section class="card acct-card">
          <p class="eyebrow">Signed in as</p>
          <p class="mail">${esc(u.email)}</p>
          <p class="sub" data-sync>${syncLine()}</p>
        </section>
        <p class="hint lead">Your log is saved on this phone first and synced in the background, so the app keeps working at the table without a connection.</p>
        ${acc.notice ? `<p class="notice">${esc(acc.notice)}</p>` : ''}
        ${acc.error ? `<p class="error">${esc(acc.error)}</p>` : ''}
        <button type="button" class="btn plain" data-act="acc-sync"${Cloud.status.syncing ? ' disabled' : ''}>Sync now</button>
        <button type="button" class="btn plain${c === 'signout' ? ' danger' : ''}" data-act="acc-signout"${acc.busy ? ' disabled' : ''}>${c === 'signout' ? `Sign out and lose ${plural(waiting, 'unsynced change', 'unsynced changes')}?` : 'Sign out'}</button>
        <p class="hint">Signing out removes your log from this phone. It stays safe in your account.</p>
        <div class="field danger-zone">
          <p class="legend">Delete account</p>
          <p class="hint">${c === 'delete' ? 'This deletes your account and everything synced to it, for good. The log on this phone stays, only on this phone.' : 'Removes your account and all synced data from the server.'}</p>
          <button type="button" class="btn plain danger" data-act="acc-delete"${acc.busy ? ' disabled' : ''}>${c === 'delete' ? 'Yes, delete my account' : 'Delete account'}</button>
        </div>
      </div>`;
  }
  const up = acc.mode === 'up';
  return `${formHead(up ? 'Create account' : 'Sign in')}
    <div class="form">
      <div class="seg two" role="group" aria-label="Account" style="--i:${up ? 1 : 0}" data-i="${up ? 1 : 0}">
        <button type="button" data-act="acc-mode" data-val="in" aria-pressed="${!up}">Sign in</button>
        <button type="button" data-act="acc-mode" data-val="up" aria-pressed="${up}">Create account</button>
      </div>
      <p class="hint lead">${Cloud.status.expired ? 'Your session expired. Sign in again to keep syncing; nothing on this phone was lost.' : 'With an account your log is backed up and in sync on all your devices. Without one, the app works exactly the same, only on this phone.'}</p>
      <div class="field">
        <label class="legend" for="acc-email">Email</label>
        <input class="input" id="acc-email" type="email" inputmode="email" autocomplete="${up ? 'email' : 'username'}" autocapitalize="off" spellcheck="false" value="${esc(acc.email || '')}">
      </div>
      <div class="field">
        <label class="legend" for="acc-pass">Password${up ? ' <small>at least 8 characters</small>' : ''}</label>
        <input class="input" id="acc-pass" type="password" autocomplete="${up ? 'new-password' : 'current-password'}">
      </div>
      ${acc.notice ? `<p class="notice">${esc(acc.notice)}</p>` : ''}
      <p class="error" id="acc-error"${acc.error ? '' : ' hidden'}>${esc(acc.error)}</p>
      <button type="button" class="btn pro" data-act="acc-submit"${acc.busy ? ' disabled' : ''}>${acc.busy ? 'One moment…' : up ? 'Create account' : 'Sign in'}</button>
    </div>`;
}

async function submitAccount() {
  if (acc.busy) return;
  const email = (document.getElementById('acc-email') || {}).value || '';
  const pass = (document.getElementById('acc-pass') || {}).value || '';
  acc.email = email.trim();
  const fail = (msg) => {
    Object.assign(acc, { busy: false, error: msg });
    render();
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(acc.email)) return fail('Enter a valid email address.');
  if (acc.mode === 'up' && pass.length < 8) return fail('Use a password of at least 8 characters.');
  if (!pass) return fail('Enter your password.');
  Object.assign(acc, { busy: true, error: '', notice: '' });
  render();
  try {
    if (acc.mode === 'up') {
      const res = await Cloud.signUp(acc.email, pass);
      if (res.confirm) {
        Object.assign(acc, { busy: false, mode: 'in', notice: 'Check your email and confirm your address, then sign in here.' });
        return render();
      }
    } else {
      await Cloud.signIn(acc.email, pass);
    }
  } catch (err) {
    return fail(err.message);
  }
  acc.busy = false;
  if (Cloud.needsClaim(entries.length)) return render(); // eerst vragen wat er met de data hier moet
  return claimDevice();
}

async function claimDevice() {
  Cloud.claim(settings);
  render();
  await Cloud.sync();
  render();
  toast(Cloud.status.error ? `Signed in. ${Cloud.status.error.message}` : 'Signed in. Your log is synced.');
}

async function signOutFlow() {
  if (acc.busy) return;
  if (acc.confirm !== 'signout') {
    acc.busy = true;
    render();
    await Cloud.sync(); // eerst alles doorgeven
    acc.busy = false;
    if (Cloud.pending(entries) > 0) {
      acc.confirm = 'signout'; // nog niet alles staat online: eerst bevestigen
      return render();
    }
  }
  acc.confirm = null;
  await Cloud.signOut();
  entries = [];
  settings = { ...C.DEFAULT_SETTINGS };
  saveLocal();
  shown.clear();
  location.replace('#/log');
  toast('Signed out. Your log is no longer on this phone.');
}

async function deleteFlow() {
  if (acc.busy) return;
  if (acc.confirm !== 'delete') {
    acc.confirm = 'delete';
    return render();
  }
  Object.assign(acc, { busy: true, confirm: null, error: '' });
  render();
  try {
    await Cloud.deleteAccount();
  } catch (err) {
    Object.assign(acc, { busy: false, error: err.message });
    return render();
  }
  acc.busy = false;
  location.replace('#/log');
  toast('Account deleted. The log on this phone is still here.');
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

function formError(msg) {
  const el = document.getElementById('form-error');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  el.scrollIntoView({ block: 'nearest' });
}

function amountError() {
  const el = document.getElementById('amount-error');
  el.hidden = false;
  document.getElementById('f-amount').scrollIntoView({ block: 'start' });
}

function addEntry(type, fields) {
  const before = prog();
  const entry = make(type, fields);
  entries.push(entry);
  if (!persist()) {
    entries.pop();
    return;
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const { gained } = reward(before);
  pendingFx = { entry, gained };
  lastAdded = { id: entry.id, at: Date.now() };
  closeForm('#/');
  const bits = [`${NAMES[type]} logged: ${describe(entry)}`];
  if (gained) bits.push(`+${gained} XP`);
  else if (type === 'punt' && before.combo > 0) bits.push('combo lost');
  toast(bits.join(' · '), {
    label: 'Undo',
    run: () => removeEntry(entry.id),
  });
}

function removeEntry(id) {
  const gone = entries.find((e) => e.id === id);
  if (!gone) return [];
  // Een stopadvies dat door deze entry kwam, verdwijnt mee.
  const removed = entries.filter((e) => e.id === id || (e.type === 'stopadvies' && e.cause === id));
  entries = entries.filter((e) => !removed.includes(e));
  persist();
  render();
  syncAlarm();
  return removed;
}

function saveForm() {
  const d = draft;
  if (d.type === 'punt' && !d.cents) return amountError();
  if (d.type === 'punt' && !d.reason) return formError('Pick a reason.');
  if (d.type === 'pro' && !d.kind) return formError('Pick a type.');
  const note = (d.note || '').trim();
  if (d.mode === 'new') return addEntry('pro', { kind: d.kind, note });

  const when = new Date(d.when);
  if (!d.when || Number.isNaN(when.getTime())) return formError('Enter a valid time.');
  const i = entries.findIndex((e) => e.id === d.id);
  if (i < 0) return closeForm('#/log');
  const before = entries[i];
  // Seconden behouden als het tijdstip niet is aangepast, zodat de volgorde gelijk blijft.
  const ts = d.when === toLocalInput(before.ts) ? before.ts : when.toISOString();
  const next = { ...before, ts, note, updated: Date.now() };
  if (before.type === 'punt') Object.assign(next, { cents: d.cents, reason: d.reason });
  if (before.type === 'pro') next.kind = d.kind;
  if (before.type === 'klap') next.size = d.size;
  entries[i] = next;
  if (!persist()) {
    entries[i] = before;
    return undefined;
  }
  closeForm('#/log');
  return toast('Change saved');
}

function deleteDraft() {
  const removed = removeEntry(draft.id);
  closeForm('#/log');
  if (!removed.length) return;
  const gone = removed.find((e) => e.id === draft.id);
  toast(`${NAMES[gone.type] || systemLabel(gone)} deleted`, {
    label: 'Undo',
    run: () => {
      const now = Date.now();
      for (const e of removed) if (!entries.some((x) => x.id === e.id)) entries.push({ ...e, updated: now });
      persist();
      render();
    },
  });
}

/* ---------- sessie en tiltmeter ---------- */

function readSeen() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY)) || {};
  } catch {
    return {};
  }
}

function writeSeen(seen) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Niet erg: dan komt het advies hooguit een keer extra.
  }
}

// Kijkt of de meter in een hogere zone is gekomen sinds het laatste advies, en toont dat dan.
function checkTable() {
  const st = table();
  if (!st.active) return;
  const seen = readSeen();
  const rank = RANK[st.zone];
  const prev = seen.sid === st.sid ? seen.rank : 0;
  if (rank !== prev) writeSeen({ sid: st.sid, rank });
  if (rank <= prev) return;
  if (st.zone === 'rood' && !st.redAt) {
    const cause = lastAdded && Date.now() - lastAdded.at < 10000 ? lastAdded.id : undefined;
    entries.push(make('stopadvies', cause ? { cause } : {}));
    persist();
    if (route().name === 'home' && !draft) render();
  }
  showAlarm(table());
}

// Sluit een advies dat niet meer klopt, bv. na "ongedaan maken".
function syncAlarm() {
  const st = table();
  const rank = st.active ? RANK[st.zone] : 0;
  const seen = readSeen();
  if (st.active && seen.sid === st.sid && seen.rank > rank) writeSeen({ sid: st.sid, rank });
  if (alarm && alarm.kind !== 'timer' && rank < alarm.rank) closeAlarm();
}

function reasonList(st) {
  return st.reasons.length ? `<ul class="why-list">${st.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '';
}

function showAlarm(st) {
  if (!st.active || st.zone === 'groen') return;
  const stop = st.zone === 'rood';
  alarm = { kind: stop ? 'stop' : 'pauze', rank: RANK[st.zone] };
  alarmEl.dataset.zone = st.zone;
  alarmEl.innerHTML = stop ? `
    <div class="rings" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="alarm-in">
      <p class="eyebrow">Tilt meter on red</p>
      <h1 id="alarm-title">Stop</h1>
      <p class="lead">Rack up and leave the table. This is the moment it goes wrong.</p>
      ${reasonList(st)}
      ${settings.message.trim() ? `<blockquote><span>Note to self</span>${esc(settings.message.trim())}</blockquote>` : ''}
      <button type="button" class="btn pro" data-act="leave">I'm leaving the table</button>
      <button type="button" class="hold" data-hold="ignore"><i></i><span>Hold to keep playing anyway</span></button>
    </div>` : `
    <div class="rings" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="alarm-in">
      <p class="eyebrow">Tilt meter on orange</p>
      <h1 id="alarm-title">Break</h1>
      <p class="lead">Get up and walk away from the table for ${C.PAUSE_MINUTES} minutes. Now, not after this orbit.</p>
      ${reasonList(st)}
      <button type="button" class="btn amber" data-act="pause">Start ${C.PAUSE_MINUTES}-minute break</button>
      <button type="button" class="btn ghost" data-act="alarm-close">Not now</button>
    </div>`;
  openAlarm();
  FX.buzz(stop ? [80, 60, 80, 60, 160] : [60, 60, 60]);
}

let clock = 0;

function showTimer(until, gained = 0) {
  alarm = { kind: 'timer', rank: 1, until };
  alarmEl.dataset.zone = 'oranje';
  alarmEl.innerHTML = `
    <div class="alarm-in">
      <p class="eyebrow">Break${gained ? ` · +${gained} XP` : ''}</p>
      <h1 id="alarm-title" class="clock"></h1>
      <p class="lead" id="alarm-lead">Away from the table. Breathe. Don't replay hands.</p>
      <button type="button" class="btn plain" data-act="alarm-close">Back to the table</button>
      <button type="button" class="btn ghost" data-act="leave">I'm done for today</button>
    </div>`;
  openAlarm();
  const tick = () => {
    const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    const title = document.getElementById('alarm-title');
    if (!title || !alarm || alarm.kind !== 'timer') return;
    if (left) {
      title.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
      return;
    }
    clearInterval(clock);
    title.textContent = 'Done';
    document.getElementById('alarm-lead').textContent = "Are you playing your own game again? If not, call it a day.";
    FX.buzz([60, 60, 60]);
  };
  clearInterval(clock);
  clock = setInterval(tick, 500);
  tick();
}

// Zolang het advies open staat, is de rest van de app niet te bedienen.
function setInert(on) {
  view.inert = on;
  document.querySelector('.tabbar').inert = on;
}

function openAlarm() {
  alarmEl.hidden = false;
  setInert(true);
  document.body.classList.add('has-alarm');
  alarmEl.scrollTop = 0;
}

function closeAlarm() {
  clearInterval(clock);
  alarm = null;
  alarmEl.hidden = true;
  alarmEl.innerHTML = '';
  document.body.classList.remove('has-alarm');
  setInert(false);
  flushCheer();
}

// Nieuw level: een eigen schermvullend moment, maar nooit over een advies heen.
function flushCheer() {
  if (!cheer || alarm || !cheerEl.hidden) return;
  const p = cheer;
  cheer = null;
  cheerEl.innerHTML = `
    <div class="rings" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="alarm-in">
      <p class="eyebrow">Level up</p>
      <h1 id="cheer-title">Level ${p.level}</h1>
      <p class="rank">${p.title}</p>
      <p class="lead">${num(p.toNext)} XP to ${p.nextTitle === p.title ? `level ${p.level + 1}` : p.nextTitle}.</p>
      <button type="button" class="btn klap" data-act="cheer-close">Keep it up</button>
    </div>`;
  cheerEl.hidden = false;
  cheerEl.scrollTop = 0;
  setInert(true);
  document.body.classList.add('has-alarm');
  const x = window.innerWidth / 2;
  FX.burst(x, window.innerHeight * 0.34, { tone: 'klap', count: 60 });
  setTimeout(() => FX.burst(x, window.innerHeight * 0.34, { tone: 'pro', count: 50 }), 220);
  FX.buzz([40, 40, 40, 40, 140]);
}

function closeCheer() {
  cheerEl.hidden = true;
  cheerEl.innerHTML = '';
  document.body.classList.remove('has-alarm');
  setInert(false);
}

// XP die niet bij een entry op het scherm hoort (sessie afgesloten): label bij de voortgangsknop.
function popXp(gained) {
  const pill = view.querySelector('.prog');
  if (!pill || !gained) return;
  const box = pill.getBoundingClientRect();
  FX.floatLabel(`+${gained} XP`, box.left, box.bottom + 26, 'pro');
  FX.burst(box.left + box.width / 2, box.bottom, { tone: 'pro', count: 32 });
  FX.pulse(pill, 'hit-xp');
}

function startSession() {
  if (table().active) return;
  const start = make('start');
  entries.push(start);
  if (!persist()) {
    entries.pop();
    return;
  }
  shown.delete('gauge');
  render(true);
  toast('Session started. Log every hit and every punt.', { label: 'Undo', run: () => removeEntry(start.id) });
  checkTable(); // kort na een zware sessie kan de meter nog hoog staan
}

function startPause() {
  const st = table();
  if (!st.active) return closeAlarm();
  const before = prog();
  const pause = make('pauze');
  entries.push(pause);
  persist();
  const { gained } = reward(before);
  syncAlarm();
  if (route().name === 'home' && !draft) render();
  return showTimer(Date.parse(pause.ts) + C.PAUSE_MINUTES * 60000, gained);
}

// Sessie stoppen. Na een stopadvies zonder verder verlies telt dat als pro play: discipline.
function endSession() {
  const st = table();
  closeAlarm();
  if (!st.active) return;
  const now = Date.now();
  const before = prog();
  // Opgevolgd: niet doorgespeeld na het advies, en vandaag nog niet eerder zo afgesloten.
  const followed = Boolean(st.redAt) && st.afterAdvice === 0 && !st.ignored && !st.leftToday;
  const added = [];
  // De pro play komt vlak voor de stop, zodat hij bij deze sessie hoort.
  if (followed) added.push(make('pro', { kind: 'discipline', note: 'Left the table when the tilt meter was on red.' }, now - 1));
  added.push(make('stop', { advice: followed }, now));
  entries.push(...added);
  if (!persist()) {
    entries = entries.filter((e) => !added.includes(e));
    return;
  }
  const { gained } = reward(before);
  shown.delete('gauge');
  if (route().name === 'home' && !draft) {
    render(true);
    if (followed) celebrate(added[0], gained);
    else popXp(gained);
  }
  setTimeout(flushCheer, FX.motionOk() ? 900 : 0);
  let message = `Session ended after ${C.duration(st.minutes)}.`;
  if (followed) message = `Strong. Session ended and logged as a pro play: Discipline. +${gained} XP`;
  else if (gained) message = `Session ended after ${C.duration(st.minutes)} · clean exit +${gained} XP`;
  toast(message, {
    label: 'Undo',
    run: () => {
      entries = entries.filter((e) => !added.includes(e));
      persist();
      render();
    },
  });
}

function ignoreAdvice() {
  const st = table();
  const advice = st.active && entries.find((e) => e.type === 'stopadvies' && e.ts === st.redAt);
  if (advice) {
    // Vastleggen dat je bewust doorspeelde: dat breekt de streak.
    advice.ignored = true;
    advice.updated = Date.now();
    persist();
  }
  closeAlarm();
  toast("You're playing on against the stop warning. The meter stays on red.");
}

/* ---------- overzicht ---------- */

function firstSessionDay() {
  let first = null;
  for (const e of entries) {
    const day = C.sessionDay(e.ts);
    if (!first || day < first) first = day;
  }
  return first;
}

function weekTitle(start) {
  return `Week ${C.isoWeek(start).week}`;
}

function tableBlock(inPeriod) {
  const t = C.tableStats(inPeriod);
  if (!t.sessions) return '';
  let line = 'No stop warning in this period yet.';
  if (t.advices && t.puntsAfter) {
    line = `After a stop warning you kept playing and lost another <strong>${money(t.lostAfter)}</strong> on ${plural(t.puntsAfter, 'punt', 'punts')}.`;
  } else if (t.advices) {
    line = `Followed ${t.followed} out of ${t.advices}. No punts after a stop warning.`;
  }
  return `
    <section class="block">
      <h2>At the table</h2>
      <div class="tiles">
        <div class="card tile"><h2>Sessions</h2><p>${t.sessions}</p></div>
        <div class="card tile"><h2>Hits</h2><p>${t.klaps}</p></div>
        <div class="card tile"><h2>Warnings</h2><p>${t.advices}</p></div>
      </div>
      <p class="readout">${line}</p>
    </section>`;
}

function overviewView() {
  const now = Date.now();
  const range = C.periodRange(ov.mode, ov.offset, now);
  const inPeriod = entries.filter((e) => C.inRange(e, range));
  const s = C.summarize(inPeriod);
  const first = firstSessionDay();

  let title = 'All time';
  let sub = first ? `since ${fmtShort.format(first)} ${first.getFullYear()}` : 'nothing logged yet';
  if (ov.mode === 'week') {
    title = weekTitle(range.start);
    sub = spanLabel(range.start, C.addDays(range.end, -1));
  } else if (ov.mode === 'month') {
    title = fmtMonth.format(range.start);
    sub = ov.offset === 0 ? 'this month' : '';
  }
  const canPrev = Boolean(range && first && range.start > first);
  const canNext = Boolean(range && ov.offset < 0);

  const seg = [['week', 'Week'], ['month', 'Month'], ['all', 'All']]
    .map(([k, label]) => `<button type="button" data-act="mode" data-val="${k}" aria-pressed="${ov.mode === k}">${label}</button>`)
    .join('');

  const maxReason = s.byReason.length ? s.byReason[0].cents : 1;
  const reasons = s.byReason.length
    ? `<ul class="reasons">${s.byReason.map((r, i) => `
        <li style="--i:${i}">
          <div class="row-line">
            <span>${C.labelOf(C.REASONS, r.reason)} <small>${r.count}×</small></span>
            <span class="num">${money(r.cents)} <small>${Math.round((r.cents / s.lost) * 100)}%</small></span>
          </div>
          <div class="meter"><span style="width:${Math.max((r.cents / maxReason) * 100, 1.5)}%"></span></div>
        </li>`).join('')}</ul>`
    : '<p class="empty">No punts in this period.</p>';

  const pros = inPeriod.filter((e) => e.type === 'pro').sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const proList = pros.length
    ? `<ul class="list">${pros.map((e) => `
        <li><a class="entry pro" href="#/edit/${encodeURIComponent(e.id)}" data-nav>
          <span class="when">${fmtShort.format(C.sessionDay(e.ts))}</span>
          <span class="body">
            <span class="title">${C.labelOf(C.KINDS, e.kind)}</span>
            ${e.note ? `<span class="note">${esc(e.note)}</span>` : ''}
          </span>
        </a></li>`).join('')}</ul>`
    : '<p class="empty">No pro plays in this period.</p>';

  return `
    <header class="top"><h1>Overview</h1></header>
    <div class="seg" role="group" aria-label="Period" style="--i:${ov.from}" data-i="${MODES.indexOf(ov.mode)}">${seg}</div>
    <div class="period">
      <button type="button" data-act="prev" aria-label="Previous period"${canPrev ? '' : ' disabled'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5 8 12l6.5 7"/></svg>
      </button>
      <div><strong>${title}</strong><span>${sub}</span></div>
      <button type="button" data-act="next" aria-label="Next period"${canNext ? '' : ' disabled'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5 16 12l-6.5 7"/></svg>
      </button>
    </div>

    <section class="card stat hero">
      <h2>Total lost</h2>
      <p class="amount${s.lost ? ' is-punt' : ''}" data-count="${s.lost}" data-key="ov-total">${money(s.lost)}</p>
    </section>
    <div class="tiles">
      <div class="card tile"><h2>Punts</h2><p>${s.punts}</p></div>
      <div class="card tile"><h2>Avg per punt</h2><p>${s.punts ? money(s.avg) : '–'}</p></div>
      <div class="card tile"><h2>Pro plays</h2><p>${s.pros}</p></div>
    </div>

    <section class="block">
      <h2>By reason</h2>
      ${reasons}
    </section>

    <section class="block">
      <h2>Lost per week <small>last 8 weeks</small></h2>
      ${weekChart(range, now)}
    </section>

    ${tableBlock(inPeriod)}

    <section class="block" id="pro-plays">
      <h2>Pro plays <small>${title.toLowerCase()}</small></h2>
      ${proList}
    </section>`;
}

function weekChart(range, now) {
  const thisWeek = C.weekStart(C.sessionDay(now));
  let last = thisWeek;
  if (range) {
    const w = C.weekStart(C.addDays(range.end, -1));
    if (w < thisWeek) last = w;
  }
  const weeks = C.weeklySeries(entries, last, 8);
  const max = Math.max(...weeks.map((w) => w.lost));
  const sel = ov.bar === null ? weeks.length - 1 : ov.bar;
  const cols = weeks.map((w, i) => {
    const inPeriod = !range || (w.start < range.end && w.end > range.start);
    const h = max ? Math.max((w.lost / max) * 100, w.lost ? 3 : 0) : 0;
    const label = `${weekTitle(w.start)}: ${money(w.lost)}, ${plural(w.punts, 'punt', 'punts')}`;
    return `
      <button type="button" class="col${inPeriod ? '' : ' dim'}" style="--i:${i}" data-act="bar" data-val="${i}"
        aria-pressed="${i === sel}" aria-label="${label}">
        <span class="val">${i === sel ? money(w.lost) : ''}</span>
        <span class="track"><span class="bar" style="height:${h}%"></span></span>
        <span class="x">${C.isoWeek(w.start).week}</span>
      </button>`;
  }).join('');
  const w = weeks[sel];
  return `
    <div class="chart" role="group" aria-label="Lost to punts per week">${cols}</div>
    <p class="readout">
      <strong>${weekTitle(w.start)}</strong> · ${spanLabel(w.start, C.addDays(w.end, -1))}:
      ${money(w.lost)} · ${plural(w.punts, 'punt', 'punts')}
    </p>`;
}

/* ---------- log ---------- */

function entryTitle(e) {
  if (e.type === 'punt') return `<b>${money(e.cents)}</b> ${C.labelOf(C.REASONS, e.reason)}`;
  if (e.type === 'pro') return `<b>Pro play</b> ${C.labelOf(C.KINDS, e.kind)}`;
  if (e.type === 'klap') return `<b>Hit</b> ${C.labelOf(C.SIZES, e.size)}`;
  return systemLabel(e);
}

function logView() {
  const groups = C.groupBySessionDay(entries);
  const days = groups.map((g) => {
    const s = C.summarize(g.entries);
    const meta = [
      s.punts ? `${money(s.lost)} · ${plural(s.punts, 'punt', 'punts')}` : '',
      s.pros ? `${s.pros} pro` : '',
      s.klaps ? plural(s.klaps, 'hit', 'hits') : '',
    ].filter(Boolean).join(' · ');
    const rows = g.entries.map((e) => `
      <li><a class="entry ${e.type}${SYSTEM.includes(e.type) ? ' sys' : ''}" href="#/edit/${encodeURIComponent(e.id)}" data-nav>
        <span class="when">${fmtTime.format(new Date(e.ts))}</span>
        <span class="body">
          <span class="title">${entryTitle(e)}</span>
          ${e.note ? `<span class="note">${esc(e.note)}</span>` : ''}
        </span>
        <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5 16 12l-6.5 7"/></svg>
      </a></li>`).join('');
    return `
      <section class="day">
        <header><h2>${dayLabel(g.day)}</h2><p>${meta}</p></header>
        <ul class="list">${rows}</ul>
      </section>`;
  }).join('');

  return `
    <header class="top"><h1>Log</h1></header>
    ${days || '<p class="empty big-empty">Nothing logged yet. Your first punt or pro play shows up here.</p>'}
    ${accountBlock()}
    <section class="block backup">
      <h2>Backup</h2>
      <p class="hint">${Cloud.ready() ? 'Your log is backed up to your account. You can still export a copy.' : 'Your data only lives on this device. Export a backup now and then.'}</p>
      <div class="pair">
        <button type="button" class="btn plain" data-act="export"${entries.length ? '' : ' disabled'}>Export JSON</button>
        <button type="button" class="btn plain" data-act="import">Import JSON</button>
      </div>
    </section>`;
}

async function exportData() {
  const payload = { app: 'poker-punt-tracker', version: 1, exported: new Date().toISOString(), settings, entries };
  const name = `punt-tracker-backup-${C.dayKey(new Date())}.json`;
  const file = new File([JSON.stringify(payload, null, 2)], name, { type: 'application/json' });
  // Op een telefoon is het deelmenu de betrouwbaarste weg naar Bestanden of iCloud.
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Punt Tracker backup' });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`Backup downloaded (${plural(entries.length, 'entry', 'entries')})`);
}

async function importData(file) {
  try {
    const data = C.parseBackup(await file.text());
    const before = { entries, settings };
    const merged = C.mergeEntries(entries, data.entries);
    entries = merged.entries;
    // Tafelregels uit de backup alleen overnemen op een leeg toestel.
    if (data.settings && !before.entries.length) settings = data.settings;
    if (!persist()) {
      ({ entries, settings } = before);
      return;
    }
    render();
    const parts = [`${merged.added} new`, `${merged.updated} updated`];
    if (data.skipped) parts.push(`${data.skipped} skipped`);
    toast(`Import done: ${parts.join(', ')}`, merged.added || merged.updated ? {
      label: 'Undo',
      run: () => {
        // Teruggezette versies krijgen een nieuwe wijzigingstijd, zodat ze ook op andere toestellen winnen.
        const now = Date.now();
        const after = new Map(entries.map((e) => [e.id, e]));
        entries = before.entries.map((e) => (after.get(e.id) === e ? e : { ...e, updated: now }));
        settings = before.settings;
        persist();
        render();
      },
    } : null);
  } catch (err) {
    toast(err.message || 'Import failed.');
  }
}

/* ---------- toast ---------- */

let toastTimer = 0;
let toastRun = null;

function toast(message, action) {
  clearTimeout(toastTimer);
  toastRun = action ? action.run : null;
  toastEl.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" data-act="toast-action">${esc(action.label)}</button>` : ''}`;
  const ms = action ? 8000 : 3500;
  toastEl.style.setProperty('--ms', `${ms}ms`);
  toastEl.hidden = true;
  void toastEl.offsetWidth; // herstart de animatie als er al een toast stond
  toastEl.hidden = false;
  toastTimer = setTimeout(hideToast, ms);
}

function hideToast() {
  clearTimeout(toastTimer);
  toastEl.hidden = true;
  toastEl.textContent = '';
  toastRun = null;
}

/* ---------- events ---------- */

const actions = {
  close: () => closeForm(draft && draft.mode === 'edit' ? '#/log' : '#/'),
  'pick-amount': (el) => {
    draft.cents = Number(el.dataset.val);
    draft.custom = '';
    render();
  },
  'pick-reason': (el) => {
    draft.reason = el.dataset.val;
    if (draft.mode === 'edit') return render();
    if (!draft.cents) {
      draft.reason = null;
      return amountError();
    }
    return addEntry('punt', { cents: draft.cents, reason: draft.reason, note: draft.note.trim() });
  },
  'pick-kind': (el) => {
    draft.kind = el.dataset.val;
    render();
  },
  'pick-size': (el) => {
    draft.size = el.dataset.val;
    if (draft.mode === 'edit') return render();
    return addEntry('klap', { size: draft.size, note: draft.note.trim() });
  },
  'set-rule': (el) => {
    const val = el.dataset.val;
    settings = C.cleanSettings({ ...settings, [el.dataset.key]: /^\d+$/.test(val) ? Number(val) : val });
    persist();
    render();
  },
  save: saveForm,
  delete: deleteDraft,
  'start-session': startSession,
  'stop-session': endSession,
  leave: endSession,
  pause: startPause,
  'alarm-close': closeAlarm,
  'cheer-close': closeCheer,
  'acc-mode': (el) => {
    Object.assign(acc, { mode: el.dataset.val, error: '', notice: '' });
    render();
  },
  'acc-submit': submitAccount,
  'acc-claim': claimDevice,
  'acc-cancel': () => {
    Cloud.abandon();
    render();
  },
  'acc-sync': () => Cloud.sync(),
  'acc-signout': signOutFlow,
  'acc-delete': deleteFlow,
  mode: (el) => {
    Object.assign(ov, { from: MODES.indexOf(ov.mode), mode: el.dataset.val, offset: 0, bar: null });
    render(true);
    ov.from = MODES.indexOf(ov.mode);
  },
  prev: () => {
    ov.offset -= 1;
    ov.bar = null;
    render(true);
  },
  next: () => {
    ov.offset = Math.min(ov.offset + 1, 0);
    ov.bar = null;
    render(true);
  },
  bar: (el) => {
    ov.bar = Number(el.dataset.val);
    render();
    FX.buzz(8);
  },
  export: exportData,
  import: () => importInput.click(),
  'toast-action': () => {
    const run = toastRun;
    hideToast();
    if (run) run();
  },
};

document.addEventListener('click', (e) => {
  if (e.target.closest('a[data-nav]')) {
    cameFromApp = true;
    if (route().name === 'log') logScroll = window.scrollY;
  }
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled && actions[el.dataset.act]) actions[el.dataset.act](el);
});

view.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'message') {
    settings = C.cleanSettings({ ...settings, message: t.value });
    persist();
    autoGrow(t);
    return;
  }
  if (!draft) return;
  if (t.id === 'custom') {
    draft.custom = t.value;
    draft.cents = C.parseAmount(t.value);
    for (const c of view.querySelectorAll('[data-act="pick-amount"]')) c.setAttribute('aria-pressed', 'false');
    document.getElementById('amount-error').hidden = true;
  } else if (t.id === 'note') {
    draft.note = t.value;
    autoGrow(t);
  } else if (t.id === 'when') {
    draft.when = t.value;
  }
});

view.addEventListener('submit', (e) => e.preventDefault());
view.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'custom') {
    e.preventDefault();
    e.target.blur();
  }
  if (e.key === 'Enter' && (e.target.id === 'acc-email' || e.target.id === 'acc-pass')) {
    e.preventDefault();
    submitAccount();
  }
});

// Ingedrukt houden: bewust een drempel om tegen een stopadvies in te gaan.
const HOLD_MS = 2500;
let holdTimer = 0;

function endHold() {
  clearTimeout(holdTimer);
  const btn = alarmEl.querySelector('.hold.holding');
  if (btn) btn.classList.remove('holding');
}

alarmEl.addEventListener('pointerdown', (e) => {
  const btn = e.target.closest('[data-hold]');
  if (!btn) return;
  btn.style.setProperty('--hold', `${HOLD_MS}ms`);
  btn.classList.add('holding');
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    endHold();
    ignoreAdvice();
  }, HOLD_MS);
});
for (const type of ['pointerup', 'pointerleave', 'pointercancel']) alarmEl.addEventListener(type, endHold);
alarmEl.addEventListener('contextmenu', (e) => e.preventDefault());

importInput.addEventListener('change', () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (file) importData(file);
});

window.addEventListener('hashchange', onRoute);
window.addEventListener('storage', (e) => {
  if (e.key !== STORE_KEY) return;
  ({ entries, settings } = load());
  if (!draft) render();
});

const onHome = () => route().name === 'home' && !draft;

document.addEventListener('visibilitychange', () => {
  // Bij terugkomst opnieuw tekenen: de dag, de week of de meter kan intussen zijn veranderd.
  if (document.visibilityState !== 'visible') return;
  if (!draft && !['rules', 'account'].includes(route().name)) render();
  if (onHome()) checkTable();
  Cloud.sync();
});

// Synchroniseren zodra er weer verbinding is, en af en toe zolang de app open staat.
window.addEventListener('online', () => Cloud.sync());
setInterval(() => {
  if (document.visibilityState === 'visible') Cloud.sync();
}, 60000);
Cloud.onStatus(() => {
  for (const el of view.querySelectorAll('[data-sync]')) el.textContent = syncLine();
  if (route().name === 'account' && !acc.busy) render();
});

// Tijdens een sessie loopt de klok mee, en kan de maximale duur een advies geven.
setInterval(() => {
  if (document.visibilityState !== 'visible' || !onHome() || !table().active) return;
  refreshTable();
  if (!alarm) checkTable();
}, 20000);

onRoute();
Cloud.sync();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
