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

// ---- 申込メール ----
import { findExisting } from './logic.ts';
const D3: any = [
  { key: 'bukken', label: '物件名', type: 'text' }, { key: 'room', label: '号室', type: 'text' },
  { key: 'moushi', label: '申込日', type: 'date' },
];
let ap: any = ruleExtract({ from: '桃井貴也 <x@gmail.com>', subject: '【申込】AXIA M-CITY大阪瑞光 101', body: '', dateIso: '2026-11-18' }, D3);
assert.equal(ap.application.bukken, 'AXIA M-CITY大阪瑞光'); assert.equal(ap.application.room, '101');
assert.deepEqual(ap.application.create, { bukken: 'AXIA M-CITY大阪瑞光', room: '101', moushi: '2026-11-18' });
ap = ruleExtract({ from: 'x@gmail.com', subject: 'Re: 【申込】グランドパレス 1203号室', body: '', dateIso: '2026-11-18' }, D3);
assert.equal(ap.application.bukken, 'グランドパレス'); assert.equal(ap.application.room, '1203');
// 号室なし
ap = ruleExtract({ from: 'x@gmail.com', subject: '【申込】戸建A', body: '', dateIso: '2026-11-18' }, D3);
assert.equal(ap.application.room, ''); assert.equal(ap.application.bukken, '戸建A');
// 既存カード探索：全角半角・空白の違いを吸収／複数なら新しい方
const ex = [{ id: 5, fields: { bukken: 'ＡＸＩＡ M-CITY大阪瑞光', room: '101' } }, { id: 9, fields: { bukken: 'AXIA M-CITY大阪瑞光', room: '101' } }, { id: 7, fields: { bukken: 'AXIA M-CITY大阪瑞光', room: '104' } }];
assert.equal(findExisting(ex, { bukkenKey: 'bukken', roomKey: 'room', bukken: 'AXIA M-CITY大阪瑞光', room: '101' })!.id, 9);
assert.equal(findExisting(ex, { bukkenKey: 'bukken', roomKey: 'room', bukken: 'AXIA M-CITY大阪瑞光', room: '999' }), null);
// 「申込」を含むだけのメールは対象にしない
assert.equal(ruleExtract({ from: 'n@rakuten-sec.co.jp', subject: '【お申込受付中】セミナー', body: '', dateIso: '2026-11-18' }, D3), null);
console.log('application tests: all passed');

// ---- 9種類の進捗メール ----
import { STAGES, parseDateTime } from './logic.ts';
const ALL: any = [
  { key: 'bukken', label: '物件名', type: 'text' }, { key: 'room', label: '号室', type: 'text' },
  { key: 'jizen', label: '事前承認日', type: 'date' }, { key: 'honsho', label: '本承認日', type: 'date' },
  { key: 'moushi', label: '申込日', type: 'date' }, { key: 'keiyaku', label: '契約日', type: 'datetime' },
  { key: 'denwa', label: '電話面談日', type: 'datetime' }, { key: 'kinsho', label: '金消予定日', type: 'datetime' },
  { key: 'furikae', label: '物件振替日', type: 'date' }, { key: 'kakutei', label: '物件確定日', type: 'date' },
  { key: 'open', label: 'オープン日', type: 'date' },
];
const expectKey: Record<string, string> = { 事前承認: 'jizen', 本承認: 'honsho', 申込: 'moushi', 契約: 'keiyaku', 電話面談: 'denwa', 金消: 'kinsho', 物件振替: 'furikae', 物件確定: 'kakutei', オープン: 'open' };
assert.equal(STAGES.length, 9);
for (const s of STAGES) {
  const r: any = ruleExtract({ from: 'a@b.jp', subject: `【${s.name}】テスト物件 305`, body: '', dateIso: '2026-11-18' }, ALL);
  assert.equal(r.updates[0].key, expectKey[s.name], s.name);
  assert.equal(r.updates[0].date, '2026-11-18', s.name);                     // 日付が無ければ受信日
  assert.equal(r.application.bukken, 'テスト物件'); assert.equal(r.application.room, '305');
}
// 件名の末尾の日付・時刻を優先（号室と取り違えない）
let sg: any = ruleExtract({ from: 'a@b.jp', subject: '【金消】AXIA M-CITY大阪瑞光 101 11/30 14:00', body: '', dateIso: '2026-11-18' }, ALL);
assert.deepEqual(sg.updates, [{ key: 'kinsho', date: '2026-11-30', time: '14:00' }]); assert.equal(sg.application.room, '101');
assert.deepEqual(sg.application.create.kinsho, { d: '2026-11-30', t: '14:00', none: false });
// 本文のキーワード直後の日付
sg = ruleExtract({ from: 'a@b.jp', subject: '【契約】グランドパレス 501', body: '契約日時：12月5日（土）13:30 でお願いします', dateIso: '2026-11-18' }, ALL);
assert.deepEqual(sg.updates, [{ key: 'keiyaku', date: '2026-12-05', time: '13:30' }]);
// 「完了」「報告」付き・Re: 付き
sg = ruleExtract({ from: 'a@b.jp', subject: 'Re: 【本承認完了】グランドパレス 501', body: '', dateIso: '2026-11-18' }, ALL);
assert.equal(sg.updates[0].key, 'honsho');
// 対応する項目が無い種類 → 物件だけ登録（日付は入れない）
sg = ruleExtract({ from: 'a@b.jp', subject: '【オープン】X物件 1', body: '', dateIso: '2026-11-18' }, ALL.filter((f: any) => f.key !== 'open'));
assert.deepEqual(sg.updates, []);
// 年またぎ：12月受信で「1月10日」→ 翌年
assert.deepEqual(parseDateTime('1月10日 10:00', '2026-12-20'), { d: '2027-01-10', t: '10:00' });
assert.equal(parseDateTime('メモ', '2026-11-18'), null);
console.log('stage tests: all passed');
// 日付が受信日の代用か
assert.equal((ruleExtract({ from: 'a@b.jp', subject: '【申込】物件 1', body: '', dateIso: '2026-11-18' }, ALL) as any).dateIsFallback, true);
assert.equal((ruleExtract({ from: 'a@b.jp', subject: '【申込】物件 1 11/20', body: '', dateIso: '2026-11-18' }, ALL) as any).dateIsFallback, false);
console.log('fallback tests: all passed');
