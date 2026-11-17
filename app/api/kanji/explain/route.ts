import { NextRequest, NextResponse } from "next/server";
import data from "@/data/kanji.json";
import { askJSON } from "@/lib/server/ai";
import { rateLimit } from "@/lib/server/guard";
import { aiError, clampQuery } from "@/lib/server/http";
import type { KanjiRecord } from "@/lib/kanji/search";

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "kanji-explain", 20);
  if (limited) return limited;
  const c = [...clampQuery(req.nextUrl.searchParams.get("c"), 4)][0];
  const rec = (data as KanjiRecord[]).find((k) => k.c === c);
  if (!rec) return NextResponse.json({ error: "not_found", message: "辞書にない漢字です" }, { status: 404 });
  try {
    const r = await askJSON<{ meaning: string; examples: string[] }>({
      cacheKey: `kanji-explain:${c}`,
      system: "漢字辞典の編集者として、与えられた漢字の日本語での意味と代表的な熟語を簡潔に答える。辞書データに矛盾しないこと。",
      user: `漢字: ${rec.c}\n英語の意味(参考): ${rec.m.join(", ")}\n音読み: ${rec.on.join("、")} 訓読み: ${rec.kun.join("、")}\nJSON: {"meaning":"日本語の意味(60字以内)","examples":["熟語(読み)",...最大4]}`,
      maxTokens: 400,
    });
    return NextResponse.json(r);
  } catch (e) { return aiError(e); }
}
