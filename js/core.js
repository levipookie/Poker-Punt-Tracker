// Pure rekenlogica: geen DOM, geen opslag. Bedragen altijd in centen.

export const REASONS = [
  ['tilt', 'Tilt'],
  ['verveeld', 'Verveeld'],
  ['moe', 'Moe'],
  ['ego', 'Ego'],
  ['fancy', 'Fancy play'],
  ['nieuwsgierig', 'Nieuwsgierig'],
  ['anders', 'Anders'],
];

export const KINDS = [
  ['hero-fold', 'Hero fold'],
  ['hero-call', 'Hero call'],
  ['thin-value', 'Thin value'],
  ['bluff', 'Bluff'],
  ['exploit', 'Exploit'],
  ['discipline', 'Discipline'],
  ['anders', 'Anders'],
];

// Een klap is een bad beat of cooler: goed gespeeld en toch verloren.
export const SIZES = [
  ['pot', 'Pot kwijt'],
  ['stack', 'Stack kwijt'],
];

export const QUICK_AMOUNTS = [2000, 5000, 10000, 20000];

// Een sessiedag loopt tot 06:00: alles daarvoor telt bij de vorige kalenderdag.
export const DAY_START_HOUR = 6;

export function labelOf(list, key) {
  const hit = list.find(([k]) => k === key);
  return hit ? hit[1] : 'Anders';
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

// mode: 'week' | 'maand' | 'alles'. offset 0 = huidige periode, -1 = vorige, enz.
// Geeft { start, end } terug (end exclusief), of null voor 'alles'.
export function periodRange(mode, offset, now) {
  const today = sessionDay(now);
  if (mode === 'week') {
    const start = addDays(weekStart(today), 7 * offset);
    return { start, end: addDays(start, 7) };
  }
  if (mode === 'maand') {
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

function cleanEntry(raw) {
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
    const kind = KINDS.some(([k]) => k === raw.kind) ? raw.kind : 'anders';
    return { ...base, type: 'pro', kind };
  }
  if (raw.type === 'klap') return { ...base, type: 'klap', size: raw.size === 'stack' ? 'stack' : 'pot' };
  if (raw.type === 'stop') return { ...base, type: 'stop', advice: raw.advice === true };
  if (raw.type === 'stopadvies') {
    return typeof raw.cause === 'string' ? { ...base, type: 'stopadvies', cause: raw.cause } : { ...base, type: 'stopadvies' };
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
    throw new Error('Geen geldig JSON-bestand.');
  }
  const list = Array.isArray(data) ? data : data && data.entries;
  if (!Array.isArray(list)) throw new Error('Dit is geen backup van de Punt Tracker.');
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
  maxHours: 6, // maximale sessieduur in uren (0 = uit)
  sens: 'normaal', // 'streng' | 'normaal' | 'los'
  message: 'Je speelt nu niet meer je eigen spel, ook al voelt het niet zo. Normaal fold je gewoon als je beat bent. Sta op.',
};

export function cleanSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  if ([0, 2, 3, 4].includes(raw.stopLoss)) s.stopLoss = raw.stopLoss;
  if ([0, 4, 6, 8].includes(raw.maxHours)) s.maxHours = raw.maxHours;
  if (['streng', 'normaal', 'los'].includes(raw.sens)) s.sens = raw.sens;
  if (typeof raw.message === 'string') s.message = raw.message.slice(0, 400);
  return s;
}

// Tiltmeter: elke klap en punt geeft punten die langzaam wegzakken (halfwaardetijd 2,5 uur).
// Vanaf ORANGE adviseert de app een pauze, vanaf RED stoppen. Gevoeligheid schaalt die grenzen.
export const ORANGE = 50;
export const RED = 100;
export const PAUSE_MINUTES = 10;
const HALF_LIFE_MS = 150 * 60000;
const SENS = { streng: 0.8, normaal: 1, los: 1.25 };
const at = (e) => Date.parse(e.ts);

function points(e) {
  if (e.type === 'klap') return e.size === 'stack' ? 40 : 22;
  if (e.type === 'punt') return e.reason === 'tilt' ? 55 : e.reason === 'ego' ? 45 : 35;
  if (e.type === 'pauze') return -15;
  return 0;
}

export function duration(minutes) {
  const h = Math.floor(minutes / 60);
  return h ? `${h}u${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;
}

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
  let score = 0;
  for (const e of dayEntries) {
    if (at(e) <= t) score += points(e) * 0.5 ** ((t - at(e)) / HALF_LIFE_MS);
  }
  const minutes = Math.max(0, Math.floor((t - Date.parse(session.start)) / 60000));
  const hours = minutes / 60;
  // Vermoeidheid: de laatste twee uur voor de maximale duur telt mee.
  if (settings.maxHours) score += Math.min(Math.max(0, hours - (settings.maxHours - 2)) * 15, 45);
  score = Math.max(0, score);

  const mine = session.events.filter((e) => at(e) <= t);
  const klaps = mine.filter((e) => e.type === 'klap').length;
  const stacks = mine.filter((e) => e.type === 'klap' && e.size === 'stack').length;
  const punts = mine.filter((e) => e.type === 'punt').length;
  const tilt = mine.some((e) => e.type === 'punt' && e.reason === 'tilt');
  const maxPunts = settings.sens === 'los' ? 3 : 2;

  const stop = [];
  if (tilt && settings.sens !== 'los') stop.push('Je logde net zelf een punt uit tilt');
  if (punts >= maxPunts) stop.push(`${punts} punts in deze sessie`);
  if (settings.stopLoss && stacks >= settings.stopLoss) stop.push(`Stop-loss: ${stacks} stacks kwijt`);
  if (settings.maxHours && hours >= settings.maxHours) stop.push(`${duration(minutes)} aan tafel, je maximum is ${settings.maxHours} uur`);

  const context = [];
  if (klaps) context.push(`${klaps} ${klaps === 1 ? 'klap' : 'klappen'}${stacks ? `, waarvan ${stacks}× je stack` : ''}`);
  if (punts && !stop.some((r) => r.includes('punt'))) context.push(`${punts} ${punts === 1 ? 'punt' : 'punts'}`);
  if (settings.maxHours && hours >= settings.maxHours - 2 && hours < settings.maxHours) context.push(`al ${duration(minutes)} aan tafel`);
  // Wat er eerder vandaag gebeurde telt nog mee, ook als dat in een vorige sessie was.
  let carried = 0;
  for (const e of dayEntries) {
    if (at(e) < Date.parse(session.start)) carried += points(e) * 0.5 ** ((t - at(e)) / HALF_LIFE_MS);
  }
  if (carried >= 20) context.push('je bent nog niet bekomen van je vorige sessie');

  let zone = 'groen';
  if (score >= ORANGE * factor || (tilt && settings.sens === 'los')) zone = 'oranje';
  if (score >= RED * factor || stop.length) zone = 'rood';
  const pct = zone === 'rood' ? 100 : Math.min(99, Math.round((score / (RED * factor)) * 100));
  return { score, pct, zone, reasons: [...stop, ...context], klaps, stacks, punts, minutes };
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
