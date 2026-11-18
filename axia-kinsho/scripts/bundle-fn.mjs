// Edge Function を「1ファイル」にまとめる（Supabase ダッシュボードのエディタに貼れる形）
// 使い方: npm run bundle-fn  →  dist/mail-ingest.single.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const dir = new URL('../supabase/functions/mail-ingest/', import.meta.url);
const logic = readFileSync(new URL('logic.ts', dir), 'utf8').replace(/^export /gm, '');
let index = readFileSync(new URL('index.ts', dir), 'utf8');
index = index.replace(/import \{[^}]*\} from '\.\/logic\.ts';\n/, '');
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/mail-ingest.single.ts', import.meta.url),
  // ※ 置換は「関数」で行う（文字列だと、中の `$'` や `$&` が特殊記号として解釈されて壊れる）
  `// ※ 自動生成（npm run bundle-fn）。logic.ts + index.ts を1つにまとめたもの\n${index.replace("import { createClient } from 'npm:@supabase/supabase-js@2';", () => "import { createClient } from 'npm:@supabase/supabase-js@2';\n" + logic)}`);
console.log('dist/mail-ingest.single.ts を作った');
