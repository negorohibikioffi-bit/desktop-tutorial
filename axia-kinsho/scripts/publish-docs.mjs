// アプリ本体を ../docs/ にコピーする（GitHub Pages は「/docs」フォルダを配信できる）
// 使い方: npm run build && npm run pages
import { cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const out = new URL('../../docs/', import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'app.js', 'config.js', 'sw.js', 'manifest.webmanifest']) cpSync(new URL(f, root), new URL(f, out));
for (const d of ['vendor', 'icons']) cpSync(new URL(d, root), new URL(d, out), { recursive: true });
writeFileSync(new URL('.nojekyll', out), '');
console.log('docs/ を作った（GitHub Pages 用）');
