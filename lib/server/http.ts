import { NextResponse } from "next/server";
import { AIUnavailable } from "./ai";

export function aiError(e: unknown) {
  if (e instanceof AIUnavailable) {
    const status = e.reason === "budget" ? 429 : e.reason === "no_key" ? 503 : 502;
    return NextResponse.json({ error: `ai_${e.reason}`, message: e.message }, { status });
  }
  return NextResponse.json({ error: "internal", message: "サーバーでエラーが発生しました" }, { status: 500 });
}
export const clampQuery = (s: string | null, max = 80) => (s ?? "").normalize("NFKC").trim().slice(0, max);
