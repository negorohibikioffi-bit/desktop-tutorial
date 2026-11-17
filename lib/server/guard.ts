import { NextRequest, NextResponse } from "next/server";

/** 単純なスライディングウィンドウ式レート制限＋TTLキャッシュ（インスタンス単位）。
 *  本番の複数インスタンス構成では Upstash Redis / Supabase に差し替えること（README参照）。 */
const buckets = new Map<string, number[]>();
const cache = new Map<string, { v: unknown; exp: number }>();
let dayKey = "";
let dayCount = 0;

export function clientId(req: NextRequest) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

export function rateLimit(req: NextRequest, scope: string, max: number, windowMs = 60_000): NextResponse | null {
  const key = `${scope}:${clientId(req)}`;
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    return NextResponse.json({ error: "rate_limited", message: "リクエストが多すぎます。少し待ってからもう一度お試しください。" }, { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } });
  }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 5000) buckets.clear();
  return null;
}

export function cacheGet<T>(key: string): T | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (e.exp < Date.now()) { cache.delete(key); return undefined; }
  return e.v as T;
}
export function cacheSet(key: string, v: unknown, ttlMs = 24 * 3600_000) {
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
  cache.set(key, { v, exp: Date.now() + ttlMs });
}

/** 1日あたりのAI呼び出し総数の上限（コスト暴走防止） */
export function aiBudgetOk(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; dayCount = 0; }
  const limit = Number(process.env.AI_DAILY_LIMIT ?? 300);
  if (dayCount >= limit) return false;
  dayCount++;
  return true;
}
