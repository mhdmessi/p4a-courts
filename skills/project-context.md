# Project context

**Who:** the owner (repo mhdmessi) plays in the "Pickleball4ALL 7am" WhatsApp group: Saturday 7–9am open play at Pickleball4ALL, about 12–22 players, 4–5 courts. Bilal usually runs the courts on his phone and is the DUPR club director.

**Why this exists:** the group used Pickleheads "Claim the Throne". With extra players, Pickleheads sat out whoever kept losing, so some people sat about 50% of the morning, and Bilal had to fix sit-outs by hand. Pickleheads only offers manual "mark unavailable" sit-outs, and it has no API or connector that accepts scores.

**Goal (owner's words):** Bilal "almost doesn't have to move anybody", every round is ready with one tap, and DUPR is ready as soon as games are done. It should look better than Pickleheads and have its features: timer, rankings over weeks, display mode, and score entry.

**Sign-ups:** WhatsApp can't be read automatically (no API; unofficial tools risk bans). So the app has its own **Sign-up tab**: post the link (`?go=signup`) in WhatsApp; players tap their name once, then "I'm in" or "Can't make it", and confirm their DUPR rating. On Saturday, Check-in has a one-tap "Check in the N who signed up".

**Live data:** a shared Firebase database (see `backend.md`). Every phone sees the same sessions live; players enter their own court's score (Pickleheads-style); Bilal taps "Start round". `?practice=1` is a sandbox for trying things.

**Live:** https://mhdmessi.github.io/p4a-courts/ (organizer app) and `/rankings.html` (public leaderboard for the group).

**Long term:** the owner wants a real phone app eventually. This web app (PWA, installable from Safari "Add to Home Screen") comes first.
