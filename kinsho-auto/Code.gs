/**
 * AXIA 金消予定日(自動更新版) — Gmail の案件メール → Supabase(axia_kinsho_auto) へ反映
 * 「Moshikomi Notify」(Slack投稿)と同じ読み取りロジックで、投稿先だけを金消アプリのテーブルにしたもの。
 *
 *  - 申込/新規/買増/他社増し ... 行を新規作成(同じ顧客・物件の行があれば更新)
 *  - 訂正 ..................... 同じ顧客の行を訂正後の値で上書き
 *  - 物件振替 / 物件確定 ...... 同じ顧客の行を新しい物件・日付に更新
 *  - 契約 / 金消 / 承認 ....... 同じ顧客の行に日付などを追記(該当行がなければ新規作成)
 *  - オープン ................. 行は消さず、名前の後ろに「（オープン）」を付ける
 *
 * 事前準備: ①「サービス」→ Gmail API を追加(識別子 Gmail) ②setup.sql を実行済み
 *   ③ dryRun() で確認 → notifyNewApplications() を1回 → setupTrigger()
 */

// ===== 設定 =====
const SUPABASE_URL = 'https://rmqsapkwtngsusqaldpe.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VXflIxa8nyBLGpzv8SFHOA_d_qL4_1Z';
const TABLE = 'axia_kinsho_auto';
const STABLE = 'axia_kinsho_auto_settings';
const START_DATE = '2026-11-01T00:00:00+09:00';   // この日時以降に届いたメールだけが対象
const QUERY = '(顧客名 OR "Customer Name" OR subject:申込 OR subject:物件確定 OR subject:契約 OR subject:金消 OR subject:承認 OR subject:振替 OR subject:訂正 OR subject:修正 OR subject:再送 OR subject:オープン OR subject:新規 OR subject:買い増し OR subject:買増 OR subject:他社増し OR subject:correction OR subject:contract OR subject:application OR subject:approval OR subject:open)';
const LOOKBACK_DAYS = 30;   // 初回取込用。安定したら 7 に戻してOK
const MAX_THREADS = 100;
const MAX_PAGES = 5;   // 最大 100×5 = 500スレッドまで検索
const MAX_ITEMS_PER_RUN = 30;
const OPEN_SUFFIX = '（オープン）';

/**
 * メールの【項目】→ アプリの項目。label はアプリの設定画面の「項目名」にマッチする正規表現。
 * main:true は設定の mainKey(金消予定日)。マッチする項目がアプリに無ければその値は無視される。
 */
const MAP = [
  { tags: ['決済予定'], main: true },
  { tags: ['契約予定'],             label: /^契約/ },
  { tags: ['承認日', '承認予定', '持込予定'], label: /^承認/ },
  { tags: ['物件名'],               label: /^物件名/, option: 'add' },   // 新しい物件名は選択肢に自動追加
  { tags: ['号室'],                 label: /^部屋/ },
  { tags: ['銀行'],                 label: /^銀行/, option: 'match' },    // 楽天銀行→楽天 など選択肢に寄せる
  { tags: ['立会'],                 label: /^立会/, option: 'add' },
  { tags: ['物件登録'],             label: /^物件登録/, option: 'match' },
  { tags: ['登記依頼'],             label: /^登記依頼/, option: 'match' },
  { tags: ['減額'],                 label: /^減額/, option: 'match' },
  { tags: ['担当'],                 label: /^担当/ },
  { tags: ['同行'],                 label: /^同行/ },
  { tags: ['建物管理'],             label: /^建物管理/ },
  { tags: ['賃貸管理'],             label: /^賃貸管理/ },
];

// ===== Gmail API(高度なサービス)で読む =====
function searchThreads_(query) {
  // 100件を超える場合も取りこぼさないよう、次のページも読む(最大 MAX_PAGES ページ)
  let all = [], token = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = withRetry_(function () { return Gmail.Users.Threads.list('me', { q: query, maxResults: MAX_THREADS, pageToken: token || undefined }); });
    all = all.concat(res.threads || []);
    token = res.nextPageToken;
    if (!token) break;
  }
  return all.map(function (th) {
    let cache = null;
    return {
      getId: function () { return th.id; },
      getSig: function () { return String(th.historyId); },
      getMessages: function () {
        if (!cache) {
          const full = withRetry_(function () { return Gmail.Users.Threads.get('me', th.id, { format: 'full' }); });
          cache = (full.messages || []).map(wrapMessage_);
          Utilities.sleep(200);   // 1分あたりの上限対策: 1通ごとに少し待つ
        }
        return cache;
      },
    };
  });
}
/** 上限エラー(Quota exceeded)のときは待ってやり直す */
function withRetry_(fn) {
  for (let i = 0; ; i++) {
    try { return fn(); }
    catch (e) {
      if (i >= 4 || !/quota|rate limit|userRateLimit/i.test(String(e))) throw e;
      Utilities.sleep(20000 * (i + 1));
    }
  }
}
function wrapMessage_(gm) {
  const headers = {};
  ((gm.payload && gm.payload.headers) || []).forEach(function (h) { headers[h.name.toLowerCase()] = h.value; });
  let plain = null, html = null;
  (function walk(p) {
    if (!p) return;
    if (p.mimeType === 'text/plain' && p.body && p.body.data && plain === null) plain = decodeB64_(p.body.data);
    if (p.mimeType === 'text/html' && p.body && p.body.data && html === null) html = decodeB64_(p.body.data);
    (p.parts || []).forEach(walk);
  })(gm.payload);
  if (plain === null) {
    plain = (html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  return {
    getId: function () { return gm.id; },
    getDate: function () { return new Date(Number(gm.internalDate)); },
    getSubject: function () { return headers['subject'] || ''; },
    getFrom: function () { return headers['from'] || ''; },
    getPlainBody: function () { return plain; },
  };
}
function decodeB64_(data) {
  try {
    if (typeof data !== 'string') return Utilities.newBlob(data).getDataAsString('UTF-8');
    let s = data.replace(/[^A-Za-z0-9\-_+\/]/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return Utilities.newBlob(Utilities.base64Decode(s)).getDataAsString('UTF-8');
  } catch (e) {
    try { return Utilities.newBlob(Utilities.base64DecodeWebSafe(String(data))).getDataAsString('UTF-8'); } catch (e2) {}
    return '';
  }
}

// ===== メイン =====
function notifyNewApplications() {
  const props = PropertiesService.getScriptProperties();
  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = Math.floor(new Date(START_DATE).getTime() / 1000);
  const fromSec = Math.max(startSec, nowSec - LOOKBACK_DAYS * 86400);
  const threads = searchThreads_(QUERY + ' after:' + fromSec);

  const items = [], sigs = {};
  let readFailed = false;
  threads.forEach(function (t) {
    if (readFailed) return;
    const tid = t.getId(), sig = t.getSig();
    if (props.getProperty('TS_' + tid) === sig) return;
    try {
      t.getMessages().forEach(function (m) {
        if (m.getDate().getTime() / 1000 < startSec) return;
        if (props.getProperty('DONE_' + m.getId())) return;
        items.push({ msg: m, tid: tid });
      });
      sigs[tid] = sig;
    } catch (e) {
      Logger.log('Gmailの読み込みが上限に達しました。ここまでを処理します。もう一度実行すると続きから進みます: ' + e);
      readFailed = true;
    }
  });
  items.sort(function (a, b) { return a.msg.getDate() - b.msg.getDate(); });

  const st = loadSettings_();
  let handled = 0, stoppedAt = items.length;
  for (let i = 0; i < items.length; i++) {
    if (handled >= MAX_ITEMS_PER_RUN) { stoppedAt = i; break; }
    const msg = items[i].msg, subject = msg.getSubject();
    const fields = readFields_(msg);
    const isReply = /^\s*(re|fw|fwd|返信|転送)\s*[:：]/i.test(subject) && !/訂正|振替/.test(subject);
    if (isReply || !fields['顧客名']) { props.setProperty('DONE_' + msg.getId(), String(nowSec)); continue; }
    apply_(msg, fields, st);
    saveSettingsIfDirty_(st);
    props.setProperty('DONE_' + msg.getId(), String(nowSec));
    handled++;
  }
  const pending = {};
  for (let j = stoppedAt; j < items.length; j++) pending[items[j].tid] = true;
  Object.keys(sigs).forEach(function (tid) { if (!pending[tid]) props.setProperty('TS_' + tid, sigs[tid]); });
  cleanup_(props, nowSec);
}

function apply_(msg, f, st) {
  const subject = msg.getSubject();
  const route = route_(subject, f);
  if (route === 'skip') return;
  const cust = normCust_(f['顧客名']), pk = propKey_(f);
  const name = f['顧客名'].replace(/様$/, '').trim();
  const rows = rowsOf_(cust, pk);
  const sameProp = rows.filter(function (r) { return samePropKey_(r.prop, pk); })[0]
                || rows.filter(function (r) { return looseSameProp_(r.prop, pk); })[0] || null;
  const mapped = mapFields_(f, st, msg.getDate());
  const fixFlag = isCorrection_(subject, f, introText_(msg.getPlainBody()));   // 訂正・修正・再送・Correction
  const nameUpd = fixFlag ? name : null;                                        // 訂正のときだけ名前も直す

  if (route === 'open') {                       // 行は消さずに「（オープン）」表示
    const t = sameProp || (rows.length === 1 ? rows[0] : null);
    if (t) patch_(t.id, { name: t.name.replace(OPEN_SUFFIX, '') + OPEN_SUFFIX });
    return;
  }
  if (route === 'thread') {                     // 契約・金消・承認: 該当行に追記(訂正なら上書き)
    const t = sameProp || (rows.length === 1 || fixFlag ? rows[0] : null);
    if (t) return update_(t, mapped, st, pk, nameUpd, cust);
    return insert_(name, cust, pk, mapped, st, msg);
  }
  // main: 申込・物件確定・振替・訂正
  const kind = f['種別'] || '';
  const transfer = /振替|transfer/i.test([subject, kind, f['区分'], f['備考']].join(' '));
  const confirm = !transfer && !fixFlag && /物件確定|confirm/i.test(subject + ' ' + kind);
  let t = null;
  if (transfer) t = rows[0] || null;                                   // 振替: その顧客の最新の行
  else if (fixFlag) t = sameProp || rows[0] || null;                   // 訂正: 同じ物件、なければその顧客の最新の行
  else if (confirm) t = rows.filter(function (r) { return !r.prop || /未定|未確定|未決定/.test(r.prop); })[0] || sameProp || null;
  else t = sameProp;                                                   // 通常の申込: 同じ物件の行があれば更新(重複防止)
  if (t) return update_(t, mapped, st, pk, (fixFlag || transfer) ? name : null, cust);
  insert_(name, cust, pk, mapped, st, msg);
}

/** メールの項目を、アプリの項目キーの値に変換(「－」・空欄は入れない) */
function mapFields_(f, st, mailDate) {
  const t = {};
  Object.keys(f).forEach(function (k) { t[k] = f[k]; });
  // 物件名に部屋番号が付いていて【号室】が無いときは分ける(複数物件「／」は分けない)
  if (t['物件名'] && !t['号室'] && t['物件名'].indexOf('／') < 0) {
    const m = t['物件名'].match(/^(.*?)[\s　]*([0-9０-９]{2,4})\s*(?:号室|号)?\s*$/);
    if (m) { t['物件名'] = m[1].trim(); t['号室'] = m[2]; }
  }
  if (t['号室']) t['号室'] = String(t['号室']).replace(/号室|号/g, '').trim();
  const out = {};
  MAP.forEach(function (r) {
    let v = null;
    for (let i = 0; i < r.tags.length && (v == null || v === ''); i++) v = t[r.tags[i]];
    if (v == null || v === '' || /^[-－ー―—–\s]*$/.test(v)) return;
    const fld = r.main ? st.fields.filter(function (x) { return x.key === st.mainKey; })[0]
                       : st.fields.filter(function (x) { return r.label.test(x.label || ''); })[0];
    if (!fld) return;
    const val = convert_(fld, v, mailDate, r.option, st);
    if (val !== '' && val != null) out[fld.key] = val;
  });
  return out;
}
function convert_(fld, v, mailDate, option, st) {
  const d = parseDate_(v, mailDate);
  if (fld.type === 'datetime') return { d: d || '', t: '', none: false };
  if (fld.type === 'date') return d || '';
  if (fld.type === 'select' && option) return pickOption_(fld, v, option, st);
  return v;
}
/** 選択肢に寄せる: 「楽天銀行」→「楽天」。無ければ、option==='add' なら選択肢に追加、'match' なら元の文字のまま */
function pickOption_(fld, v, option, st) {
  const nv = norm_(v);
  const opts = fld.options || [];
  for (let i = 0; i < opts.length; i++) {
    const no = norm_(opts[i]);
    if (no && (nv === no || nv.indexOf(no) >= 0 || (no.length >= 4 && no.indexOf(nv) >= 0))) return opts[i];
  }
  if (option === 'add') { fld.options = opts.concat([v]); st.dirty = true; }
  return v;
}
function parseDate_(v, base) {
  const x = String(v).match(/(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日/) || String(v).match(/()(\d{1,2})\/(\d{1,2})/);
  if (!x) return '';
  const by = Number(Utilities.formatDate(base, 'Asia/Tokyo', 'yyyy')), bm = Number(Utilities.formatDate(base, 'Asia/Tokyo', 'M'));
  let y = x[1] ? Number(x[1]) : by;
  const mo = Number(x[2]);
  if (!x[1] && mo < bm - 6) y += 1;
  return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + Number(x[3])).slice(-2);
}
function monthOf_(fields, st, fallback) {
  const m = fields[st.mainKey];
  const d = m && (m.d || (typeof m === 'string' ? m : ''));
  return d ? d.slice(0, 7) : fallback;
}

// ===== Supabase =====
function sb_(path, opt) {
  opt = opt || {};
  opt.headers = Object.assign({ apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' }, opt.headers || {});
  opt.muteHttpExceptions = true;
  const r = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + path, opt);
  if (r.getResponseCode() >= 300) throw new Error(r.getResponseCode() + ' ' + r.getContentText());
  const t = r.getContentText();
  return t ? JSON.parse(t) : [];
}
function loadSettings_() {
  const rows = sb_(STABLE + '?id=eq.1&select=settings');
  const raw = (rows[0] && rows[0].settings) || {};
  return { raw: raw, mainKey: raw.mainKey || 'kinsho', fields: raw.fields || [], dirty: false };
}
/** 選択肢が増えたときだけ、設定を保存(アプリの選択肢に反映される) */
function saveSettingsIfDirty_(st) {
  if (!st.dirty) return;
  st.raw.fields = st.fields;
  sb_(STABLE + '?id=eq.1', { method: 'patch', payload: JSON.stringify({ settings: st.raw, updated_at: new Date().toISOString() }) });
  st.dirty = false;
}
function rowsOf_(cust, pk) {
  const notOpen = function (r) { return String(r.name || '').indexOf(OPEN_SUFFIX) < 0; };
  let rows = sb_(TABLE + '?cust=eq.' + encodeURIComponent(cust) + '&order=id.desc').filter(notOpen);
  if (!rows.length && cust.length >= 2) {
    rows = sb_(TABLE + '?cust=like.' + encodeURIComponent(cust.slice(0, 2) + '*') + '&order=id.desc').filter(notOpen)
      .filter(function (r) { const c = r.cust || ''; return c.indexOf(cust) === 0 || cust.indexOf(c) === 0; });
  }
  // お客様名が違う表記(ひらがな/漢字など)でも、同じ物件・部屋番号なら同じ案件として扱う
  if (!rows.length) {
    const d = (String(pk || '').match(/(\d{2,4})$/) || [])[1];
    if (d) rows = sb_(TABLE + '?prop=like.' + encodeURIComponent('*' + d) + '&order=id.desc').filter(notOpen)
      .filter(function (r) { return looseSameProp_(r.prop, pk); });
  }
  return rows;
}
function looseSameProp_(a, b) {
  if (!a || !b) return false;
  if (samePropKey_(a, b)) return true;
  const da = (a.match(/(\d{2,4})$/) || [])[1], db = (b.match(/(\d{2,4})$/) || [])[1];
  if (!da || da !== db) return false;
  for (let i = 0; i + 3 <= a.length; i++) if (b.indexOf(a.substr(i, 3)) >= 0 && !/^\d+$/.test(a.substr(i, 3))) return true;
  return false;
}
function patch_(id, body) { sb_(TABLE + '?id=eq.' + id, { method: 'patch', payload: JSON.stringify(body) }); }
function update_(row, mapped, st, pk, name, cust) {
  const fields = Object.assign({}, row.fields || {}, mapped);
  const body = { fields: fields, month: monthOf_(fields, st, row.month) };
  if (pk) body.prop = pk;
  if (name) { body.name = name; if (cust) body.cust = cust; }
  patch_(row.id, body);
}
function insert_(name, cust, pk, mapped, st, msg) {
  const fallback = Utilities.formatDate(msg.getDate(), 'Asia/Tokyo', 'yyyy-MM');
  sb_(TABLE + '?on_conflict=mail_id', {
    method: 'post', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    payload: JSON.stringify({ mail_id: msg.getId(), month: monthOf_(mapped, st, fallback), name: name, cust: cust, prop: pk, fields: mapped, sort_order: msg.getDate().getTime() % 1e9 }),
  });
}

// ===== 解析(Moshikomi Notify と同じ) =====
function parseFields_(body) {
  const KNOWN = { '顧客名':1, '物件名':1, '号室':1, '銀行':1, '決済予定':1, '契約予定':1, '承認日':1, '持込予定':1, '担当':1, '同行':1, '所属':1, '立会':1, '種別':1, '備考':1, '区分':1 };
  const main = body.split(/\r?\n--\s*\r?\n/)[0];
  const fields = {}, freeText = [];
  main.split(/\r?\n/).forEach(function (line) {
    if (/^\s*>/.test(line)) return;
    // 【項目】値 / [Item] 値 / ［項目］値
    let m = line.match(/^\s*[【\[［]([^】\]］]+)[】\]］]\s*[:：]?[ \t　]*(.*)$/);
    // 項目：値 / Item: value (知っている項目名だけ)
    if (!m) { const m2 = line.match(/^\s*([^:：\s【\[［]{1,24}?)\s*[:：]\s*(.+)$/); if (m2 && KNOWN[canonKey_(m2[1])]) m = m2; }
    if (m) { const k = canonKey_(m[1]); if (!(k in fields)) fields[k] = m[2].trim(); }
    else freeText.push(line);
  });
  if (!fields['持込予定']) {
    const m = freeText.join('\n').match(/持込[^0-9０-９\n]{0,6}([0-9０-９]{1,2}[\/月][0-9０-９]{1,2}日?(?:[（(][^）)]*[）)])?)/);
    if (m) fields['持込予定'] = m[1];
  }
  return fields;
}
function canonKey_(key) {
  const k = String(key).normalize('NFKC').replace(/[\s_\-.　]+/g, '').toLowerCase();
  if (/^新規.*(買い?増し?|増し?)/.test(k) || /^新規・/.test(k)) return '区分';
  if (/^物件名[・\/]?号室$/.test(k)) return '物件名';
  const A = [
    [/^(お客様(名前|名|氏名)?|お客さま(名)?|顧客(名|氏名)?|氏名|お名前|名前|申込者(名)?|購入者(名)?|契約者(名)?|customer(name)?|client(name)?|buyer(name)?|purchaser(name)?|fullname|name)$/, '顧客名'],
    [/^(物件名?|マンション名|建物名|property(name)?|building(name)?)$/, '物件名'],
    [/^(号室|部屋番号|部屋|room(no|number)?|unit(no|number)?)$/, '号室'],
    [/^(銀行名?|金融機関(名)?|融資銀行|bank(name)?|lender)$/, '銀行'],
    [/^(決済(予定)?(日.*)?|引渡(予定)?(日.*)?|settlement(date)?|closing(date)?)$/, '決済予定'],
    [/^(契約(予定)?(日.*)?|contract(date)?)$/, '契約予定'],
    [/^(承認(予定)?日?|approval(date)?)$/, '承認日'],
    [/^(持込(予定)?日?|持ち込み(予定)?日?|bringin(date)?)$/, '持込予定'],
    [/^(担当(者)?|営業担当|staff|incharge|personincharge)$/, '担当'],
    [/^(同行(者)?|companion|accompaniedby)$/, '同行'],
    [/^(所属(課|部署)?|部署|課|department|team|section)$/, '所属'],
    [/^(立会(い)?|witness|attendance)$/, '立会'],
    [/^(種別|種類|type|kind)$/, '種別'],
    [/^(備考|notes?|remarks?|memo)$/, '備考'],
    [/^(区分|category)$/, '区分'],
  ];
  for (let i = 0; i < A.length; i++) if (A[i][0].test(k)) return A[i][1];
  return key.replace(/\s+/g, '');
}
function deriveKind_(subject) {
  const re = /【([^】]+)】/g; let m;
  while ((m = re.exec(subject)) !== null) {
    const s = m[1].replace(/\s+/g, '').replace(/メール$/, '');
    if (/^訂正/.test(s)) continue;
    return /[・,，、\/]/.test(s) ? '' : s;
  }
  return '';
}
function readFields_(msg) {
  const f = parseFields_(msg.getPlainBody());
  if (!f['種別']) { const k = deriveKind_(msg.getSubject()); if (k) f['種別'] = k; }
  return f;
}
function introText_(body) {
  const text = body.split(/\r?\n/).filter(function (l) { return !/^\s*>/.test(l); }).join('\n');
  const i = text.indexOf('【');
  return i > 0 ? text.slice(0, i) : '';
}
const FIX_RE = /訂正|修正|誤り|誤記|間違い|再送|correction|corrected|revis|amend|resend|updated/i;
function isCorrection_(subject, f, intro) {
  if (FIX_RE.test(subject) || FIX_RE.test(intro || '')) return true;
  if (FIX_RE.test((f['種別'] || '') + (f['区分'] || ''))) return true;
  return Object.keys(f).some(function (k) { return FIX_RE.test(k); });
}
function route_(subject, fields) {
  if (!fields['種別'] && /【[^】]*[・,，、\/][^】]*】/.test(subject)) return 'skip';
  const t = fields['種別'] || subject;
  if (/オープン|\bopen(ed)?\b/i.test(t)) return 'open';
  if (/承認|approv/i.test(t)) return 'thread';
  if (/申込|物件確定|振替|新規|買い?増し?|他社増し?|applica|transfer|confirm|\bnew\b/i.test(t)) return 'main';
  if (/契約|金消|contract|loan/i.test(t)) return 'thread';
  if (!fields['種別'] && /新規|買い?増し?|他社増し?/.test(fields['区分'] || '')) return 'main';
  if (fields['顧客名'] && fields['物件名']) return 'main';   // 種別が読めなくても、顧客名と物件名があれば案件として扱う
  return 'skip';
}
function norm_(s) {
  return String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
    .replace(/リ[ヴブ]シ(ティ|テイ)/g, 'livcity')
    .replace(/濱/g, '浜').replace(/[﨑嵜]/g, '崎').replace(/髙/g, '高').replace(/[邉邊]/g, '辺')
    .replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });   // カタカナ→ひらがな(表記ゆれ対策)
}
function normCust_(s) { return norm_(s).replace(/(様|さま)$/, ''); }
function propKey_(f) { return norm_((f['物件名'] || '') + (f['号室'] || '')).replace(/号室|号/g, ''); }
function samePropKey_(a, b) {
  if (!a || !b) return false;
  return a === b || (Math.min(a.length, b.length) >= 4 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0));
}

// ===== トリガー・掃除 =====
function setupTrigger() {
  stopTrigger();
  ScriptApp.newTrigger('notifyNewApplications').timeBased().everyMinutes(5).create();
}
function stopTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'notifyNewApplications') ScriptApp.deleteTrigger(t); });
}
function cleanup_(props, nowSec) {
  const all = props.getProperties();
  Object.keys(all).forEach(function (k) { if (k.indexOf('DONE_') === 0 && nowSec - Number(all[k]) > 30 * 86400) props.deleteProperty(k); });
}

// ===== 確認用(DBには書かない) =====
function dryRun() {
  const st = loadSettings_();
  Logger.log('アプリの項目: ' + (st.fields.map(function (f) { return f.label + '(' + f.type + ')'; }).join(' / ') || '（未設定: 設定画面で項目を作ってください）') + ' / 主項目キー=' + st.mainKey);
  const th = searchThreads_(QUERY + ' after:' + Math.floor(new Date(START_DATE).getTime() / 1000));
  Logger.log('検索で見つかったスレッド数: ' + th.length + '（' + START_DATE.slice(0, 10) + ' 以降）');
  th.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      const f = readFields_(m);
      Logger.log([m.getSubject(), '顧客=' + (f['顧客名'] || 'なし'), 'route=' + route_(m.getSubject(), f), JSON.stringify(mapFields_(f, st, m.getDate()))].join(' | '));
    });
  });
}
/** 最初からやり直したい時: 処理済みの印を消す(テーブルの行は消さない) */
function resetMarks() {
  const p = PropertiesService.getScriptProperties();
  Object.keys(p.getProperties()).forEach(function (k) { if (/^(DONE_|TS_)/.test(k)) p.deleteProperty(k); });
}
