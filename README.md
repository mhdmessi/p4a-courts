# P4A Courts

Phone web app for Saturday 7am open play at Pickleball4ALL.

- Courts are set by DUPR rating (court 1 = highest), nudged by today's results. A Claim-the-Throne-style ladder mode is in Settings.
- Fair sit-outs: whoever has sat the least sits next, regardless of wins or losses. Late arrivals and breaks are handled.
- Partners rotate every round.
- Today's standings and rankings for the last 4 weeks, 2 months, 6 months or all time, with "copy for WhatsApp" buttons.
- DUPR: exports a club "Import Matches via CSV" file for a club director to upload on dupr.com.

Files: `index.html` (UI shell), `app.js` (UI), `engine.js` (rotation logic), `test.js` (`node test.js` simulates 1,200 sessions).
Data is stored in the browser's localStorage on the organizer's phone. Settings → Backup moves it to another phone.
