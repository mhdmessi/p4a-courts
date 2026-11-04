# DUPR (what's possible and what we chose)

- **No public DUPR API.** The official Partner API (RaaS, https://dupr.gitbook.io/dupr-raas, contact tech@mydupr.com) requires partner approval, player SSO login (manual DUPR ID entry isn't allowed in partner apps) and rating webhooks. That fits the future native app.
- **The app can't pull ratings or scores from DUPR.** Knowing someone's DUPR ID doesn't let us read their rating. Ratings are typed once per player on the Players tab.
- **Pickleheads can't help:** its MCP connector (pickleheads.com/guides/mcp) has no score-writing tool and can't send to DUPR. It can only check submission status.
- **What we do:** the app exports DUPR's club **"Import Matches via CSV"** file. Bilal (DUPR club director, confirmed) uploads it on dupr.com desktop: Club → Matches → Add Matches → Import Matches via CSV. Club-submitted matches are auto-validated.
- The CSV header (27 columns) comes from a third-party copy of the template and was **not yet checked against DUPR's own template**: matchType, event, date (yyyy-MM-dd), playerA1, playerA1DuprId, playerA1ExternalId, … teamAGame1, teamBGame1 … teamAGame5, teamBGame5, location, scoreType. matchType "D", scoreType SIDEOUT or RALLY. **TODO:** get Bilal's real template and compare.
- A game is included only if it has both scores and all 4 players have DUPR IDs. The Results tab lists what's missing and lets you fill in IDs inline.
- On a phone, "Send DUPR file" uses the share sheet to get the file to Bilal.

## Getting ratings (DUPR unlocks are limited, so lookups inside DUPR don't scale)
- The Pickleheads session page (public, e.g. pickleheads.com/sessions/45559621/1) lists every confirmed player with their DUPR rating. Read it in the owner's Chrome on request (Fridays). Don't script it unattended: Pickleheads blocks bots, and the safety check refused a UA-spoofing curl.
- Players confirm their own rating on the Sign-up tab (seeing your own rating in DUPR is free).
- The group rating fills the gaps between refreshes.
