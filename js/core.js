// Pure rekenlogica: geen DOM, geen opslag. Bedragen altijd in centen.
// De interface is Engels; de sleutels in de opgeslagen data (tilt, moe, klap, ...) blijven
// Nederlands, zodat bestaande data en oude backups gewoon blijven werken.

export const REASONS = [
  ['tilt', 'Tilt'],
  ['verveeld', 'Bored'],
  ['moe', 'Tired'],
  ['ego', 'Ego'],
  ['fancy', 'Fancy play'],
  ['nieuwsgierig', 'Curious'],
  ['anders', 'Other'],
];

// Een pro play is een sterke mental-game-beslissing, geen pokertechniek. Bewust maar vier:
// de beslissingen die een sessie redden. De rest kan in de notitie.
export const KINDS = [
  ['hero-fold', 'Folded when beat'],
  ['no-fancy', 'Skipped fancy play'],
  ['reset', 'Reset after a beat'],
  ['discipline', 'Quit on time'],
];

// Soorten uit eerdere versies: ze blijven leesbaar in het log, maar je kiest ze niet meer.
const OLD_KINDS = [
  ['patient', 'Stayed patient'],
  ['stakes', 'Stuck to my stakes'],
  ['break', 'Took a break'],
  ['anders', 'Other'],
  ['hero-call', 'Hero call'],
  ['thin-value', 'Thin value'],
  ['bluff', 'Bluff'],
  ['exploit', 'Exploit'],
];
const ALL_KINDS = [...KINDS, ...OLD_KINDS];
export const kindLabel = (kind) => labelOf(ALL_KINDS, kind);
export const isOldKind = (kind) => OLD_KINDS.some(([k]) => k === kind);

// Een klap is een bad beat of cooler: goed gespeeld en toch verloren.
export const SIZES = [
  ['pot', 'Pot lost'],
  ['stack', 'Stack lost'],
];


// Een sessiedag loopt tot 06:00: alles daarvoor telt bij de vorige kalenderdag.
export const DAY_START_HOUR = 6;

export function labelOf(list, key) {
  const hit = list.find(([k]) => k === key);
  return hit ? hit[1] : 'Other';
}

export function sessionDay(ts) {
  const d = new Date(ts);
  const shift = d.getHours() < DAY_START_HOUR ? 1 : 0;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - shift);
}

export function addDays(day, n) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + n);
}

// Week begint op maandag.
export function weekStart(day) {
  return addDays(day, -((day.getDay() + 6) % 7));
}

export function isoWeek(day) {
  const thursday = addDays(day, 3 - ((day.getDay() + 6) % 7));
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  const firstThursday = addDays(jan4, 3 - ((jan4.getDay() + 6) % 7));
  const week = 1 + Math.round((thursday - firstThursday) / (7 * 864e5));
  return { week, year: thursday.getFullYear() };
}

export function dayKey(day) {
  const p = (n) => String(n).padStart(2, '0');
  return `${day.getFullYear()}-${p(day.getMonth() + 1)}-${p(day.getDate())}`;
}

// mode: 'week' | 'month' | 'all'. offset 0 = huidige periode, -1 = vorige, enz.
// Geeft { start, end } terug (end exclusief), of null voor 'all'.
export function periodRange(mode, offset, now) {
  const today = sessionDay(now);
  if (mode === 'week') {
    const start = addDays(weekStart(today), 7 * offset);
    return { start, end: addDays(start, 7) };
  }
  if (mode === 'month') {
    return {
      start: new Date(today.getFullYear(), today.getMonth() + offset, 1),
      end: new Date(today.getFullYear(), today.getMonth() + offset + 1, 1),
    };
  }
  return null;
}

export function inRange(entry, range) {
  if (!range) return true;
  const day = sessionDay(entry.ts);
  return day >= range.start && day < range.end;
}

export function summarize(entries) {
  let lost = 0;
  let punts = 0;
  let pros = 0;
  let klaps = 0;
  const reasons = new Map();
  for (const e of entries) {
    if (e.type === 'pro') pros += 1;
    if (e.type === 'klap') klaps += 1;
    if (e.type !== 'punt') continue;
    punts += 1;
    lost += e.cents;
    const r = reasons.get(e.reason) || { reason: e.reason, cents: 0, count: 0 };
    r.cents += e.cents;
    r.count += 1;
    reasons.set(e.reason, r);
  }
  const byReason = [...reasons.values()].sort((a, b) => b.cents - a.cents || b.count - a.count);
  return { lost, punts, pros, klaps, avg: punts ? Math.round(lost / punts) : 0, byReason };
}

// n weken, oplopend, eindigend met de week die op lastWeekStart begint.
export function weeklySeries(entries, lastWeekStart, n = 8) {
  const weeks = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const start = addDays(lastWeekStart, -7 * i);
    weeks.push({ start, end: addDays(start, 7), lost: 0, punts: 0 });
  }
  for (const e of entries) {
    if (e.type !== 'punt') continue;
    const day = sessionDay(e.ts);
    const w = weeks.find((x) => day >= x.start && day < x.end);
    if (w) {
      w.lost += e.cents;
      w.punts += 1;
    }
  }
  return weeks;
}

// Entries per sessiedag, nieuwste dag en nieuwste entry eerst.
export function groupBySessionDay(entries) {
  const sorted = [...entries].sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const groups = [];
  for (const e of sorted) {
    const day = sessionDay(e.ts);
    const key = dayKey(day);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, day, entries: [] };
      groups.push(g);
    }
    g.entries.push(e);
  }
  return groups;
}

// "50", "12,50", "€ 1.250" -> centen. Ongeldig of <= 0 -> null.
export function parseAmount(input) {
  let s = String(input).replace(/[€\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return cents > 0 && cents < 1e11 ? cents : null;
}

export function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const time = new Date(raw.ts);
  if (typeof raw.id !== 'string' || !raw.id || Number.isNaN(time.getTime())) return null;
  const base = {
    id: raw.id,
    ts: time.toISOString(),
    note: typeof raw.note === 'string' ? raw.note : '',
    updated: Number.isFinite(raw.updated) ? raw.updated : 0,
  };
  if (raw.type === 'punt') {
    if (!Number.isInteger(raw.cents) || raw.cents <= 0) return null;
    const reason = REASONS.some(([k]) => k === raw.reason) ? raw.reason : 'anders';
    return { ...base, type: 'punt', cents: raw.cents, reason };
  }
  if (raw.type === 'pro') {
    const kind = ALL_KINDS.some(([k]) => k === raw.kind) ? raw.kind : 'anders';
    return { ...base, type: 'pro', kind };
  }
  if (raw.type === 'klap') return { ...base, type: 'klap', size: raw.size === 'stack' ? 'stack' : 'pot' };
  if (raw.type === 'stop') return { ...base, type: 'stop', advice: raw.advice === true };
  if (raw.type === 'stopadvies') {
    const advice = { ...base, type: 'stopadvies' };
    if (typeof raw.cause === 'string') advice.cause = raw.cause;
    if (raw.ignored === true) advice.ignored = true; // bewust doorgespeeld tegen het advies in
    return advice;
  }
  if (raw.type === 'start' || raw.type === 'pauze') return { ...base, type: raw.type };
  return null;
}

// Leest een backup. Gooit een Error als het geen backup van deze app is.
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not a valid JSON file.');
  }
  const list = Array.isArray(data) ? data : data && data.entries;
  if (!Array.isArray(list)) throw new Error("This isn't a Punt Tracker backup.");
  const entries = list.map(cleanEntry).filter(Boolean);
  const settings = !Array.isArray(data) && data.settings ? cleanSettings(data.settings) : null;
  return { entries, skipped: list.length - entries.length, settings };
}

// Voegt samen op id; bij een dubbele id wint de laatst bewerkte versie.
export function mergeEntries(current, incoming) {
  const byId = new Map(current.map((e) => [e.id, e]));
  let added = 0;
  let updated = 0;
  for (const e of incoming) {
    const mine = byId.get(e.id);
    if (!mine) {
      byId.set(e.id, e);
      added += 1;
    } else if ((e.updated || 0) > (mine.updated || 0)) {
      byId.set(e.id, e);
      updated += 1;
    }
  }
  return { entries: [...byId.values()], added, updated };
}

/* ---------- tafel: sessies en tiltmeter ---------- */

// De tafelregels. Je stelt ze in met een helder hoofd; aan tafel beslist de app.
export const DEFAULT_SETTINGS = {
  stopLoss: 3, // zoveel stacks kwijt in één sessie = stop (0 = uit)
  maxHours: 0, // harde grens aan de sessieduur in uren (0 = uit; lang spelen is op zich geen probleem)
  buyIn: 20000, // je gebruikelijke buy-in in centen: daaraan meet de meter hoe zwaar een punt is
  sens: 'normaal', // 'streng' | 'normaal' | 'los'
  message: "You're not playing your own game anymore, even if it doesn't feel that way. Normally you just fold when you're beat. Get up.",
};

export const BUY_INS = [5000, 10000, 20000, 50000, 100000];
export const MAX_HOURS = [0, 6, 8, 10];
const QUICK = { 5000: [500, 1000, 2500, 5000], 10000: [1000, 2500, 5000, 10000], 20000: [2000, 5000, 10000, 20000], 50000: [5000, 10000, 25000, 50000], 100000: [10000, 25000, 50000, 100000] };
// Snelknoppen voor het bedrag van een punt, passend bij je buy-in.
export const quickAmounts = (buyIn) => QUICK[buyIn] || QUICK[20000];

// Het standaardbericht van de eerdere Nederlandse versie; wie dat nooit aanpaste krijgt het Engelse.
const OLD_DEFAULT_MESSAGE = 'Je speelt nu niet meer je eigen spel, ook al voelt het niet zo. Normaal fold je gewoon als je beat bent. Sta op.';

export function cleanSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  if ([0, 2, 3, 4].includes(raw.stopLoss)) s.stopLoss = raw.stopLoss;
  if ([...MAX_HOURS, 4].includes(raw.maxHours)) s.maxHours = raw.maxHours;
  if (BUY_INS.includes(raw.buyIn)) s.buyIn = raw.buyIn;
  if (['streng', 'normaal', 'los'].includes(raw.sens)) s.sens = raw.sens;
  if (typeof raw.message === 'string' && raw.message !== OLD_DEFAULT_MESSAGE) s.message = raw.message.slice(0, 400);
  return s;
}

/* Tiltmeter.
 *
 * Elke gebeurtenis krijgt een gewicht dat langzaam wegzakt (halfwaardetijd 2,5 uur):
 * - Een klap: een pot kwijt weegt minder dan een stack.
 * - Een punt: naar wat hij kostte, gemeten aan je buy-in, en naar de reden (tilt en ego
 *   wegen zwaarder dan verveling). Zwaarder als hij vlak na een klap of punt kwam (doorstomen),
 *   en elke volgende punt in korte tijd weegt iets meer.
 * - Een pauze en een mental-game-pro-play halen de meter juist iets omlaag.
 * Lang spelen is op zich geen probleem: pas na vier uur zonder pauze loopt de meter wat op.
 * Vanaf ORANGE adviseert de app een pauze, vanaf RED stoppen. Gevoeligheid schaalt die grenzen.
 */
export const ORANGE = 50;
export const RED = 100;
export const PAUSE_MINUTES = 10;
const HALF_LIFE_MS = 150 * 60000;
const STEAM_MS = 45 * 60000; // een punt binnen 45 minuten na een klap of punt: doorstomen
const REPEAT_MS = 3 * 3600000;
const SENS = { streng: 0.8, normaal: 1, los: 1.25 };
const REASON_WEIGHT = { tilt: 1.5, ego: 1.4, fancy: 1.2, moe: 1, verveeld: 1, nieuwsgierig: 0.9, anders: 1 };
const MENTAL_WINS = ['hero-fold', 'no-fancy', 'reset'];
const at = (e) => Date.parse(e.ts);

// Het gewicht van elke gebeurtenis van de dag, in volgorde, met wat ervoor gebeurde als context.
function weigh(dayEntries, settings) {
  const buyIn = settings.buyIn || DEFAULT_SETTINGS.buyIn;
  const out = [];
  const seen = [];
  for (const e of dayEntries) {
    let pts = 0;
    let steaming = false;
    if (e.type === 'klap') {
      pts = e.size === 'stack' ? 38 : 22;
    } else if (e.type === 'punt') {
      const size = Math.min(e.cents / buyIn, 2);
      pts = (10 + 45 * size) * (REASON_WEIGHT[e.reason] || 1);
      steaming = seen.some((x) => (x.type === 'klap' || x.type === 'punt') && at(e) - at(x) <= STEAM_MS);
      if (steaming) pts *= 1.25;
      const before = seen.filter((x) => x.type === 'punt' && at(e) - at(x) <= REPEAT_MS).length;
      pts *= Math.min(1 + 0.15 * before, 1.6);
    } else if (e.type === 'pauze') {
      pts = -15;
    } else if (e.type === 'pro' && MENTAL_WINS.includes(e.kind)) {
      pts = -8;
    }
    if (pts) out.push({ e, pts, steaming });
    seen.push(e);
  }
  return out;
}

const decayed = (w, t) => w.pts * 0.5 ** ((t - at(w.e)) / HALF_LIFE_MS);

export function duration(minutes) {
  const h = Math.floor(minutes / 60);
  return h ? `${h}h${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;
}

const euro = (cents) => `€${(cents / 100).toLocaleString('en-IE', { maximumFractionDigits: 2 })}`;
const REASON_TEXT = { tilt: 'out of tilt', ego: 'out of ego', fancy: 'a fancy play', moe: 'while tired', verveeld: 'out of boredom', nieuwsgierig: 'out of curiosity', anders: '' };

// Knipt de entries van één sessiedag (oplopend gesorteerd) in sessies.
// Een klap start vanzelf een sessie: die log je alleen aan tafel. Een punt doet dat ook,
// behalve als je die dag al een sessie hebt gestopt: dan log je hem waarschijnlijk achteraf.
export function sessionsOf(sorted) {
  const sessions = [];
  let open = null;
  let stopped = false;
  for (const e of sorted) {
    if (e.type === 'start') {
      if (open) sessions.push({ ...open, end: e.ts });
      open = { start: e.ts, end: null, stop: null, explicit: true, events: [] };
    } else if (e.type === 'stop') {
      if (open) sessions.push({ ...open, end: e.ts, stop: e });
      open = null;
      stopped = true;
    } else {
      const opens = e.type === 'klap' || (e.type === 'punt' && !stopped);
      if (!open && opens) open = { start: e.ts, end: null, stop: null, explicit: false, events: [] };
      if (open) open.events.push(e);
    }
  }
  if (open) sessions.push(open);
  return sessions;
}

// Stand van de tiltmeter op tijdstip t, voor een sessie binnen de entries van die dag.
export function evaluate(dayEntries, session, t, settings) {
  const factor = SENS[settings.sens] || 1;
  const buyIn = settings.buyIn || DEFAULT_SETTINGS.buyIn;
  const start = Date.parse(session.start);
  const weights = weigh(dayEntries.filter((e) => at(e) <= t), settings);
  let score = weights.reduce((sum, w) => sum + decayed(w, t), 0);

  const minutes = Math.max(0, Math.floor((t - start) / 60000));
  const mine = session.events.filter((e) => at(e) <= t);
  // Vermoeidheid: pas na vier uur zonder pauze, en een pauze zet de klok terug.
  const lastBreak = mine.filter((e) => e.type === 'pauze').map((e) => at(e) + PAUSE_MINUTES * 60000).pop();
  const sinceRest = (t - Math.max(start, lastBreak || 0)) / 3600000;
  const fatigue = Math.min(Math.max(0, sinceRest - 4) * 6, 24);
  score = Math.max(0, score + fatigue);

  const klaps = mine.filter((e) => e.type === 'klap').length;
  const stacks = mine.filter((e) => e.type === 'klap' && e.size === 'stack').length;
  const punts = mine.filter((e) => e.type === 'punt');
  const lost = punts.reduce((sum, e) => sum + e.cents, 0);
  // Eén grote punt uit tilt of ego (een volle buy-in of meer) is genoeg om te stoppen.
  const blowup = settings.sens === 'los' ? null : punts.find((e) => e.cents >= buyIn && (e.reason === 'tilt' || e.reason === 'ego'));

  const stop = [];
  if (blowup) stop.push(`${euro(blowup.cents)} punt ${REASON_TEXT[blowup.reason]}`);
  if (settings.stopLoss && stacks >= settings.stopLoss) stop.push(`Stop-loss: ${stacks} stacks lost`);
  if (settings.maxHours && minutes / 60 >= settings.maxHours) stop.push(`${duration(minutes)} at the table, your max is ${settings.maxHours} hours`);

  const context = [];
  if (klaps) context.push(`${klaps} ${klaps === 1 ? 'hit' : 'hits'}${stacks ? ` (${stacks}× your stack)` : ''}`);
  if (punts.length && !(blowup && punts.length === 1)) {
    const steamed = weights.some((w) => w.steaming && mine.includes(w.e));
    context.push(`${punts.length} ${punts.length === 1 ? 'punt' : 'punts'}, ${euro(lost)}${steamed ? ', right after a beat' : ''}`);
  }
  if (fatigue > 0) context.push(`${duration(Math.round(sinceRest * 60))} without a break`);
  // Wat er eerder vandaag gebeurde telt nog mee, ook als dat in een vorige sessie was.
  const carried = weights.filter((w) => at(w.e) < start).reduce((sum, w) => sum + decayed(w, t), 0);
  if (carried >= 20) context.push('still rattled from your previous session');

  let zone = 'groen';
  if (score >= ORANGE * factor) zone = 'oranje';
  if (score >= RED * factor || stop.length) zone = 'rood';
  const pct = zone === 'rood' ? 100 : Math.min(99, Math.round((score / (RED * factor)) * 100));
  return { score, pct, zone, reasons: [...stop, ...context], klaps, stacks, punts: punts.length, minutes };
}

// De lopende sessie van vandaag (sessiedag), of { active: false }.
export function tableState(entries, now, settings) {
  const today = dayKey(sessionDay(now));
  const day = entries
    .filter((e) => at(e) <= now && dayKey(sessionDay(e.ts)) === today)
    .sort((a, b) => at(a) - at(b));
  const session = sessionsOf(day).pop();
  if (!session || session.end) return { active: false };
  const state = evaluate(day, session, now, settings);
  // Een stopadvies blijft staan tot de sessie stopt, ook als de meter daarna zakt.
  const advice = session.events.find((e) => e.type === 'stopadvies');
  const pause = [...session.events].reverse().find((e) => e.type === 'pauze');
  return {
    active: true,
    sid: session.start,
    start: session.start,
    ...state,
    zone: advice ? 'rood' : state.zone,
    pct: advice ? 100 : state.pct,
    redAt: advice ? advice.ts : null,
    afterAdvice: advice ? session.events.filter((e) => at(e) > at(advice) && ['klap', 'punt'].includes(e.type)).length : 0,
    ignored: Boolean(advice && advice.ignored),
    // Van tafel gaan op een stopadvies telt één keer per sessiedag, anders valt het te herhalen.
    leftToday: day.some((e) => e.type === 'stop' && e.advice),
    pauseUntil: pause && at(pause) + PAUSE_MINUTES * 60000 > now ? at(pause) + PAUSE_MINUTES * 60000 : null,
  };
}

// Cijfers over sessies in een periode: hoe vaak kwam er een stopadvies, en wat kostte doorspelen daarna?
export function tableStats(entries) {
  const days = new Map();
  for (const e of [...entries].sort((a, b) => at(a) - at(b))) {
    const key = dayKey(sessionDay(e.ts));
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(e);
  }
  const out = { sessions: 0, klaps: 0, advices: 0, followed: 0, lostAfter: 0, puntsAfter: 0 };
  for (const day of days.values()) {
    for (const s of sessionsOf(day)) {
      out.sessions += 1;
      out.klaps += s.events.filter((e) => e.type === 'klap').length;
      const advice = s.events.find((e) => e.type === 'stopadvies');
      if (!advice) continue;
      out.advices += 1;
      const after = s.events.filter((e) => at(e) > at(advice) && ['klap', 'punt'].includes(e.type));
      if (!after.length) out.followed += 1;
      for (const e of after) {
        if (e.type !== 'punt') continue;
        out.lostAfter += e.cents;
        out.puntsAfter += 1;
      }
    }
  }
  return out;
}

/* ---------- voortgang: XP, combo, streak en levels ---------- */

// Alleen goede mental-game-beslissingen leveren XP op. Een punt levert niets op en breekt de
// sessiestreak niet: eerlijk loggen mag nooit iets kosten wat je over sessies heen opbouwt.
export const XP = {
  pro: 30, // pro play gelogd
  hit: 10, // een klap gelogd in plaats van erop te stomen
  break: 40, // pauze genomen toen de meter dat zei
  leave: 100, // van tafel gegaan op een stopadvies
  clean: 40, // sessie van minstens een half uur netjes afgesloten
};
export const CLEAN_MINUTES = 30;
export const MAX_MULT = 3;

const TITLES = ['Tilt Monkey', 'Hothead', 'Self-aware', 'Steady', 'Composed', 'Disciplined', 'Ice Cold', 'Zen', 'Unshakeable', 'Stone Buddha'];
const FLOORS = [0, 150, 400, 750, 1200, 1800, 2500, 3300, 4200, 5200];
const LEVEL_STEP = 1200; // na level 10 kost elk level evenveel

const floorOf = (level) => (level <= FLOORS.length ? FLOORS[level - 1] : FLOORS[FLOORS.length - 1] + (level - FLOORS.length) * LEVEL_STEP);
const titleOf = (level) => TITLES[Math.min(level, TITLES.length) - 1];

export const LEVELS = TITLES.map((title, i) => ({ level: i + 1, title, xp: FLOORS[i] }));

export function levelFor(xp) {
  let level = 1;
  while (xp >= floorOf(level + 1)) level += 1;
  const floor = floorOf(level);
  const next = floorOf(level + 1);
  return {
    level,
    title: titleOf(level),
    nextTitle: titleOf(level + 1),
    next,
    toNext: next - xp,
    pct: Math.min(99, Math.round(((xp - floor) / (next - floor)) * 100)),
  };
}

// De combo: elke winst op rij in een sessie, zonder punt ertussen, verhoogt de vermenigvuldiger.
export const multFor = (combo) => Math.min(1 + combo * 0.5, MAX_MULT);

// Speelt het hele log af en telt XP, combo en streak. Alles volgt uit de entries zelf,
// dus bewerken, verwijderen en importeren kloppen vanzelf.
export function progress(entries, now) {
  const days = new Map();
  for (const e of [...entries].sort((a, b) => at(a) - at(b))) {
    const key = dayKey(sessionDay(e.ts));
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(e);
  }
  const today = dayKey(sessionDay(now));
  const events = [];
  const award = (e, xp, label, mult = 1) => events.push({ id: e.id, ts: e.ts, xp, label, mult });
  let streak = 0;
  let bestStreak = 0;
  let bestCombo = 0;
  let combo = 0; // van de lopende sessie

  for (const [key, day] of days) {
    const inSession = new Set();
    let left = false;
    const sessions = sessionsOf(day);
    sessions.forEach((s, i) => {
      let run = 0;
      let advice = null;
      let after = 0;
      for (const e of s.events) {
        inSession.add(e.id);
        if (e.type === 'stopadvies' && !advice) advice = e;
        if (advice && e !== advice && (e.type === 'klap' || e.type === 'punt')) after += 1;
        if (e.type === 'punt') {
          run = 0;
        } else if (e.type === 'pro' || e.type === 'klap') {
          const mult = multFor(run);
          const label = e.type === 'pro' ? `Pro play: ${kindLabel(e.kind)}` : 'Took a hit and logged it';
          award(e, Math.round((e.type === 'pro' ? XP.pro : XP.hit) * mult), label, mult);
          run += 1;
        } else if (e.type === 'pauze') {
          award(e, XP.break, 'Took a break on orange');
          run += 1;
        }
        bestCombo = Math.max(bestCombo, run);
      }
      const broken = Boolean(advice) && (advice.ignored === true || after > 0);
      const minutes = s.end ? (Date.parse(s.end) - Date.parse(s.start)) / 60000 : 0;
      let kept = false;
      if (s.stop && !broken) {
        if (s.stop.advice && !left) {
          left = true;
          kept = true;
          award(s.stop, XP.leave, 'Left the table on a stop warning');
        } else if (!advice && minutes >= CLEAN_MINUTES) {
          kept = true;
          award(s.stop, XP.clean, 'Clean exit');
        }
      }
      if (broken) streak = 0;
      else if (kept) streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      if (key === today && i === sessions.length - 1 && !s.end) combo = run;
    });
    // Pro plays die je achteraf logt, buiten een sessie, tellen ook: zonder combo.
    for (const e of day) {
      if (e.type === 'pro' && !inSession.has(e.id)) award(e, XP.pro, `Pro play: ${kindLabel(e.kind)}`);
    }
  }
  events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const xp = events.reduce((sum, ev) => sum + ev.xp, 0);
  return { xp, ...levelFor(xp), events, wins: events.length, streak, bestStreak, combo, mult: multFor(combo), bestMult: multFor(Math.max(bestCombo - 1, 0)) };
}
