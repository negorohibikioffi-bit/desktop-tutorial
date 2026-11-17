import { test } from "node:test";
import assert from "node:assert/strict";
import { searchPhrases } from "../lib/korean/search.ts";

for (const [q, id] of [["今何してる？", "doing-now"], ["めっちゃかわいい", "so-cute"], ["それガチ？", "really"], ["会いたい", "miss-you"], ["お腹すいた", "hungry"]] as const)
  test(`韓国語: ${q}`, () => assert.equal(searchPhrases(q)[0]?.phrase.id, id));
test("ハングル入力: 대박", () => assert.equal(searchPhrases("대박")[0]?.phrase.id, "wow"));
test("無関係な入力は空", () => assert.equal(searchPhrases("量子コンピュータの冷却方式").length, 0));
