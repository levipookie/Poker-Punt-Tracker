import * as C from './core.js';

const STORE_KEY = 'ppt.v1';
const view = document.getElementById('view');
const toastEl = document.getElementById('toast');
const importInput = document.getElementById('import-file');

let entries = loadEntries();
let draft = null; // het formulier dat open staat
let cameFromApp = false; // true als het formulier via een tik in de app is geopend
let logScroll = 0;
const ov = { mode: 'week', offset: 0, bar: null };

/* ---------- opslag ---------- */

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? C.parseBackup(raw).entries : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, entries }));
    return true;
  } catch {
    toast('Opslaan mislukt: de opslag van dit toestel is vol of geblokkeerd.');
    return false;
  }
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ---------- weergavehulpjes ---------- */

const eur0 = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
const money = (cents) => (cents % 100 === 0 ? eur0 : eur2).format(cents / 100);

const fmtDay = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDayYear = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' });
const fmtMonth = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' });

const thisYear = () => C.sessionDay(Date.now()).getFullYear();
const dayLabel = (day) => (day.getFullYear() === thisYear() ? fmtDay : fmtDayYear).format(day);
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
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ',');
}

/* ---------- routing ---------- */

function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (['punt', 'pro', 'overzicht', 'log'].includes(name)) return { name };
  if (name === 'bewerk') return { name, id: decodeURIComponent(arg || '') };
  return { name: 'home' };
}

function onRoute() {
  const r = route();
  draft = null;
  if (r.name === 'punt') {
    draft = { mode: 'new', type: 'punt', cents: null, custom: '', reason: null, note: '' };
  } else if (r.name === 'pro') {
    draft = { mode: 'new', type: 'pro', kind: null, note: '' };
  } else if (r.name === 'bewerk') {
    const e = entries.find((x) => x.id === r.id);
    if (!e) {
      location.replace('#/log');
      return;
    }
    draft = { ...e, mode: 'edit', when: toLocalInput(e.ts) };
    if (e.type === 'punt') draft.custom = C.QUICK_AMOUNTS.includes(e.cents) ? '' : plainAmount(e.cents);
  }
  render();
  window.scrollTo(0, r.name === 'log' ? logScroll : 0);
}

function closeForm(fallback = '#/') {
  if (cameFromApp) {
    cameFromApp = false;
    history.back();
  } else {
    location.replace(fallback);
  }
}

function render() {
  const r = route();
  document.body.classList.toggle('is-form', Boolean(draft));
  for (const a of document.querySelectorAll('.tabbar a')) {
    if (a.dataset.tab === r.name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (draft) view.innerHTML = draft.type === 'punt' ? puntForm() : proForm();
  else if (r.name === 'overzicht') view.innerHTML = overviewView();
  else if (r.name === 'log') view.innerHTML = logView();
  else view.innerHTML = homeView();
  const note = view.querySelector('textarea');
  if (note) autoGrow(note);
}

/* ---------- home ---------- */

function homeView() {
  const now = Date.now();
  const card = (title, mode) => {
    const range = C.periodRange(mode, 0, now);
    const s = C.summarize(entries.filter((e) => C.inRange(e, range)));
    return `
      <section class="card stat">
        <h2>${title}</h2>
        <p class="amount${s.lost ? ' is-punt' : ''}">${money(s.lost)}</p>
        <p class="sub">verloren aan punts</p>
        <ul class="counts">
          <li><span class="dot punt"></span>${plural(s.punts, 'punt', 'punts')}</li>
          <li><span class="dot pro"></span>${plural(s.pros, 'pro play', 'pro plays')}</li>
        </ul>
      </section>`;
  };
  return `
    <div class="home">
      <header class="top">
        <h1>Punt Tracker</h1>
        <p>${dayLabel(C.sessionDay(now))}</p>
      </header>
      <div class="stats">
        ${card('Deze week', 'week')}
        ${card('Deze maand', 'maand')}
      </div>
      <div class="actions">
        <a class="big punt" href="#/punt" data-nav>
          <strong>Punt</strong>
          <span>Slechte play</span>
        </a>
        <a class="big pro" href="#/pro" data-nav>
          <strong>Pro play</strong>
          <span>Sterke +EV play</span>
        </a>
      </div>
    </div>`;
}

/* ---------- formulieren ---------- */

function formHead(title) {
  return `
    <header class="formhead">
      <button type="button" class="back" data-act="close" aria-label="Terug">
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
      <label class="legend" for="when">Tijdstip</label>
      <input class="input" id="when" type="datetime-local" value="${esc(draft.when)}">
    </div>`;
}

function editButtons(tone) {
  return `
    <p class="error" id="form-error" hidden></p>
    <button type="button" class="btn ${tone}" data-act="save">Opslaan</button>
    <button type="button" class="btn ghost" data-act="delete">Verwijderen</button>`;
}

function puntForm() {
  const d = draft;
  const edit = d.mode === 'edit';
  const amount = `
    <div class="field" id="f-amount">
      <p class="legend">Bedrag</p>
      <div class="chips four">
        ${C.QUICK_AMOUNTS.map((c) => chip('pick-amount', c, money(c), !d.custom && d.cents === c, 'punt')).join('')}
      </div>
      <label class="money">
        <span>€</span>
        <input id="custom" inputmode="decimal" autocomplete="off" enterkeyhint="done"
          placeholder="Ander bedrag" aria-label="Ander bedrag in euro" value="${esc(d.custom)}">
      </label>
      <p class="hint">Wat de fout kostte op het moment van de beslissing, los van hoe de hand afliep.</p>
      <p class="error" id="amount-error" hidden>Kies eerst een bedrag.</p>
    </div>`;
  const note = `
    <div class="field">
      <label class="legend" for="note">Notitie <small>optioneel</small></label>
      <textarea class="input" id="note" rows="1" placeholder="Wat gebeurde er?">${esc(d.note)}</textarea>
    </div>`;
  const reason = `
    <div class="field">
      <p class="legend">Reden${edit ? '' : ' <small>tik om op te slaan</small>'}</p>
      <div class="chips two">
        ${C.REASONS.map(([k, label]) => chip('pick-reason', k, label, d.reason === k, 'punt')).join('')}
      </div>
    </div>`;
  return `
    ${formHead(edit ? 'Punt bewerken' : 'Punt loggen')}
    <form class="form" novalidate>
      ${edit ? amount + reason + note + whenField() + editButtons('punt') : amount + note + reason}
    </form>`;
}

function proForm() {
  const d = draft;
  const edit = d.mode === 'edit';
  return `
    ${formHead(edit ? 'Pro play bewerken' : 'Pro play loggen')}
    <form class="form" novalidate>
      <div class="field">
        <p class="legend">Type</p>
        <div class="chips two">
          ${C.KINDS.map(([k, label]) => chip('pick-kind', k, label, d.kind === k, 'pro')).join('')}
        </div>
      </div>
      <div class="field">
        <label class="legend" for="note">Notitie</label>
        <textarea class="input" id="note" rows="4" placeholder="Wat deed je, en waarom?">${esc(d.note)}</textarea>
      </div>
      ${edit ? whenField() + editButtons('pro') : `
        <p class="error" id="form-error" hidden></p>
        <button type="button" class="btn pro" data-act="save">Pro play opslaan</button>`}
    </form>`;
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

function describe(e) {
  return e.type === 'punt'
    ? `${money(e.cents)} · ${C.labelOf(C.REASONS, e.reason)}`
    : C.labelOf(C.KINDS, e.kind);
}

function addEntry(fields) {
  const now = Date.now();
  const entry = { id: newId(), ts: new Date(now).toISOString(), updated: now, ...fields };
  entries.push(entry);
  if (!persist()) {
    entries.pop();
    return;
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  closeForm('#/');
  toast(`${entry.type === 'punt' ? 'Punt' : 'Pro play'} gelogd: ${describe(entry)}`, {
    label: 'Ongedaan maken',
    run: () => removeEntry(entry.id),
  });
}

function removeEntry(id) {
  const i = entries.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const [gone] = entries.splice(i, 1);
  persist();
  render();
  return gone;
}

function saveForm() {
  const d = draft;
  if (d.type === 'punt' && !d.cents) return amountError();
  if (d.type === 'punt' && !d.reason) return formError('Kies een reden.');
  if (d.type === 'pro' && !d.kind) return formError('Kies een type.');
  const note = d.note.trim();
  if (d.mode === 'new') return addEntry({ type: 'pro', kind: d.kind, note });

  const when = new Date(d.when);
  if (!d.when || Number.isNaN(when.getTime())) return formError('Vul een geldig tijdstip in.');
  const i = entries.findIndex((e) => e.id === d.id);
  if (i < 0) return closeForm('#/log');
  const before = entries[i];
  // Seconden behouden als het tijdstip niet is aangepast, zodat de volgorde gelijk blijft.
  const ts = d.when === toLocalInput(before.ts) ? before.ts : when.toISOString();
  const next = { id: before.id, type: before.type, ts, note, updated: Date.now() };
  if (before.type === 'punt') Object.assign(next, { cents: d.cents, reason: d.reason });
  else next.kind = d.kind;
  entries[i] = next;
  if (!persist()) {
    entries[i] = before;
    return undefined;
  }
  closeForm('#/log');
  return toast('Wijziging opgeslagen');
}

function deleteDraft() {
  const gone = removeEntry(draft.id);
  closeForm('#/log');
  if (!gone) return;
  toast(`${gone.type === 'punt' ? 'Punt' : 'Pro play'} verwijderd`, {
    label: 'Ongedaan maken',
    run: () => {
      if (entries.some((e) => e.id === gone.id)) return;
      entries.push(gone);
      persist();
      render();
    },
  });
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

function overviewView() {
  const now = Date.now();
  const range = C.periodRange(ov.mode, ov.offset, now);
  const inPeriod = entries.filter((e) => C.inRange(e, range));
  const s = C.summarize(inPeriod);
  const first = firstSessionDay();

  let title = 'Alles';
  let sub = first ? `sinds ${fmtShort.format(first)} ${first.getFullYear()}` : 'nog niets gelogd';
  if (ov.mode === 'week') {
    title = weekTitle(range.start);
    sub = spanLabel(range.start, C.addDays(range.end, -1));
  } else if (ov.mode === 'maand') {
    title = fmtMonth.format(range.start);
    sub = ov.offset === 0 ? 'deze maand' : '';
  }
  const canPrev = Boolean(range && first && range.start > first);
  const canNext = Boolean(range && ov.offset < 0);

  const seg = [['week', 'Week'], ['maand', 'Maand'], ['alles', 'Alles']]
    .map(([k, label]) => `<button type="button" data-act="mode" data-val="${k}" aria-pressed="${ov.mode === k}">${label}</button>`)
    .join('');

  const maxReason = s.byReason.length ? s.byReason[0].cents : 1;
  const reasons = s.byReason.length
    ? `<ul class="reasons">${s.byReason.map((r) => `
        <li>
          <div class="row-line">
            <span>${C.labelOf(C.REASONS, r.reason)} <small>${r.count}×</small></span>
            <span class="num">${money(r.cents)} <small>${Math.round((r.cents / s.lost) * 100)}%</small></span>
          </div>
          <div class="meter"><span style="width:${Math.max((r.cents / maxReason) * 100, 1.5)}%"></span></div>
        </li>`).join('')}</ul>`
    : '<p class="empty">Geen punts in deze periode.</p>';

  const pros = inPeriod.filter((e) => e.type === 'pro').sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const proList = pros.length
    ? `<ul class="list">${pros.map((e) => `
        <li><a class="entry pro" href="#/bewerk/${encodeURIComponent(e.id)}" data-nav>
          <span class="when">${fmtShort.format(C.sessionDay(e.ts))}</span>
          <span class="body">
            <span class="title">${C.labelOf(C.KINDS, e.kind)}</span>
            ${e.note ? `<span class="note">${esc(e.note)}</span>` : ''}
          </span>
        </a></li>`).join('')}</ul>`
    : '<p class="empty">Geen pro plays in deze periode.</p>';

  return `
    <header class="top"><h1>Overzicht</h1></header>
    <div class="seg" role="group" aria-label="Periode">${seg}</div>
    <div class="period">
      <button type="button" data-act="prev" aria-label="Vorige periode"${canPrev ? '' : ' disabled'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5 8 12l6.5 7"/></svg>
      </button>
      <div><strong>${title}</strong><span>${sub}</span></div>
      <button type="button" data-act="next" aria-label="Volgende periode"${canNext ? '' : ' disabled'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5 16 12l-6.5 7"/></svg>
      </button>
    </div>

    <section class="card stat hero">
      <h2>Totaal verloren</h2>
      <p class="amount${s.lost ? ' is-punt' : ''}">${money(s.lost)}</p>
    </section>
    <div class="tiles">
      <div class="card tile"><h2>Punts</h2><p>${s.punts}</p></div>
      <div class="card tile"><h2>Gem. per punt</h2><p>${s.punts ? money(s.avg) : '–'}</p></div>
      <div class="card tile"><h2>Pro plays</h2><p>${s.pros}</p></div>
    </div>

    <section class="block">
      <h2>Per reden</h2>
      ${reasons}
    </section>

    <section class="block">
      <h2>Verloren per week <small>laatste 8 weken</small></h2>
      ${weekChart(range, now)}
    </section>

    <section class="block">
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
      <button type="button" class="col${inPeriod ? '' : ' dim'}" data-act="bar" data-val="${i}"
        aria-pressed="${i === sel}" aria-label="${label}">
        <span class="val">${i === sel ? money(w.lost) : ''}</span>
        <span class="track"><span class="bar" style="height:${h}%"></span></span>
        <span class="x">${C.isoWeek(w.start).week}</span>
      </button>`;
  }).join('');
  const w = weeks[sel];
  return `
    <div class="chart" role="group" aria-label="Verloren aan punts per week">${cols}</div>
    <p class="readout">
      <strong>${weekTitle(w.start)}</strong> · ${spanLabel(w.start, C.addDays(w.end, -1))}:
      ${money(w.lost)} · ${plural(w.punts, 'punt', 'punts')}
    </p>`;
}

/* ---------- log ---------- */

function logView() {
  const groups = C.groupBySessionDay(entries);
  const days = groups.map((g) => {
    const s = C.summarize(g.entries);
    const meta = [s.punts ? `${money(s.lost)} · ${plural(s.punts, 'punt', 'punts')}` : '', s.pros ? plural(s.pros, 'pro play', 'pro plays') : '']
      .filter(Boolean).join(' · ');
    const rows = g.entries.map((e) => `
      <li><a class="entry ${e.type}" href="#/bewerk/${encodeURIComponent(e.id)}" data-nav>
        <span class="when">${fmtTime.format(new Date(e.ts))}</span>
        <span class="body">
          <span class="title">${e.type === 'punt'
            ? `<b>${money(e.cents)}</b> ${C.labelOf(C.REASONS, e.reason)}`
            : `<b>Pro play</b> ${C.labelOf(C.KINDS, e.kind)}`}</span>
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
    ${days || '<p class="empty big-empty">Nog niets gelogd. Je eerste punt of pro play verschijnt hier.</p>'}
    <section class="block backup">
      <h2>Backup</h2>
      <p class="hint">Je data staat alleen op dit toestel. Exporteer af en toe een backup.</p>
      <div class="pair">
        <button type="button" class="btn plain" data-act="export"${entries.length ? '' : ' disabled'}>Exporteer JSON</button>
        <button type="button" class="btn plain" data-act="import">Importeer JSON</button>
      </div>
    </section>`;
}

async function exportData() {
  const payload = { app: 'poker-punt-tracker', version: 1, exported: new Date().toISOString(), entries };
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
  toast(`Backup gedownload (${plural(entries.length, 'entry', 'entries')})`);
}

async function importData(file) {
  try {
    const { entries: incoming, skipped } = C.parseBackup(await file.text());
    const before = entries;
    const merged = C.mergeEntries(entries, incoming);
    entries = merged.entries;
    if (!persist()) {
      entries = before;
      return;
    }
    render();
    const parts = [`${merged.added} nieuw`, `${merged.updated} bijgewerkt`];
    if (skipped) parts.push(`${skipped} overgeslagen`);
    toast(`Import klaar: ${parts.join(', ')}`, merged.added || merged.updated ? {
      label: 'Ongedaan maken',
      run: () => {
        entries = before;
        persist();
        render();
      },
    } : null);
  } catch (err) {
    toast(err.message || 'Importeren mislukt.');
  }
}

/* ---------- toast ---------- */

let toastTimer = 0;
let toastRun = null;

function toast(message, action) {
  clearTimeout(toastTimer);
  toastRun = action ? action.run : null;
  toastEl.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" data-act="toast-action">${esc(action.label)}</button>` : ''}`;
  toastEl.hidden = false;
  toastTimer = setTimeout(hideToast, action ? 8000 : 3000);
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
    return addEntry({ type: 'punt', cents: draft.cents, reason: draft.reason, note: draft.note.trim() });
  },
  'pick-kind': (el) => {
    draft.kind = el.dataset.val;
    render();
  },
  save: saveForm,
  delete: deleteDraft,
  mode: (el) => {
    Object.assign(ov, { mode: el.dataset.val, offset: 0, bar: null });
    render();
  },
  prev: () => {
    ov.offset -= 1;
    ov.bar = null;
    render();
  },
  next: () => {
    ov.offset = Math.min(ov.offset + 1, 0);
    ov.bar = null;
    render();
  },
  bar: (el) => {
    ov.bar = Number(el.dataset.val);
    render();
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
  if (!draft) return;
  const t = e.target;
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
});

importInput.addEventListener('change', () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (file) importData(file);
});

window.addEventListener('hashchange', onRoute);
window.addEventListener('storage', (e) => {
  if (e.key !== STORE_KEY) return;
  entries = loadEntries();
  if (!draft) render();
});
document.addEventListener('visibilitychange', () => {
  // Bij terugkomst opnieuw tekenen: de dag of week kan intussen zijn omgeslagen.
  if (document.visibilityState === 'visible' && !draft) render();
});

onRoute();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
