// P4A Courts: organizer app. Data lives in this phone's localStorage.
(function () {
  'use strict';
  const E = window.Engine;
  const KEY = 'p4a-courts-v1';
  const TOKEN_KEY = 'p4a-publish-key';
  const REPO = 'mhdmessi/p4a-courts';
  const FILE = 'data/results.json';
  const DEFAULTS = {
    roster: {},
    settings: {
      courts: 5, rounds: 8, mode: 'rating', formBump: 0.05, mixGap: 0.3, defaultRating: 3.0,
      target: 11, winBy: 2, scoreType: 'SIDEOUT', timerMin: 0, timerAuto: true,
      event: 'P4A Saturday 7am', location: 'Pickleball4ALL',
    },
    session: null,
    history: {},
    rankPeriod: 56,
    rankSort: 'pfg',
  };

  const $ = (id) => document.getElementById(id);
  const $app = $('app'), $nav = $('nav'), $sub = $('sub'), $timer = $('timer'), $overlay = $('overlay');

  let S = load();
  let tab = S.session && S.session.rounds.length ? 'play' : 'today';
  let armed = null;        // two-tap confirmations
  let sheet = null;        // open bottom sheet
  let display = false;     // full-screen lineup

  // ---------- storage ----------
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s) {
        const out = { ...DEFAULTS, ...s, settings: { ...DEFAULTS.settings, ...s.settings } };
        if (!s.rankSortChosen) out.rankSort = 'pfg';
        return out;
      }
    } catch (e) { /* fresh start */ }
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  function archive() {
    const s = S.session;
    if (!s) return;
    const st = E.derive(s);
    const stats = {};
    let games = 0;
    s.players.forEach((p) => {
      const x = st[p.id];
      if (x && x.games) { stats[p.id] = { points: x.points, wins: x.wins, games: x.games, sits: x.sits, pf: x.pf, pa: x.pa, sg: x.sg }; games += x.games; }
    });
    const list = [];
    s.rounds.forEach((round, r) => round.courts.forEach((c, k) => {
      const w = E.winnerOf(c);
      if (w) list.push({ i: r * 10 + k, round: r + 1, court: k + 1, a: c.a, b: c.b, sa: c.sa, sb: c.sb, w });
    }));
    if (games) S.history[s.seed] = { date: s.date, stats, games: list };
    else delete S.history[s.seed];
  }
  function save() { if (!S.history) S.history = {}; archive(); localStorage.setItem(KEY, JSON.stringify(S)); }

  // ---------- helpers ----------
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const blank = (v) => v === null || v === undefined || v === '';
  function nextSaturday() {
    const d = new Date();
    const add = (6 - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + add);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function buzz(pattern) { try { navigator.vibrate && navigator.vibrate(pattern); } catch (e) { /* ignore */ } }
  let audio;
  function beep(times) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < times; i++) {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; o.type = 'square';
        g.gain.value = 0.08;
        o.connect(g); g.connect(audio.destination);
        const t0 = audio.currentTime + i * 0.35;
        o.start(t0); o.stop(t0 + 0.2);
      }
    } catch (e) { /* no audio */ }
  }

  function newSession() {
    S.session = { seed: Math.floor(Math.random() * 1e9), date: nextSaturday(), courts: S.settings.courts, players: [], rounds: [] };
  }
  function sess() { if (!S.session) newSession(); return S.session; }
  function person(id) { return S.roster[id] || { name: '?', rating: null, dupr: '' }; }
  const hasRating = (id) => !blank(person(id).rating);
  const rating = (id) => (hasRating(id) ? Number(person(id).rating) : Number(S.settings.defaultRating));
  const nm = (id) => esc(person(id).name);
  const first = (id) => esc(person(id).name);
  // Court placement: DUPR rating; players without one use their group rating after 6+ scored games.
  function ratings() {
    const gr = groupRatingMap();
    const o = {};
    sess().players.forEach((p) => {
      const g = gr[person(p.id).name];
      o[p.id] = !hasRating(p.id) && g && g.games >= 6 ? g.rating : rating(p.id);
    });
    return o;
  }
  function groupRatingMap() {
    const seed = {};
    Object.values(S.roster).forEach((p) => { if (!blank(p.rating)) seed[p.name] = Number(p.rating); });
    return E.groupRatings(allGames(), seed, Number(S.settings.defaultRating));
  }
  function findByName(name) { const k = name.trim().toLowerCase(); return Object.values(S.roster).find((p) => p.name.toLowerCase() === k); }
  function addToDay(name) {
    let p = findByName(name);
    if (!p) { p = { id: uid(), name: name.trim(), rating: null, dupr: '' }; S.roster[p.id] = p; }
    const s = sess();
    let sp = s.players.find((x) => x.id === p.id);
    if (!sp) { sp = { id: p.id, present: false, joinRound: null, joinCredit: 0 }; s.players.push(sp); }
    return sp;
  }
  function setHere(sp, on) {
    const s = sess();
    if (on && !sp.present) {
      if (sp.joinRound == null) { sp.joinCredit = E.joinCredit(s); sp.joinRound = s.rounds.length; }
      sp.present = true;
    } else if (!on) sp.present = false;
  }
  const here = () => sess().players.filter((p) => p.present);
  const curRound = () => { const r = sess().rounds; return r[r.length - 1] || null; };
  const roundDone = (round) => round && round.courts.every((c) => E.winnerOf(c));
  const roundStarted = (round) => round && round.courts.some((c) => E.winnerOf(c) || !blank(c.sa) || !blank(c.sb));

  function plan() {
    const n = here().length;
    const courts = Math.min(Number(sess().courts), Math.floor(n / 4));
    const sit = courts > 0 ? n - courts * 4 : 0;
    const rounds = Number(S.settings.rounds) || 8;
    const slots = sit * rounds;
    const lo = n ? Math.floor(slots / n) : 0, hi = n ? Math.ceil(slots / n) : 0;
    return { n, courts, sit, rounds, lo, hi };
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
    const playPct = Math.round(100 * (p.rounds - p.hi) / p.rounds);
    return `Over ${p.rounds} rounds each player sits ${range} time${p.hi === 1 ? '' : 's'} (plays at least ${playPct}% of games). Nobody sits twice until everyone has sat once.`;
  }

  function nextRound() {
    const s = sess();
    const round = E.generateRound(s, {
      ratings: ratings(), mode: S.settings.mode, formBump: Number(S.settings.formBump), mixGap: Number(S.settings.mixGap),
    });
    round.createdAt = Date.now();
    round.timed = Number(S.settings.timerMin) > 0;
    round.timerEnd = round.timed && S.settings.timerAuto ? Date.now() + Number(S.settings.timerMin) * 60000 : null;
    s.rounds.push(round);
    save();
    buzz(30);
  }

  // ---------- timer ----------
  let warned = {};
  function tickTimer() {
    const round = tab === 'play' || display ? curRound() : curRound();
    if (!round || !round.timed || roundDone(round)) { $timer.innerHTML = ''; return; }
    if (!round.timerEnd) {
      $timer.innerHTML = `<button class="btn small teal" data-act="timerstart">▶ ${esc(S.settings.timerMin)}:00</button>`;
      return;
    }
    const left = Math.round((round.timerEnd - Date.now()) / 1000);
    const key = round.createdAt + ':' + round.timerEnd;
    if (left <= 60 && left > 0 && !warned[key + 'w']) { warned[key + 'w'] = 1; buzz([200, 100, 200]); beep(1); }
    if (left <= 0 && !warned[key + 'u']) { warned[key + 'u'] = 1; buzz([400, 150, 400, 150, 400]); beep(3); toast("Time! Enter scores as they stand."); }
    const m = Math.floor(Math.abs(left) / 60), sec = String(Math.abs(left) % 60).padStart(2, '0');
    const cls = left <= 0 ? 'up' : left <= 60 ? 'low' : '';
    const txt = left <= 0 ? 'TIME' : m + ':' + sec;
    $timer.innerHTML = `<div class="timer ${cls}" data-act="timermenu">${txt}</div>`;
    const big = document.getElementById('bigtimer');
    if (big) big.textContent = txt;
  }
  setInterval(tickTimer, 1000);

  // Keep the screen awake while running courts.
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
  const ICONS = {
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v4M12 17v4"/></svg>',
    results: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    players: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  };

  // ---------- views ----------
  function seg(key, options, scope) {
    const cur = String(scope === 'session' ? sess()[key] : S.settings[key]);
    return `<div class="seg">${options.map(([v, l]) => `<button class="${cur === String(v) ? 'on' : ''}" data-act="seg" data-key="${key}" data-val="${v}" data-scope="${scope || ''}">${l}</button>`).join('')}</div>`;
  }

  function viewToday() {
    const s = sess();
    const day = {};
    s.players.forEach((p) => { day[p.id] = p; });
    const everyone = Object.values(S.roster).sort((a, b) => a.name.localeCompare(b.name));
    const p = plan();
    const chips = everyone.map((x) => {
      const sp = day[x.id];
      return `<button class="chip ${sp && sp.present ? 'in' : ''}" data-act="${sp ? 'toggle' : 'addreg'}" data-id="${x.id}">${esc(x.name)}</button>`;
    }).join('');
    return `
      <div class="stat" style="margin-bottom:12px">
        <div><b>${p.n}</b><span>Players in</span></div>
        <div><b>${p.courts || 0}</b><span>Courts</span></div>
        <div><b>${p.sit}</b><span>Sit / round</span></div>
      </div>
      <div class="card">
        <div class="between"><h2 style="margin:0">Who's playing</h2>
          ${everyone.length ? `<button class="btn ghost small" data-act="allin">${s.players.some((x) => x.present) ? 'Clear' : 'All in'}</button>` : ''}</div>
        <p class="muted" style="margin:6px 0 12px">Tap everyone who voted <b>Yes</b> on the poll. Saved players stay here every week.</p>
        <div class="chips">${chips || '<span class="muted">No players yet. Add your regulars below.</span>'}</div>
        <div class="row" style="margin-top:12px">
          <input id="one" placeholder="Add a new player" autocomplete="off">
          <button class="btn sec" data-act="addone">Add</button>
        </div>
        <details style="margin-top:10px"><summary>Paste a list of names</summary>
          <textarea id="paste" style="margin-top:8px" placeholder="One name per line. Copied poll voters or the old numbered list both work."></textarea>
          <button class="btn sec full" style="margin-top:8px" data-act="paste">Add these players</button>
        </details>
      </div>
      <div class="card">
        <h2>Courts available</h2>
        ${seg('courts', [[3, '3'], [4, '4'], [5, '5'], [6, '6']], 'session')}
        <p class="muted small" style="margin:10px 0 0">${esc(sitText())}</p>
        <div class="row" style="margin-top:12px">
          <span class="muted grow small">Date</span>
          <input type="date" id="date" value="${esc(s.date)}" style="width:auto">
        </div>
      </div>
      ${s.rounds.length
        ? `<button class="btn full big sticky-cta" data-act="goplay">Back to round ${s.rounds.length} →</button>`
        : `<button class="btn full big sticky-cta" data-act="start" ${p.courts < 1 ? 'disabled' : ''}>Start round 1 →</button>`}
      <button class="btn ${armed === 'newday' ? 'warn' : 'ghost'} full" style="margin-top:14px" data-act="newday">${armed === 'newday' ? 'Tap again: clear today (players and rankings stay)' : 'Start a new day'}</button>`;
  }

  function courtHtml(round, r, k) {
    const c = round.courts[k];
    const w = E.winnerOf(c);
    const n = round.courts.length;
    const avg = [...c.a, ...c.b].reduce((t, id) => t + rating(id), 0) / 4;
    const warn = E.scoreWarning(c.sa, c.sb, Number(S.settings.target), Number(S.settings.winBy), round.timed);
    const side = (code, ids, pts) => `
      <div class="side ${w === code ? 'won' : w ? 'lost' : ''}" data-act="score" data-r="${r}" data-k="${k}" data-side="${code}">
        <div class="who">${ids.map((id) => `<div>${first(id)}<small>${hasRating(id) ? rating(id).toFixed(2) : ''}</small></div>`).join('')}</div>
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

  function viewPlay() {
    const s = sess();
    if (!s.rounds.length) {
      return `<div class="empty"><div class="ico"><img src="icon.svg" alt="" style="width:56px;height:56px"></div>No round yet.<br><br>
        <button class="btn big" data-act="start" ${plan().courts < 1 ? 'disabled' : ''}>Start round 1 →</button>
        <p class="muted">${esc(planText())}</p></div>`;
    }
    const r = s.rounds.length - 1;
    const round = s.rounds[r];
    const st = E.derive(s);
    const done = roundDone(round);
    const doneCount = round.courts.filter((c) => E.winnerOf(c)).length;
    const started = roundStarted(round);
    const hereChips = s.players.slice().sort((a, b) => person(a.id).name.localeCompare(person(b.id).name))
      .map((p) => `<button class="chip sm ${p.present ? 'in' : ''}" data-act="toggle" data-id="${p.id}">${nm(p.id)}<span class="n">${p.joinRound == null ? '' : '·' + st[p.id].sits}</span></button>`).join('');
    const past = s.rounds.slice(0, r).map((rd, i) => `
      <details><summary>Round ${i + 1}${rd.sitting.length ? ' · sat: ' + rd.sitting.map(nm).join(', ') : ''}</summary>
        <div style="margin-top:8px">${rd.courts.map((_, k) => courtHtml(rd, i, k)).join('')}</div>
      </details>`).reverse().join('');
    return `
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
        ${!started ? `<button class="btn sec grow small" data-act="reshuffle">Redo round</button>` : ''}
        <button class="btn sec grow small" data-act="finish">Finish day</button>
      </div>
      <div class="card" style="margin-top:14px">
        <h2>Who's here</h2>
        <p class="muted small" style="margin:0 0 10px">Late or leaving? Tap a name, changes apply next round. ·n = rounds sat.</p>
        <div class="chips">${hereChips}</div>
        <div class="row" style="margin-top:10px">
          <input id="one" placeholder="Late arrival's name" autocomplete="off">
          <button class="btn sec" data-act="addone">Add</button>
        </div>
      </div>
      ${past ? `<div class="card"><h2>Earlier rounds</h2>${past}</div>` : ''}
      <button class="btn ${armed === 'undo' ? 'warn' : 'ghost'} full" data-act="undo">${armed === 'undo' ? 'Tap again to delete round ' + (r + 1) : 'Undo round ' + (r + 1)}</button>`;
  }

  // ---------- results ----------
  function duprStatus() {
    const s = sess();
    let ready = 0, total = 0;
    const noScore = [];
    const noId = new Set();
    s.rounds.forEach((round, r) => round.courts.forEach((c, k) => {
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
    Object.values(S.roster).forEach((p) => { o[p.id] = { name: p.name, dupr: (p.dupr || '').trim() }; });
    return o;
  }
  // Today: most game points won, then +/-, then wins.
  function todayRows(s) {
    return E.standings(s).sort((a, b) => b.pf - a.pf || (b.pf - b.pa) - (a.pf - a.pa) || b.wins - a.wins);
  }
  function viewResults() {
    const s = sess();
    const rows = todayRows(s);
    let today = '';
    if (rows.length) {
      const awards = E.dayAwards(s);
      const d = duprStatus();
      today = `
        <div class="card">
          <div class="between"><h2 style="margin:0">Today · ${esc(s.date)}</h2><span class="pill">${s.rounds.length} rounds</span></div>
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
        <div class="row" style="margin-bottom:16px">
          <button class="btn sec grow" data-act="share">Copy recap</button>
          <button class="btn sec grow" data-act="publish">Publish rankings</button>
        </div>`;
    }
    return today + viewRankings() + (rows.length ? '' : '<p class="muted small" style="text-align:center">Today\'s results show up once a round is scored.</p>');
  }

  function allGames() {
    const out = [];
    Object.values(S.history || {}).forEach((d) => (d.games || []).forEach((g) => out.push({
      date: d.date, i: g.i, a: g.a.map((id) => person(id).name), b: g.b.map((id) => person(id).name), w: g.w, sa: g.sa, sb: g.sb,
    })));
    return out;
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
    const days = Object.values(S.history || {});
    const period = Number(S.rankPeriod);
    let since = null;
    if (period) { const d = new Date(); d.setDate(d.getDate() - period); since = d.toISOString().slice(0, 10); }
    const all = E.rankings(days, since, S.rankSort, 0);
    const maxGames = all.reduce((m, x) => Math.max(m, x.games), 0);
    const minGames = Math.max(5, Math.round(maxGames * 0.4));
    return { list: E.rankings(days, since, S.rankSort, minGames), minGames, nDays: days.filter((d) => !since || d.date >= since).length };
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
          ${list.map((x, i) => `<tr class="click ${needMin && !x.qualified ? 'dim' : ''}" data-act="card" data-id="${x.id}"><td class="rk">${medal(i, x)}</td><td>${nm(x.id)}</td>
            <td class="hl">${sortVal(x)}</td><td>${x.wins}-${x.games - x.wins}</td><td>${x.days}</td></tr>`).join('')}
        </table>
        <p class="muted small">${nDays} Saturday${nDays === 1 ? '' : 's'}. ${SORT_NOTE[S.rankSort] || ''} ${needMin ? `Needs ${minGames}+ games to rank.` : ''} Tap a player for their card.</p>
        <button class="btn sec full" data-act="sharerank">Copy top 10 for WhatsApp</button>`
        : '<p class="muted">No games in this period yet.</p>'}
      </div>`;
  }

  function viewPlayers() {
    const list = Object.values(S.roster).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) return '<div class="empty"><div class="ico">👥</div>Players are saved here when you add them on the Check-in tab.</div>';
    const missR = list.filter((p) => !hasRating(p.id)).length;
    const missD = list.filter((p) => !p.dupr).length;
    const inDay = new Set(sess().players.map((p) => p.id));
    return `
      <div class="card">
        <div class="between"><h2 style="margin:0">Players · ${list.length}</h2>
          <span>${missR ? `<span class="pill miss">${missR} no rating</span>` : ''} ${missD ? `<span class="pill miss">${missD} no DUPR ID</span>` : ''}</span></div>
        <p class="muted small">Ratings decide courts (court 1 = highest). No rating counts as ${esc(S.settings.defaultRating)}. DUPR IDs are needed for DUPR submission (in the DUPR app: Profile, under your name).</p>
        <div class="plist">
          <div class="p muted small"><span>Name</span><span>Rating</span><span>DUPR ID</span><span></span></div>
          ${list.map((p) => `<div class="p">
            <input value="${esc(p.name)}" data-act="pname" data-id="${p.id}">
            <input value="${esc(p.rating == null ? '' : p.rating)}" inputmode="decimal" placeholder="3.50" data-act="prating" data-id="${p.id}">
            <input value="${esc(p.dupr || '')}" placeholder="ID" data-act="pdupr" data-id="${p.id}" autocomplete="off">
            ${inDay.has(p.id) ? '<span></span>' : `<button class="x" data-act="pdel" data-id="${p.id}">${armed === 'del' + p.id ? '✓?' : '✕'}</button>`}
          </div>`).join('')}
        </div>
      </div>`;
  }

  function viewSettings() {
    const st = S.settings;
    const hasKey = !!localStorage.getItem(TOKEN_KEY);
    return `
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
        <p class="muted small" style="margin:-4px 0 12px">Swaps players of similar rating between neighboring courts so you don't face the same 3 people all morning.</p>
        <label class="f">Hot-streak nudge (rating points per net win today)
          <input data-act="set" data-key="formBump" inputmode="decimal" value="${esc(st.formBump)}"></label>
        <label class="f">Rating for players without one
          <input data-act="set" data-key="defaultRating" inputmode="decimal" value="${esc(st.defaultRating)}"></label>
        <p class="muted small" style="margin:0">Sit-outs never depend on wins or losses: whoever has sat the least sits next.</p>
      </div>
      <div class="card">
        <h2>DUPR file</h2>
        <label class="f">Event name <input data-act="set" data-key="event" value="${esc(st.event)}"></label>
        <label class="f">Location <input data-act="set" data-key="location" value="${esc(st.location)}"></label>
      </div>
      <div class="card">
        <h2>Group rankings page</h2>
        <p class="muted small" style="margin-top:0">Publishing needs a key (a GitHub token that can only edit this site). It stays on this phone and isn't in backups.
          ${hasKey ? '<span class="pill">Key saved</span>' : '<span class="pill miss">No key</span>'}</p>
        <div class="row"><input id="pubkey" type="password" placeholder="Paste publish key" autocomplete="off"><button class="btn sec" data-act="savekey">Save</button></div>
        <p class="muted small" style="margin-bottom:0">Share with the group: <a href="rankings.html">rankings page</a></p>
      </div>
      <div class="card">
        <h2>Backup</h2>
        <p class="muted small" style="margin-top:0">Everything is saved on this phone. Copy a backup to move to another phone.</p>
        <div class="row"><button class="btn sec grow" data-act="backup">Copy backup</button><button class="btn ghost grow" data-act="restore">Restore</button></div>
        <textarea id="restoretext" placeholder="Paste a backup here, then tap Restore" style="margin-top:8px;min-height:60px"></textarea>
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
          <button class="btn sec full" data-act="timeradd" data-min="1">+1 minute</button>
          <button class="btn sec full" data-act="timerrestart">Restart ${esc(S.settings.timerMin)}:00</button>
          <button class="btn ghost full" data-act="timeroff">Turn off for this round</button>
        </div></div></div>`;
    }
    const s = sess();
    const round = s.rounds[sheet.r];
    const c = round.courts[sheet.k];
    const target = Number(S.settings.target);
    const team = (ids) => ids.map(nm).join(' & ');
    const timed = round.timed;
    const win = sheet.side;
    let body;
    if (!win) {
      body = `<p class="muted" style="margin-top:0">Who won?</p>
        <div class="teampick">
          <button data-act="pickwin" data-side="A">${team(c.a)}</button>
          <button data-act="pickwin" data-side="B">${team(c.b)}</button>
        </div>`;
    } else {
      const loser = win === 'A' ? c.b : c.a;
      const quick = `<p class="muted" style="margin:0 0 8px">${team(loser)} scored${timed ? ' (game reached ' + target + ')' : ''}:</p>
        <div class="scoregrid">${Array.from({ length: target - 1 }, (_, i) => `<button data-act="quick" data-lo="${i}">${i}</button>`).join('')}</div>
        <p class="muted small" style="margin:14px 0 8px">${timed ? 'Time ran out, close game or other score:' : 'Close game or other score:'}</p>`;
      const curA = !blank(c.sa) ? c.sa : '', curB = !blank(c.sb) ? c.sb : '';
      body = `<div class="between" style="margin-bottom:10px"><span>🏆 <b>${team(win === 'A' ? c.a : c.b)}</b></span><button class="btn ghost small" data-act="pickwin" data-side="">Change</button></div>
        ${quick}
        <div class="vs">
          <div><div class="muted small" style="text-align:center;margin-bottom:4px">${team(c.a)}</div><input id="ea" inputmode="numeric" value="${esc(curA)}" placeholder="${win === 'A' ? target : ''}"></div>
          <b class="muted">–</b>
          <div><div class="muted small" style="text-align:center;margin-bottom:4px">${team(c.b)}</div><input id="eb" inputmode="numeric" value="${esc(curB)}" placeholder="${win === 'B' ? target : ''}"></div>
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
    const games = allGames();
    const card = E.playerCard(games, p.name);
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
      <div class="muted">${esc(s.date)}${left !== null ? ` · <b id="bigtimer" style="color:var(--ball)">${left <= 0 ? 'TIME' : Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0')}</b>` : ''}</div>
      <div class="dgrid">${round.courts.map((c, k) => `<div class="dcourt">
        <div class="n">${k === 0 && round.courts.length > 1 ? '👑 ' : ''}Court ${k + 1}</div>
        <div class="t">${c.a.map(nm).join(' & ')}</div><div class="v">VS</div><div class="t">${c.b.map(nm).join(' & ')}</div>
      </div>`).join('')}</div>
      ${round.sitting.length ? `<div class="bench" style="margin-top:16px;font-size:18px">🪑 Sitting: <b>${round.sitting.map(nm).join(', ')}</b></div>` : ''}
    </div>`;
  }

  // ---------- render ----------
  const TABS = [
    ['today', 'Check-in', viewToday],
    ['play', 'Courts', viewPlay],
    ['results', 'Results', viewResults],
    ['players', 'Players', viewPlayers],
    ['settings', 'Settings', viewSettings],
  ];
  function render() {
    const s = sess();
    const y = window.scrollY;
    $sub.textContent = [s.date, planText(), s.rounds.length ? 'round ' + s.rounds.length : ''].filter(Boolean).join(' · ');
    $nav.innerHTML = TABS.map(([k, label]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${ICONS[k === 'results' ? 'results' : k]}${label}</button>`).join('');
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
    c.sa = sa; c.sb = sb; c.winner = winner || null;
    save();
    sheet = null;
    const round = sess().rounds[r];
    if (r === sess().rounds.length - 1 && roundDone(round)) { buzz([60, 60, 60]); toast('All courts done. Tap Start round ' + (r + 2) + '.'); }
  }
  function lineupText() {
    const s = sess();
    const round = curRound();
    return `🟡 P4A Round ${s.rounds.length}\n` +
      round.courts.map((c, k) => `Court ${k + 1}: ${c.a.map((id) => person(id).name).join(' & ')} vs ${c.b.map((id) => person(id).name).join(' & ')}`).join('\n') +
      (round.sitting.length ? `\nSitting: ${round.sitting.map((id) => person(id).name).join(', ')}` : '');
  }
  function duprFile() {
    const s = sess();
    return E.duprCsv(s, people(), { event: S.settings.event, location: S.settings.location, scoreType: S.settings.scoreType });
  }

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
      case 'paste': {
        const names = E.parseList($('paste').value);
        names.forEach((n) => setHere(addToDay(n), true));
        save(); toast(names.length ? 'Added ' + names.length + ' players' : 'No names found');
        break;
      }
      case 'addone': {
        const v = $('one').value.trim();
        if (v) { setHere(addToDay(v), true); save(); toast(v + ' is in'); }
        break;
      }
      case 'addreg': setHere(addToDay(person(el.dataset.id).name), true); save(); break;
      case 'toggle': { const sp = s.players.find((p) => p.id === el.dataset.id); setHere(sp, !sp.present); save(); break; }
      case 'allin': {
        const anyIn = s.players.some((p) => p.present);
        if (anyIn) s.players.forEach((p) => { if (s.rounds.length === 0) p.present = false; });
        else Object.values(S.roster).forEach((p) => setHere(addToDay(p.name), true));
        save(); break;
      }
      case 'seg': {
        const v = el.dataset.val;
        const val = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
        if (el.dataset.scope === 'session') { s[el.dataset.key] = val; if (el.dataset.key === 'courts') S.settings.courts = val; }
        else S.settings[el.dataset.key] = val;
        save(); break;
      }
      case 'start': case 'next':
        try { nextRound(); tab = 'play'; window.scrollTo(0, 0); } catch (err) { toast(err.message); }
        break;
      case 'goplay': go('play'); return;
      case 'reshuffle': s.rounds.pop(); try { nextRound(); toast('Round redone with who is here'); } catch (err) { toast(err.message); } break;
      case 'undo': if (wasArmed === 'undo') { s.rounds.pop(); save(); toast('Round removed'); } else armed = 'undo'; break;
      case 'newday': if (wasArmed === 'newday') { newSession(); save(); toast('New day. Tap who is playing.'); } else armed = 'newday'; break;
      case 'finish': go('results'); setTimeout(() => { const d = $('dupr'); if (d) d.scrollIntoView({ behavior: 'smooth' }); }, 50); return;
      case 'display': display = true; break;
      case 'hidedisplay': display = false; break;
      case 'copylineup': copy(lineupText()); return;
      case 'score': {
        const r = +el.dataset.r, k = +el.dataset.k;
        const c = s.rounds[r].courts[k];
        sheet = { type: 'score', r, k, side: el.dataset.side || E.winnerOf(c) || null };
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
        setScore(sheet.r, sheet.k, a, b, w);
        break;
      }
      case 'nosave': setScore(sheet.r, sheet.k, '', '', sheet.side); break;
      case 'clearscore': setScore(sheet.r, sheet.k, '', '', null); break;
      case 'timerstart': { const round = curRound(); round.timerEnd = Date.now() + Number(S.settings.timerMin) * 60000; save(); break; }
      case 'timermenu': sheet = { type: 'timer' }; break;
      case 'timeradd': { const round = curRound(); round.timerEnd = Math.max(round.timerEnd, Date.now()) + 60000; save(); sheet = null; break; }
      case 'timerrestart': { const round = curRound(); round.timerEnd = Date.now() + Number(S.settings.timerMin) * 60000; save(); sheet = null; break; }
      case 'timeroff': { const round = curRound(); round.timed = false; round.timerEnd = null; save(); sheet = null; break; }
      case 'rank': S[el.dataset.key] = isNaN(+el.dataset.val) ? el.dataset.val : +el.dataset.val; if (el.dataset.key === 'rankSort') S.rankSortChosen = true; save(); break;
      case 'card': sheet = { type: 'card', id: el.dataset.id }; break;
      case 'share': {
        const rows = todayRows(s);
        const aw = E.dayAwards(s);
        copy(`🟡 P4A ${s.date} recap (${s.rounds.length} rounds)\n` +
          (aw.length ? aw.map((a) => `🏅 ${a.title}: ${a.who.map((id) => person(id).name).join(' & ')} (${a.detail})`).join('\n') + '\n\n' : '') +
          rows.map((x, i) => `${i + 1}. ${person(x.id).name}: ${x.pf} pts (${x.pf - x.pa >= 0 ? '+' : ''}${x.pf - x.pa}), ${x.wins}-${x.games - x.wins}`).join('\n'));
        return;
      }
      case 'sharerank': {
        const { list } = rankData();
        const label = { 28: 'last 4 weeks', 56: 'last 2 months', 182: 'last 6 months', 0: 'all time' }[S.rankPeriod];
        const needMin = S.rankSort !== 'wins';
        const top = list.filter((x) => !needMin || x.qualified).slice(0, 10);
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
      case 'publish':
        el.disabled = true; el.textContent = 'Publishing…';
        publish().then(() => toast('Published. The rankings page updates in about a minute.'))
          .catch((err) => toast(err.message))
          .finally(() => { el.disabled = false; el.textContent = 'Publish rankings'; });
        return;
      case 'savekey': {
        const v = $('pubkey').value.trim();
        if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY);
        toast(v ? 'Key saved on this phone' : 'Key removed');
        break;
      }
      case 'pdel': if (wasArmed === 'del' + el.dataset.id) { delete S.roster[el.dataset.id]; save(); } else armed = 'del' + el.dataset.id; break;
      case 'backup': copy(JSON.stringify(S)); return;
      case 'restore': {
        try {
          const v = JSON.parse($('restoretext').value);
          if (!v.roster) throw new Error();
          S = { ...DEFAULTS, ...v, settings: { ...DEFAULTS.settings, ...v.settings } };
          save(); toast('Restored');
        } catch (err) { toast("That doesn't look like a backup"); return; }
        break;
      }
      default: return;
    }
    render();
  }
  document.addEventListener('click', onClick);

  document.addEventListener('input', (e) => {
    const el = e.target;
    const act = el.dataset && el.dataset.act;
    if (!act) return;
    if (act === 'pname') { const v = el.value.trim(); if (v) S.roster[el.dataset.id].name = v; save(); }
    else if (act === 'prating') { const v = el.value.trim(); S.roster[el.dataset.id].rating = v === '' || isNaN(+v) ? null : +v; save(); }
    else if (act === 'pdupr') { S.roster[el.dataset.id].dupr = el.value.trim(); save(); }
    else if (act === 'set') {
      const k = el.dataset.key;
      S.settings[k] = ['formBump', 'defaultRating'].includes(k) ? (isNaN(+el.value) ? S.settings[k] : +el.value) : el.value;
      save();
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'date') { sess().date = e.target.value; save(); render(); }
    if (e.target.dataset && e.target.dataset.act === 'pdupr' && tab === 'results') render();
  });

  // ---------- publish rankings ----------
  const b64 = (str) => btoa(unescape(encodeURIComponent(str)));
  const unb64 = (str) => decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));
  async function publish() {
    const token = (localStorage.getItem(TOKEN_KEY) || '').trim();
    if (!token) throw new Error('Add the publish key in Settings first');
    const url = `https://api.github.com/repos/${REPO}/contents/${FILE}`;
    const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
    let sha, remote = { days: {} };
    const g = await fetch(url, { headers, cache: 'no-store' });
    if (g.ok) { const j = await g.json(); sha = j.sha; remote = JSON.parse(unb64(j.content)); }
    else if (g.status !== 404) throw new Error(g.status === 401 ? 'Publish key not accepted' : 'GitHub error ' + g.status);
    const days = { ...(remote.days || {}) };
    for (const [key, d] of Object.entries(S.history || {})) {
      const stats = {};
      for (const [id, x] of Object.entries(d.stats)) stats[person(id).name] = x;
      const games = (d.games || []).map((x) => ({ i: x.i, a: x.a.map((id) => person(id).name), b: x.b.map((id) => person(id).name), sa: x.sa, sb: x.sb, w: x.w }));
      days[key] = { date: d.date, stats, games };
    }
    const body = JSON.stringify({ updated: new Date().toISOString(), days }, null, 1);
    const p = await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ message: 'Results ' + sess().date, content: b64(body), sha }) });
    if (!p.ok) throw new Error(p.status === 403 || p.status === 404 ? "Publish key can't write to the site" : 'GitHub error ' + p.status);
  }

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

  render();
})();
