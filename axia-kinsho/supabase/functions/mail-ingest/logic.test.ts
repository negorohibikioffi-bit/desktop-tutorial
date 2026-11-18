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

// ---- ルール読み取り（実際に届いていたメールの型で確認）----
import { pickRow, ruleExtract } from './logic.ts';
const D2: any = [
  { key: 'bukken', label: '物件名', type: 'text' }, { key: 'room', label: '号室', type: 'text' },
  { key: 'keiyaku', label: '契約日', type: 'datetime' }, { key: 'kessai', label: '決済日', type: 'date' },
];
const rows = [
  { id: 1, name: '山田 太郎', fields: { bukken: 'ライズ中野松ヶ丘', room: '207' } },
  { id: 2, name: '佐藤 花子', fields: { bukken: 'エスリード名城公園', room: '1504' } },
  { id: 3, name: '鈴木 一郎', fields: { bukken: 'アゼスト亀有', room: '1104' } },
];
// クラウドサイン：売買契約書 → 契約日＝受信日
let x: any = ruleExtract({ from: 'クラウドサイン <support@cloudsign.jp>', subject: '「ライズ中野松ヶ丘207　【BC】売買契約書」の合意締結が完了しました', body: '', dateIso: '2026-11-06' }, D2);
assert.deepEqual(x.updates, [{ key: 'keiyaku', date: '2026-11-06' }]);
let pk = pickRow(rows, D2, x.propertyText); assert.equal(pk.row!.id, 1); assert.equal(pk.hits, 2); assert.equal(pk.unique, true);
// GMOサイン：取引完了確認書 → 対象外
x = ruleExtract({ from: 'noreply@gmosign.com', subject: '電子署名完了のお知らせ（アゼスト亀有1104【BC】取引完了確認書※電子）', body: '', dateIso: '2026-11-09' }, D2);
assert.equal(x.relevant, false);
// GMOサイン：管理委託契約書 → 対象外（契約日に入れない）
x = ruleExtract({ from: 'noreply@gmosign.com', subject: '電子署名完了のお知らせ（管理委託契約書　インベスト京都修学院202号室）', body: '', dateIso: '2026-11-17' }, D2);
assert.equal(x.relevant, false);
// GATES：決済日の確定
x = ruleExtract({ from: 'a.yamashita@gatestokyo.co.jp', subject: 'RE: 訂正版 エスリード名城公園 1504号室の決済日について', body: '【エスリード名城公園1504】を【2026年11月30日】にて決済お受けいたしました。', dateIso: '2026-11-18' }, D2);
assert.deepEqual(x.updates, [{ key: 'kessai', date: '2026-11-30' }]);
pk = pickRow(rows, D2, x.propertyText); assert.equal(pk.row!.id, 2); assert.equal(pk.hits >= 2, true);
// 決済日の項目が無い設定 → 反映せず理由だけ
x = ruleExtract({ from: 'a@gatestokyo.co.jp', subject: '決済', body: '【物件】を【2026年11月30日】にて決済お受けいたしました', dateIso: '2026-11-18' }, D2.filter((f: any) => f.key !== 'kessai'));
assert.deepEqual(x.updates, []);
// 営業メール → ルール対象外(null)
assert.equal(ruleExtract({ from: 'x@openhouse-group.com', subject: '今一番いい物件送ります', body: '決済は…', dateIso: '2026-11-18' }, D2), null);
// 候補日の相談など（確定ではない）→ null
assert.equal(ruleExtract({ from: 'x@bank.jp', subject: '決済日のご相談', body: '11月30日か12月2日で決済をお願いできますか', dateIso: '2026-11-18' }, D2), null);
console.log('rule tests: all passed');
