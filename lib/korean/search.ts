import { PHRASES } from "./phrases.ts";
import type { Phrase } from "./types.ts";

const norm = (s: string) =>
  s.normalize("NFKC").toLowerCase().replace(/[\s　？?！!。、,.～~ー・]/g, "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const bigrams = (s: string) => { const out = new Set<string>(); for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2)); if (s.length === 1) out.add(s); return out; };
const jaccard = (a: string, b: string) => { const A = bigrams(a), B = bigrams(b); const i = [...A].filter((x) => B.has(x)).length; const u = new Set([...A, ...B]).size; return u ? i / u : 0; };

export type PhraseHit = { phrase: Phrase; score: number };

export function searchPhrases(raw: string, limit = 5): PhraseHit[] {
  const q = norm(raw);
  if (!q) return [];
  const hits: PhraseHit[] = [];
  for (const p of PHRASES) {
    let best = 0;
    for (const ja of p.ja) {
      const n = norm(ja);
      let sc = 0;
      if (n === q) sc = 1;
      else if (n.includes(q) && q.length >= 2) sc = 0.8;
      else if (q.includes(n) && n.length >= 2) sc = 0.75;
      else sc = jaccard(n, q) * 0.7;
      best = Math.max(best, sc);
    }
    // ハングル入力にも対応（ko / スラング）
    const hangul = [p.polite.ko, p.casual.ko, p.formal?.ko ?? "", ...(p.slang?.map((x) => x.ko) ?? [])].map((x) => x.replace(/[\s?]/g, ""));
    if (hangul.includes(raw.replace(/[\s?？]/g, ""))) best = Math.max(best, 1);
    if (best >= 0.45) hits.push({ phrase: p, score: best });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
