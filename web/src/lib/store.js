// App state + live database sync + every action. Components read from here.
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, push, runTransaction } from 'firebase/database';
import confetti from 'canvas-confetti';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
// engine.js, model.js and firebase-config.js load as plain scripts (see index.html), shared with
// the tests (Node) and the rankings page, so they stay one copy.
export const E = globalThis.Engine;
export const M = globalThis.Model;

const SETTINGS = {
  courts: 4, rounds: 8, mode: 'rating', formBump: 0.05, mixGap: 0.3, defaultRating: 3.0,
  protectWinners: true, target: 11, winBy: 2, scoreType: 'SIDEOUT', timerMin: 0, timerAuto: true,
  event: 'P4A Saturday 7am', location: 'Pickleball4ALL', time: '7:00 AM',
};
export const PRACTICE = new URLSearchParams(location.search).has('practice');
const PREF_KEY = PRACTICE ? 'p4a-prefs-practice' : 'p4a-prefs-v2';
const CACHE_KEY = PRACTICE ? 'p4a-cache-practice' : 'p4a-cache-v2';

const loadJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const prefs = loadJSON(PREF_KEY, {});
const cache = loadJSON(CACHE_KEY, {});

export const S = {
  roster: cache.players || {},
  rawSessions: cache.sessions || {},
  sessions: {},
  history: cache.history || {},
  settings: { ...SETTINGS, ...(cache.settings || {}) },
  rankPeriod: prefs.rankPeriod != null ? prefs.rankPeriod : 56,
  rankSort: prefs.rankSort || 'pfg',
  currentId: prefs.currentId || null,
  me: prefs.me || null,
  online: true,
  user: null,
  admins: {},
  preview: null,
  loaded: { players: false, sessions: false },
  ui: { tab: new URLSearchParams(location.search).get('go') || null, moreTab: 'players', sheet: null, display: false, toast: null, armed: null },
};

// ---------- subscription ----------
let version = 0;
const subs = new Set();
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const getVersion = () => version;
export function bump() { version++; subs.forEach((f) => f()); }
export function setUI(patch) { S.ui = { ...S.ui, ...patch }; bump(); }

let daysCache = null;
function convertSessions() {
  S.sessions = {};
  Object.entries(S.rawSessions || {}).forEach(([id, raw]) => { S.sessions[id] = M.toSession(id, raw); });
  daysCache = null;
}
convertSessions();
const savePrefs = () => localStorage.setItem(PREF_KEY, JSON.stringify({ rankPeriod: S.rankPeriod, rankSort: S.rankSort, currentId: S.currentId, me: S.me }));
const saveCache = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ players: S.roster, sessions: S.rawSessions, settings: S.settings, history: S.history })); } catch (e) { /* full */ } };

// ---------- database ----------
const app = initializeApp(globalThis.P4A_FIREBASE);
const db = getDatabase(app);
const BASE = PRACTICE ? 'p4a/practice' : 'p4a';
const R = (p) => ref(db, BASE + '/' + p);
export function W(path, value) {
  return set(R(path), value === undefined ? null : value).catch((err) => toast('Not saved: ' + err.message));
}
const auth = getAuth(app);
export const isAdmin = () => !!(S.user && S.admins && S.admins[S.user.uid]);
export const noAdminsYet = () => !S.admins || !Object.keys(S.admins).length;
export function start() {
  onAuthStateChanged(auth, (u) => { S.user = u ? { uid: u.uid, name: u.displayName, email: u.email } : null; bump(); });
  onValue(ref(db, 'p4a/meta/admins'), (s) => { S.admins = s.val() || {}; bump(); });
  onValue(R('players'), (s) => { S.roster = s.val() || {}; S.loaded.players = true; changed(); });
  onValue(R('sessions'), (s) => { S.rawSessions = s.val() || {}; S.loaded.sessions = true; convertSessions(); ensureSession(); changed(); });
  onValue(R('meta/history'), (s) => { S.history = s.val() || {}; daysCache = null; changed(); });
  onValue(R('meta/settings'), (s) => { S.settings = { ...SETTINGS, ...(s.val() || {}) }; changed(); });
  onValue(ref(db, '.info/connected'), (s) => { S.online = !!s.val(); bump(); });
}
function changed() { saveCache(); bump(); }

// ---------- small helpers ----------
export const blank = (v) => v === null || v === undefined || v === '';
export const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const todayStr = () => ymd(new Date());
export function nextSaturday() { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7)); return ymd(d); }
export function niceDate(s, long) {
  const [y, m, d] = String(s).split('-').map(Number);
  if (!y) return s;
  return new Date(y, m - 1, d).toLocaleDateString([], long ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' });
}
let toastTimer;
export function toast(msg) {
  clearTimeout(toastTimer);
  setUI({ toast: { msg, id: Date.now() } });
  toastTimer = setTimeout(() => setUI({ toast: null }), 2600);
}
export function buzz(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* ignore */ } }
let audio;
export function beep(times) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; o.type = 'square'; g.gain.value = 0.08;
      o.connect(g); g.connect(audio.destination);
      const t0 = audio.currentTime + i * 0.35; o.start(t0); o.stop(t0 + 0.2);
    }
  } catch (e) { /* no audio */ }
}
export function celebrate() {
  try { confetti({ particleCount: 90, spread: 70, origin: { y: 0.75 }, colors: ['#a78bfa', '#f0abfc', '#5eead4', '#fde68a'] }); } catch (e) { /* ignore */ }
}
export async function copy(txt) {
  try { await navigator.clipboard.writeText(txt); toast('Copied. Paste it in WhatsApp.'); }
  catch (e) { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast('Copied'); }
}
export function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ---------- sessions ----------
export const sessionList = () => Object.values(S.sessions).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
function pickDefaultSession() {
  const t = todayStr();
  const list = sessionList();
  const upcoming = list.filter((s) => s.date >= t).sort((a, b) => (a.date < b.date ? -1 : 1));
  return (upcoming[0] || list[0] || {}).id || null;
}
function ensureSession() {
  if (S.currentId && S.sessions[S.currentId]) return;
  S.currentId = pickDefaultSession();
  if (!S.currentId && S.loaded.sessions) createSession(nextSaturday(), S.settings.time);
  savePrefs();
}
export function createSession(date, time) {
  let id = date, n = 2;
  while (S.sessions[id]) id = date + '-' + n++;
  runTransaction(R('sessions/' + id), (cur) => cur || {
    date, time: time || S.settings.time, courts: S.settings.courts, seed: Math.floor(Math.random() * 1e9), createdAt: Date.now(),
  });
  S.currentId = id; savePrefs(); bump();
  return id;
}
export function openSession(id) { S.currentId = id; savePrefs(); bump(); }
const BLANK = { id: null, date: nextSaturday(), time: '7:00 AM', courts: 5, seed: 1, rsvp: {}, players: [], rounds: [] };
export const sess = () => S.sessions[S.currentId] || BLANK;
const sp = (path) => 'sessions/' + sess().id + '/' + path;
export const isLiveToday = () => { const s = S.sessions[S.currentId]; return !!(s && s.date === todayStr() && s.rounds.length); };

// ---------- players ----------
export const person = (id) => S.roster[id] || { name: '?', rating: null, dupr: '' };
export const hasRating = (id) => !blank(person(id).rating);
export const rating = (id) => (hasRating(id) ? Number(person(id).rating) : Number(S.settings.defaultRating));
export const nameOf = (id) => person(id).name;
// First name, plus last initial when two players share a first name ("Mohammad A.").
export const firstName = (id) => {
  const parts = String(person(id).name || '').trim().split(/\s+/);
  const f = parts[0] || '?';
  const clash = Object.entries(S.roster).some(([k, p]) => k !== id && String(p.name || '').trim().split(/\s+/)[0].toLowerCase() === f.toLowerCase());
  return clash && parts.length > 1 ? `${f} ${parts[parts.length - 1][0]}.` : f;
};
export const rosterList = () => Object.entries(S.roster).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.name.localeCompare(b.name));
export function findByName(name) {
  const k = name.trim().toLowerCase();
  const hit = Object.entries(S.roster).find(([, p]) => (p.name || '').toLowerCase() === k);
  return hit ? hit[0] : null;
}
export function ensurePlayer(name, ratingVal) {
  let id = findByName(name);
  if (!id) {
    id = push(R('players')).key;
    S.roster[id] = { name: name.trim(), rating: null, dupr: '' };
    W('players/' + id + '/name', name.trim());
    if (ratingVal != null && (isAdmin() || PRACTICE)) W('players/' + id + '/rating', ratingVal);
  } else if (ratingVal != null && (isAdmin() || PRACTICE)) { W('players/' + id + '/rating', ratingVal); }
  return id;
}
export const dayPlayer = (id) => sess().players.find((p) => p.id === id) || null;
export function setHere(id, on) {
  const s = sess();
  if (!s.id) return;
  const cur = dayPlayer(id) || { present: false, joinRound: null, joinCredit: 0 };
  const next = { present: !!on, joinRound: cur.joinRound, joinCredit: cur.joinCredit || 0 };
  if (on && cur.joinRound == null) { next.joinCredit = E.joinCredit(s); next.joinRound = s.rounds.length; }
  W(sp('players/' + id), next);
}
export const here = () => sess().players.filter((p) => p.present);
export const curRound = () => { const r = sess().rounds; return r[r.length - 1] || null; };
export const roundDone = (round) => !!round && round.courts.every((c) => E.winnerOf(c));
export const roundStarted = (round) => !!round && round.courts.some((c) => E.winnerOf(c) || !blank(c.sa) || !blank(c.sb));
export const rsvpOf = (id) => (sess().rsvp[id] || {}).s || null;
export const capOf = (s) => (s && s.cap) || Number((s && s.courts) || 4) * 4 + 2;
export const confirmedIds = () => rsvpIds('in').slice(0, capOf(sess()));
export const waitlistIds = () => rsvpIds('in').slice(capOf(sess()));
export const rsvpIds = (v) => Object.entries(sess().rsvp).filter(([id, x]) => x && x.s === v && S.roster[id]).sort((a, b) => (a[1].at || 0) - (b[1].at || 0)).map(([id]) => id);

// ---------- history & ratings ----------
export function days() {
  if (!daysCache) {
    const live = Object.values(S.sessions).map(M.dayFrom).filter(Boolean);
    const liveDates = new Set(live.map((d) => d.date));
    const imported = Object.values(S.history || {}).filter((d) => d && d.stats && !liveDates.has(d.date))
      .map((d) => ({ date: d.date, stats: d.stats, games: [], imported: true }));
    daysCache = live.concat(imported);
  }
  return daysCache;
}
export function allGames() {
  const out = [];
  days().forEach((d) => d.games.forEach((g) => out.push({ date: d.date, i: g.i, a: g.a.map(nameOf), b: g.b.map(nameOf), w: g.w, sa: g.sa, sb: g.sb })));
  return out;
}
export function groupRatingMap() {
  const seed = {};
  Object.values(S.roster).forEach((p) => { if (!blank(p.rating)) seed[p.name] = Number(p.rating); });
  return E.groupRatings(allGames(), seed, Number(S.settings.defaultRating));
}
function ratings() {
  const gr = groupRatingMap();
  const o = {};
  sess().players.forEach((p) => { const g = gr[nameOf(p.id)]; o[p.id] = !hasRating(p.id) && g && g.games >= 6 ? g.rating : rating(p.id); });
  return o;
}
export function plan() {
  const n = here().length;
  const courts = Math.min(Number(sess().courts), Math.floor(n / 4));
  const sit = courts > 0 ? n - courts * 4 : 0;
  const rounds = Number(S.settings.rounds) || 8;
  const slots = sit * rounds;
  return { n, courts, sit, rounds, lo: n ? Math.floor(slots / n) : 0, hi: n ? Math.ceil(slots / n) : 0 };
}
export function sitText() {
  const p = plan();
  if (p.courts < 1) return 'Check in at least 4 players.';
  if (!p.sit) return 'Everyone plays every round.';
  const range = p.lo === p.hi ? p.lo + '' : p.lo + '–' + p.hi;
  return `Over ${p.rounds} rounds each player sits ${range} time${p.hi === 1 ? '' : 's'} (plays at least ${Math.round(100 * (p.rounds - p.hi) / p.rounds)}%). Nobody sits twice until everyone has sat once.`;
}
const roundOpts = () => ({ ratings: ratings(), mode: S.settings.mode, formBump: Number(S.settings.formBump), mixGap: Number(S.settings.mixGap), protectWinners: S.settings.protectWinners !== false });
function buildRound(s, salt) {
  const round = E.generateRound(s, { ...roundOpts(), salt: salt || '' });
  round.createdAt = Date.now();
  round.timed = Number(S.settings.timerMin) > 0;
  round.timerEnd = round.timed && S.settings.timerAuto ? Date.now() + Number(S.settings.timerMin) * 60000 : null;
  return round;
}
// Preview of who sits next round, using current results (assumes the round finishes as scored).
export function upNextSitters() {
  const s = sess();
  try { return E.generateRound(s, roundOpts()).sitting; } catch (e) { return []; }
}

// ---------- actions ----------
export const actions = {
  setTab(tab) { setUI({ tab, sheet: null, display: false, armed: null }); window.scrollTo({ top: 0 }); },
  iam(id) { S.me = id; savePrefs(); bump(); },
  notMe() { S.me = null; savePrefs(); bump(); },
  newMe(name) { if (!name.trim()) return; S.me = ensurePlayer(name); savePrefs(); toast('Welcome, ' + name.trim() + '!'); bump(); },
  rsvp(v) {
    const s = sess(); if (!S.me || !s.id) return;
    const was = rsvpOf(S.me);
    W(sp('rsvp/' + S.me), was === v ? null : { s: v, at: Date.now() });
    if (v === 'in' && was !== 'in') {
      const pos = rsvpIds('in').length + 1 - capOf(s);
      if (pos > 0) toast(`It's full (${capOf(s)}). You're #${pos} on the waitlist; you'll move in if someone drops.`);
      else { toast("You're in for " + niceDate(s.date) + '!'); celebrate(); }
      buzz(20);
    }
  },
  saveMe(r, d) {
    if (!S.me) return;
    if (!isAdmin() && !PRACTICE) { toast('Only the organizer can change ratings'); return; }
    if (r !== '' && (isNaN(+r) || +r < 1 || +r > 8)) { toast('Rating should look like 3.45'); return; }
    W('players/' + S.me + '/rating', r === '' ? null : +r);
    W('players/' + S.me + '/dupr', d.trim());
    toast('Saved');
  },
  checkInAll() { confirmedIds().forEach((id) => { const d = dayPlayer(id); if (!d || !d.present) setHere(id, true); }); toast('Checked in'); },
  toggleHere(id) { const d = dayPlayer(id); setHere(id, !(d && d.present)); },
  addHere(name) { if (!name.trim()) return; setHere(ensurePlayer(name), true); toast(name.trim() + ' is in'); },
  pasteHere(text) { const rows = E.parseRoster(text); rows.forEach((r) => setHere(ensurePlayer(r.name, r.rating), true)); toast(rows.length ? 'Added ' + rows.length + ' players' : 'No names found'); },
  pasteRoster(text) { const rows = E.parseRoster(text); rows.forEach((r) => ensurePlayer(r.name, r.rating)); toast(rows.length ? 'Saved ' + rows.length + ' players' : 'No names found'); },
  setSession(key, val) { W(sp(key), val); if (key === 'courts') W('meta/settings/courts', val); },
  setSetting(key, val) { W('meta/settings/' + key, val); },
  // Build the next round as a preview; nothing is saved until "Start".
  start() {
    try { const s = sess(); S.preview = { round: buildRound(s), pick: null, salt: 0 }; setUI({ sheet: { type: 'preview' } }); }
    catch (err) { toast(err.message); }
  },
  reshufflePreview() {
    const s = sess(); const salt = (S.preview ? S.preview.salt : 0) + 1;
    try { S.preview = { round: buildRound(s, salt), pick: null, salt }; bump(); } catch (err) { toast(err.message); }
  },
  // Tap two players (on courts or sitting) to swap them.
  pickPreview(id) {
    const pv = S.preview; if (!pv) return;
    if (!pv.pick) { pv.pick = id; bump(); return; }
    if (pv.pick === id) { pv.pick = null; bump(); return; }
    const a = pv.pick, b = id, rd = pv.round;
    const sw = (arr) => arr.map((x) => (x === a ? b : x === b ? a : x));
    rd.courts = rd.courts.map((c) => ({ ...c, a: sw(c.a), b: sw(c.b) }));
    rd.sitting = sw(rd.sitting);
    pv.pick = null; buzz(15); bump();
  },
  commitPreview() {
    const s = sess(); const pv = S.preview; if (!pv) return;
    W(sp('rounds/' + s.rounds.length), M.roundToDb(pv.round));
    S.preview = null; buzz(30); setUI({ sheet: null }); actions.setTab('play');
  },
  signIn() { signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => toast('Sign-in failed: ' + (e.code || e.message))); },
  signOut() { signOut(auth); },
  claimAdmin() { if (!S.user) return; set(ref(db, 'p4a/meta/admins/' + S.user.uid), { name: S.user.name || '', email: S.user.email || '' }).then(() => toast("You're the organizer now")).catch((e) => toast('Could not claim: ' + e.message)); },
  setCap(v) { W(sp('cap'), v); },
  redo() {
    const s = sess(); const r = s.rounds.length - 1;
    try { W(sp('rounds/' + r), M.roundToDb(buildRound({ ...s, rounds: s.rounds.slice(0, r) }))); toast("Round redone with who's here"); }
    catch (err) { toast(err.message); }
  },
  undo() { const s = sess(); W(sp('rounds/' + (s.rounds.length - 1)), null); toast('Round removed'); },
  setScore(r, k, sa, sb, winner) {
    const s = sess(); const c = s.rounds[r].courts[k];
    W(sp(`rounds/${r}/courts/${k}`), M.courtToDb({ ...c, sa, sb, winner: winner || null }));
    setUI({ sheet: null });
    const round = { ...s.rounds[r], courts: s.rounds[r].courts.map((x, i) => (i === k ? { ...x, sa, sb, winner } : x)) };
    if (r === s.rounds.length - 1 && roundDone(round)) { buzz([60, 60, 60]); celebrate(); toast('All courts done. Start round ' + (r + 2) + ' when ready.'); }
  },
  timer(kind) {
    const s = sess(); const r = s.rounds.length - 1; const round = curRound();
    const full = Date.now() + Number(S.settings.timerMin) * 60000;
    if (kind === 'start' || kind === 'restart') W(sp(`rounds/${r}/timerEnd`), full);
    if (kind === 'add') W(sp(`rounds/${r}/timerEnd`), Math.max(round.timerEnd || 0, Date.now()) + 60000);
    if (kind === 'off') W(sp(`rounds/${r}/timed`), false);
    setUI({ sheet: null });
  },
  rank(key, val) { S[key] = val; savePrefs(); bump(); },
  savePlayer(id, field, val) {
    if (!isAdmin() && !PRACTICE) { toast('Only the organizer can edit players'); return; }
    if (field === 'name') { if (val.trim()) W('players/' + id + '/name', val.trim()); }
    else if (field === 'rating') W('players/' + id + '/rating', val.trim() === '' || isNaN(+val) ? null : +val);
    else W('players/' + id + '/dupr', val.trim());
  },
  deletePlayer(id) { if (!isAdmin() && !PRACTICE) { toast('Only the organizer can remove players'); return; } W('players/' + id, null); },
};

// ---------- derived views ----------
export function duprStatus() {
  let ready = 0, total = 0;
  const noScore = [], noId = new Set();
  sess().rounds.forEach((round, r) => round.courts.forEach((c, k) => {
    total++;
    if (blank(c.sa) || blank(c.sb) || !E.winnerOf(c)) { noScore.push({ r, k }); return; }
    const miss = [...c.a, ...c.b].filter((id) => !(person(id).dupr || '').trim());
    miss.forEach((id) => noId.add(id));
    if (!miss.length) ready++;
  }));
  return { ready, total, noScore, noId: [...noId] };
}
export function duprFile() {
  const people = {};
  Object.entries(S.roster).forEach(([id, p]) => { people[id] = { name: p.name, dupr: (p.dupr || '').trim() }; });
  return E.duprCsv(sess(), people, { event: S.settings.event, location: S.settings.location, scoreType: S.settings.scoreType });
}
export const todayRows = (s) => E.standings(s).sort((a, b) => b.pf - a.pf || (b.pf - b.pa) - (a.pf - a.pa) || b.wins - a.wins);
export function rankData() {
  const ds = days();
  const period = Number(S.rankPeriod);
  let since = null;
  if (period) { const d = new Date(); d.setDate(d.getDate() - period); since = ymd(d); }
  const all = E.rankings(ds, since, S.rankSort, 0);
  const maxGames = all.reduce((m, x) => Math.max(m, x.games), 0);
  const minGames = Math.max(5, Math.round(maxGames * 0.4));
  return { list: E.rankings(ds, since, S.rankSort, minGames).filter((x) => S.roster[x.id]), minGames, nDays: ds.filter((d) => !since || d.date >= since).length };
}
export function lineupText() {
  const s = sess(); const round = curRound();
  return `🟡 P4A Round ${s.rounds.length}\n` +
    round.courts.map((c, k) => `Court ${k + 1}: ${c.a.map(nameOf).join(' & ')} vs ${c.b.map(nameOf).join(' & ')}`).join('\n') +
    (round.sitting.length ? `\nSitting: ${round.sitting.map(nameOf).join(', ')}` : '');
}
export const shareLink = () => location.origin + location.pathname + '?go=signup' + (PRACTICE ? '&practice=1' : '');
// Where am I this morning? Every round's court/partner/opponents/result for one player.
export function myMorning(id) {
  return sess().rounds.map((round, r) => {
    if (round.sitting.includes(id)) return { r, sat: true };
    const k = round.courts.findIndex((c) => [...c.a, ...c.b].includes(id));
    if (k < 0) return { r, away: true };
    const c = round.courts[k]; const side = c.a.includes(id) ? 'A' : 'B';
    const mine = side === 'A' ? c.a : c.b, them = side === 'A' ? c.b : c.a;
    const w = E.winnerOf(c);
    return { r, k, mate: mine.find((x) => x !== id), them, won: w ? w === side : null, score: blank(c.sa) ? null : (side === 'A' ? `${c.sa}-${c.sb}` : `${c.sb}-${c.sa}`) };
  });
}
