// P4A Ladder engine: court ladder (winners up, losers down) with fair sit-outs.
// Pure functions, no DOM. Works in the browser (window.Engine) and in Node (require).
(function (root) {
  'use strict';

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  const blank = (v) => v === null || v === undefined || v === '';

  // Winner of a court: explicit pick, else from scores. Returns 'A', 'B' or null.
  function winnerOf(c) {
    if (c.winner === 'A' || c.winner === 'B') return c.winner;
    if (!blank(c.sa) && !blank(c.sb) && Number(c.sa) !== Number(c.sb)) {
      return Number(c.sa) > Number(c.sb) ? 'A' : 'B';
    }
    return null;
  }

  // Replays every round and returns per-player stats.
  // session.players: [{id, present, joinRound, joinCredit}]
  // joinRound = how many rounds existed when the player first checked in (null = never).
  // Every round from joinRound on that the player did not play counts as a sit
  // (sitting out or stepping away). joinCredit counts rounds missed before arriving,
  // capped when they check in so a late arrival isn't sat out straight away.
  function derive(session) {
    const st = {};
    for (const p of session.players) {
      st[p.id] = {
        id: p.id, games: 0, wins: 0, points: 0, pf: 0, pa: 0, sg: 0,
        sits: p.joinRound == null ? 0 : (p.joinCredit || 0),
        lastSat: -1, pos: null, lastWon: false,
        partners: {}, met: {}, lastPartner: null, lastRoundPlayed: -1, streak: 0,
      };
    }
    session.rounds.forEach((round, r) => {
      const n = round.courts.length;
      const playing = new Set();
      round.courts.forEach((c, k) => {
        const four = [...c.a, ...c.b];
        four.forEach((id) => {
          playing.add(id);
          const s = st[id];
          if (s) four.forEach((o) => { if (o !== id) s.met[o] = (s.met[o] || 0) + 1; });
        });
        const w = winnerOf(c);
        const teams = { A: c.a, B: c.b };
        for (const side of ['A', 'B']) {
          const team = teams[side];
          team.forEach((id, i) => {
            const s = st[id];
            if (!s) return;
            const mate = team[1 - i];
            s.partners[mate] = (s.partners[mate] || 0) + 1;
            s.lastPartner = mate;
            s.lastRoundPlayed = r;
            if (w) {
              s.games++;
              if (!blank(c.sa) && !blank(c.sb)) {
                const mine = Number(side === 'A' ? c.sa : c.sb), theirs = Number(side === 'A' ? c.sb : c.sa);
                s.pf += mine; s.pa += theirs; s.sg++;
              }
              const won = w === side;
              if (won) { s.wins++; s.points += n - k; }
              s.streak = won ? Math.max(1, s.streak + 1) : Math.min(-1, s.streak - 1);
              s.lastWon = won;
              s.pos = won ? Math.max(0, k - 1) : Math.min(n - 1, k + 1);
            } else {
              s.pos = k;
            }
          });
        }
      });
      for (const p of session.players) {
        if (p.joinRound == null || r < p.joinRound) continue;
        if (!playing.has(p.id)) {
          st[p.id].sits++;
          st[p.id].lastSat = r;
        }
      }
    });
    return st;
  }

  // Sit credit for a player checking in now (late arrival).
  function joinCredit(session) {
    const r = session.rounds.length;
    if (r === 0) return 0;
    const st = derive(session);
    const here = session.players.filter((p) => p.present && p.joinRound != null);
    const maxSits = here.reduce((m, p) => Math.max(m, st[p.id].sits), 0);
    return Math.min(r, maxSits);
  }

  const PAIRINGS = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ];

  // Variety: with steady ratings the same four would share a court all morning.
  // Swap players between neighboring courts when their ratings are within `gap`
  // and it cuts down how often the same people have shared a court today.
  // Nobody moves more than one court from their rating spot.
  function mixCourts(order, n, st, eff, gap) {
    if (n < 2 || !gap) return;
    const home = {};
    order.forEach((id, i) => { home[id] = Math.floor(i / 4); });
    const courtOf = (i) => Math.floor(i / 4);
    const costAt = (k) => {
      const q = order.slice(k * 4, k * 4 + 4);
      let c = 0;
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) c += (st[q[i]].met[q[j]] || 0) ** 2;
      return c;
    };
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (let k = 0; k < n - 1; k++) {
        for (let i = k * 4; i < k * 4 + 4; i++) {
          for (let j = (k + 1) * 4; j < (k + 1) * 4 + 4; j++) {
            const x = order[i], y = order[j];
            if (Math.abs(eff(x) - eff(y)) > gap) continue;
            if (Math.abs(courtOf(j) - home[x]) > 1 || Math.abs(courtOf(i) - home[y]) > 1) continue;
            const before = costAt(k) + costAt(k + 1);
            order[i] = y; order[j] = x;
            const after = costAt(k) + costAt(k + 1);
            if (after < before) improved = true;
            else { order[i] = x; order[j] = y; }
          }
        }
      }
      if (!improved) break;
    }
  }

  // Builds the next round. Returns {courts:[{a,b,sa,sb,winner}], sitting:[ids]}.
  // opts.ratings: {id: number} used to seed round 1 (optional).
  function generateRound(session, opts) {
    opts = opts || {};
    const ratings = opts.ratings || {};
    const r = session.rounds.length;
    const present = session.players.filter((p) => p.present);
    const n = Math.min(session.courts, Math.floor(present.length / 4));
    if (n < 1) throw new Error('Need at least 4 players checked in.');

    const st = derive(session);
    const R = rng(hash(String(session.seed) + ':' + r));
    const tb = {};
    present.forEach((p) => { tb[p.id] = R(); });

    // 1) Who sits: fewest sits so far sit first; ties go to whoever sat longest ago.
    const sitCount = present.length - 4 * n;
    const bySit = present.slice().sort((x, y) => {
      const a = st[x.id], b = st[y.id];
      return a.sits - b.sits || a.lastSat - b.lastSat || tb[x.id] - tb[y.id];
    });
    const sitting = bySit.slice(0, sitCount).map((p) => p.id);
    const sitSet = new Set(sitting);
    const playing = present.filter((p) => !sitSet.has(p.id)).map((p) => p.id);

    // 2) Court order (court 1 = strongest).
    if ((opts.mode || 'rating') === 'rating') {
      // By DUPR rating, nudged by today's results (formBump per net win).
      const bump = opts.formBump == null ? 0.05 : opts.formBump;
      const eff = (id) => (ratings[id] || 0) + bump * (st[id].wins - (st[id].games - st[id].wins));
      playing.sort((x, y) => eff(y) - eff(x) || tb[x] - tb[y]);
      mixCourts(playing, n, st, eff, opts.mixGap == null ? 0.3 : opts.mixGap);
    } else {
      // Ladder: winners up, losers down; players keep their spot through a sit-out.
      // New players: by rating on the first round, bottom court after that.
      const anyPos = playing.some((id) => st[id].pos !== null);
      const posOf = (id) => {
        const s = st[id];
        if (s.pos === null) return anyPos ? n - 1 + 0.5 : 0;
        return Math.min(s.pos, n - 1);
      };
      playing.sort((x, y) => {
        const a = st[x], b = st[y];
        return posOf(x) - posOf(y)
          || (b.lastWon - a.lastWon)
          || (b.points - a.points)
          || ((ratings[y] || 0) - (ratings[x] || 0))
          || tb[x] - tb[y];
      });
    }

    // 3) Split partners on each court: avoid last partner, then repeat partners,
    // then keep teams even.
    const strength = (id) => (ratings[id] || 0) * 10 + st[id].points + st[id].wins;
    const courts = [];
    for (let k = 0; k < n; k++) {
      const q = playing.slice(k * 4, k * 4 + 4);
      let best = null;
      for (const [ta, tbm] of PAIRINGS) {
        const A = ta.map((i) => q[i]);
        const B = tbm.map((i) => q[i]);
        let cost = 0;
        for (const [p1, p2] of [A, B]) {
          if (st[p1].lastPartner === p2) cost += 100;
          cost += 10 * (st[p1].partners[p2] || 0);
        }
        cost += Math.abs(strength(A[0]) + strength(A[1]) - strength(B[0]) - strength(B[1])) * 0.01;
        cost += R() * 0.001;
        if (!best || cost < best.cost) best = { cost, A, B };
      }
      courts.push({ a: best.A, b: best.B, sa: '', sb: '', winner: null });
    }
    return { courts, sitting };
  }

  function standings(session) {
    const st = derive(session);
    return session.players
      .filter((p) => p.joinRound != null)
      .map((p) => st[p.id])
      .sort((a, b) => b.points - a.points
        || (b.games ? b.wins / b.games : 0) - (a.games ? a.wins / a.games : 0)
        || b.wins - a.wins);
  }

  // Parses a WhatsApp availability list into names.
  function parseList(text) {
    const out = [];
    const seen = new Set();
    for (let line of String(text).split(/\r?\n/)) {
      line = line.replace(/[​-‏⁠﻿]/g, '').trim();
      if (!line) continue;
      if (/^p4a\b/i.test(line) || /\d{1,2}\/\d{1,2}.*\d\s*(am|pm)/i.test(line)) continue;
      // WhatsApp poll "View votes" noise: vote counts, times, phone numbers, "You"
      if (/^\d+\s+votes?$/i.test(line) || /^(today|yesterday)?\s*,?\s*\d{1,2}:\d{2}\s*(am|pm)?$/i.test(line)) continue;
      if (/^[+\d\s()\-]{7,}$/.test(line) || /^(you|view votes|votes|poll)$/i.test(line)) continue;
      line = line
        .replace(/^~\s*/, '')
        .replace(/^\s*\d+\s*[.)\-:]\s*/, '')
        .replace(/\s*[-–—]\s*(registered|reg|paid|confirmed|maybe|tentative|late|out)\b.*$/i, '')
        .replace(/\s*\((registered|reg|paid|maybe|late)\)\s*$/i, '')
        .replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '')
        .trim();
      if (!line || line.length > 40 || /[,?!]/.test(line)) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
    return out;
  }

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  const DUPR_HEADER = ['matchType', 'event', 'date',
    'playerA1', 'playerA1DuprId', 'playerA1ExternalId',
    'playerA2', 'playerA2DuprId', 'playerA2ExternalId',
    'playerB1', 'playerB1DuprId', 'playerB1ExternalId',
    'playerB2', 'playerB2DuprId', 'playerB2ExternalId',
    'teamAGame1', 'teamBGame1', 'teamAGame2', 'teamBGame2', 'teamAGame3', 'teamBGame3',
    'teamAGame4', 'teamBGame4', 'teamAGame5', 'teamBGame5',
    'location', 'scoreType'];

  // One row per game that has both scores entered.
  // people: {id: {name, dupr}}. Returns {csv, rows, skipped:[reasons]}.
  function duprCsv(session, people, opts) {
    const lines = [DUPR_HEADER.join(',')];
    const skipped = [];
    let rows = 0;
    session.rounds.forEach((round, r) => {
      round.courts.forEach((c, k) => {
        const label = 'Round ' + (r + 1) + ', court ' + (k + 1);
        if (blank(c.sa) || blank(c.sb)) { skipped.push(label + ': no score'); return; }
        const ids = [...c.a, ...c.b];
        const missing = ids.filter((id) => !(people[id] && people[id].dupr)).map((id) => (people[id] || {}).name || id);
        if (missing.length) { skipped.push(label + ': no DUPR ID for ' + missing.join(', ')); return; }
        const pl = (id) => [people[id].name, people[id].dupr, ''];
        const row = ['D', opts.event, session.date,
          ...pl(c.a[0]), ...pl(c.a[1]), ...pl(c.b[0]), ...pl(c.b[1]),
          Number(c.sa), Number(c.sb), '', '', '', '', '', '', '', '',
          opts.location, opts.scoreType];
        lines.push(row.map(csvCell).join(','));
        rows++;
      });
    });
    return { csv: lines.join('\n') + '\n', rows, skipped };
  }

  // Checks a pickleball score. Returns '' if fine, else a short warning.
  // timed = round ended on the clock (games may stop before the target).
  function scoreWarning(sa, sb, target, winBy, timed) {
    if (blank(sa) || blank(sb)) return '';
    const a = Number(sa), b = Number(sb);
    const hi = Math.max(a, b), lo = Math.min(a, b);
    if (a === b) return 'Tied score: pick a winner';
    if (timed) return '';
    if (hi < target) return 'Game is to ' + target;
    if (hi - lo < winBy) return 'Must win by ' + winBy;
    if (lo >= target - 1 && hi - lo !== winBy) return 'Past ' + (target - 1) + '-' + (target - 1) + ', game ends at a ' + winBy + '-point lead';
    return '';
  }

  // Awards for one day. Returns [{title, who, detail}] using ids.
  function dayAwards(session) {
    const st = derive(session);
    const ids = session.players.filter((p) => p.joinRound != null && st[p.id].games).map((p) => p.id);
    if (!ids.length) return [];
    const out = [];
    const top = (f) => ids.slice().sort((a, b) => f(st[b]) - f(st[a]))[0];
    const mvp = top((x) => x.pf * 1000 + (x.pf - x.pa) * 10 + x.wins);
    out.push({ title: 'MVP', who: [mvp], detail: st[mvp].pf + ' pts, ' + st[mvp].wins + '-' + (st[mvp].games - st[mvp].wins) });
    // best streak today
    let bestStreak = { len: 0, id: null };
    const run = {};
    session.rounds.forEach((round) => round.courts.forEach((c) => {
      const w = winnerOf(c);
      if (!w) return;
      for (const side of ['A', 'B']) for (const id of (side === 'A' ? c.a : c.b)) {
        run[id] = w === side ? (run[id] || 0) + 1 : 0;
        if (run[id] > bestStreak.len) bestStreak = { len: run[id], id };
      }
    }));
    if (bestStreak.len >= 3) out.push({ title: 'On fire', who: [bestStreak.id], detail: bestStreak.len + ' wins in a row' });
    // best duo (2+ games together)
    const duo = {};
    session.rounds.forEach((round) => round.courts.forEach((c) => {
      const w = winnerOf(c);
      if (!w) return;
      for (const side of ['A', 'B']) {
        const t = (side === 'A' ? c.a : c.b).slice().sort();
        const k = t.join('|');
        const d = duo[k] || (duo[k] = { t, g: 0, w: 0 });
        d.g++; if (w === side) d.w++;
      }
    }));
    const duos = Object.values(duo).filter((d) => d.g >= 2).sort((a, b) => b.w / b.g - a.w / a.g || b.w - a.w);
    if (duos.length && duos[0].w === duos[0].g) out.push({ title: 'Best duo', who: duos[0].t, detail: duos[0].w + '-0 together' });
    // court 1 king
    const c1 = {};
    session.rounds.forEach((round) => { const c = round.courts[0]; const w = c && winnerOf(c); if (w && round.courts.length > 1) (w === 'A' ? c.a : c.b).forEach((id) => { c1[id] = (c1[id] || 0) + 1; }); });
    const king = Object.entries(c1).sort((a, b) => b[1] - a[1])[0];
    if (king && king[1] >= 2) out.push({ title: 'Top court king', who: [king[0]], detail: king[1] + ' wins on court 1' });
    return out;
  }

  // Player card from game history. games: [{date, a:[name,name], b:[name,name], sa, sb, w:'A'|'B'}]
  function playerCard(games, name) {
    let w = 0, l = 0, streak = 0, best = 0;
    const mates = {};
    const mine = games.filter((g) => g.a.includes(name) || g.b.includes(name))
      .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : (x.i || 0) - (y.i || 0)));
    for (const g of mine) {
      const side = g.a.includes(name) ? 'A' : 'B';
      const won = g.w === side;
      if (won) { w++; streak = streak > 0 ? streak + 1 : 1; best = Math.max(best, streak); } else { l++; streak = streak < 0 ? streak - 1 : -1; }
      const mate = (side === 'A' ? g.a : g.b).find((x) => x !== name);
      const m = mates[mate] || (mates[mate] = { name: mate, g: 0, w: 0 });
      m.g++; if (won) m.w++;
    }
    const partners = Object.values(mates).filter((m) => m.g >= 2).sort((a, b) => b.w / b.g - a.w / a.g || b.g - a.g);
    return { wins: w, losses: l, streak, bestStreak: best, bestPartner: partners[0] || null, partnersPlayed: Object.keys(mates).length };
  }

  // Group rating, DUPR-style: every game moves your number by how your team's share
  // of the points compares to what the rating gap predicted. Points count even in a loss.
  // games: [{date, i, a:[n,n], b:[n,n], sa, sb}], seed: {name: startingRating}
  function groupRatings(games, seed, defaultRating, k) {
    const K = k || 0.08;
    const r = {};
    const get = (n) => (r[n] != null ? r[n] : (r[n] = seed[n] != null ? Number(seed[n]) : defaultRating));
    const played = {};
    games.filter((g) => !blank(g.sa) && !blank(g.sb) && Number(g.sa) + Number(g.sb) > 0)
      .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : (x.i || 0) - (y.i || 0)))
      .forEach((g) => {
        const ra = (get(g.a[0]) + get(g.a[1])) / 2, rb = (get(g.b[0]) + get(g.b[1])) / 2;
        const expA = 1 / (1 + Math.pow(10, (rb - ra) / 0.6));     // ~0.6 rating gap = 10:1 favourite
        const share = Number(g.sa) / (Number(g.sa) + Number(g.sb));
        const actA = 0.5 + (share - 0.5) * 1.6;                    // stretch: 11-0 ~ 0.9, 11-9 ~ 0.54
        const d = K * (Math.max(0, Math.min(1, actA)) - expA);
        g.a.forEach((n) => { r[n] = get(n) + d; played[n] = (played[n] || 0) + 1; });
        g.b.forEach((n) => { r[n] = get(n) - d; played[n] = (played[n] || 0) + 1; });
      });
    const out = {};
    Object.keys(r).forEach((n) => { out[n] = { rating: r[n], games: played[n] || 0 }; });
    return out;
  }

  // Multi-week leaderboard. days: [{date:'YYYY-MM-DD', stats:{id:{points,wins,games,sits}}}]
  // sinceDate: 'YYYY-MM-DD' or null for all time. sort: 'pct' | 'wins' | 'points'.
  // Win% ranking only lists players with at least minGames games; others follow after.
  function rankings(days, sinceDate, sort, minGames) {
    const tot = {};
    for (const d of days) {
      if (sinceDate && d.date < sinceDate) continue;
      for (const [id, x] of Object.entries(d.stats)) {
        const t = tot[id] || (tot[id] = { id, points: 0, wins: 0, games: 0, days: 0, pf: 0, pa: 0, sg: 0 });
        t.points += x.points; t.wins += x.wins; t.games += x.games; t.days++;
        t.pf += x.pf || 0; t.pa += x.pa || 0; t.sg += x.sg || 0;
      }
    }
    const list = Object.values(tot);
    list.forEach((t) => {
      t.pct = t.games ? t.wins / t.games : 0;
      t.ppg = t.games ? t.points / t.games : 0;
      t.pfg = t.sg ? t.pf / t.sg : 0;            // game points won per scored game
      t.diff = t.sg ? (t.pf - t.pa) / t.sg : 0;  // point differential per scored game
      t.qualified = t.games >= (minGames || 0);
    });
    const key = { pfg: 'pfg', diff: 'diff', ppg: 'ppg', pct: 'pct', wins: 'wins', points: 'points' }[sort] || 'pfg';
    const needsMin = key !== 'wins' && key !== 'points';
    list.sort((a, b) => (needsMin ? b.qualified - a.qualified : 0)
      || b[key] - a[key] || b.pct - a.pct || b.wins - a.wins || b.games - a.games);
    return list;
  }

  const api = { groupRatings, rankings, scoreWarning, dayAwards, playerCard, mixCourts, hash, rng, winnerOf, derive, joinCredit, generateRound, standings, parseList, duprCsv, DUPR_HEADER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
