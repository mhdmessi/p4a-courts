// Simulates many sessions and checks fairness. Run: node test.js
const E = require('./engine.js');
const assert = require('assert');

function makeSession(nPlayers, courts, seed) {
  const players = [];
  const ratings = {};
  const R = E.rng(seed);
  for (let i = 0; i < nPlayers; i++) {
    players.push({ id: 'p' + i, present: true, joinRound: 0, joinCredit: 0 });
    ratings['p' + i] = Math.round((2.8 + R() * 1.6) * 100) / 100;
  }
  return { s: { seed, courts, date: '2026-11-07', players, rounds: [] }, ratings, R };
}

function playRound(s, ratings, R, mode) {
  const round = E.generateRound(s, { ratings, mode });
  // sanity: everyone present is placed exactly once
  const seen = new Set();
  round.courts.forEach((c) => [...c.a, ...c.b].forEach((id) => { assert(!seen.has(id)); seen.add(id); }));
  round.sitting.forEach((id) => { assert(!seen.has(id)); seen.add(id); });
  assert.strictEqual(seen.size, s.players.filter((p) => p.present).length);
  round.courts.forEach((c) => {
    const ra = ratings[c.a[0]] + ratings[c.a[1]], rb = ratings[c.b[0]] + ratings[c.b[1]];
    const aWins = R() < 1 / (1 + Math.exp(-(ra - rb) * 3));
    c.sa = aWins ? 11 : Math.floor(R() * 10);
    c.sb = aWins ? Math.floor(R() * 10) : 11;
  });
  s.rounds.push(round);
  return round;
}

function spread(s) {
  const st = E.derive(s);
  const sits = s.players.filter((p) => p.present).map((p) => st[p.id].sits);
  return Math.max(...sits) - Math.min(...sits);
}

let worst = 0, sessions = 0;
for (const mode of ['rating', 'ladder']) {
  for (let n = 8; n <= 22; n++) {
    for (const courts of [3, 4]) {
      for (let seed = 1; seed <= 20; seed++) {
        const { s, ratings, R } = makeSession(n, courts, seed * 1000 + n);
        for (let r = 0; r < 10; r++) {
          playRound(s, ratings, R, mode);
          const sp = spread(s);
          worst = Math.max(worst, sp);
          assert(sp <= 1, `${mode} n=${n} courts=${courts} seed=${seed} round=${r + 1}: sit spread ${sp}`);
          // nobody sits two rounds in a row while someone present hasn't sat since
          if (r > 0) {
            const prev = new Set(s.rounds[r - 1].sitting);
            const twice = s.rounds[r].sitting.filter((id) => prev.has(id));
            const sitters = s.rounds[r].sitting.length;
            if (twice.length) assert(sitters * 2 > n - 0, `back-to-back sit with plenty of players: ${mode} n=${n}`);
          }
        }
        sessions++;
      }
    }
  }
}
console.log(`fairness: ${sessions} simulated sessions, max sit-out gap between any two players = ${worst}`);

// Rating mode: court 1 should hold the top-rated players when there are no results yet.
{
  const { s, ratings, R } = makeSession(16, 4, 7);
  const round = playRound(s, ratings, R, 'rating');
  const avg = round.courts.map((c) => [...c.a, ...c.b].reduce((t, id) => t + ratings[id], 0) / 4);
  for (let k = 1; k < avg.length; k++) assert(avg[k - 1] >= avg[k], 'court 1 strongest');
  console.log('rating order round 1 (court avg):', avg.map((x) => x.toFixed(2)).join(' > '));
  // partners split up every round on each court
  for (let r = 0; r < 5; r++) playRound(s, ratings, R, 'rating');
  for (let r = 1; r < s.rounds.length; r++) {
    const prevPairs = new Set();
    s.rounds[r - 1].courts.forEach((c) => [c.a, c.b].forEach(([x, y]) => { prevPairs.add(x + y); prevPairs.add(y + x); }));
    s.rounds[r].courts.forEach((c) => [c.a, c.b].forEach(([x, y]) => assert(!prevPairs.has(x + y), 'same partner twice in a row')));
  }
  console.log('partners: nobody kept the same partner two rounds running');
}

// Late arrival: shouldn't be sat out right away, and should end up even.
{
  const { s, ratings, R } = makeSession(15, 3, 99);
  const late = s.players.pop();
  late.present = false; late.joinRound = null;
  s.players.push(late);
  for (let r = 0; r < 4; r++) playRound(s, ratings, R, 'rating');
  late.joinCredit = E.joinCredit(s);
  late.present = true; late.joinRound = s.rounds.length;
  const next = playRound(s, ratings, R, 'rating');
  assert(!next.sitting.includes(late.id), 'late arrival sat immediately');
  for (let r = 0; r < 6; r++) playRound(s, ratings, R, 'rating');
  console.log(`late arrival: credited ${late.joinCredit} sit(s), plays first round back, sit gap after 11 rounds = ${spread(s)}`);
  assert(spread(s) <= 1);
}

// Player steps away for a round: counts as their sit.
{
  const { s, ratings, R } = makeSession(17, 4, 5);
  for (let r = 0; r < 3; r++) playRound(s, ratings, R, 'rating');
  const p = s.players[3];
  p.present = false;
  playRound(s, ratings, R, 'rating');
  p.present = true;
  for (let r = 0; r < 4; r++) playRound(s, ratings, R, 'rating');
  console.log(`break: player who stepped out got ${E.derive(s)[p.id].sits} sit(s) counted, gap = ${spread(s)}`);
  assert(spread(s) <= 1);
}

// WhatsApp list parsing
{
  const txt = `P4A 10/31 7-9am:
1. Ahsan - registered
2. H2
3. ⁠Munaf- registered
4. ⁠Saleem - registered
5. Imran K.
6. Amjad - registered
7. ahsan`;
  const names = E.parseList(txt);
  assert.deepStrictEqual(names, ['Ahsan', 'H2', 'Munaf', 'Saleem', 'Imran K.', 'Amjad']);
  console.log('parse:', names.join(', '));
}

// DUPR CSV
{
  const { s, ratings, R } = makeSession(8, 2, 3);
  playRound(s, ratings, R, 'rating');
  const people = {};
  s.players.forEach((p, i) => { people[p.id] = { name: 'Player ' + i, dupr: i === 0 ? '' : 'ID' + i }; });
  const out = E.duprCsv(s, people, { event: 'P4A Saturday', location: 'Pickleball4ALL', scoreType: 'SIDEOUT' });
  assert.strictEqual(out.rows + out.skipped.length, 2);
  assert.strictEqual(out.csv.split('\n')[0].split(',').length, 27);
  console.log('dupr csv:', out.rows, 'row(s);', out.skipped.join('; '));
}
console.log('ALL TESTS PASSED');

// Rankings across weeks
{
  const days = [
    { date: '2026-09-05', stats: { a: { points: 10, wins: 6, games: 8, sits: 1 }, b: { points: 4, wins: 2, games: 8, sits: 1 } } },
    { date: '2026-10-31', stats: { a: { points: 2, wins: 1, games: 7, sits: 2 }, b: { points: 9, wins: 6, games: 7, sits: 2 }, c: { points: 4, wins: 3, games: 3, sits: 0 } } },
  ];
  const all = E.rankings(days, null, 'pct', 5);
  assert.deepStrictEqual(all.map((x) => x.id), ['b', 'a', 'c']); // c: 100% but only 3 games -> unranked
  const recent = E.rankings(days, '2026-10-01', 'wins', 0);
  assert.deepStrictEqual(recent.map((x) => x.id), ['b', 'c', 'a']);
  console.log('rankings: ok');
}
// Points count even in a loss; group rating moves with score margin
{
  const days = [{ date: '2026-11-07', stats: {
    a: { points: 2, wins: 1, games: 2, pf: 20, pa: 13, sg: 2 },
    b: { points: 2, wins: 1, games: 2, pf: 13, pa: 20, sg: 2 },
    c: { points: 0, wins: 0, games: 2, pf: 19, pa: 22, sg: 2 } } }];
  const r = E.rankings(days, null, 'pfg', 0);
  assert.deepStrictEqual(r.map((x) => x.id), ['a', 'c', 'b']); // c lost both but scored 19
  const g = E.groupRatings([
    { date: 'd', i: 1, a: ['p', 'q'], b: ['x', 'y'], sa: 11, sb: 2 },
    { date: 'd', i: 2, a: ['p', 'x'], b: ['q', 'y'], sa: 9, sb: 11 },
  ], { p: 3.5, q: 3.5, x: 3.5, y: 3.5 }, 3.0);
  assert(g.p.rating > 3.5 && g.y.rating < 3.5, 'rating moves');
  assert(Math.abs(g.p.rating - 3.5) < 0.1, 'moves are small');
  console.log('points + group rating: ok', Object.entries(g).map(([n, v]) => n + ' ' + v.rating.toFixed(3)).join(', '));
}
{
  const r = E.parseRoster('Mubeen Shafi\n3.33 DUPR\nBilal Majeed 3.4\nAhmed - 3.64 DUPR\n1. Sahl\nImran K. (3.33)');
  assert.deepStrictEqual(r, [{ name: 'Mubeen Shafi', rating: 3.33 }, { name: 'Bilal Majeed', rating: 3.4 }, { name: 'Ahmed', rating: 3.64 }, { name: 'Sahl', rating: null }, { name: 'Imran K.', rating: 3.33 }]);
  console.log('roster paste: ok');
}
console.log('ALL TESTS PASSED (incl. rankings)');

// Zone rule: nobody who played last round moves more than one court (rating mode).
{
  let worst = 0;
  for (const [n, c] of [[16, 4], [17, 4], [20, 5], [21, 5], [22, 5], [14, 3]]) for (let seed = 1; seed <= 25; seed++) {
    const R = E.rng(seed * 101 + n), ratings = {}, players = [];
    for (let i = 0; i < n; i++) { players.push({ id: 'p' + i, present: true, joinRound: 0, joinCredit: 0 }); ratings['p' + i] = 2.8 + R() * 1.4; }
    const s = { seed, courts: c, players, rounds: [], date: 'x' };
    for (let r = 0; r < 8; r++) {
      const rd = E.generateRound(s, { ratings });
      if (r > 0) s.rounds[r - 1].courts.forEach((cc, k) => [...cc.a, ...cc.b].forEach((id) => {
        const nk = rd.courts.findIndex((x) => [...x.a, ...x.b].includes(id));
        if (nk >= 0) worst = Math.max(worst, Math.abs(nk - k));
      }));
      rd.courts.forEach((cc) => { const a = R() < 0.5; cc.sa = a ? 11 : 6; cc.sb = a ? 6 : 11; });
      s.rounds.push(rd);
    }
  }
  assert(worst <= 1, 'someone moved ' + worst + ' courts');
  console.log('zone rule: max court move between rounds = ' + worst);
}
console.log('ALL TESTS PASSED (incl. zones)');
