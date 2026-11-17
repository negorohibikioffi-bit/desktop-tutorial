import { RADICAL_NAMES, FILLERS, COMPONENT_VARIANTS } from "./radicals.ts";

export type KanjiRecord = {
  c: string; s: number | null; g: number | null; j: number | null; f: number | null;
  m: string[]; on: string[]; kun: string[]; ids: string | null; d: string[]; p: string[];
};
export type MatchType = "exact" | "component" | "reading" | "meaning";
export type KanjiHit = { record: KanjiRecord; matchType: MatchType; score: number };
export type ParsedQuery = { components: string[]; reading: string | null; english: string | null; rest: string };

const KANJI_RE = /[㐀-䶿一-鿿々〆ヶ]/u;
const KANA_RE = /^[぀-ゟ゠-ヿ]+$/u;
const NAMES = Object.keys(RADICAL_NAMES).sort((a, b) => b.length - a.length);
const FILLER_SORTED = [...FILLERS].sort((a, b) => b.length - a.length);

export const kata2hira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const normComp = (c: string) => COMPONENT_VARIANTS[c] ?? c;

/** 「さんずいに青」のような自然な日本語を、部品リストと読みに分解する（規則ベース） */
export function parseQuery(raw: string): ParsedQuery {
  const input = raw.normalize("NFKC").trim();
  if (/^[A-Za-z][A-Za-z\s-]*$/.test(input)) return { components: [], reading: null, english: input.toLowerCase(), rest: "" };
  const components: string[] = [];
  let kana = "";
  let rest = "";
  let i = 0;
  const flushKana = () => { if (kana) { rest += kana; } };
  while (i < input.length) {
    const tail = input.slice(i);
    // 1) 部首名（最長一致）— 「にんべん」の「に」を接続詞と誤認しないよう、先に評価
    const name = NAMES.find((n) => tail.startsWith(n));
    if (name) { flushKana(); kana = ""; components.push(normComp(RADICAL_NAMES[name])); i += name.length; continue; }
    // 2) 漢字そのもの
    const ch = [...tail][0];
    if (KANJI_RE.test(ch)) { flushKana(); kana = ""; components.push(normComp(ch)); i += ch.length; continue; }
    // 3) 読み飛ばし語
    const filler = FILLER_SORTED.find((f) => tail.startsWith(f));
    if (filler && !(kana && filler.length === 1 && /^[でがをの]$/.test(filler) && false)) {
      // 仮名列の途中で現れる助詞も区切りとして扱う
      if (kana) { rest += kana; kana = ""; }
      i += filler.length; continue;
    }
    kana += ch; i += ch.length;
  }
  if (kana) rest += kana;
  const reading = rest && KANA_RE.test(rest) ? kata2hira(rest) : null;
  return { components: [...new Set(components)], reading, english: null, rest };
}

const strip = (r: string) => kata2hira(r.replace(/[-]/g, ""));
function readingVariants(rs: string[]): string[] {
  const out = new Set<string>();
  for (const r of rs) {
    const [stem] = r.split(".");
    out.add(strip(stem));
    out.add(strip(r.replace(".", "")));
  }
  return [...out];
}

export function createIndex(data: KanjiRecord[]) {
  const byChar = new Map(data.map((k) => [k.c, k]));
  const readings = data.map((k) => ({ k, on: readingVariants(k.on), kun: readingVariants(k.kun) }));

  function search(raw: string, limit = 40): { parsed: ParsedQuery; hits: KanjiHit[] } {
    const parsed = parseQuery(raw);
    const hits = new Map<string, KanjiHit>();
    const add = (record: KanjiRecord, matchType: MatchType, score: number) => {
      const prev = hits.get(record.c);
      const bonus = (record.f ? Math.max(0, 1 - record.f / 3000) : 0) * 5; // 常用頻度で微調整
      if (!prev || prev.score < score + bonus) hits.set(record.c, { record, matchType, score: score + bonus });
    };

    const comps = parsed.components;
    if (comps.length) {
      // 入力が漢字1文字だけなら、その漢字自体を先頭に
      if (comps.length === 1 && [...raw.normalize("NFKC").trim()].length === 1 && byChar.has(raw.trim())) add(byChar.get(raw.trim())!, "exact", 100);
      for (const k of data) {
        if (k.c === comps[0] && comps.length === 1) continue;
        const inDirect = comps.every((c) => k.d.includes(c));
        const inAll = comps.every((c) => k.p.includes(c) || k.d.includes(c));
        if (!inAll) continue;
        // 直接の構成要素に全部含まれる > 再帰分解で含まれる。部品数が少ない(=余計な部品が少ない)ほど上位
        const extra = Math.max(0, k.d.length - comps.length);
        let score = (inDirect ? 60 : 30) - extra * 4;
        if (parsed.reading) {
          const rd = readings[data.indexOf(k)];
          const ok = [...rd.on, ...rd.kun].some((r) => r.startsWith(parsed.reading!));
          if (!ok) continue;
          score += 20;
        }
        add(k, "component", score);
      }
    } else if (parsed.reading) {
      const q = parsed.reading;
      for (const { k, on, kun } of readings) {
        const exact = [...on, ...kun].includes(q);
        const prefix = !exact && [...on, ...kun].some((r) => r.startsWith(q));
        if (exact) add(k, "reading", 70); else if (prefix) add(k, "reading", 35);
      }
    } else if (parsed.english) {
      const q = parsed.english;
      for (const k of data) {
        const ms = k.m.map((m) => m.toLowerCase());
        if (ms.includes(q)) add(k, "meaning", 60); else if (ms.some((m) => m.startsWith(q))) add(k, "meaning", 30);
      }
    }
    const sorted = [...hits.values()].sort((a, b) => b.score - a.score).slice(0, limit);
    return { parsed, hits: sorted };
  }

  return { search, byChar, get: (c: string) => byChar.get(c) };
}
