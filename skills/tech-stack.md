# Tech stack (v4, 2026-11-04)

- **App (`web/`):** React 18 + Vite 5 + Tailwind CSS 3 + Framer Motion (animations) + Lucide icons + Firebase JS SDK (Realtime Database).
  - `web/src/lib/store.js`: all state, live DB sync and actions (ported from the old vanilla `app.js`). Components re-render through `useSyncExternalStore` (`lib/hooks.js`).
  - `web/src/views/*`: Sign-up, Check-in, Courts, Results, More. `web/src/overlays/Overlays.jsx`: score sheet, player card, timer, full-screen lineup, toasts. `web/src/ui/kit.jsx`: design primitives.
  - Responsive: phone = single column with a bottom nav; `lg` (laptops) = tabs in the header, courts in a grid, side columns. The owner asked for full screen use on laptops.
- **Shared logic (repo root):** `engine.js` (court/sit-out rules), `model.js` (DB ↔ engine shapes), `firebase-config.js`. These are plain scripts, loaded with `<script>` tags in `web/index.html` (not bundled; Vite's CJS interop broke them). `node test.js` tests `engine.js`.
- **Build & deploy:** `cd web && npm run build` copies root static files into `web/public` (gitignored), then builds into `docs/`. GitHub Pages serves `main:/docs`. Always rebuild and commit `docs/` after changes.
- The old vanilla `index.html`/`app.js`/`style.css` at the root are legacy (still used by `rankings.html` for styles). They're no longer served as the app.
- Practice sandbox: `?practice=1` (DB path `p4a/practice`).
