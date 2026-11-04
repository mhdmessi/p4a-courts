# How courts and sit-outs work (do not break these)

## Courts
- **Court 1 is the strongest.** Default placement sorts players by DUPR rating (high to low) and fills courts 4 at a time. The owner said: "we dont want low DUPR to be in high courts."
- A small hot-streak nudge (`formBump`, default 0.05 rating per net win today) lets a hot player move up.
- **Court variety (`mixGap`, default 0.3):** with steady ratings, the same 4 would share a court all morning. Players within 0.3 rating can swap between neighboring courts when it reduces repeat meetings (cost = sum of squared "shared a court" counts). Nobody moves more than one court from their rating spot. Sims (8 rounds): each player meets about 2x more people (6.6 → 12.2 at 20 players), and the average rating gap on a court goes 0.30 → 0.50.
- Optional ladder mode in Settings (Claim the Throne style: winners up, losers down).
- Partners split every round. Cost order: never last round's partner (+100), then fewer repeat partners (+10 each), then even teams.

## Sit-outs (the main reason this app exists)
- Whoever has sat the **least** sits next. Ties go to whoever sat longest ago, then a seeded random pick. Wins and losses **never** affect sit-outs.
- Any round a checked-in player doesn't play counts as a sit, including stepping away.
- Late arrival: credited `min(rounds so far, current max sits)` sits, so they go straight onto a court.
- Guarantee: the gap between any two players' sit counts is at most 1 (`test.js` checks 1,200 simulated sessions).
- The owner wants everyone to get nearly the same time out with odd numbers or no-shows. A morning is about 7–8 games, 2 hours.

## Scoring
- Pickleball rules: games to 11 (also 15 or 21), win by 2, side-out or rally (Settings). The sheet warns on impossible scores (for example 11-10).
- Two-tap entry: tap the winning team, then tap the losing score. "Close game" inputs handle deuce scores.
- Round timer (Pickleheads has one, and the owner asked for it): Off/8/10/12/15 minutes, auto-starts with the round, buzzes and beeps at 1:00 and 0:00. Timed rounds accept scores below the target.
- Court points: a win on court k of n = n−k+1 points.

## Rankings
- Default sort: **points per game** (court-weighted). The sims showed win % is misleading with rating-balanced courts: a 3.06 player came 3rd. Win % and Wins are also available.
- Players need ≥ max(5, 40% of the most games anyone played) to be ranked in Pts/game or Win %.
- Every day with scored games is saved in `history` (stats plus a game list) for player cards (record, streaks, best partner).
