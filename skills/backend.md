# Backend (Firebase Realtime Database)

- **Account:** `ninjasrturtles2@gmail.com` (owner's main Firebase account, console /u/0/). Project **P4A Courts**, id `p4a-courts-87196`, free Spark plan.
- DB: https://p4a-courts-87196-default-rtdb.firebaseio.com (us-central1). Web config in `firebase-config.js`. It's public by design; the rules control access.
- An unused project `p4a-courts` also exists on `mohammadasalam384@gmail.com`. The Firebase CLI is logged in as that account, and its Cloud console needs 2-step verification, which is why we switched. It's safe to delete if the owner wants.
- **Rules** (`database.rules.json`, a copy; the live rules were set in the console Rules tab): only `p4a/` is readable. `players/{id}` is writable (name required, under 60 chars), `sessions/{id}` can be created and updated but not deleted, and `meta` and `practice` are writable. Edit them in the console: Realtime Database → Rules. The CLI isn't logged into this account.
- **No login for players:** the group is trusted ("nobody cheats"). Anyone with the link can sign up and enter scores.

## Data shape (`/p4a`)
- `players/{pushId}`: `{name, rating, dupr}`
- `sessions/{YYYY-MM-DD[-n]}`: `{date, time, courts, seed, createdAt, rsvp:{pid:{s:'in'|'out', at}}, players:{pid:{present, joinRound, joinCredit}}, rounds:[{sitting:[], createdAt, timed, timerEnd, courts:[{a:[p,p], b:[p,p], sa, sb, winner}]}]}`
- `meta/settings`: shared settings (target, timer, mode, mixGap, protectWinners, ...)
- `practice/...`: the same shape, used by `?practice=1` (sandbox; never mixes with real data)
- Writes are granular (a single score, a single RSVP, a single round), so several phones can enter scores at once without overwriting each other.
- `model.js` converts DB ↔ engine shapes (`toSession`, `roundToDb`, `dayFrom`). Rankings are computed from every session's games. `rankings.html` reads `/p4a.json` over REST.
