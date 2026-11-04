// P4A Courts UI. All data lives in this phone's localStorage.
(function () {
  'use strict';
  const E = window.Engine;
  const KEY = 'p4a-courts-v1';
  const DEFAULTS = {
    roster: {},
    settings: {
      courts: 5, mode: 'rating', formBump: 0.05, defaultRating: 3.0,
      event: 'P4A Saturday 7am', location: 'Pickleball4ALL', scoreType: 'SIDEOUT',
    },
    session: null,
    history: {},
    rankPeriod: 56, rankSort: 'pct',
  };

  const $app = document.getElementById('app');
  const $nav = document.getElementById('nav');
  const $sub = document.getElementById('sub');

  let S = load();
  let tab = S.session && S.session.rounds.length ? 'play' : 'today';
  let armed = null; // two-tap confirm key

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s) return { ...DEFAULTS, ...s, settings: { ...DEFAULTS.settings, ...s.settings } };
    } catch (e) { /* fall through */ }
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  // Each day with finished games is kept in S.history (keyed by session seed) for rankings.
  function archive() {
    const s = S.session;
    if (!s) return;
    const st = E.derive(s);
    const stats = {};
    let games = 0;
    s.players.forEach((p) => {
      const x = st[p.id];
      if (x && x.games) { stats[p.id] = { points: x.points, wins: x.wins, games: x.games, sits: x.sits }; games += x.games; }
    });
    if (games) S.history[s.seed] = { date: s.date, stats };
    else delete S.history[s.seed];
  }
  function save() {
    if (!S.history) S.history = {};
    archive();
    localStorage.setItem(KEY, JSON.stringify(S));
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  // ---------- data helpers ----------
  function newSession() {
    S.session = { seed: Math.floor(Math.random() * 1e9), date: today(), courts: S.settings.courts, players: [], rounds: [] };
  }
  function sess() { if (!S.session) newSession(); return S.session; }
  function person(id) { return S.roster[id] || { name: '?', rating: null, dupr: '' }; }
  function hasRating(id) { const r = person(id).rating; return !(r === null || r === undefined || r === ''); }
  function rating(id) { return hasRating(id) ? Number(person(id).rating) : Number(S.settings.defaultRating); }
  function ratings() { const o = {}; sess().players.forEach((p) => { o[p.id] = rating(p.id); }); return o; }
  function findByName(name) {
    const k = name.trim().toLowerCase();
    return Object.values(S.roster).find((p) => p.name.toLowerCase() === k);
  }
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
    } else if (!on) {
      sp.present = false;
    }
  }
  const here = () => sess().players.filter((p) => p.present);
  const curRound = () => { const r = sess().rounds; return r[r.length - 1] || null; };
  const roundDone = (round) => round.courts.every((c) => E.winnerOf(c));
  const roundStarted = (round) => round.courts.some((c) => E.winnerOf(c) || c.sa !== '' || c.sb !== '');
  function planText() {
    const n = here().length;
    const courts = Math.min(sess().courts, Math.floor(n / 4));
    if (courts < 1) return n + ' here, need at least 4';
    const sit = n - courts * 4;
    return n + ' here, ' + courts + ' court' + (courts > 1 ? 's' : '') + (sit ? ', ' + sit + ' sit each round' : ', nobody sits');
  }
  function nextRound() {
    const s = sess();
    s.rounds.push(E.generateRound(s, { ratings: ratings(), mode: S.settings.mode, formBump: Number(S.settings.formBump) }));
    save();
  }
  const nm = (id) => esc(person(id).name);

  // ---------- group rankings page (GitHub) ----------
  // The organizer's phone saves results to data/results.json in the site's repo,
  // and rankings.html shows them to everyone. The key is stored apart from backups.
  const REPO = 'mhdmessi/p4a-courts';
  const FILE = 'data/results.json';
  const TOKEN_KEY = 'p4a-publish-key';
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
    // Merge by day, so publishing from a second phone never wipes earlier Saturdays.
    const days = { ...(remote.days || {}) };
    for (const [key, d] of Object.entries(S.history || {})) {
      const stats = {};
      for (const [id, x] of Object.entries(d.stats)) stats[person(id).name] = x;
      days[key] = { date: d.date, stats };
    }
    const body = JSON.stringify({ updated: new Date().toISOString(), days }, null, 1);
    const p = await fetch(url, {
      method: 'PUT', headers,
      body: JSON.stringify({ message: 'Results ' + sess().date, content: b64(body), sha }),
    });
    if (!p.ok) throw new Error(p.status === 403 || p.status === 404 ? "Publish key can't write to the site" : 'GitHub error ' + p.status);
  }

  // ---------- views ----------
  function viewToday() {
    const s = sess();
    // Every saved player is one tap away (check off whoever voted "in" on the poll).
    const dayById = {};
    s.players.forEach((p) => { dayById[p.id] = p; });
    const everyone = Object.values(S.roster).sort((a, b) => a.name.localeCompare(b.name));
    const chips = everyone.map((p) => {
      const sp = dayById[p.id];
      return sp
        ? `<button class="chip ${sp.present ? 'in' : ''}" data-act="toggle" data-id="${p.id}">${esc(p.name)}</button>`
        : `<button class="chip" data-act="addreg" data-id="${p.id}">${esc(p.name)}</button>`;
    }).join('');
    return `
      <div class="card">
        <h2>1. Who's playing</h2>
        <p class="muted" style="margin-top:0">Tap everyone who voted in on the poll (tap again to remove). <b>${esc(planText())}.</b></p>
        <div class="chips">${chips || '<span class="muted">No players saved yet. Add names below; they\'re remembered for next week.</span>'}</div>
        <div class="row" style="margin-top:10px">
          <input id="one" class="grow" placeholder="New player's name">
          <button class="btn ghost" data-act="addone">Add</button>
        </div>
        <details style="margin-top:8px"><summary>Or paste a list of names</summary>
          <textarea id="paste" placeholder="One name per line. Works with copied poll voters or the old numbered list."></textarea>
          <button class="btn sec full" style="margin-top:8px" data-act="paste">Add these players</button>
        </details>
      </div>
      <div class="card">
        <h2>2. Courts</h2>
        <div class="row">
          <label class="grow muted">Courts available</label>
          <select id="courts" data-act="courts">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option ${n === Number(s.courts) ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </div>
        <div class="row" style="margin-top:8px">
          <label class="grow muted">Date</label>
          <input type="date" id="date" value="${esc(s.date)}">
        </div>
      </div>
      ${s.rounds.length
        ? `<button class="btn full" data-act="goplay">Back to round ${s.rounds.length} →</button>`
        : `<button class="btn full" data-act="start" ${here().length < 4 ? 'disabled' : ''}>Start round 1 →</button>`}
      <div style="margin-top:18px">
        <button class="btn ${armed === 'newday' ? 'warn' : 'ghost'} full" data-act="newday">${armed === 'newday' ? 'Tap again to clear today (players stay saved)' : 'Start a new day'}</button>
      </div>`;
  }

  function courtHtml(round, r, k, n) {
    const c = round.courts[k];
    const w = E.winnerOf(c);
    const avg = [...c.a, ...c.b].reduce((t, id) => t + rating(id), 0) / 4;
    const team = (side, ids, score) => `
      <div class="team ${w === side ? 'won' : ''}">
        <div class="names" data-act="win" data-r="${r}" data-k="${k}" data-side="${side}">
          ${ids.map((id) => `${nm(id)} <small>${hasRating(id) ? rating(id).toFixed(2) : ''}</small>`).join('<br>')}
        </div>
        <input class="score" inputmode="numeric" pattern="[0-9]*" placeholder="–" value="${esc(score)}"
               data-act="score" data-r="${r}" data-k="${k}" data-side="${side}">
      </div>`;
    return `
      <div class="court ${k === 0 ? 'c1' : ''}">
        <div class="top"><span>Court ${k + 1}${k === 0 && n > 1 ? ' · top court' : ''}</span><span>avg ${avg.toFixed(2)}</span></div>
        ${team('A', c.a, c.sa)}
        ${team('B', c.b, c.sb)}
      </div>`;
  }

  function sittingHtml(round, st) {
    if (!round.sitting.length) return '';
    return `<div class="sitbox"><b>Sitting out:</b> ${round.sitting.map((id) => `${nm(id)} <span class="muted">(${st[id].sits})</span>`).join(', ')}</div>`;
  }

  function viewPlay() {
    const s = sess();
    if (!s.rounds.length) {
      return `<div class="empty">No round yet.<br><br>
        <button class="btn" data-act="start" ${here().length < 4 ? 'disabled' : ''}>Start round 1 →</button>
        <p class="muted">${esc(planText())}</p></div>`;
    }
    const r = s.rounds.length - 1;
    const round = s.rounds[r];
    const st = E.derive(s);
    const done = roundDone(round);
    const started = roundStarted(round);
    const chips = s.players
      .slice().sort((a, b) => person(a.id).name.localeCompare(person(b.id).name))
      .map((p) => `<button class="chip ${p.present ? 'in' : ''}" data-act="toggle" data-id="${p.id}">${nm(p.id)}<span class="n">${p.joinRound == null ? '' : st[p.id].sits}</span></button>`).join('');
    const past = s.rounds.slice(0, r).map((rd, i) => `
      <details><summary>Round ${i + 1}</summary>
        ${rd.sitting.length ? `<p class="muted">Sat: ${rd.sitting.map(nm).join(', ')}</p>` : ''}
        ${rd.courts.map((_, k) => courtHtml(rd, i, k, rd.courts.length)).join('')}
      </details>`).reverse().join('');
    return `
      <div class="row" style="margin-bottom:8px">
        <h2 class="grow" style="margin:0">Round ${r + 1}</h2>
        <span class="muted">Tap the winners or enter scores</span>
      </div>
      ${sittingHtml(round, st)}
      ${round.courts.map((_, k) => courtHtml(round, r, k, round.courts.length)).join('')}
      <button class="btn full" data-act="next" ${done && here().length >= 4 ? '' : 'disabled'}>${done ? 'Next round →' : 'Finish every court for the next round'}</button>
      ${!started ? `<button class="btn sec full" style="margin-top:8px" data-act="reshuffle">Redo this round with who's here now</button>` : ''}
      <div class="card" style="margin-top:14px">
        <h2>Who's here</h2>
        <p class="muted" style="margin-top:0">Late arrivals and early leavers: tap their name. Changes apply next round. Number = rounds sat so far.</p>
        <div class="chips">${chips}</div>
        <div class="row" style="margin-top:8px">
          <input id="one" class="grow" placeholder="Add a late arrival">
          <button class="btn ghost" data-act="addone">Add</button>
        </div>
      </div>
      ${past ? `<div class="card"><h2>Earlier rounds</h2>${past}</div>` : ''}
      <button class="btn ${armed === 'undo' ? 'warn' : 'ghost'} full" data-act="undo">${armed === 'undo' ? 'Tap again to delete round ' + (r + 1) : 'Undo round ' + (r + 1)}</button>`;
  }

  function rankData() {
    const days = Object.values(S.history || {});
    const period = Number(S.rankPeriod);
    let since = null;
    if (period) {
      const d = new Date(); d.setDate(d.getDate() - period);
      since = d.toISOString().slice(0, 10);
    }
    const all = E.rankings(days, since, S.rankSort, 0);
    const maxGames = all.reduce((m, x) => Math.max(m, x.games), 0);
    const minGames = Math.max(5, Math.round(maxGames * 0.4));
    const nDays = days.filter((d) => !since || d.date >= since).length;
    return { list: E.rankings(days, since, S.rankSort, minGames), minGames, nDays };
  }
  const PERIODS = [[28, 'Last 4 weeks'], [56, 'Last 2 months'], [182, 'Last 6 months'], [0, 'All time']];

  function viewRankings() {
    const { list, minGames, nDays } = rankData();
    const pill = (key, val, label) => `<button class="chip ${String(S[key]) === String(val) ? 'in' : ''}" data-act="rank" data-key="${key}" data-val="${val}">${label}</button>`;
    return `
      <div class="card">
        <h2>Rankings</h2>
        <div class="chips" style="margin-bottom:8px">${PERIODS.map(([v, l]) => pill('rankPeriod', v, l)).join('')}</div>
        <div class="chips" style="margin-bottom:10px">${pill('rankSort', 'pct', 'Win %')}${pill('rankSort', 'wins', 'Most wins')}${pill('rankSort', 'points', 'Court points')}</div>
        ${list.length ? `<table>
          <tr><th>#</th><th>Player</th><th>Win%</th><th>W-L</th><th>Pts</th><th>Days</th></tr>
          ${list.map((x, i) => `<tr style="${S.rankSort === 'pct' && !x.qualified ? 'opacity:.5' : ''}"><td>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td><td>${nm(x.id)}</td>
            <td><b>${Math.round(x.pct * 100)}%</b></td><td>${x.wins}-${x.games - x.wins}</td><td>${x.points}</td><td>${x.days}</td></tr>`).join('')}
        </table>
        <p class="muted">${nDays} Saturday${nDays === 1 ? '' : 's'} counted.${S.rankSort === 'pct' ? ' Win % needs ' + minGames + '+ games to rank (greyed out = not enough yet).' : ''}</p>`
        : '<p class="muted">No games in this period yet.</p>'}
      </div>
      ${list.length ? `<div class="row"><button class="btn grow" data-act="publish">Publish to group page</button><button class="btn sec grow" data-act="sharerank">Copy top 10</button></div>
        <p class="muted">Group page: <a href="rankings.html">rankings.html</a>. Share that link in WhatsApp; it updates each time you publish.</p>` : ''}`;
  }

  function viewStandings() {
    const s = sess();
    const rows = E.standings(s);
    if (!rows.length) return '<div class="empty">Today\'s standings show up once rounds are played.</div>' + viewRankings();
    return `
      <div class="card">
        <h2>Today${s.rounds.length ? ' · after ' + s.rounds.length + ' round' + (s.rounds.length > 1 ? 's' : '') : ''}</h2>
        <table>
          <tr><th>#</th><th>Player</th><th>Pts</th><th>W-L</th><th>Sat</th></tr>
          ${rows.map((x, i) => `<tr><td>${i + 1}</td><td>${nm(x.id)}</td><td><b>${x.points}</b></td><td>${x.wins}-${x.games - x.wins}</td><td>${x.sits}</td></tr>`).join('')}
        </table>
        <p class="muted">Points: a win on the top court is worth the most (court 1 of 4 = 4 pts, court 4 = 1 pt).</p>
      </div>
      <button class="btn sec full" data-act="share" style="margin-bottom:16px">Copy today's results for WhatsApp</button>
      ${viewRankings()}`;
  }

  function viewPlayers() {
    const list = Object.values(S.roster).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) return '<div class="empty">Players get saved here when you add them on the Today tab.</div>';
    const missingR = list.filter((p) => !hasRating(p.id)).length;
    const missingD = list.filter((p) => !p.dupr).length;
    const inDay = new Set(sess().players.map((p) => p.id));
    return `
      <div class="card">
        <h2>Players (${list.length})</h2>
        <p class="muted" style="margin-top:0">Ratings set the courts (court 1 = highest). Players without one count as ${esc(S.settings.defaultRating)}.
          ${missingR ? `<span class="pill miss">${missingR} missing rating</span>` : ''} ${missingD ? `<span class="pill miss">${missingD} missing DUPR ID</span>` : ''}</p>
        <table class="rp">
          <tr><th></th><th>Name</th><th style="width:78px">Rating</th><th style="width:118px">DUPR ID</th><th></th></tr>
          ${list.map((p) => `<tr>
            <td></td>
            <td><input value="${esc(p.name)}" data-act="pname" data-id="${p.id}"></td>
            <td><input value="${esc(p.rating == null ? '' : p.rating)}" inputmode="decimal" placeholder="3.25" data-act="prating" data-id="${p.id}"></td>
            <td><input value="${esc(p.dupr || '')}" placeholder="e.g. 5RKXW2" data-act="pdupr" data-id="${p.id}"></td>
            <td>${inDay.has(p.id) ? '' : `<button class="winbtn" data-act="pdel" data-id="${p.id}">${armed === 'del' + p.id ? 'Sure?' : '✕'}</button>`}</td>
          </tr>`).join('')}
        </table>
      </div>`;
  }

  function viewSettings() {
    const st = S.settings;
    const sel = (key, opts) => `<select data-act="set" data-key="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(st[key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    return `
      <div class="card">
        <h2>How courts are set</h2>
        <label class="f">Court placement ${sel('mode', [['rating', 'By DUPR rating (court 1 = highest)'], ['ladder', 'Ladder: winners up, losers down']])}</label>
        <label class="f">Hot-streak nudge, rating points per net win (by-rating mode)
          <input data-act="set" data-key="formBump" inputmode="decimal" value="${esc(st.formBump)}"></label>
        <label class="f">Rating for players without one
          <input data-act="set" data-key="defaultRating" inputmode="decimal" value="${esc(st.defaultRating)}"></label>
        <p class="muted">Sit-outs never depend on wins or losses: whoever has sat the least sits next, and nobody sits twice before everyone has sat once.</p>
      </div>
      <div class="card">
        <h2>DUPR upload</h2>
        <p class="muted" style="margin-top:0">Makes a file a DUPR club director uploads on dupr.com (desktop): Club → Matches → Add Matches → Import Matches via CSV. Only games with scores and four DUPR IDs are included.</p>
        <label class="f">Event name <input data-act="set" data-key="event" value="${esc(st.event)}"></label>
        <label class="f">Location <input data-act="set" data-key="location" value="${esc(st.location)}"></label>
        <label class="f">Scoring ${sel('scoreType', [['SIDEOUT', 'Side-out'], ['RALLY', 'Rally']])}</label>
        <button class="btn full" data-act="dupr">Download DUPR file</button>
        <div id="duprinfo"></div>
      </div>
      <div class="card">
        <h2>Group rankings page</h2>
        <p class="muted" style="margin-top:0">To publish results, this phone needs a publish key (a GitHub token that can only edit this site). It stays on this phone and isn't included in backups.
          ${localStorage.getItem(TOKEN_KEY) ? '<span class="pill">Key saved</span>' : '<span class="pill miss">No key</span>'}</p>
        <div class="row"><input id="pubkey" type="password" class="grow" placeholder="Paste publish key" autocomplete="off"><button class="btn ghost" data-act="savekey">Save</button></div>
      </div>
      <div class="card">
        <h2>Backup</h2>
        <p class="muted" style="margin-top:0">Everything is saved on this phone only. Copy a backup to move it to another phone.</p>
        <div class="row"><button class="btn sec grow" data-act="backup">Copy backup</button><button class="btn ghost grow" data-act="restore">Restore</button></div>
        <textarea id="restoretext" placeholder="Paste a backup here, then tap Restore" style="margin-top:8px;min-height:60px"></textarea>
      </div>`;
  }

  const TABS = [
    ['today', '📋', 'Today', viewToday],
    ['play', '🏓', 'Courts', viewPlay],
    ['standings', '🏆', 'Results', viewStandings],
    ['players', '👥', 'Players', viewPlayers],
    ['settings', '⚙️', 'Settings', viewSettings],
  ];

  function render() {
    const s = sess();
    const scrollY = window.scrollY;
    $sub.textContent = [s.date, planText(), s.rounds.length ? 'round ' + s.rounds.length : ''].filter(Boolean).join(' · ');
    $nav.innerHTML = TABS.map(([k, ic, label]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}"><span class="ic">${ic}</span>${label}</button>`).join('');
    $app.innerHTML = TABS.find((t) => t[0] === tab)[3]();
    window.scrollTo(0, scrollY);
  }

  function go(t) { tab = t; armed = null; render(); window.scrollTo(0, 0); }

  // ---------- events ----------
  $nav.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); });

  $app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
    const act = el.dataset.act;
    const s = sess();
    const wasArmed = armed;
    armed = null;
    switch (act) {
      case 'paste': {
        const names = E.parseList(document.getElementById('paste').value);
        names.forEach((n) => setHere(addToDay(n), true));
        save();
        toast(names.length ? 'Added ' + names.length + ' players' : 'No names found');
        break;
      }
      case 'addone': {
        const v = document.getElementById('one').value.trim();
        if (v) { setHere(addToDay(v), true); save(); toast(v + ' checked in'); }
        break;
      }
      case 'addreg': setHere(addToDay(person(el.dataset.id).name), true); save(); break;
      case 'toggle': {
        const sp = s.players.find((p) => p.id === el.dataset.id);
        setHere(sp, !sp.present);
        save();
        break;
      }
      case 'start':
      case 'next':
        try { nextRound(); tab = 'play'; window.scrollTo(0, 0); } catch (err) { toast(err.message); }
        break;
      case 'goplay': go('play'); return;
      case 'reshuffle': s.rounds.pop(); try { nextRound(); toast('Round redone'); } catch (err) { toast(err.message); } break;
      case 'undo':
        if (wasArmed === 'undo') { s.rounds.pop(); save(); toast('Round removed'); } else armed = 'undo';
        break;
      case 'newday':
        if (wasArmed === 'newday') { newSession(); save(); toast('New day started'); } else armed = 'newday';
        break;
      case 'win': {
        const c = s.rounds[+el.dataset.r].courts[+el.dataset.k];
        const side = el.dataset.side;
        c.winner = c.winner === side ? null : side;
        // keep entered scores consistent with the pick
        if (c.sa !== '' && c.sb !== '' && E.winnerOf({ sa: c.sa, sb: c.sb }) && E.winnerOf({ sa: c.sa, sb: c.sb }) !== c.winner && c.winner) { c.sa = ''; c.sb = ''; }
        save();
        break;
      }
      case 'share': {
        const rows = E.standings(s);
        const txt = `P4A ${s.date} results (${s.rounds.length} rounds)\n` +
          rows.map((x, i) => `${i + 1}. ${person(x.id).name}: ${x.points} pts, ${x.wins}-${x.games - x.wins}, sat ${x.sits}`).join('\n');
        copy(txt);
        return;
      }
      case 'rank': S[el.dataset.key] = el.dataset.val; save(); break;
      case 'sharerank': {
        const { list } = rankData();
        const label = (PERIODS.find(([v]) => String(v) === String(S.rankPeriod)) || [0, ''])[1];
        const top = list.filter((x) => S.rankSort !== 'pct' || x.qualified).slice(0, 10);
        const txt = `🏆 P4A top 10, ${label.toLowerCase()}\n` +
          top.map((x, i) => `${i + 1}. ${person(x.id).name}: ${Math.round(x.pct * 100)}% (${x.wins}-${x.games - x.wins})`).join('\n');
        copy(txt);
        return;
      }
      case 'publish':
        el.disabled = true; el.textContent = 'Publishing…';
        publish().then(() => toast('Published. The group page updates in about a minute.'))
          .catch((err) => toast(err.message))
          .finally(() => { el.disabled = false; el.textContent = 'Publish to group page'; });
        return;
      case 'savekey': {
        const v = document.getElementById('pubkey').value.trim();
        if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY);
        toast(v ? 'Publish key saved on this phone' : 'Publish key removed');
        break;
      }
      case 'pdel':
        if (wasArmed === 'del' + el.dataset.id) { delete S.roster[el.dataset.id]; save(); } else armed = 'del' + el.dataset.id;
        break;
      case 'dupr': {
        const people = {};
        Object.values(S.roster).forEach((p) => { people[p.id] = { name: p.name, dupr: (p.dupr || '').trim() }; });
        const out = E.duprCsv(s, people, { event: S.settings.event, location: S.settings.location, scoreType: S.settings.scoreType });
        if (out.rows) download(`dupr-${s.date}.csv`, out.csv);
        document.getElementById('duprinfo').innerHTML =
          `<p><b>${out.rows} game${out.rows === 1 ? '' : 's'} in the file.</b></p>` +
          (out.skipped.length ? `<details><summary>${out.skipped.length} left out</summary><p class="muted">${out.skipped.map(esc).join('<br>')}</p></details>` : '');
        return;
      }
      case 'backup': copy(JSON.stringify(S)); return;
      case 'restore': {
        try {
          const v = JSON.parse(document.getElementById('restoretext').value);
          if (!v.roster) throw new Error();
          S = { ...DEFAULTS, ...v, settings: { ...DEFAULTS.settings, ...v.settings } };
          save(); toast('Restored');
        } catch (err) { toast("That doesn't look like a backup"); return; }
        break;
      }
      default: return;
    }
    render();
  });

  // Inputs update data without re-rendering (keeps the keyboard open).
  $app.addEventListener('input', (e) => {
    const el = e.target;
    const act = el.dataset.act;
    if (!act) return;
    const s = sess();
    if (act === 'score') {
      const c = s.rounds[+el.dataset.r].courts[+el.dataset.k];
      const v = el.value.replace(/[^0-9]/g, '');
      if (el.dataset.side === 'A') c.sa = v; else c.sb = v;
      c.winner = null;
      save();
      // update winner highlight + next button without losing focus
      const w = E.winnerOf(c);
      const box = el.closest('.court');
      box.querySelectorAll('.team').forEach((t, i) => t.classList.toggle('won', w === (i === 0 ? 'A' : 'B')));
      const round = curRound();
      const nb = $app.querySelector('[data-act="next"]');
      if (nb && round) {
        const done = roundDone(round);
        nb.disabled = !done;
        nb.textContent = done ? 'Next round →' : 'Finish every court for the next round';
      }
    } else if (act === 'pname') { const v = el.value.trim(); if (v) S.roster[el.dataset.id].name = v; save(); }
    else if (act === 'prating') { const v = el.value.trim(); S.roster[el.dataset.id].rating = v === '' || isNaN(+v) ? null : +v; save(); }
    else if (act === 'pdupr') { S.roster[el.dataset.id].dupr = el.value.trim(); save(); }
    else if (act === 'set') {
      const k = el.dataset.key;
      S.settings[k] = ['formBump', 'defaultRating'].includes(k) ? (isNaN(+el.value) ? S.settings[k] : +el.value) : el.value;
      save();
    }
  });

  $app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'courts') { sess().courts = +el.value; S.settings.courts = +el.value; save(); render(); }
    if (el.id === 'date') { sess().date = el.value; save(); render(); }
    if (el.dataset.act === 'set' && el.tagName === 'SELECT') render();
  });

  function copy(txt) {
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
      .then(() => toast('Copied'))
      .catch(() => { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast('Copied'); });
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  render();
})();
