// Accounts en synchronisatie met Supabase, zonder SDK: gewone fetch-aanroepen naar de
// Auth- en REST-API. De app blijft local-first: alles staat eerst in localStorage en
// wordt op de achtergrond bijgewerkt. Zonder verbinding werkt alles gewoon door.
import * as config from './config.js';
import { cleanEntry, cleanSettings } from './core.js';

const AUTH_KEY = 'ppt.auth';
const SYNC_KEY = 'ppt.sync';
const PAGE = 500;
const OVERLAP_MS = 60000; // marge bij het ophalen, voor schrijfacties die net later binnenkwamen
const SUPABASE_KEY = config.SUPABASE_KEY || '';
const BASE = String(config.SUPABASE_URL || '').replace(/\/+$/, '');
const HANDOFF_KEY = 'ppt.handoff';
const JUST_KEY = 'ppt.justSignedIn';
const HANDOFF_MS = 10 * 60000;

export const enabled = Boolean(BASE && SUPABASE_KEY);
export const google = Boolean(enabled && config.GOOGLE_LOGIN);

function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value === null || value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Opslag vol of geblokkeerd: de volgende keer opnieuw.
  }
}

const fresh = () => ({ owner: null, cursor: 0, known: {}, settingsLocal: null, settingsServer: null, settingsAt: 0, lastSync: 0 });

let session = read(AUTH_KEY, null);
let state = { ...fresh(), ...read(SYNC_KEY, {}) };
// Een ophaalpunt ver in de toekomst kan niet kloppen: dan alles opnieuw ophalen.
if (!(state.cursor >= 0) || state.cursor > Date.now() + 7 * 864e5) state.cursor = 0;
const save = () => write(SYNC_KEY, state);

/* ---------- status ---------- */

export const status = { syncing: false, error: null, expired: false };
const listeners = [];
export const onStatus = (fn) => listeners.push(fn);
const emit = () => listeners.forEach((fn) => fn());

export const user = () => (session ? session.user : null);
// Is dit toestel ooit aan een account gekoppeld (ook als de sessie intussen verliep)?
export const owner = () => state.owner;
export const lastSync = () => state.lastSync;
// Klaar om te synchroniseren: ingelogd en de data op dit toestel hoort bij dit account.
export const ready = () => Boolean(enabled && session && state.owner === session.user.id);

/* ---------- verzoeken ---------- */

export class CloudError extends Error {
  constructor(message, code, httpStatus) {
    super(message);
    this.code = code;
    this.status = httpStatus;
  }
}

function friendly(httpStatus, body) {
  const code = (body && (body.error_code || body.error || (typeof body.code === 'string' ? body.code : ''))) || '';
  const msg = (body && (body.msg || body.error_description || body.message)) || '';
  const known = {
    invalid_credentials: 'Wrong email or password.',
    invalid_grant: 'Wrong email or password.',
    user_already_exists: 'There is already an account with this email. Sign in instead.',
    email_exists: 'There is already an account with this email. Sign in instead.',
    email_not_confirmed: 'Confirm your email first (check your inbox), then sign in.',
    over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
    over_email_send_rate_limit: 'Too many attempts. Wait a minute and try again.',
    signup_disabled: 'Creating new accounts is turned off for this app.',
    email_address_invalid: 'That email address does not look right.',
  };
  if (known[code]) return { code, message: known[code] };
  if (code === 'weak_password' || /password/i.test(msg)) return { code: code || 'weak_password', message: msg || 'Pick a longer password.' };
  if (httpStatus === 429) return { code: 'rate_limit', message: known.over_request_rate_limit };
  if (httpStatus >= 500) return { code: 'server', message: 'The server had a problem. Try again in a moment.' };
  return { code, message: msg || `Something went wrong (${httpStatus}).` };
}

async function request(path, { method = 'GET', body, token, prefer } = {}) {
  const headers = { apikey: SUPABASE_KEY };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (prefer) headers.Prefer = prefer;
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new CloudError('No connection. Try again when you are online.', 'offline', 0);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const { code, message } = friendly(res.status, data);
    throw new CloudError(message, code, res.status);
  }
  return data;
}

/* ---------- inloggen ---------- */

function keep(data) {
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: { id: data.user.id, email: data.user.email },
  };
  write(AUTH_KEY, session);
  status.expired = false;
}

// Sessie verlopen of ingetrokken: uitloggen, maar de data op dit toestel laten staan.
function expire() {
  session = null;
  write(AUTH_KEY, null);
  status.expired = true;
  emit();
}

let refreshing = null;
async function refresh() {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        keep(await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } }));
      } catch (err) {
        if (err.code !== 'offline' && err.status && err.status < 500) {
          expire();
          throw new CloudError('Your session expired. Sign in again to keep syncing.', 'expired', err.status);
        }
        throw err;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

async function token() {
  if (!session) throw new CloudError('Not signed in.', 'signed_out', 0);
  if (session.expires_at - 60 <= Date.now() / 1000) await refresh();
  return session.access_token;
}

// Verzoek als ingelogde gebruiker; bij een verlopen token één keer verversen en opnieuw.
async function authed(path, options = {}) {
  try {
    return await request(path, { ...options, token: await token() });
  } catch (err) {
    if (err.status !== 401 || !session) throw err;
    await refresh();
    return request(path, { ...options, token: session.access_token });
  }
}

export async function signUp(email, password) {
  const data = await request('/auth/v1/signup', { method: 'POST', body: { email, password } });
  if (data && data.access_token) {
    keep(data);
    emit();
    return { signedIn: true };
  }
  return { confirm: true }; // e-mailbevestiging staat aan in Supabase
}

/* ---------- inloggen met Google ---------- */

// Start: een geheime code onthouden en naar Google. Na het inloggen komt de browser terug op
// auth.html, in de app zelf of (op iPhone vaak) in Safari.
export function googleUrl() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const id = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  write(HANDOFF_KEY, { id, at: Date.now() });
  const back = new URL('auth.html', location.href);
  back.hash = '';
  back.search = `?h=${id}`;
  return `${BASE}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back.href)}`;
}

export function pendingGoogle() {
  const h = read(HANDOFF_KEY, null);
  return h && Date.now() - h.at < HANDOFF_MS ? h : null;
}

export function cancelGoogle() {
  write(HANDOFF_KEY, null);
  emit();
}

// Ingelogd op deze pagina (bv. na Google): de app weet dit bij het openen.
export function takeJustSignedIn() {
  const flag = read(JUST_KEY, false);
  if (flag) write(JUST_KEY, null);
  return flag;
}

// Op auth.html: de tokens uit de adresbalk afhandelen.
export async function finishGoogle(loc) {
  const frag = new URLSearchParams(loc.hash.replace(/^#/, ''));
  const query = new URLSearchParams(loc.search);
  const problem = frag.get('error_description') || query.get('error_description') || frag.get('error') || query.get('error');
  if (problem) throw new CloudError(problem.replace(/\+/g, ' '), 'oauth', 400);
  const access = frag.get('access_token');
  const refreshToken = frag.get('refresh_token');
  const h = query.get('h') || '';
  if (!access || !refreshToken) throw new CloudError('The sign-in did not finish. Go back to the app and try again.', 'oauth', 400);
  const u = await request('/auth/v1/user', { token: access });
  const pending = pendingGoogle();
  // Zonder code (Supabase stuurde terug naar de startpagina): wachtte deze browser zelf op Google?
  if (pending && (pending.id === h || !h)) {
    // Teruggekomen in de app zelf: gewoon inloggen.
    const expiresIn = Number(frag.get('expires_in')) || 3600;
    keep({ access_token: access, refresh_token: refreshToken, expires_at: Number(frag.get('expires_at')) || Math.floor(Date.now() / 1000) + expiresIn, user: u });
    write(HANDOFF_KEY, null);
    write(JUST_KEY, true);
    return { here: true, email: u.email };
  }
  // In een andere browser beland (Safari): de login klaarzetten voor de app.
  if (h.length !== 64) throw new CloudError('Signed in, but the sign-in could not be passed to the app. Open the app and try again.', 'oauth', 400);
  await request('/rest/v1/rpc/handoff_put', { method: 'POST', body: { handoff: h, token: refreshToken }, token: access });
  return { here: false, email: u.email };
}

// Kwam de login op de startpagina terecht in plaats van op auth.html? Doorsturen.
export function forwardStrayLogin() {
  if (!/(^|[#&])(access_token|error_description)=/.test(location.hash)) return false;
  const pending = pendingGoogle();
  location.replace(`auth.html${pending ? `?h=${pending.id}` : ''}${location.hash}`);
  return true;
}

// In de app: kijken of Safari de login al heeft klaargezet.
export async function takeGoogle() {
  const pending = pendingGoogle();
  if (!pending) return false;
  const token = await request('/rest/v1/rpc/handoff_take', { method: 'POST', body: { handoff: pending.id } });
  if (!token) return false;
  keep(await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: token } }));
  write(HANDOFF_KEY, null);
  emit();
  return true;
}

export async function signIn(email, password) {
  keep(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
  emit();
}

// Data op dit toestel zonder account: hoort die bij het account waarmee net is ingelogd?
export const needsClaim = (localCount) => Boolean(session && state.owner !== session.user.id && localCount > 0);

export function claim(settings) {
  if (state.owner !== session.user.id) state = { ...fresh(), owner: session.user.id };
  state.settingsLocal = JSON.stringify(settings);
  state.settingsAt = 0; // instellingen in het account gaan voor
  save();
}

// Inloggen afbreken zonder iets aan de data op dit toestel te veranderen.
export function abandon() {
  session = null;
  write(AUTH_KEY, null);
  emit();
}

function forget() {
  session = null;
  state = fresh();
  write(AUTH_KEY, null);
  write(SYNC_KEY, null);
  status.error = null;
  status.expired = false;
  emit();
}

export async function signOut() {
  if (session) {
    try {
      await request('/auth/v1/logout', { method: 'POST', token: session.access_token });
    } catch {
      // Lokaal uitloggen lukt altijd; het token verloopt vanzelf.
    }
  }
  forget();
}

export async function deleteAccount() {
  await authed('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {} });
  forget();
}

/* ---------- synchroniseren ---------- */

let io = null;
export function attach(handlers) {
  io = handlers; // { get: () => ({ entries, settings }), set(entries, settings), changed() }
}

// Instellingen gewijzigd op dit toestel?
export function noteSettings(settings) {
  const json = JSON.stringify(settings);
  if (json === state.settingsLocal) return;
  state.settingsLocal = json;
  state.settingsAt = Date.now();
  save();
}

export function pending(entries) {
  if (!ready()) return 0;
  const ids = new Set(entries.map((e) => e.id));
  const changed = entries.filter((e) => state.known[e.id] !== (e.updated || 0)).length;
  const removed = Object.keys(state.known).filter((id) => !ids.has(id)).length;
  return changed + removed + (state.settingsLocal !== state.settingsServer ? 1 : 0);
}

const quote = (id) => `"${id.replace(/["\\]/g, '\\$&')}"`;

// Rijen van de server verwerken in de lokale lijst (in place op de Map).
function merge(map, rows) {
  let changed = false;
  for (const row of rows) {
    state.cursor = Math.max(state.cursor, Number(row.synced_at) || 0);
    const local = map.get(row.id);
    const updated = Number(row.updated) || 0;
    if (row.deleted) {
      if (local && (local.updated || 0) <= updated) {
        map.delete(row.id);
        changed = true;
      }
      delete state.known[row.id];
      continue;
    }
    const entry = cleanEntry(row.body);
    if (!entry) continue;
    if (!local) {
      // Al bekend met deze versie en lokaal weg: hier net verwijderd, nog niet doorgegeven.
      if (state.known[row.id] !== updated) {
        map.set(row.id, { ...entry, updated });
        changed = true;
      }
    } else if (updated > (local.updated || 0)) {
      map.set(row.id, { ...entry, updated });
      changed = true;
    }
    state.known[row.id] = updated;
  }
  return changed;
}

async function round() {
  const uid = session.user.id;
  let changed = false;

  // 1. Ophalen wat er sinds de vorige keer veranderde.
  const since = Math.max(0, state.cursor - OVERLAP_MS);
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await authed(`/rest/v1/entries?select=id,body,updated,deleted,synced_at&user_id=eq.${uid}&synced_at=gte.${since}&order=synced_at.asc,id.asc&limit=${PAGE}&offset=${offset}`);
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  const [profile] = await authed(`/rest/v1/profiles?select=settings,updated&user_id=eq.${uid}`);

  let { entries, settings } = io.get();
  const map = new Map(entries.map((e) => [e.id, e]));
  if (merge(map, rows)) changed = true;
  if (profile && Number(profile.updated) > state.settingsAt) {
    settings = cleanSettings(profile.settings);
    const json = JSON.stringify(settings);
    state.settingsLocal = json;
    state.settingsServer = json;
    state.settingsAt = Number(profile.updated);
    changed = true;
  }
  if (changed) io.set([...map.values()], settings);
  save();

  // 2. Doorgeven wat hier veranderde.
  ({ entries, settings } = io.get());
  const ids = new Set(entries.map((e) => e.id));
  const now = Date.now();
  const out = [
    ...entries.filter((e) => state.known[e.id] !== (e.updated || 0)).map((e) => ({ user_id: uid, id: e.id, body: e, updated: e.updated || 0, deleted: false })),
    ...Object.keys(state.known).filter((id) => !ids.has(id)).map((id) => ({ user_id: uid, id, body: null, updated: now, deleted: true })),
  ];
  const stale = [];
  for (let i = 0; i < out.length; i += PAGE) {
    const chunk = out.slice(i, i + PAGE);
    const written = await authed('/rest/v1/entries?on_conflict=user_id,id&select=id,updated,deleted', {
      method: 'POST',
      body: chunk,
      prefer: 'resolution=merge-duplicates,return=representation',
    });
    const done = new Set((written || []).map((r) => r.id));
    for (const row of chunk) {
      if (!done.has(row.id)) stale.push(row.id); // de server had al een nieuwere versie
      else if (row.deleted) delete state.known[row.id];
      else state.known[row.id] = row.updated;
    }
    save();
  }

  // 3. Wat geweigerd werd omdat de server nieuwer was: die versie ophalen.
  for (let i = 0; i < stale.length; i += 100) {
    const filter = encodeURIComponent(`(${stale.slice(i, i + 100).map(quote).join(',')})`);
    const newer = await authed(`/rest/v1/entries?select=id,body,updated,deleted,synced_at&user_id=eq.${uid}&id=in.${filter}`);
    const current = io.get();
    const m = new Map(current.entries.map((e) => [e.id, e]));
    for (const row of newer) delete state.known[row.id];
    if (merge(m, newer)) {
      io.set([...m.values()], current.settings);
      changed = true;
    }
    save();
  }

  if (state.settingsLocal !== state.settingsServer) {
    const json = state.settingsLocal;
    const written = await authed('/rest/v1/profiles?on_conflict=user_id&select=updated', {
      method: 'POST',
      body: [{ user_id: uid, settings: JSON.parse(json), updated: Math.max(state.settingsAt, 1) }],
      prefer: 'resolution=merge-duplicates,return=representation',
    });
    if (written && written.length) state.settingsServer = json;
    else state.settingsAt = 0; // de server had nieuwere instellingen: die de volgende keer ophalen
    save();
  }
  return changed;
}

let running = null;
let again = false;

export function sync() {
  if (!ready() || !io) return Promise.resolve(false);
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    status.syncing = true;
    emit();
    let changed = false;
    try {
      do {
        again = false;
        if (await round()) changed = true;
      } while (again && ready());
      state.lastSync = Date.now();
      status.error = null;
    } catch (err) {
      status.error = err;
    } finally {
      status.syncing = false;
      running = null;
      save();
      emit();
    }
    if (changed && io.changed) io.changed();
    return changed;
  })();
  return running;
}

let timer = 0;
export function schedule(ms = 1500) {
  if (!ready()) return;
  clearTimeout(timer);
  timer = setTimeout(sync, ms);
}
