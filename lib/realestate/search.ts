import { TERMS } from "./terms.ts";
import type { Term } from "./types.ts";

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s　・･\-－()（）]/g, "");

export type TermHit = { term: Term; score: number; why: string };

export function searchTerms(raw: string, limit = 12): TermHit[] {
  const q = norm(raw);
  if (!q) return [];
  const hits: TermHit[] = [];
  for (const t of TERMS) {
    const names = [t.name, ...t.aliases].map(norm);
    let score = 0, why = "";
    if (names.includes(q)) { score = 100; why = "用語一致"; }
    else if (names.some((n) => n.startsWith(q))) { score = 80; why = "前方一致"; }
    else if (names.some((n) => n.includes(q) || (q.length >= 2 && q.includes(n) && n.length >= 2))) { score = 65; why = "部分一致"; }
    else if (norm(t.short).includes(q) || norm(t.detail).includes(q)) { score = 30; why = "解説内に該当"; }
    if (score) hits.push({ term: t, score, why });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** 「AとBの違い」形式の入力から2語を取り出す */
export function parseCompareQuery(raw: string): [string, string] | null {
  const s = raw.normalize("NFKC").trim();
  const m = s.match(/^(.+?)\s*(?:と|vs\.?|VS|対|・|\/|／)\s*(.+?)\s*(?:の違い|の比較|を比較|違い|比較)?$/);
  if (!m) return null;
  return [m[1].trim(), m[2].trim()];
}
