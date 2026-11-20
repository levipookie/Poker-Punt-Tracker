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
  const reasons = new Map();
  for (const e of entries) {
    if (e.type === 'pro') {
      pros += 1;
      continue;
    }
    punts += 1;
    lost += e.cents;
    const r = reasons.get(e.reason) || { reason: e.reason, cents: 0, count: 0 };
    r.cents += e.cents;
    r.count += 1;
    reasons.set(e.reason, r);
  }
  const byReason = [...reasons.values()].sort((a, b) => b.cents - a.cents || b.count - a.count);
  return { lost, punts, pros, avg: punts ? Math.round(lost / punts) : 0, byReason };
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
  return { entries, skipped: list.length - entries.length };
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
