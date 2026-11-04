# Roadmap

Done (2026-11-04): fair sit-outs, rating courts with variety, two-tap scoring, round timer, display mode, copy lineup, awards, recap, multi-week rankings (Pts/game), public rankings page, player cards, DUPR CSV with readiness checks, dark theme, installable PWA.

Done (2026-11-04, later): Firebase backend, sessions, Sign-up tab with rating confirmation, live courts on every phone, players enter scores, "You're on Court N" banner, practice mode, rankings page reads live data. Real roster seeded (21 players with DUPR ratings from the Pickleheads 10/31 session page).

Next:
1. Import Pickleheads history for all-time rankings: Pickleheads connector (`claude mcp add` done, owner must `/mcp` → authenticate) or screenshots of past round robins from the Pickleheads phone app.
2. Friday ratings refresh: read the club's Pickleheads session page in the owner's Chrome when asked (no unattended scraping; Pickleheads blocks bots). Check whether the connector returns ratings, for a scheduled job.
3. Check the DUPR CSV against Bilal's real template.
3. Native app later (likely by wrapping this PWA first). DUPR Partner API then.

Ideas: player self check-in link instead of the WhatsApp poll; per-player stats over time on the rankings page.
