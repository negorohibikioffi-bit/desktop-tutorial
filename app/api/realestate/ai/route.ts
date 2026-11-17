import { NextRequest, NextResponse } from "next/server";
import { askJSON } from "@/lib/server/ai";
import { rateLimit } from "@/lib/server/guard";
import { aiError, clampQuery } from "@/lib/server/http";

/** 辞書に無い用語をAIで解説。結果は必ず「AI生成・未確認」として表示される。 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "re-ai", 10);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { q?: string };
  const q = clampQuery(body.q ?? "", 60);
  if (!q) return NextResponse.json({ error: "bad_request", message: "用語を入力してください" }, { status: 400 });
  try {
    const r = await askJSON<Record<string, unknown>>({
      cacheKey: `re-ai:${q}`,
      system: "日本の不動産実務（宅建業法・民法・不動産登記法・借地借家法等）に詳しい編集者。初心者にもわかる説明と実務向け解説を作る。条文番号は確実なものだけ記載し、不確かなら書かない。法改正の可能性は注意点に明記する。",
      user: `用語: 「${q}」\nJSON: {"name":"正式名称","aliases":["別名"],"short":"一言説明(60字以内)","detail":"実務向け解説(300字以内)","example":"実務での使用例","cautions":["注意点"],"known":true/false(不動産用語として確実に存在を知っているか)}`,
      maxTokens: 900,
    });
    return NextResponse.json({ ...r, origin: "ai", checkedAt: null });
  } catch (e) { return aiError(e); }
}
