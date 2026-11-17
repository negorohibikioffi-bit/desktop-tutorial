// 漢字データ生成: KANJIDIC由来(davidluzgouveia/kanji-data) + 構成要素(cjkvi-ids) を結合
// 使い方: npm run data:kanji   (ネットワーク必須)
import { writeFileSync } from "node:fs";

const KD = "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json";
const IDS = "https://raw.githubusercontent.com/cjkvi/cjkvi-ids/master/ids.txt";
const OPS = new Set([..."⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻"]);
// 部品の異体字を正規化（検索時に同一視する）
const NORM = { "⺡": "氵", "⺅": "亻", "⺾": "艹", "艸": "艹", "⺘": "扌", "⺖": "忄", "⻌": "辶", "⻍": "辶", "⻖": "阝", "⻏": "阝", "礻": "礻", "⺭": "礻", "⺲": "罒", "⺼": "月", "⺹": "耂", "⺝": "月", "⺨": "犭", "⻂": "衤", "⺌": "小" };
const norm = (c) => NORM[c] ?? c;

const [kdText, idsText] = await Promise.all([fetch(KD).then((r) => r.text()), fetch(IDS).then((r) => r.text())]);
const kd = JSON.parse(kdText);

const idsMap = new Map();
for (const line of idsText.split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const [, ch, ...rest] = line.split("\t");
  if (!rest.length) continue;
  // 複数IDSがある場合は日本(J)向けを優先
  let pick = rest.find((r) => /\[[^\]]*J[^\]]*\]/.test(r)) ?? rest[0];
  pick = pick.replace(/\[[A-Z]+\]/g, "");
  idsMap.set(ch, pick);
}

function tokens(ids) {
  const out = [];
  const arr = [...ids];
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i];
    if (OPS.has(c)) continue;
    if (c === "&") { let j = i; let s = ""; while (j < arr.length) { s += arr[j]; if (arr[j] === ";") break; j++; } out.push(s); i = j; continue; }
    out.push(c);
  }
  return out;
}
function allParts(ch, depth = 0, seen = new Set()) {
  const ids = idsMap.get(ch);
  if (!ids || depth > 3) return [];
  const res = [];
  for (const t of tokens(ids)) {
    if (t === ch || t.startsWith("&")) continue;
    const n = norm(t);
    res.push(n);
    if (!seen.has(n)) { seen.add(n); res.push(...allParts(t, depth + 1, seen)); }
  }
  return res;
}

const list = [];
for (const [ch, v] of Object.entries(kd)) {
  if (!(v.freq || v.grade || v.jlpt_new)) continue; // 常用・頻出のみ
  const ids = idsMap.get(ch);
  const direct = ids ? [...new Set(tokens(ids).filter((t) => t !== ch && !t.startsWith("&")).map(norm))] : [];
  const all = ids ? [...new Set(allParts(ch))] : [];
  list.push({
    c: ch, s: v.strokes ?? null, g: v.grade ?? null, j: v.jlpt_new ?? null, f: v.freq ?? null,
    m: v.meanings ?? [], on: v.readings_on ?? [], kun: v.readings_kun ?? [], ids: ids ?? null, d: direct, p: all,
  });
}
list.sort((a, b) => (a.f ?? 9999) - (b.f ?? 9999));
writeFileSync(new URL("../data/kanji.json", import.meta.url), JSON.stringify(list));
console.log("kanji:", list.length, "with ids:", list.filter((k) => k.ids).length);
