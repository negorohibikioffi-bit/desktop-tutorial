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
const START_DATE = '2026-11-06T00:00:00+09:00';   // この日時以降に届いたメールだけが対象
const QUERY = '(顧客名 OR subject:申込 OR subject:物件確定 OR subject:契約 OR subject:金消 OR subject:承認 OR subject:振替 OR subject:訂正 OR subject:オープン OR subject:新規 OR subject:買い増し OR subject:買増 OR subject:他社増し)';
const LOOKBACK_DAYS = 7;
const MAX_THREADS = 100;
const MAX_ITEMS_PER_RUN = 30;
const OPEN_SUFFIX = '（オープン）';

/**
 * メールの【項目】→ アプリの項目。label はアプリの設定画面の「項目名」にマッチする正規表現。
 * main:true は設定の mainKey(金消予定日)。マッチする項目がアプリに無ければその値は無視される。
 */
const MAP = [
  { tag: '決済予定', main: true },
  { tag: '契約予定', label: /契約/ },
  { tag: '持込予定', label: /持込|承認/ },
  { tag: '銀行',     label: /銀行/ },
  { tag: '物件',     label: /物件/ },
  { tag: '諸費用ローン', label: /諸費用/ },
  { tag: '担当',     label: /担当/ },
  { tag: '同行',     label: /同行/ },
  { tag: '立会',     label: /立会/ },
  { tag: '所属',     label: /所属/ },
  { tag: '備考',     label: /備考/ },
];

// ===== Gmail API(高度なサービス)で読む =====
function searchThreads_(query) {
  const res = Gmail.Users.Threads.list('me', { q: query, maxResults: MAX_THREADS });
  return (res.threads || []).map(function (th) {
    let cache = null;
    return {
      getId: function () { return th.id; },
      getSig: function () { return String(th.historyId); },
      getMessages: function () {
        if (!cache) {
          const full = Gmail.Users.Threads.get('me', th.id, { format: 'full' });
          cache = (full.messages || []).map(wrapMessage_);
        }
        return cache;
      },
    };
  });
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
  threads.forEach(function (t) {
    const tid = t.getId(), sig = t.getSig();
    if (props.getProperty('TS_' + tid) === sig) return;
    sigs[tid] = sig;
    t.getMessages().forEach(function (m) {
      if (m.getDate().getTime() / 1000 < startSec) return;
      if (props.getProperty('DONE_' + m.getId())) return;
      items.push({ msg: m, tid: tid });
    });
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
    props.setProperty('DONE_' + msg.getId(), String(nowSec));
    handled++;
  }
  const pending = {};
  for (let j = stoppedAt; j < items.length; j++) pending[items[j].tid] = true;
  Object.keys(sigs).forEach(function (tid) { if (!pending[tid]) props.setProperty('TS_' + tid, sigs[tid]); });
  cleanup_(props, nowSec);
}

/** 1通のメールを金消アプリのテーブルに反映 */
function apply_(msg, f, st) {
  const subject = msg.getSubject();
  const route = route_(subject, f);
  if (route === 'skip') return;
  const cust = normCust_(f['顧客名']), pk = propKey_(f);
  const name = f['顧客名'].replace(/様$/, '').trim();
  const rows = rowsOf_(cust);
  const sameProp = rows.filter(function (r) { return samePropKey_(r.prop, pk); })[0] || null;
  const mapped = mapFields_(f, st, msg.getDate());

  if (route === 'open') {                       // 行は消さずに「（オープン）」表示
    const t = sameProp || (rows.length === 1 ? rows[0] : null);
    if (t) patch_(t.id, { name: t.name.replace(OPEN_SUFFIX, '') + OPEN_SUFFIX });
    return;
  }
  if (route === 'thread') {                     // 契約・金消・承認: 該当行に追記
    const t = sameProp || (rows.length === 1 ? rows[0] : null);
    if (t) return update_(t, mapped, st, pk, null);
    return insert_(name, cust, pk, mapped, st, msg);
  }
  // main: 申込・物件確定・振替・訂正
  const kind = f['種別'] || '';
  const transfer = /振替/.test([subject, kind, f['区分'], f['備考']].join(' '));
  const fix = !transfer && isCorrection_(subject, f, introText_(msg.getPlainBody()));
  const confirm = !transfer && !fix && /物件確定/.test(subject + ' ' + kind);
  let t = null;
  if (transfer) t = rows[0] || null;                                   // 振替: その顧客の最新の行
  else if (fix) t = sameProp || rows[0] || null;
  else if (confirm) t = rows.filter(function (r) { return !r.prop || /未定|未確定|未決定/.test(r.prop); })[0] || sameProp || null;
  else t = sameProp;                                                   // 通常の申込: 同じ物件の行があれば更新(重複防止)
  if (t) return update_(t, mapped, st, pk, name);
  insert_(name, cust, pk, mapped, st, msg);
}

/** メールの項目を、アプリの項目キーの値に変換(「－」・空欄は入れない) */
function mapFields_(f, st, mailDate) {
  const t = {};
  Object.keys(f).forEach(function (k) { t[k] = f[k]; });
  let property = f['物件名'] || '';
  if (f['号室'] && property.indexOf(f['号室']) === -1) property += f['号室'];
  t['物件'] = property;
  const out = {};
  MAP.forEach(function (r) {
    const v = t[r.tag];
    if (v == null || v === '' || /^[-－ー―—–\s]*$/.test(v)) return;
    const fld = r.main ? st.fields.filter(function (x) { return x.key === st.mainKey; })[0]
                       : st.fields.filter(function (x) { return r.label.test(x.label || ''); })[0];
    if (!fld) return;
    out[fld.key] = convert_(fld, v, mailDate);
  });
  return out;
}
function convert_(fld, v, mailDate) {
  const d = parseDate_(v, mailDate);
  if (fld.type === 'datetime') return { d: d || '', t: '', none: false };
  if (fld.type === 'date') return d || '';
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
  const s = (rows[0] && rows[0].settings) || {};
  return { mainKey: s.mainKey || 'kinsho', fields: s.fields || [] };
}
/** 同じ顧客の行(新しい順)。「（オープン）」済みは除く */
function rowsOf_(cust) {
  return sb_(TABLE + '?cust=eq.' + encodeURIComponent(cust) + '&order=id.desc')
    .filter(function (r) { return String(r.name || '').indexOf(OPEN_SUFFIX) < 0; });
}
function patch_(id, body) { sb_(TABLE + '?id=eq.' + id, { method: 'patch', payload: JSON.stringify(body) }); }
function update_(row, mapped, st, pk, name) {
  const fields = Object.assign({}, row.fields || {}, mapped);
  const body = { fields: fields, month: monthOf_(fields, st, row.month) };
  if (pk) body.prop = pk;
  if (name) body.name = name;
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
  const main = body.split(/\r?\n--\s*\r?\n/)[0];
  const fields = {}, freeText = [];
  main.split(/\r?\n/).forEach(function (line) {
    if (/^\s*>/.test(line)) return;
    const m = line.match(/^\s*【([^】]+)】[ \t　]*(.*)$/);
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
  const k = key.replace(/\s+/g, '');
  if (/^お客様(名前|名|氏名)$/.test(k)) return '顧客名';
  if (/^新規.*(買い?増し?|増し?)/.test(k) || /^新規・/.test(k)) return '区分';
  if (k === '物件名号室' || k === '物件名・号室') return '物件名';
  if (k === '金融機関') return '銀行';
  if (k === '所属課') return '所属';
  if (/^契約予定(日.*)?$/.test(k)) return '契約予定';
  if (/^持込(予定)?日?$/.test(k)) return '持込予定';
  if (/^決済(予定)?日?$/.test(k)) return '決済予定';
  return k;
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
function isCorrection_(subject, f, intro) {
  if (/訂正/.test(subject) || /訂正/.test(intro || '')) return true;
  if (/訂正/.test((f['種別'] || '') + (f['区分'] || ''))) return true;
  return Object.keys(f).some(function (k) { return /訂正/.test(k); });
}
function route_(subject, fields) {
  if (!fields['種別'] && /【[^】]*[・,，、\/][^】]*】/.test(subject)) return 'skip';
  const t = fields['種別'] || subject;
  const MAIN = /申込|物件確定|振替|新規|買い?増し?|他社増し?/;
  if (/オープン/.test(t)) return 'open';
  if (/承認/.test(t)) return 'thread';
  if (MAIN.test(t)) return 'main';
  if (/契約|金消/.test(t)) return 'thread';
  if (!fields['種別'] && /新規|買い?増し?|他社増し?/.test(fields['区分'] || '')) return 'main';
  return 'skip';
}
function norm_(s) {
  return String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
    .replace(/リ[ヴブ]シ(ティ|テイ)/g, 'livcity')
    .replace(/濱/g, '浜').replace(/[﨑嵜]/g, '崎').replace(/髙/g, '高').replace(/[邉邊]/g, '辺');
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
  searchThreads_(QUERY + ' after:' + Math.floor(new Date(START_DATE).getTime() / 1000)).forEach(function (t) {
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
