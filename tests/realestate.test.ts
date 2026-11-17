import { test } from "node:test";
import assert from "node:assert/strict";
import { TERMS } from "../lib/realestate/terms.ts";
import { COMPARISONS } from "../lib/realestate/comparisons.ts";
import { searchTerms, parseCompareQuery } from "../lib/realestate/search.ts";

test("関連用語の参照切れがない", () => {
  const ids = new Set(TERMS.map((t) => t.id));
  for (const t of TERMS) for (const r of t.related) assert.ok(ids.has(r), `${t.id} -> ${r}`);
  for (const c of COMPARISONS) { assert.ok(ids.has(c.a)); assert.ok(ids.has(c.b)); }
});
test("ユーザー指定の6語が引ける", () => {
  for (const q of ["サブリース", "集金代行", "三為契約", "抵当権抹消", "重要事項説明書", "固定資産税精算金"])
    assert.ok(searchTerms(q).length > 0, q);
});
test("比較クエリ解析", () => {
  assert.deepEqual(parseCompareQuery("サブリースと集金代行の違い"), ["サブリース", "集金代行"]);
});
