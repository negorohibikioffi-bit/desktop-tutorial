import { NextRequest, NextResponse } from "next/server";
import { searchPhrases } from "@/lib/korean/search";
import { askJSON } from "@/lib/server/ai";
import { rateLimit } from "@/lib/server/guard";
import { aiError, clampQuery } from "@/lib/server/http";

const hasKey = () => !!process.env.ANTHROPIC_API_KEY;

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "ko", 90);
  if (limited) return limited;
  const q = clampQuery(req.nextUrl.searchParams.get("q"), 60);
  if (!q) return NextResponse.json({ hits: [] });
  return NextResponse.json({ hits: searchPhrases(q).map((h) => ({ ...h.phrase, score: h.score })), aiAvailable: hasKey() });
}

/** 辞書に無い表現をAIで翻訳。スラングは「実使用未確認」と明示する。 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "ko-ai", 10);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { q?: string };
  const q = clampQuery(body.q ?? "", 60);
  if (!q) return NextResponse.json({ error: "bad_request", message: "文を入力してください" }, { status: 400 });
  try {
    const r = await askJSON<Record<string, unknown>>({
      cacheKey: `ko-ai:${q}`,
      system: "あなたは日本語話者向けの韓国語講師。韓国人が実際に使う自然な表現を教える。教科書的すぎる表現は避ける。スラングは、実際に広く使われていると確信できるものだけを載せ、創作しない。確信が持てないスラングは空配列にする。カタカナは近似であることを前提にする。ローマ字は韓国の国語の羅馬字表記法(RR)。",
      user: `日本語: 「${q}」\nJSON: {"formal":{"ko":"","kana":"","rom":""},"polite":{"ko":"","kana":"","rom":""},"casual":{"ko":"","kana":"","rom":""},"slang":[{"ko":"","kana":"","rom":"","meaning":"","scene":"","risk":"なし|やや注意|要注意（粗い表現）","risk_note":""}],"tips":["発音のポイント"],"nuance":"使う場面の説明"}`,
      maxTokens: 1200,
    });
    return NextResponse.json({ hit: { ...r, id: `ai-${q}`, ja: [q], origin: "ai", checkedAt: null } });
  } catch (e) { return aiError(e); }
}
