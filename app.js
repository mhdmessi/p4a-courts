// P4A Courts. Shared live data in the group database; every phone sees the same sessions.
(function () {
  'use strict';
  const E = window.Engine, M = window.Model;
  const SANDBOX = new URLSearchParams(location.search).has('practice');
  const PREF_KEY = SANDBOX ? 'p4a-prefs-practice' : 'p4a-prefs-v2';
  const CACHE_KEY = SANDBOX ? 'p4a-cache-practice' : 'p4a-cache-v2';
  const SETTINGS = {
    courts: 5, rounds: 8, mode: 'rating', formBump: 0.05, mixGap: 0.3, defaultRating: 3.0,
    protectWinners: true, target: 11, winBy: 2, scoreType: 'SIDEOUT', timerMin: 0, timerAuto: true,
    event: 'P4A Saturday 7am', location: 'Pickleball4ALL', time: '7:00 AM',
  };

  const $ = (id) => document.getElementById(id);
  const $app = $('app'), $nav = $('nav'), $sub = $('sub'), $timer = $('timer'), $overlay = $('overlay');

  // ---------- state ----------
  let daysCache = null;
  const prefs = loadJSON(PREF_KEY, {});
  const cache = loadJSON(CACHE_KEY, {});
  const S = {
    roster: cache.players || {},
    rawSessions: cache.sessions || {},
    sessions: {},
    settings: { ...SETTINGS, ...(cache.settings || {}) },
    rankPeriod: prefs.rankPeriod != null ? prefs.rankPeriod : 56,
    rankSort: prefs.rankSort || 'pfg',
    currentId: prefs.currentId || null,
    me: prefs.me || null,
    online: true,
    loaded: { players: false, sessions: false },
  };
  convertSessions();
  const params = new URLSearchParams(location.search);
  let tab = params.get('go') || null;   // picked at startup, below
  let moreTab = 'players';
  let armed = null, sheet = null, display = false;

  function loadJSON(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function savePrefs() {
    localStorage.setItem(PREF_KEY, JSON.stringify({ rankPeriod: S.rankPeriod, rankSort: S.rankSort, currentId: S.currentId, me: S.me }));
  }
  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ players: S.roster, sessions: S.rawSessions, settings: S.settings })); } catch (e) { /* full */ }
  }
  function convertSessions() {
    S.sessions = {};
    Object.entries(S.rawSessions || {}).forEach(([id, raw]) => { S.sessions[id] = M.toSession(id, raw); });
    daysCache = null;
  }

  let pending = false;
  function dataChanged() {
    saveCache();
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && document.body.contains(a)) { pending = true; return; }
    scheduleRender();
  }
  document.addEventListener('focusout', () => { if (pending) { pending = false; setTimeout(scheduleRender, 50); } });
  let raf = 0;
  function scheduleRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }

  // ---------- database ----------
  firebase.initializeApp(window.P4A_FIREBASE);
  // ?practice=1 uses a separate sandbox so trying things out never touches real data.
  const PRACTICE = new URLSearchParams(location.search).has('practice');
  const root = firebase.database().ref(PRACTICE ? 'p4a/practice' : 'p4a');
  function W(path, value) {
    return root.child(path).set(value === undefined ? null : value).catch((err) => toast('Not saved: ' + err.message));
  }

  // ---------- helpers ----------
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const blank = (v) => v === null || v === undefined || v === '';
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const todayStr = () => ymd(new Date());
  function nextSaturday() { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7)); return ymd(d); }
  function niceDate(s) {
    const [y, m, d] = String(s).split('-').map(Number);
    if (!y) return s;
    return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function buzz(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* ignore */ } }
  let audio;
  function beep(times) {
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

  // ---------- sessions ----------
  const sessionList = () => Object.values(S.sessions).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  function pickDefaultSession() {
    const list = sessionList();
    const t = todayStr();
    const upcoming = list.filter((s) => s.date >= t).sort((a, b) => (a.date < b.date ? -1 : 1));
    return (upcoming[0] || list[0] || {}).id || null;
  }
  function ensureSession() {
    if (S.currentId && S.sessions[S.currentId]) return;
    S.currentId = pickDefaultSession();
    if (!S.currentId && S.loaded.sessions) {
      const id = nextSaturday();
      createSession(id, S.settings.time);
    }
    savePrefs();
  }
  function createSession(date, time) {
    let id = date, n = 2;
    while (S.sessions[id]) id = date + '-' + n++;
    root.child('sessions/' + id).transaction((cur) => cur || {
      date, time: time || S.settings.time, courts: S.settings.courts, seed: Math.floor(Math.random() * 1e9), createdAt: Date.now(),
    });
    S.currentId = id;
    savePrefs();
    return id;
  }
  function todaySessionLive() {
    const s = S.sessions[S.currentId];
    return s && s.date === todayStr() && s.rounds.length > 0;
  }
  const BLANK = { id: null, date: nextSaturday(), time: '7:00 AM', courts: 5, seed: 1, rsvp: {}, players: [], rounds: [] };
  function sess() { return S.sessions[S.currentId] || BLANK; }
  const sp = (path) => 'sessions/' + sess().id + '/' + path;

  // ---------- players ----------
  function person(id) { return S.roster[id] || { name: '?', rating: null, dupr: '' }; }
  const hasRating = (id) => !blank(person(id).rating);
  const rating = (id) => (hasRating(id) ? Number(person(id).rating) : Number(S.settings.defaultRating));
  const nm = (id) => esc(person(id).name);
  const rosterList = () => Object.entries(S.roster).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.name.localeCompare(b.name));
  function findByName(name) {
    const k = name.trim().toLowerCase();
    const hit = Object.entries(S.roster).find(([, p]) => (p.name || '').toLowerCase() === k);
    return hit ? hit[0] : null;
  }
  function ensurePlayer(name, ratingVal) {
    let id = findByName(name);
    if (!id) {
      id = root.child('players').push().key;
      const p = { name: name.trim(), rating: ratingVal == null ? null : ratingVal, dupr: '' };
      S.roster[id] = p;
      W('players/' + id, p);
    } else if (ratingVal != null) {
      S.roster[id].rating = ratingVal;
      W('players/' + id + '/rating', ratingVal);
    }
    return id;
  }
  function dayPlayer(id) { return sess().players.find((p) => p.id === id) || null; }
  function setHere(id, on) {
    const s = sess();
    if (!s.id) return;
    const cur = dayPlayer(id) || { present: false, joinRound: null, joinCredit: 0 };
    const next = { present: !!on, joinRound: cur.joinRound, joinCredit: cur.joinCredit || 0 };
    if (on && cur.joinRound == null) { next.joinCredit = E.joinCredit(s); next.joinRound = s.rounds.length; }
    W(sp('players/' + id), next);
  }
  const here = () => sess().players.filter((p) => p.present);
  const curRound = () => { const r = sess().rounds; return r[r.length - 1] || null; };
  const roundDone = (round) => round && round.courts.every((c) => E.winnerOf(c));
  const roundStarted = (round) => round && round.courts.some((c) => E.winnerOf(c) || !blank(c.sa) || !blank(c.sb));
  const rsvpOf = (id) => (sess().rsvp[id] || {}).s || null;
  const rsvpIds = (v) => Object.entries(sess().rsvp).filter(([id, x]) => x && x.s === v && S.roster[id]).sort((a, b) => (a[1].at || 0) - (b[1].at || 0)).map(([id]) => id);

  // ---------- history & ratings ----------
  function days() {
    if (!daysCache) daysCache = Object.values(S.sessions).map(M.dayFrom).filter(Boolean);
    return daysCache;
  }
  function allGames() {
    const out = [];
    days().forEach((d) => d.games.forEach((g) => out.push({ date: d.date, i: g.i, a: g.a.map((id) => person(id).name), b: g.b.map((id) => person(id).name), w: g.w, sa: g.sa, sb: g.sb })));
    return out;
  }
  function groupRatingMap() {
    const seed = {};
    Object.values(S.roster).forEach((p) => { if (!blank(p.rating)) seed[p.name] = Number(p.rating); });
    return E.groupRatings(allGames(), seed, Number(S.settings.defaultRating));
  }
  function ratings() {
    const gr = groupRatingMap();
    const o = {};
    sess().players.forEach((p) => {
      const g = gr[person(p.id).name];
      o[p.id] = !hasRating(p.id) && g && g.games >= 6 ? g.rating : rating(p.id);
    });
    return o;
  }

  function plan() {
    const n = here().length;
    const courts = Math.min(Number(sess().courts), Math.floor(n / 4));
    const sit = courts > 0 ? n - courts * 4 : 0;
    const rounds = Number(S.settings.rounds) || 8;
    const slots = sit * rounds;
    return { n, courts, sit, rounds, lo: n ? Math.floor(slots / n) : 0, hi: n ? Math.ceil(slots / n) : 0 };
  }
  function planText() {
    const p = plan();
    if (p.courts < 1) return p.n + ' in · need 4+';
    return p.n + ' in · ' + p.courts + ' court' + (p.courts > 1 ? 's' : '') + (p.sit ? ' · ' + p.sit + ' sit/round' : ' · no sit-outs');
  }
  function sitText() {
    const p = plan();
    if (p.courts < 1) return 'Check in at least 4 players.';
    if (!p.sit) return 'Everyone plays every round.';
    const range = p.lo === p.hi ? p.lo + '' : p.lo + '–' + p.hi;
    return `Over ${p.rounds} rounds each player sits ${range} time${p.hi === 1 ? '' : 's'} (plays at least ${Math.round(100 * (p.rounds - p.hi) / p.rounds)}%). Nobody sits twice until everyone has sat once.`;
  }

  function buildRound(s) {
    const round = E.generateRound(s, {
      ratings: ratings(), mode: S.settings.mode, formBump: Number(S.settings.formBump),
      mixGap: Number(S.settings.mixGap), protectWinners: S.settings.protectWinners !== false,
    });
    round.createdAt = Date.now();
    round.timed = Number(S.settings.timerMin) > 0;
    round.timerEnd = round.timed && S.settings.timerAuto ? Date.now() + Number(S.settings.timerMin) * 60000 : null;
    return round;
  }
  function nextRound() {
    const s = sess();
    const round = buildRound(s);
    W(sp('rounds/' + s.rounds.length), M.roundToDb(round));
    buzz(30);
  }
  function redoRound() {
    const s = sess();
    const r = s.rounds.length - 1;
    const round = buildRound({ ...s, rounds: s.rounds.slice(0, r) });
    W(sp('rounds/' + r), M.roundToDb(round));
  }

  // ---------- timer ----------
  const warned = {};
  function tickTimer() {
    const round = curRound();
    if (!round || !round.timed || roundDone(round) || !sess().id) { $timer.innerHTML = ''; return; }
    if (!round.timerEnd) { $timer.innerHTML = `<button class="btn small teal" data-act="timerstart">▶ ${esc(S.settings.timerMin)}:00</button>`; return; }
    const left = Math.round((round.timerEnd - Date.now()) / 1000);
    const key = round.createdAt + ':' + round.timerEnd;
    if (tab === 'play' || display) {
      if (left <= 60 && left > 0 && !warned[key + 'w']) { warned[key + 'w'] = 1; buzz([200, 100, 200]); beep(1); }
      if (left <= 0 && !warned[key + 'u']) { warned[key + 'u'] = 1; buzz([400, 150, 400, 150, 400]); beep(3); toast('Time! Enter scores as they stand.'); }
    }
    const m = Math.floor(Math.abs(left) / 60), sec = String(Math.abs(left) % 60).padStart(2, '0');
    const txt = left <= 0 ? 'TIME' : m + ':' + sec;
    $timer.innerHTML = `<div class="timer ${left <= 0 ? 'up' : left <= 60 ? 'low' : ''}" data-act="timermenu">${txt}</div>`;
    const big = $('bigtimer');
    if (big) big.textContent = txt;
  }
  setInterval(tickTimer, 1000);
  let wake = null;
  async function keepAwake() {
    try {
      if (tab === 'play' && 'wakeLock' in navigator && !wake && document.visibilityState === 'visible') {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      }
    } catch (e) { wake = null; }
  }
  document.addEventListener('visibilitychange', keepAwake);

  // ---------- icons ----------
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    signup: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>'),
    today: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>'),
    play: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v4M12 17v4"/>'),
    results: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
    more: svg('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
  };

  // ---------- shared bits ----------
  function seg(key, options, scope) {
    const cur = String(scope === 'session' ? sess()[key] : S.settings[key]);
    return `<div class="seg">${options.map(([v, l]) => `<button class="${cur === String(v) ? 'on' : ''}" data-act="seg" data-key="${key}" data-val="${v}" data-scope="${scope || ''}">${l}</button>`).join('')}</div>`;
  }
  const shareLink = () => location.origin + location.pathname + '?go=signup' + (PRACTICE ? '&practice=1' : '');
  function sessionTitle(s) { return `${niceDate(s.date)} · ${esc(s.time || S.settings.time)}`; }

  // ---------- views ----------
  function viewSignup() {
    const s = sess();
    if (!s.id) return loadingHtml();
    const ins = rsvpIds('in'), outs = rsvpIds('out');
    const answered = new Set([...ins, ...outs]);
    const noReply = rosterList().filter((p) => !answered.has(p.id));
    const me = S.me && S.roster[S.me] ? S.me : null;
    const mine = me ? rsvpOf(me) : null;
    const upcoming = sessionList().filter((x) => x.date >= todayStr());
    const courts = Math.min(Number(s.courts), Math.floor(ins.length / 4));
    let meCard;
    if (!me) {
      meCard = `
        <h2>Who are you?</h2>
        <p class="muted small" style="margin-top:0">Tap your name once. This phone remembers you.</p>
        <div class="chips">${rosterList().map((p) => `<button class="chip" data-act="iam" data-id="${p.id}">${esc(p.name)}</button>`).join('') || '<span class="muted">No players yet.</span>'}</div>
        <div class="row" style="margin-top:12px"><input id="newme" placeholder="New here? Your name" autocomplete="off"><button class="btn sec" data-act="newme">Add me</button></div>`;
    } else {
      const p = person(me);
      meCard = `
        <div class="between"><h2 style="margin:0">Hi ${esc(p.name.split(' ')[0])} 👋</h2><button class="btn ghost small" data-act="notme">Not you?</button></div>
        <div class="row" style="margin-top:12px">
          <button class="btn grow big ${mine === 'in' ? '' : 'sec'}" data-act="rsvp" data-val="in">${mine === 'in' ? '✅ I\'m in' : 'I\'m in'}</button>
          <button class="btn grow big ${mine === 'out' ? 'warn' : 'sec'}" data-act="rsvp" data-val="out">${mine === 'out' ? '❌ Can\'t make it' : 'Can\'t make it'}</button>
        </div>
        <p class="muted small" style="margin:12px 0 6px">Keep your DUPR rating current (DUPR app → your profile). It sets the courts.</p>
        <div class="row">
          <input id="myrating" inputmode="decimal" placeholder="Rating, e.g. 3.45" value="${esc(blank(p.rating) ? '' : p.rating)}" style="flex:1">
          <input id="mydupr" placeholder="DUPR ID" value="${esc(p.dupr || '')}" autocomplete="off" style="flex:1">
          <button class="btn sec" data-act="saveme">Save</button>
        </div>`;
    }
    return `
      <div class="card">
        <div class="between">
          <div><h3>${sessionTitle(s)}</h3><div class="muted small">${esc(S.settings.location)}</div></div>
          ${upcoming.length > 1 ? `<select id="pickSession" style="width:auto">${upcoming.map((x) => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${niceDate(x.date)}</option>`).join('')}</select>` : ''}
        </div>
        <div class="stat" style="margin-top:12px">
          <div><b>${ins.length}</b><span>In</span></div>
          <div><b>${outs.length}</b><span>Out</span></div>
          <div><b>${courts}</b><span>Courts</span></div>
        </div>
      </div>
      <div class="card">${meCard}</div>
      <div class="card">
        <h2>In · ${ins.length}</h2>
        <div class="chips">${ins.map((id, i) => `<span class="chip in sm">${i + 1}. ${nm(id)}</span>`).join('') || '<span class="muted small">Nobody yet.</span>'}</div>
        ${outs.length ? `<h2 style="margin-top:14px">Out · ${outs.length}</h2><div class="chips">${outs.map((id) => `<span class="chip sm">${nm(id)}</span>`).join('')}</div>` : ''}
        ${noReply.length ? `<details style="margin-top:12px"><summary>No answer yet · ${noReply.length}</summary><div class="chips" style="margin-top:8px">${noReply.map((p) => `<span class="chip sm">${esc(p.name)}</span>`).join('')}</div></details>` : ''}
      </div>
      <div class="row">
        <button class="btn grow" data-act="sharesignup">Share sign-up link</button>
        <button class="btn sec grow" data-act="copyins">Copy list</button>
      </div>`;
  }

  function loadingHtml() {
    return `<div class="empty"><div class="ico"><img src="icon.svg" alt="" style="width:56px;height:56px"></div>${S.online ? 'Loading…' : 'Offline. Connect to load the group.'}</div>`;
  }

  function viewToday() {
    const s = sess();
    if (!s.id) return loadingHtml();
    const day = {};
    s.players.forEach((p) => { day[p.id] = p; });
    const p = plan();
    const ins = rsvpIds('in');
    const notChecked = ins.filter((id) => !(day[id] && day[id].present));
    const mark = (id) => (rsvpOf(id) === 'in' ? ' ✓' : rsvpOf(id) === 'out' ? ' ✗' : '');
    const chips = rosterList().map((x) => {
      const d = day[x.id];
      return `<button class="chip ${d && d.present ? 'in' : ''}" data-act="toggle" data-id="${x.id}">${esc(x.name)}<span class="n">${mark(x.id)}</span></button>`;
    }).join('');
    return `
      <div class="stat" style="margin-bottom:12px">
        <div><b>${p.n}</b><span>Here</span></div>
        <div><b>${p.courts || 0}</b><span>Courts</span></div>
        <div><b>${p.sit}</b><span>Sit / round</span></div>
      </div>
      ${notChecked.length ? `<button class="btn teal full big" style="margin-bottom:12px" data-act="checkinall">Check in the ${notChecked.length} who signed up</button>` : ''}
      <div class="card">
        <h2>Who's here · ${sessionTitle(s)}</h2>
        <p class="muted small" style="margin:0 0 12px">Tap to check in or out. ✓ signed up · ✗ said they can't make it.</p>
        <div class="chips">${chips || '<span class="muted">No players yet.</span>'}</div>
        <div class="row" style="margin-top:12px"><input id="one" placeholder="Add a new player" autocomplete="off"><button class="btn sec" data-act="addone">Add</button></div>
        <details style="margin-top:10px"><summary>Paste a list of names</summary>
          <textarea id="paste" style="margin-top:8px" placeholder="One name per line. Add a rating after a name to set it (Bilal Majeed 3.4)."></textarea>
          <button class="btn sec full" style="margin-top:8px" data-act="paste">Add and check in</button>
        </details>
      </div>
      <div class="card">
        <h2>Courts available</h2>
        ${seg('courts', [[3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7']], 'session')}
        <p class="muted small" style="margin:10px 0 0">${esc(sitText())}</p>
      </div>
      ${s.rounds.length
        ? `<button class="btn full big sticky-cta" data-act="goplay">Back to round ${s.rounds.length} →</button>`
        : `<button class="btn full big sticky-cta" data-act="start" ${p.courts < 1 ? 'disabled' : ''}>Start round 1 →</button>`}`;
  }

  function courtHtml(round, r, k) {
    const c = round.courts[k];
    const w = E.winnerOf(c);
    const n = round.courts.length;
    const avg = [...c.a, ...c.b].reduce((t, id) => t + rating(id), 0) / 4;
    const warn = E.scoreWarning(c.sa, c.sb, Number(S.settings.target), Number(S.settings.winBy), round.timed);
    const side = (code, ids, pts) => `
      <div class="side ${w === code ? 'won' : w ? 'lost' : ''}" data-act="score" data-r="${r}" data-k="${k}" data-side="${code}">
        <div class="who">${ids.map((id) => `<div>${nm(id)}${id === S.me ? ' ⭐' : ''}<small>${hasRating(id) ? rating(id).toFixed(2) : ''}</small></div>`).join('')}</div>
        <div class="pts">${blank(pts) ? (w === code ? 'W' : '–') : esc(pts)}</div>
      </div>`;
    return `
      <div class="court ${k === 0 && n > 1 ? 'c1' : ''} ${w ? 'done' : ''}">
        <span class="tag">${k === 0 && n > 1 ? '👑 ' : ''}Court ${k + 1}</span>
        <span class="avg">${avg.toFixed(2)}</span>
        ${side('A', c.a, c.sa)}
        <div class="net"></div>
        ${side('B', c.b, c.sb)}
        ${warn ? `<div class="warnline">⚠ ${esc(warn)}</div>` : w ? '' : '<div class="hint">Tap the winning team</div>'}
      </div>`;
  }

  function myBanner(round) {
    if (!S.me || !round) return '';
    if (round.sitting.includes(S.me)) return '<div class="bench">🪑 <span><b>You\'re sitting out</b> this round.</span></div>';
    const k = round.courts.findIndex((c) => [...c.a, ...c.b].includes(S.me));
    if (k < 0) return '';
    const c = round.courts[k];
    const mine = c.a.includes(S.me) ? c.a : c.b, them = c.a.includes(S.me) ? c.b : c.a;
    const mate = mine.find((x) => x !== S.me);
    return `<div class="bench" style="background:rgba(216,245,74,.1);border-color:rgba(216,245,74,.4);color:var(--ball)">⭐ <span><b>You're on Court ${k + 1}</b> with ${nm(mate)} vs ${them.map(nm).join(' & ')}</span></div>`;
  }

  function viewPlay() {
    const s = sess();
    if (!s.id) return loadingHtml();
    if (!s.rounds.length) {
      return `<div class="empty"><div class="ico"><img src="icon.svg" alt="" style="width:56px;height:56px"></div>No round yet for ${sessionTitle(s)}.<br><br>
        <button class="btn big" data-act="start" ${plan().courts < 1 ? 'disabled' : ''}>Start round 1 →</button>
        <p class="muted">${esc(planText())}</p></div>`;
    }
    const r = s.rounds.length - 1;
    const round = s.rounds[r];
    const st = E.derive(s);
    const done = roundDone(round);
    const doneCount = round.courts.filter((c) => E.winnerOf(c)).length;
    const hereChips = s.players.slice().sort((a, b) => person(a.id).name.localeCompare(person(b.id).name))
      .map((p) => `<button class="chip sm ${p.present ? 'in' : ''}" data-act="toggle" data-id="${p.id}">${nm(p.id)}<span class="n">${p.joinRound == null ? '' : '·' + st[p.id].sits}</span></button>`).join('');
    const past = s.rounds.slice(0, r).map((rd, i) => `
      <details><summary>Round ${i + 1}${rd.sitting.length ? ' · sat: ' + rd.sitting.map(nm).join(', ') : ''}</summary>
        <div style="margin-top:8px">${rd.courts.map((_, k) => courtHtml(rd, i, k)).join('')}</div>
      </details>`).reverse().join('');
    return `
      ${myBanner(round)}
      <div class="roundbar">
        <h3 class="grow">Round ${r + 1}<small>of ~${esc(S.settings.rounds)}</small></h3>
        <button class="btn sec small" data-act="display">⛶ Show players</button>
      </div>
      <div class="progress"><i style="width:${(doneCount / round.courts.length) * 100}%"></i></div>
      ${round.sitting.length ? `<div class="bench">🪑 <span>Sitting out: ${round.sitting.map((id) => `<b>${nm(id)}</b>`).join(', ')}</span></div>` : ''}
      ${round.courts.map((_, k) => courtHtml(round, r, k)).join('')}
      <button class="btn full big sticky-cta" data-act="next" ${done && plan().courts >= 1 ? '' : 'disabled'}>${done ? `Start round ${r + 2} →` : `${doneCount} of ${round.courts.length} courts done`}</button>
      <div class="row" style="margin-top:10px">
        <button class="btn sec grow small" data-act="copylineup">Copy lineup</button>
        ${!roundStarted(round) ? '<button class="btn sec grow small" data-act="reshuffle">Redo round</button>' : ''}
        <button class="btn sec grow small" data-act="finish">Finish day</button>
      </div>
      <div class="card" style="margin-top:14px">
        <h2>Who's here</h2>
        <p class="muted small" style="margin:0 0 10px">Late or leaving? Tap a name; changes apply next round. ·n = rounds sat.</p>
        <div class="chips">${hereChips}</div>
        <div class="row" style="margin-top:10px"><input id="one" placeholder="Late arrival's name" autocomplete="off"><button class="btn sec" data-act="addone">Add</button></div>
      </div>
      ${past ? `<div class="card"><h2>Earlier rounds</h2>${past}</div>` : ''}
      <button class="btn ${armed === 'undo' ? 'warn' : 'ghost'} full" data-act="undo">${armed === 'undo' ? 'Tap again to delete round ' + (r + 1) : 'Undo round ' + (r + 1)}</button>`;
  }

  // ---------- results ----------
  function duprStatus() {
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
  function people() {
    const o = {};
    Object.entries(S.roster).forEach(([id, p]) => { o[id] = { name: p.name, dupr: (p.dupr || '').trim() }; });
    return o;
  }
  const todayRows = (s) => E.standings(s).sort((a, b) => b.pf - a.pf || (b.pf - b.pa) - (a.pf - a.pa) || b.wins - a.wins);
  function viewResults() {
    const s = sess();
    const rows = s.id ? todayRows(s) : [];
    let today = '';
    if (rows.length) {
      const awards = E.dayAwards(s);
      const d = duprStatus();
      today = `
        <div class="card">
          <div class="between"><h2 style="margin:0">${sessionTitle(s)}</h2><span class="pill">${s.rounds.length} rounds</span></div>
          ${awards.length ? `<div class="awards" style="margin-top:12px">${awards.map((a) => `<div class="award"><div class="t">${esc(a.title)}</div><div class="w">${a.who.map(nm).join(' & ')}</div><div class="d">${esc(a.detail)}</div></div>`).join('')}</div>` : ''}
          <table style="margin-top:10px">
            <tr><th></th><th>Player</th><th>Pts</th><th>+/-</th><th>W-L</th><th>Sat</th></tr>
            ${rows.map((x, i) => `<tr class="click" data-act="card" data-id="${x.id}"><td class="rk">${i + 1}</td><td>${nm(x.id)}${x.streak >= 3 ? ' <span class="fire">🔥' + x.streak + '</span>' : ''}</td><td class="hl">${x.pf}</td><td>${x.pf - x.pa > 0 ? '+' : ''}${x.pf - x.pa}</td><td>${x.wins}-${x.games - x.wins}</td><td>${x.sits}</td></tr>`).join('')}
          </table>
        </div>
        <div class="card" id="dupr">
          <h2>DUPR</h2>
          <div class="check"><div class="dot ${d.noScore.length ? 'no' : 'ok'}">${d.noScore.length ? '!' : '✓'}</div>
            <div>${d.noScore.length ? `<b>${d.noScore.length} game${d.noScore.length > 1 ? 's' : ''} need a score</b><div class="chips" style="margin-top:6px">${d.noScore.map((g) => `<button class="chip sm" data-act="score" data-r="${g.r}" data-k="${g.k}">Round ${g.r + 1} · Court ${g.k + 1}</button>`).join('')}</div>` : 'Every game has a score'}</div></div>
          <div class="check"><div class="dot ${d.noId.length ? 'no' : 'ok'}">${d.noId.length ? '!' : '✓'}</div>
            <div class="grow">${d.noId.length ? `<b>${d.noId.length} player${d.noId.length > 1 ? 's' : ''} missing a DUPR ID</b>
              <div class="stack" style="margin-top:8px">${d.noId.map((id) => `<div class="row"><span class="grow">${nm(id)}</span><input style="width:150px" placeholder="DUPR ID" data-act="pdupr" data-id="${id}" autocomplete="off"></div>`).join('')}</div>` : 'Everyone has a DUPR ID'}</div></div>
          <p class="muted small">${d.ready} of ${d.total} games ready to submit. Games missing a score or ID are left out.</p>
          <div class="row"><button class="btn grow" data-act="sendDupr" ${d.ready ? '' : 'disabled'}>Send DUPR file</button><button class="btn sec" data-act="dupr" ${d.ready ? '' : 'disabled'}>Download</button></div>
          <p class="muted small" style="margin-bottom:0">Bilal uploads it on dupr.com (computer): Club → Matches → Add Matches → Import Matches via CSV.</p>
        </div>
        <button class="btn sec full" style="margin-bottom:16px" data-act="share">Copy recap for WhatsApp</button>`;
    }
    return today + viewRankings() + (rows.length ? '' : '<p class="muted small" style="text-align:center">This session\'s results show up once a round is scored.</p>');
  }

  const PERIODS = [[28, '4 wks'], [56, '2 mo'], [182, '6 mo'], [0, 'All']];
  const SORTS = [['pfg', 'Points'], ['diff', '+/-'], ['pct', 'Win %'], ['ppg', 'Court']];
  const SORT_HEAD = { pfg: 'Pts/G', diff: '+/-', pct: 'Win%', ppg: 'Crt/G', wins: 'Wins' };
  const sortVal = (x) => ({ pfg: x.pfg.toFixed(1), diff: (x.diff > 0 ? '+' : '') + x.diff.toFixed(1), pct: Math.round(x.pct * 100) + '%', ppg: x.ppg.toFixed(2), wins: x.wins }[S.rankSort] || x.pfg.toFixed(1));
  const SORT_NOTE = {
    pfg: 'Points: average game points you score. Every point counts, even in a loss.',
    diff: '+/-: average points scored minus points allowed per game.',
    pct: 'Win %: share of games won.',
    ppg: 'Court: court points per game; a win on a higher court is worth more.',
  };
  function rankData() {
    const ds = days();
    const period = Number(S.rankPeriod);
    let since = null;
    if (period) { const d = new Date(); d.setDate(d.getDate() - period); since = ymd(d); }
    const all = E.rankings(ds, since, S.rankSort, 0);
    const maxGames = all.reduce((m, x) => Math.max(m, x.games), 0);
    const minGames = Math.max(5, Math.round(maxGames * 0.4));
    return { list: E.rankings(ds, since, S.rankSort, minGames).filter((x) => S.roster[x.id]), minGames, nDays: ds.filter((d) => !since || d.date >= since).length };
  }
  function viewRankings() {
    const { list, minGames, nDays } = rankData();
    const needMin = S.rankSort !== 'wins';
    const medal = (i, x) => (i < 3 && (!needMin || x.qualified) ? ['🥇', '🥈', '🥉'][i] : i + 1);
    return `
      <div class="card">
        <h2>Rankings</h2>
        <div class="seg" style="margin-bottom:8px">${PERIODS.map(([v, l]) => `<button class="${String(S.rankPeriod) === String(v) ? 'on' : ''}" data-act="rank" data-key="rankPeriod" data-val="${v}">${l}</button>`).join('')}</div>
        <div class="seg" style="margin-bottom:6px">${SORTS.map(([v, l]) => `<button class="${S.rankSort === v ? 'on' : ''}" data-act="rank" data-key="rankSort" data-val="${v}">${l}</button>`).join('')}</div>
        ${list.length ? `<table>
          <tr><th></th><th>Player</th><th>${SORT_HEAD[S.rankSort] || 'Pts/G'}</th><th>W-L</th><th>Days</th></tr>
          ${list.map((x, i) => `<tr class="click ${needMin && !x.qualified ? 'dim' : ''}" data-act="card" data-id="${x.id}"><td class="rk">${medal(i, x)}</td><td>${nm(x.id)}${x.id === S.me ? ' ⭐' : ''}</td>
            <td class="hl">${sortVal(x)}</td><td>${x.wins}-${x.games - x.wins}</td><td>${x.days}</td></tr>`).join('')}
        </table>
        <p class="muted small">${nDays} session${nDays === 1 ? '' : 's'}. ${SORT_NOTE[S.rankSort] || ''} ${needMin ? `Needs ${minGames}+ games to rank.` : ''} Tap a player for their card.</p>
        <div class="row"><button class="btn sec grow" data-act="sharerank">Copy top 10</button><a class="btn ghost grow" href="rankings.html" style="text-decoration:none">Rankings page</a></div>`
        : '<p class="muted">No games in this period yet.</p>'}
      </div>`;
  }

  // ---------- more ----------
  function viewMore() {
    const tabs = [['players', 'Players'], ['sessions', 'Sessions'], ['settings', 'Settings']];
    const body = moreTab === 'sessions' ? viewSessions() : moreTab === 'settings' ? viewSettings() : viewPlayers();
    return `<div class="seg" style="margin-bottom:12px">${tabs.map(([k, l]) => `<button class="${moreTab === k ? 'on' : ''}" data-act="moretab" data-val="${k}">${l}</button>`).join('')}</div>${body}`;
  }
  function viewSessions() {
    const list = sessionList();
    return `
      <div class="card">
        <h2>New session</h2>
        <div class="row"><input type="date" id="newdate" value="${nextSaturday()}"><input id="newtime" value="${esc(S.settings.time)}" style="max-width:120px"></div>
        <button class="btn full" style="margin-top:10px" data-act="newsession">Create session</button>
        <p class="muted small" style="margin-bottom:0">Players sign up for it from the Sign-up tab. Every session's games count toward rankings.</p>
      </div>
      <div class="card">
        <h2>All sessions · ${list.length}</h2>
        ${list.map((x) => {
          const ins = Object.values(x.rsvp).filter((v) => v && v.s === 'in').length;
          return `<div class="between" style="padding:10px 0;border-bottom:1px solid var(--line)">
            <div><b>${niceDate(x.date)}</b> <span class="muted small">${esc(x.time)}</span><div class="muted small">${ins} signed up · ${x.rounds.length} rounds</div></div>
            ${x.id === sess().id ? '<span class="pill">Open</span>' : `<button class="btn sec small" data-act="opensession" data-id="${x.id}">Open</button>`}
          </div>`;
        }).join('') || '<p class="muted">No sessions yet.</p>'}
      </div>`;
  }
  function viewPlayers() {
    const list = rosterList();
    const pasteBox = (open) => `<details style="margin-top:12px" ${open ? 'open' : ''}><summary>Paste names with ratings</summary>
          <textarea id="pasteroster" style="margin-top:8px" placeholder="Bilal Majeed 3.4&#10;Ahmed Irfan 3.64"></textarea>
          <button class="btn sec full" style="margin-top:8px" data-act="pasteroster">Add or update players</button>
        </details>`;
    if (!list.length) return `<div class="card"><h2>Players</h2><p class="muted">No players yet. Paste your group below (one per line, rating optional), or players can add themselves on the Sign-up tab.</p>${pasteBox(true)}</div>`;
    const missR = list.filter((p) => !hasRating(p.id)).length;
    const missD = list.filter((p) => !p.dupr).length;
    return `
      <div class="card">
        <div class="between"><h2 style="margin:0">Players · ${list.length}</h2>
          <span>${missR ? `<span class="pill miss">${missR} no rating</span>` : ''} ${missD ? `<span class="pill miss">${missD} no DUPR ID</span>` : ''}</span></div>
        <p class="muted small">Ratings decide courts (court 1 = highest). No rating counts as ${esc(S.settings.defaultRating)}. Changes save for everyone.</p>
        <div class="plist">
          <div class="p muted small"><span>Name</span><span>Rating</span><span>DUPR ID</span><span></span></div>
          ${list.map((p) => `<div class="p">
            <input value="${esc(p.name)}" data-act="pname" data-id="${p.id}">
            <input value="${esc(blank(p.rating) ? '' : p.rating)}" inputmode="decimal" placeholder="3.50" data-act="prating" data-id="${p.id}">
            <input value="${esc(p.dupr || '')}" placeholder="ID" data-act="pdupr" data-id="${p.id}" autocomplete="off">
            <button class="x" data-act="pdel" data-id="${p.id}">${armed === 'del' + p.id ? '✓?' : '✕'}</button>
          </div>`).join('')}
        </div>
        ${pasteBox(false)}
      </div>`;
  }
  function viewSettings() {
    const st = S.settings;
    return `
      <p class="muted small" style="margin:0 0 10px">Settings are shared by the whole group.</p>
      <div class="card">
        <h2>Games</h2>
        <label class="f">Play to ${seg('target', [[11, '11'], [15, '15'], [21, '21']])}</label>
        <label class="f">Win by ${seg('winBy', [[1, '1'], [2, '2']])}</label>
        <label class="f">Scoring ${seg('scoreType', [['SIDEOUT', 'Side-out'], ['RALLY', 'Rally']])}</label>
        <label class="f">Rounds in a morning (for sit-out estimates) ${seg('rounds', [[6, '6'], [7, '7'], [8, '8'], [9, '9'], [10, '10']])}</label>
      </div>
      <div class="card">
        <h2>Round timer</h2>
        <label class="f">Minutes per round ${seg('timerMin', [[0, 'Off'], [8, '8'], [10, '10'], [12, '12'], [15, '15']])}</label>
        <label class="f">Start the timer ${seg('timerAuto', [[true, 'Automatically'], [false, 'When I tap']])}</label>
        <p class="muted small" style="margin:0">Buzzes at 1 minute left and at time. Timed games can end below ${esc(st.target)}; enter the score as it stands.</p>
      </div>
      <div class="card">
        <h2>Courts</h2>
        <label class="f">Placement ${seg('mode', [['rating', 'By rating'], ['ladder', 'Up & down ladder']])}</label>
        <label class="f">Court variety ${seg('mixGap', [[0, 'Off'], [0.15, 'Light'], [0.3, 'Normal'], [0.45, 'More']])}</label>
        <label class="f">Protect winners from sitting ${seg('protectWinners', [[true, 'On'], [false, 'Off']])}</label>
        <p class="muted small" style="margin:-4px 0 12px">Sit-outs stay equal: whoever has sat the least sits next, nobody sits twice in a row, and among those due to sit, whoever just lost sits before anyone on a winning streak.</p>
        <label class="f">Hot-streak nudge (rating points per net win today)<input data-act="set" data-key="formBump" inputmode="decimal" value="${esc(st.formBump)}"></label>
        <label class="f">Rating for players without one<input data-act="set" data-key="defaultRating" inputmode="decimal" value="${esc(st.defaultRating)}"></label>
      </div>
      <div class="card">
        <h2>Sessions & DUPR file</h2>
        <label class="f">Default start time<input data-act="set" data-key="time" value="${esc(st.time)}"></label>
        <label class="f">Event name<input data-act="set" data-key="event" value="${esc(st.event)}"></label>
        <label class="f">Location<input data-act="set" data-key="location" value="${esc(st.location)}"></label>
      </div>
      <div class="card">
        <h2>Connection</h2>
        <p class="muted small" style="margin:0">${S.online ? '🟢 Live: changes sync to every phone instantly.' : '🟠 Offline: changes are saved on this phone and sync when you reconnect.'}</p>
      </div>`;
  }

  // ---------- overlays ----------
  function sheetHtml() {
    if (!sheet) return '';
    if (sheet.type === 'card') return playerCardHtml(sheet.id);
    if (sheet.type === 'timer') {
      return `<div class="scrim" data-act="close"><div class="sheet" data-stop>
        <div class="grab"></div><h3 style="margin-bottom:12px">Round timer</h3>
        <div class="stack">
          <button class="btn sec full" data-act="timeradd">+1 minute</button>
          <button class="btn sec full" data-act="timerrestart">Restart ${esc(S.settings.timerMin)}:00</button>
          <button class="btn ghost full" data-act="timeroff">Turn off for this round</button>
        </div></div></div>`;
    }
    const round = sess().rounds[sheet.r];
    if (!round) { sheet = null; return ''; }
    const c = round.courts[sheet.k];
    const target = Number(S.settings.target);
    const team = (ids) => ids.map(nm).join(' & ');
    const timed = round.timed;
    const win = sheet.side;
    let body;
    if (!win) {
      body = `<p class="muted" style="margin-top:0">Who won?</p>
        <div class="teampick"><button data-act="pickwin" data-side="A">${team(c.a)}</button><button data-act="pickwin" data-side="B">${team(c.b)}</button></div>`;
    } else {
      const loser = win === 'A' ? c.b : c.a;
      body = `<div class="between" style="margin-bottom:10px"><span>🏆 <b>${team(win === 'A' ? c.a : c.b)}</b></span><button class="btn ghost small" data-act="pickwin" data-side="">Change</button></div>
        <p class="muted" style="margin:0 0 8px">${team(loser)} scored${timed ? ' (game reached ' + target + ')' : ''}:</p>
        <div class="scoregrid">${Array.from({ length: target - 1 }, (_, i) => `<button data-act="quick" data-lo="${i}">${i}</button>`).join('')}</div>
        <p class="muted small" style="margin:14px 0 8px">${timed ? 'Time ran out, close game or other score:' : 'Close game or other score:'}</p>
        <div class="vs">
          <div><div class="muted small" style="text-align:center;margin-bottom:4px">${team(c.a)}</div><input id="ea" inputmode="numeric" value="${esc(c.sa)}" placeholder="${win === 'A' ? target : ''}"></div>
          <b class="muted">–</b>
          <div><div class="muted small" style="text-align:center;margin-bottom:4px">${team(c.b)}</div><input id="eb" inputmode="numeric" value="${esc(c.sb)}" placeholder="${win === 'B' ? target : ''}"></div>
        </div>
        <button class="btn full" style="margin-top:12px" data-act="savescore">Save score</button>
        <button class="btn ghost full" style="margin-top:8px" data-act="nosave">Winner only, no score (won't go to DUPR)</button>`;
    }
    return `<div class="scrim" data-act="close"><div class="sheet" data-stop>
      <div class="grab"></div>
      <div class="between" style="margin-bottom:12px"><h3>Court ${sheet.k + 1}</h3><span class="muted small">Round ${sheet.r + 1}${timed ? ' · timed' : ''}</span></div>
      ${body}
      ${E.winnerOf(c) ? '<button class="btn ghost full" style="margin-top:8px" data-act="clearscore">Clear result</button>' : ''}
    </div></div>`;
  }
  function playerCardHtml(id) {
    const p = person(id);
    const card = E.playerCard(allGames(), p.name);
    const { list } = rankData();
    const rk = list.findIndex((x) => x.id === id);
    const me = list[rk];
    const gr = groupRatingMap()[p.name];
    const initials = p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    return `<div class="scrim" data-act="close"><div class="sheet" data-stop>
      <div class="grab"></div>
      <div class="pc-head"><div class="avatar">${esc(initials)}</div><div><h3>${esc(p.name)}</h3>
        <div class="muted small">${hasRating(id) ? 'DUPR ' + rating(id).toFixed(2) : 'No rating'}${p.dupr ? ' · ID ' + esc(p.dupr) : ''}</div></div></div>
      <div class="stat">
        <div><b>${card.wins}-${card.losses}</b><span>Record</span></div>
        <div><b>${me ? me.pfg.toFixed(1) : '–'}</b><span>Pts / game</span></div>
        <div><b>${rk >= 0 ? '#' + (rk + 1) : '–'}</b><span>Rank</span></div>
      </div>
      <div class="stack" style="margin-top:12px">
        <div class="between"><span class="muted">Group rating</span><b>${gr && gr.games ? gr.rating.toFixed(2) + (hasRating(id) ? ` <span class="muted small">(${(gr.rating - rating(id) >= 0 ? '+' : '') + (gr.rating - rating(id)).toFixed(2)} vs DUPR)</span>` : '') : '–'}</b></div>
        <div class="between"><span class="muted">Point +/- per game</span><b>${me ? (me.diff > 0 ? '+' : '') + me.diff.toFixed(1) : '–'}</b></div>
        <div class="between"><span class="muted">Current streak</span><b>${card.streak > 0 ? '🔥 ' + card.streak + ' W' : card.streak < 0 ? -card.streak + ' L' : '–'}</b></div>
        <div class="between"><span class="muted">Best win streak</span><b>${card.bestStreak || '–'}</b></div>
        <div class="between"><span class="muted">Best partner</span><b>${card.bestPartner ? esc(card.bestPartner.name) + ' (' + card.bestPartner.w + '-' + (card.bestPartner.g - card.bestPartner.w) + ')' : '–'}</b></div>
        <div class="between"><span class="muted">Different partners</span><b>${card.partnersPlayed}</b></div>
      </div>
      <button class="btn sec full" style="margin-top:14px" data-act="close">Close</button>
    </div></div>`;
  }
  function displayHtml() {
    if (!display) return '';
    const s = sess();
    const round = curRound();
    if (!round) return '';
    const left = round.timerEnd ? Math.round((round.timerEnd - Date.now()) / 1000) : null;
    return `<div class="display">
      <button class="btn sec small close" data-act="hidedisplay">✕ Close</button>
      <h1>Round ${s.rounds.length}</h1>
      <div class="muted">${sessionTitle(s)}${left !== null ? ` · <b id="bigtimer" style="color:var(--ball)">${left <= 0 ? 'TIME' : Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0')}</b>` : ''}</div>
      <div class="dgrid">${round.courts.map((c, k) => `<div class="dcourt">
        <div class="n">${k === 0 && round.courts.length > 1 ? '👑 ' : ''}Court ${k + 1}</div>
        <div class="t">${c.a.map(nm).join(' & ')}</div><div class="v">VS</div><div class="t">${c.b.map(nm).join(' & ')}</div>
      </div>`).join('')}</div>
      ${round.sitting.length ? `<div class="bench" style="margin-top:16px;font-size:18px">🪑 Sitting: <b>${round.sitting.map(nm).join(', ')}</b></div>` : ''}
    </div>`;
  }

  // ---------- render ----------
  const TABS = [
    ['signup', 'Sign-up', viewSignup],
    ['today', 'Check-in', viewToday],
    ['play', 'Courts', viewPlay],
    ['results', 'Results', viewResults],
    ['more', 'More', viewMore],
  ];
  function render() {
    const s = sess();
    const y = window.scrollY;
    $sub.textContent = s.id ? [PRACTICE ? 'PRACTICE MODE' : '', niceDate(s.date), planText(), s.rounds.length ? 'round ' + s.rounds.length : '', S.online ? '' : 'offline'].filter(Boolean).join(' · ') : 'Loading…';
    if (!TABS.find((t) => t[0] === tab)) tab = 'signup';
    $nav.innerHTML = TABS.map(([k, label]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${ICONS[k]}${label}</button>`).join('');
    $app.innerHTML = TABS.find((t) => t[0] === tab)[2]();
    $overlay.innerHTML = displayHtml() + sheetHtml();
    window.scrollTo(0, y);
    tickTimer();
    keepAwake();
  }
  function go(t) { tab = t; armed = null; render(); window.scrollTo(0, 0); }

  // ---------- actions ----------
  function setScore(r, k, sa, sb, winner) {
    const c = sess().rounds[r].courts[k];
    W(sp(`rounds/${r}/courts/${k}`), M.courtToDb({ ...c, sa, sb, winner: winner || null }));
    sheet = null;
    const round = { ...sess().rounds[r] };
    round.courts = round.courts.map((x, i) => (i === k ? { ...x, sa, sb, winner } : x));
    if (r === sess().rounds.length - 1 && roundDone(round)) { buzz([60, 60, 60]); toast('All courts done. Tap Start round ' + (r + 2) + '.'); }
  }
  function lineupText() {
    const s = sess();
    const round = curRound();
    return `🟡 P4A Round ${s.rounds.length}\n` +
      round.courts.map((c, k) => `Court ${k + 1}: ${c.a.map((id) => person(id).name).join(' & ')} vs ${c.b.map((id) => person(id).name).join(' & ')}`).join('\n') +
      (round.sitting.length ? `\nSitting: ${round.sitting.map((id) => person(id).name).join(', ')}` : '');
  }
  const duprFile = () => E.duprCsv(sess(), people(), { event: S.settings.event, location: S.settings.location, scoreType: S.settings.scoreType });

  async function onClick(e) {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { sheet = null; display = false; go(tabBtn.dataset.tab); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'close' && e.target.closest('[data-stop]') && !e.target.closest('button[data-act="close"]')) return;
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
    const act = el.dataset.act;
    const s = sess();
    const wasArmed = armed;
    armed = null;
    switch (act) {
      case 'close': sheet = null; break;
      // sign-up
      case 'iam': S.me = el.dataset.id; savePrefs(); break;
      case 'notme': S.me = null; savePrefs(); break;
      case 'newme': { const v = $('newme').value.trim(); if (!v) return; S.me = ensurePlayer(v); savePrefs(); toast('Welcome, ' + v + '!'); break; }
      case 'rsvp': {
        if (!S.me || !s.id) return;
        const v = el.dataset.val;
        const was = rsvpOf(S.me);
        W(sp('rsvp/' + S.me), was === v ? null : { s: v, at: Date.now() });
        if (v === 'in' && was !== 'in') toast("You're in for " + niceDate(s.date) + '!');
        break;
      }
      case 'saveme': {
        if (!S.me) return;
        const r = $('myrating').value.trim(), d = $('mydupr').value.trim();
        if (r !== '' && (isNaN(+r) || +r < 1 || +r > 8)) { toast('Rating should look like 3.45'); return; }
        W('players/' + S.me + '/rating', r === '' ? null : +r);
        W('players/' + S.me + '/dupr', d);
        toast('Saved');
        break;
      }
      case 'sharesignup': {
        const txt = `🟡 P4A ${niceDate(s.date)} ${s.time}: tap to sign up (and keep your DUPR rating current)\n${shareLink()}`;
        if (navigator.share) { try { await navigator.share({ text: txt }); } catch (err) { /* cancelled */ } } else copy(txt);
        return;
      }
      case 'copyins': {
        const ins = rsvpIds('in');
        copy(`🟡 P4A ${niceDate(s.date)} ${s.time} · ${ins.length} in\n` + ins.map((id, i) => `${i + 1}. ${person(id).name}`).join('\n') + `\nSign up: ${shareLink()}`);
        return;
      }
      // check-in
      case 'checkinall': rsvpIds('in').forEach((id) => { const d = dayPlayer(id); if (!d || !d.present) setHere(id, true); }); toast('Checked in'); break;
      case 'paste': {
        const rows = E.parseRoster($('paste').value);
        rows.forEach((r) => setHere(ensurePlayer(r.name, r.rating), true));
        toast(rows.length ? 'Added ' + rows.length + ' players' : 'No names found');
        break;
      }
      case 'pasteroster': {
        const rows = E.parseRoster($('pasteroster').value);
        rows.forEach((r) => ensurePlayer(r.name, r.rating));
        toast(rows.length ? 'Saved ' + rows.length + ' players' : 'No names found');
        break;
      }
      case 'addone': { const v = $('one').value.trim(); if (v) { setHere(ensurePlayer(v), true); toast(v + ' is in'); } break; }
      case 'toggle': { const d = dayPlayer(el.dataset.id); setHere(el.dataset.id, !(d && d.present)); break; }
      case 'seg': {
        const v = el.dataset.val;
        const val = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
        if (el.dataset.scope === 'session') { W(sp(el.dataset.key), val); if (el.dataset.key === 'courts') W('meta/settings/courts', val); }
        else W('meta/settings/' + el.dataset.key, val);
        break;
      }
      case 'start': case 'next':
        try { nextRound(); tab = 'play'; window.scrollTo(0, 0); } catch (err) { toast(err.message); }
        break;
      case 'goplay': go('play'); return;
      case 'reshuffle': try { redoRound(); toast("Round redone with who's here"); } catch (err) { toast(err.message); } break;
      case 'undo': if (wasArmed === 'undo') { W(sp('rounds/' + (s.rounds.length - 1)), null); toast('Round removed'); } else armed = 'undo'; break;
      case 'finish': go('results'); setTimeout(() => { const d = $('dupr'); if (d) d.scrollIntoView({ behavior: 'smooth' }); }, 50); return;
      case 'display': display = true; break;
      case 'hidedisplay': display = false; break;
      case 'copylineup': copy(lineupText()); return;
      case 'score': {
        const r = +el.dataset.r, k = +el.dataset.k;
        sheet = { type: 'score', r, k, side: el.dataset.side || E.winnerOf(s.rounds[r].courts[k]) || null };
        break;
      }
      case 'pickwin': sheet.side = el.dataset.side || null; break;
      case 'quick': {
        const t = Number(S.settings.target), lo = +el.dataset.lo;
        if (sheet.side === 'A') setScore(sheet.r, sheet.k, t, lo, 'A'); else setScore(sheet.r, sheet.k, lo, t, 'B');
        break;
      }
      case 'savescore': {
        const t = Number(S.settings.target);
        let a = $('ea').value.replace(/\D/g, ''), b = $('eb').value.replace(/\D/g, '');
        if (a === '' && sheet.side === 'A') a = String(t);
        if (b === '' && sheet.side === 'B') b = String(t);
        if (a === '' || b === '') { toast('Enter both scores'); return; }
        if (+a === +b) { toast('Scores are tied. Who won?'); return; }
        const w = +a > +b ? 'A' : 'B';
        if (w !== sheet.side) toast('Saved. Winner set from the score.');
        setScore(sheet.r, sheet.k, +a, +b, w);
        break;
      }
      case 'nosave': setScore(sheet.r, sheet.k, '', '', sheet.side); break;
      case 'clearscore': setScore(sheet.r, sheet.k, '', '', null); break;
      case 'timerstart': W(sp(`rounds/${s.rounds.length - 1}/timerEnd`), Date.now() + Number(S.settings.timerMin) * 60000); break;
      case 'timermenu': sheet = { type: 'timer' }; break;
      case 'timeradd': { const round = curRound(); W(sp(`rounds/${s.rounds.length - 1}/timerEnd`), Math.max(round.timerEnd || 0, Date.now()) + 60000); sheet = null; break; }
      case 'timerrestart': W(sp(`rounds/${s.rounds.length - 1}/timerEnd`), Date.now() + Number(S.settings.timerMin) * 60000); sheet = null; break;
      case 'timeroff': W(sp(`rounds/${s.rounds.length - 1}/timed`), false); sheet = null; break;
      // results
      case 'rank': S[el.dataset.key] = isNaN(+el.dataset.val) ? el.dataset.val : +el.dataset.val; savePrefs(); break;
      case 'card': sheet = { type: 'card', id: el.dataset.id }; break;
      case 'share': {
        const rows = todayRows(s);
        const aw = E.dayAwards(s);
        copy(`🟡 P4A ${niceDate(s.date)} recap (${s.rounds.length} rounds)\n` +
          (aw.length ? aw.map((a) => `🏅 ${a.title}: ${a.who.map((id) => person(id).name).join(' & ')} (${a.detail})`).join('\n') + '\n\n' : '') +
          rows.map((x, i) => `${i + 1}. ${person(x.id).name}: ${x.pf} pts (${x.pf - x.pa >= 0 ? '+' : ''}${x.pf - x.pa}), ${x.wins}-${x.games - x.wins}`).join('\n'));
        return;
      }
      case 'sharerank': {
        const { list } = rankData();
        const label = { 28: 'last 4 weeks', 56: 'last 2 months', 182: 'last 6 months', 0: 'all time' }[S.rankPeriod];
        const top = list.filter((x) => S.rankSort === 'wins' || x.qualified).slice(0, 10);
        copy(`🏆 P4A top 10, ${label} (${SORT_HEAD[S.rankSort]})\n` + top.map((x, i) => `${i + 1}. ${person(x.id).name}: ${sortVal(x)}, ${x.wins}-${x.games - x.wins}`).join('\n'));
        return;
      }
      case 'dupr': { const out = duprFile(); download(`dupr-${s.date}.csv`, out.csv); toast(out.rows + ' games in the file'); return; }
      case 'sendDupr': {
        const out = duprFile();
        const file = new File([out.csv], `dupr-${s.date}.csv`, { type: 'text/csv' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: 'DUPR ' + s.date, text: out.rows + ' games for DUPR upload' }); } catch (err) { /* cancelled */ }
        } else { download(file.name, out.csv); toast('Downloaded ' + out.rows + ' games. Send the file to Bilal.'); }
        return;
      }
      // more
      case 'moretab': moreTab = el.dataset.val; break;
      case 'newsession': {
        const d = $('newdate').value, t = $('newtime').value.trim();
        if (!d) { toast('Pick a date'); return; }
        createSession(d, t);
        toast('Session created for ' + niceDate(d));
        go('signup');
        return;
      }
      case 'opensession': S.currentId = el.dataset.id; savePrefs(); toast('Opened ' + niceDate(S.sessions[S.currentId].date)); break;
      case 'pdel': if (wasArmed === 'del' + el.dataset.id) { W('players/' + el.dataset.id, null); } else armed = 'del' + el.dataset.id; break;
      default: return;
    }
    render();
  }
  document.addEventListener('click', onClick);

  // Text fields save when you leave the field, so typing isn't interrupted.
  document.addEventListener('change', (e) => {
    const el = e.target;
    const act = el.dataset && el.dataset.act;
    if (el.id === 'pickSession') { S.currentId = el.value; savePrefs(); render(); return; }
    if (!act) return;
    const id = el.dataset.id;
    if (act === 'pname') { const v = el.value.trim(); if (v) W('players/' + id + '/name', v); }
    else if (act === 'prating') { const v = el.value.trim(); W('players/' + id + '/rating', v === '' || isNaN(+v) ? null : +v); }
    else if (act === 'pdupr') { W('players/' + id + '/dupr', el.value.trim()); }
    else if (act === 'set') {
      const k = el.dataset.key;
      const v = ['formBump', 'defaultRating'].includes(k) ? (isNaN(+el.value) ? S.settings[k] : +el.value) : el.value;
      W('meta/settings/' + k, v);
    }
  });

  function copy(txt) {
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
      .then(() => toast('Copied. Paste it in WhatsApp.'))
      .catch(() => { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast('Copied'); });
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  if (!tab) tab = todaySessionLive() ? 'play' : 'signup';
  render();
  // Start live sync last, after everything above is defined.
  root.child('players').on('value', (snap) => { S.roster = snap.val() || {}; S.loaded.players = true; dataChanged(); });
  root.child('sessions').on('value', (snap) => { S.rawSessions = snap.val() || {}; S.loaded.sessions = true; convertSessions(); ensureSession(); dataChanged(); });
  root.child('meta/settings').on('value', (snap) => { S.settings = { ...SETTINGS, ...(snap.val() || {}) }; dataChanged(); });
  firebase.database().ref('.info/connected').on('value', (snap) => { S.online = !!snap.val(); dataChanged(); });
})();
