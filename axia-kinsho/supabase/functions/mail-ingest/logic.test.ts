import assert from 'node:assert/strict';
import { buildChanges, identityHits, isRealDate, jstToday, monthRange, toFieldValue } from './logic.ts';
const defs = [
  { key: 'bukken', label: '物件名', type: 'text' }, { key: 'room', label: '号室', type: 'text' },
  { key: 'kinsho', label: '金消予定日', type: 'datetime' }, { key: 'appr', label: '承認日', type: 'date' },
  { key: 'bank', label: '銀行', type: 'select', options: ['SBI', '楽天'] }, { key: 'price', label: '融資額', type: 'money' },
] as const;
const D = defs as any;
// 日付
assert.equal(isRealDate('2026-02-30'), false); assert.equal(isRealDate('2026-11-23'), true); assert.equal(isRealDate('11/23'), false);
// 型ごとの変換
assert.deepEqual(toFieldValue(D[2], { key: 'kinsho', date: '2026-11-23', time: '10:00' }), { ok: true, value: { d: '2026-11-23', t: '10:00', none: false } });
assert.deepEqual((toFieldValue(D[2], { key: 'kinsho', date: '2026-11-23', time: '25:99' }) as any).value.t, '');
assert.equal(toFieldValue(D[4], { key: 'bank', text: 'みずほ' }).ok, false);   // 選択肢外は捨てる
assert.equal(toFieldValue(D[4], { key: 'bank', text: '楽天' }).ok, true);
assert.deepEqual(toFieldValue(D[5], { key: 'price', text: '3,200万円' }), { ok: true, value: '3200' });
// buildChanges：未知キー・同値は除外
const cur = { kinsho: { d: '2026-11-23', t: '10:00', none: false }, bank: 'SBI' };
const r = buildChanges(D, [
  { key: 'kinsho', date: '2026-11-23', time: '10:00' },      // 同じ → 無視
  { key: 'appr', date: '2026-11-10' },                        // 新規
  { key: 'bank', text: 'ゆうちょ' },                          // 選択肢外 → skipped
  { key: 'hack', text: 'x' },                                 // 未知 → skipped
], cur);
assert.deepEqual(Object.keys(r.changes), ['appr']); assert.equal(r.skipped.length, 2);
assert.equal(r.changes.appr.before, null);
// 同一性チェック
const row = { name: '山田 太郎', fields: { bukken: 'AXIA 白金台', room: '302' } };
assert.equal(identityHits(row, D, '山田様 AXIA白金台 の金消日程'), 2);        // 空白差・全角半角差を吸収
assert.equal(identityHits(row, D, 'ＡＸＩＡ　白金台の件、302号室'), 2);       // 全角
assert.equal(identityHits(row, D, '山田様の件'), 1);                          // 1つだけ → 自動反映せん
assert.equal(identityHits(row, D, '佐藤様の件'), 0);
// 日付ヘルパー
assert.equal(jstToday(new Date('2026-11-17T16:00:00Z')).iso, '2026-11-18');   // UTC夕方＝JST翌日
assert.deepEqual(monthRange(new Date('2026-11-18T00:00:00Z')), { from: '2026-10', to: '2027-02' });
console.log('logic tests: all passed');
