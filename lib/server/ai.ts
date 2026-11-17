import "server-only";
import { aiBudgetOk, cacheGet, cacheSet } from "./guard";

export class AIUnavailable extends Error {
  constructor(public reason: "no_key" | "budget" | "upstream" | "parse", msg?: string) { super(msg ?? reason); }
}

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

/** Anthropic Messages API をサーバー側からのみ呼ぶ。キーはクライアントへ出さない。 */
export async function askJSON<T>(opts: { cacheKey: string; system: string; user: string; maxTokens?: number }): Promise<T> {
  const cached = cacheGet<T>(opts.cacheKey);
  if (cached) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AIUnavailable("no_key", "AIのAPIキーが未設定です");
  if (!aiBudgetOk()) throw new AIUnavailable("budget", "本日のAI利用上限に達しました");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5",
        max_tokens: opts.maxTokens ?? 1200,
        system: opts.system + "\n出力は有効なJSONオブジェクトのみ。前後に説明文やコードフェンスを付けない。",
        messages: [{ role: "user", content: opts.user }],
      }),
    });
  } catch (e) {
    throw new AIUnavailable("upstream", (e as Error).name === "AbortError" ? "AIの応答がタイムアウトしました" : "AIへの接続に失敗しました");
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new AIUnavailable("upstream", `AI APIエラー (${res.status})`);
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = body.content?.filter((b) => b.type === "text").map((b) => b.text).join("") ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new AIUnavailable("parse", "AIの応答を解釈できませんでした");
  try {
    const v = JSON.parse(m[0]) as T;
    cacheSet(opts.cacheKey, v);
    return v;
  } catch { throw new AIUnavailable("parse", "AIの応答を解釈できませんでした"); }
}
