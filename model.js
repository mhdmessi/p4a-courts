// Converts database records to the shapes the engine uses. Shared by the app and the rankings page.
(function (root) {
  'use strict';
  const E = root.Engine || (typeof require !== 'undefined' ? require('./engine.js') : null);

  // The database stores lists as objects ({0:..,1:..}) and drops empty ones.
  function arr(x) {
    if (!x) return [];
    if (Array.isArray(x)) return x.filter((v) => v !== null && v !== undefined);
    return Object.keys(x).sort((a, b) => Number(a) - Number(b)).map((k) => x[k]).filter((v) => v !== null && v !== undefined);
  }
  const val = (v) => (v === null || v === undefined ? '' : v);

  function toSession(id, raw) {
    raw = raw || {};
    const players = Object.entries(raw.players || {}).map(([pid, p]) => ({
      id: pid,
      present: !!p.present,
      joinRound: p.joinRound === undefined || p.joinRound === null ? null : Number(p.joinRound),
      joinCredit: Number(p.joinCredit || 0),
    }));
    const rounds = arr(raw.rounds).map((r) => ({
      sitting: arr(r.sitting),
      createdAt: r.createdAt || 0,
      timed: !!r.timed,
      timerEnd: r.timerEnd || null,
      courts: arr(r.courts).map((c) => ({ a: arr(c.a), b: arr(c.b), sa: val(c.sa), sb: val(c.sb), winner: c.winner || null })),
    }));
    return {
      id,
      date: raw.date || id,
      time: raw.time || '7:00 AM',
      courts: Number(raw.courts || 4),
      cap: raw.cap ? Number(raw.cap) : null,
      seed: Number(raw.seed || 1),
      createdAt: raw.createdAt || 0,
      rsvp: raw.rsvp || {},
      players,
      rounds,
    };
  }

  // For writing a round back: arrays are fine to store.
  function roundToDb(round) {
    return {
      sitting: round.sitting,
      createdAt: round.createdAt || Date.now(),
      timed: !!round.timed,
      timerEnd: round.timerEnd || null,
      courts: round.courts.map((c) => courtToDb(c)),
    };
  }
  function courtToDb(c) {
    return { a: c.a, b: c.b, sa: val(c.sa), sb: val(c.sb), winner: c.winner || null };
  }

  // One day of results for rankings: stats per player id and the game list.
  function dayFrom(s) {
    if (!s.rounds.length) return null;
    const st = E.derive(s);
    const stats = {};
    let games = 0;
    s.players.forEach((p) => {
      const x = st[p.id];
      if (x && x.games) { stats[p.id] = { points: x.points, wins: x.wins, games: x.games, sits: x.sits, pf: x.pf, pa: x.pa, sg: x.sg }; games += x.games; }
    });
    if (!games) return null;
    const list = [];
    s.rounds.forEach((round, r) => round.courts.forEach((c, k) => {
      const w = E.winnerOf(c);
      if (w) list.push({ i: r * 10 + k, round: r + 1, court: k + 1, a: c.a, b: c.b, sa: c.sa, sb: c.sb, w });
    }));
    return { id: s.id, date: s.date, stats, games: list };
  }

  // Renames ids to player names (for rankings keyed by name).
  function dayByName(day, names) {
    const n = (id) => (names[id] && names[id].name) || id;
    const stats = {};
    Object.entries(day.stats).forEach(([id, x]) => { stats[n(id)] = x; });
    return { date: day.date, stats, games: day.games.map((g) => ({ ...g, a: g.a.map(n), b: g.b.map(n) })) };
  }

  const api = { arr, toSession, roundToDb, courtToDb, dayFrom, dayByName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Model = api;
})(typeof window !== 'undefined' ? window : globalThis);
