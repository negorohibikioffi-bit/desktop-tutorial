import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createIndex, parseQuery, type KanjiRecord } from "../lib/kanji/search.ts";

const data = JSON.parse(readFileSync(new URL("../data/kanji.json", import.meta.url), "utf8")) as KanjiRecord[];
const idx = createIndex(data);
const top = (q: string, n = 10) => idx.search(q).hits.slice(0, n).map((h) => h.record.c);

test("parse: さんずいに青", () => assert.deepEqual(parseQuery("さんずいに青").components, ["氵", "青"]));
test("parse: にんべんに言（に が部首名と衝突しない）", () => assert.deepEqual(parseQuery("にんべんに言").components, ["亻", "言"]));
test("さんずいに青 → 清", () => assert.ok(top("さんずいに青").includes("清")));
test("にんべんに言 → 信", () => assert.ok(top("にんべんに言").includes("信")));
test("くさかんむりに早 → 草", () => assert.ok(top("くさかんむりに早").includes("草")));
test("読み: せい → 清を含む", () => assert.ok(top("せい", 40).includes("清")));
test("単一漢字: 清 は先頭", () => assert.equal(top("清")[0], "清"));
test("存在しない構成は空", () => assert.equal(idx.search("さんずいに龘").hits.length, 0));
