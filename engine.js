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
        id: p.id, games: 0, wins: 0, points: 0,
        sits: p.joinRound == null ? 0 : (p.joinCredit || 0),
        lastSat: -1, pos: null, lastWon: false,
        partners: {}, lastPartner: null, lastRoundPlayed: -1,
      };
    }
    session.rounds.forEach((round, r) => {
      const n = round.courts.length;
      const playing = new Set();
      round.courts.forEach((c, k) => {
        [...c.a, ...c.b].forEach((id) => playing.add(id));
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
              const won = w === side;
              if (won) { s.wins++; s.points += n - k; }
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

  // Multi-week leaderboard. days: [{date:'YYYY-MM-DD', stats:{id:{points,wins,games,sits}}}]
  // sinceDate: 'YYYY-MM-DD' or null for all time. sort: 'pct' | 'wins' | 'points'.
  // Win% ranking only lists players with at least minGames games; others follow after.
  function rankings(days, sinceDate, sort, minGames) {
    const tot = {};
    for (const d of days) {
      if (sinceDate && d.date < sinceDate) continue;
      for (const [id, x] of Object.entries(d.stats)) {
        const t = tot[id] || (tot[id] = { id, points: 0, wins: 0, games: 0, days: 0 });
        t.points += x.points; t.wins += x.wins; t.games += x.games; t.days++;
      }
    }
    const list = Object.values(tot);
    list.forEach((t) => { t.pct = t.games ? t.wins / t.games : 0; t.qualified = t.games >= (minGames || 0); });
    const key = { pct: 'pct', wins: 'wins', points: 'points' }[sort] || 'pct';
    list.sort((a, b) => (sort === 'pct' ? b.qualified - a.qualified : 0)
      || b[key] - a[key] || b.pct - a.pct || b.wins - a.wins || b.games - a.games);
    return list;
  }

  const api = { rankings, hash, rng, winnerOf, derive, joinCredit, generateRound, standings, parseList, duprCsv, DUPR_HEADER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
