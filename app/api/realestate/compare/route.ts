import { NextRequest, NextResponse } from "next/server";
import { askJSON } from "@/lib/server/ai";
import { rateLimit } from "@/lib/server/guard";
import { aiError, clampQuery } from "@/lib/server/http";

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "re-cmp", 8);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { a?: string; b?: string };
  const a = clampQuery(body.a ?? "", 40), b = clampQuery(body.b ?? "", 40);
  if (!a || !b) return NextResponse.json({ error: "bad_request", message: "2つの用語を指定してください" }, { status: 400 });
  try {
    const r = await askJSON<Record<string, unknown>>({
      cacheKey: `re-cmp:${[a, b].sort().join("|")}`,
      system: "日本の不動産実務に詳しい編集者。2つの用語の違いを比較表にする。確実でない点は書かない。",
      user: `比較: 「${a}」と「${b}」\nJSON: {"summary":"違いの要点(100字以内)","rows":[{"label":"観点","a":"${a}の内容","b":"${b}の内容"}](4〜6行),"cautions":["注意点"]}`,
      maxTokens: 900,
    });
    return NextResponse.json({ ...r, origin: "ai", checkedAt: null });
  } catch (e) { return aiError(e); }
}
