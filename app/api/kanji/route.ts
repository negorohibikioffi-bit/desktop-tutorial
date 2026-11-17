import { NextRequest, NextResponse } from "next/server";
import data from "@/data/kanji.json";
import { createIndex, type KanjiRecord } from "@/lib/kanji/search";
import { askJSON } from "@/lib/server/ai";
import { rateLimit } from "@/lib/server/guard";
import { aiError, clampQuery } from "@/lib/server/http";

const index = createIndex(data as KanjiRecord[]);

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "kanji", 90);
  if (limited) return limited;
  const q = clampQuery(req.nextUrl.searchParams.get("q"));
  const useAI = req.nextUrl.searchParams.get("ai") === "1";
  if (!q) return NextResponse.json({ parsed: null, hits: [], ai: [] });

  const { parsed, hits } = index.search(q);
  const out = {
    parsed,
    hits: hits.map((h) => ({ ...h.record, matchType: h.matchType })),
    ai: [] as (KanjiRecord & { matchType: "ai"; reason: string })[],
  };
  if (!useAI) return NextResponse.json(out);

  try {
    const r = await askJSON<{ candidates?: { kanji: string; reason: string }[] }>({
      cacheKey: `kanji-ai:${q}`,
      system: "あなたは日本語の漢字辞典アシスタントです。ユーザーの説明（部首・構成要素・読み・意味）に当てはまる漢字を最大6個、可能性の高い順に挙げる。実在しない漢字は絶対に作らない。確信がなければ少なく返す。",
      user: `説明: 「${q}」\nJSON形式: {"candidates":[{"kanji":"漢字1文字","reason":"なぜ該当するか(30字以内)"}]}`,
      maxTokens: 500,
    });
    const seen = new Set(out.hits.map((h) => h.c));
    for (const c of r.candidates ?? []) {
      const ch = [...(c.kanji ?? "")][0];
      const rec = ch ? index.get(ch) : undefined; // データベースに存在する漢字だけ採用（幻覚対策）
      if (rec && !seen.has(rec.c)) { seen.add(rec.c); out.ai.push({ ...rec, matchType: "ai", reason: String(c.reason ?? "").slice(0, 80) }); }
    }
    return NextResponse.json(out);
  } catch (e) {
    return aiError(e);
  }
}
