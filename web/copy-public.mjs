// Copies shared static files from the repo root into web/public before each build.
import { copyFileSync, mkdirSync, writeFileSync } from 'fs';
mkdirSync('public', { recursive: true });
for (const f of ['icon.svg', 'icon-180.png', 'icon-512.png', 'manifest.webmanifest', 'rankings.html', 'engine.js', 'model.js', 'firebase-config.js', 'style.css']) copyFileSync('../' + f, 'public/' + f);
writeFileSync('public/.nojekyll', '');
console.log('copied static files');
