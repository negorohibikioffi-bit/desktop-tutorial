import { NextRequest, NextResponse } from "next/server";
import { searchTerms, parseCompareQuery } from "@/lib/realestate/search";
import { findComparison } from "@/lib/realestate/comparisons";
import { TERM_MAP } from "@/lib/realestate/terms";
import { rateLimit } from "@/lib/server/guard";
import { clampQuery } from "@/lib/server/http";

const withRelated = <T extends { related: string[] }>(t: T) => ({ ...t, relatedTerms: t.related.map((id) => TERM_MAP.get(id)).filter(Boolean).map((r) => ({ id: r!.id, name: r!.name })) });

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "re", 120);
  if (limited) return limited;
  const sp = req.nextUrl.searchParams;

  // ID指定の比較（用語カードの「比較」ボタンから）
  const cmpIds = sp.get("cmp")?.split(",");
  if (cmpIds?.length === 2) {
    const [a, b] = cmpIds.map((id) => TERM_MAP.get(id));
    if (!a || !b) return NextResponse.json({ error: "not_found", message: "用語が見つかりません" }, { status: 404 });
    return NextResponse.json({ hits: [], compare: { a: withRelated(a), b: withRelated(b), data: findComparison(a.id, b.id) ?? null } });
  }

  const q = clampQuery(sp.get("q"));
  if (!q) return NextResponse.json({ hits: [], compare: null });
  const hits = searchTerms(q).map((h) => ({ ...withRelated(h.term), score: h.score, why: h.why }));

  let compare = null as null | { a: unknown; b: unknown; data: ReturnType<typeof findComparison> | null };
  const pair = parseCompareQuery(q);
  if (pair) {
    const a = searchTerms(pair[0], 1)[0]?.term, b = searchTerms(pair[1], 1)[0]?.term;
    if (a && b && a.id !== b.id) compare = { a: withRelated(a), b: withRelated(b), data: findComparison(a.id, b.id) ?? null };
  }
  return NextResponse.json({ hits, compare });
}
