/**
 * AXIA 金消予定日(自動更新版) — Gmail(negoro) の【金消】メール → Supabase へ自動追記
 * 使い方: 初回に run() を1回実行して承認 → setupTrigger() を実行(5分ごとに自動)。
 */
const CONFIG = {
  SUPABASE_URL: 'https://rmqsapkwtngsusqaldpe.supabase.co',
  SUPABASE_KEY: 'sb_publishable_VXflIxa8nyBLGpzv8SFHOA_d_qL4_1Z',
  TABLE: 'axia_kinsho_auto',
  STABLE: 'axia_kinsho_auto_settings',
  QUERY: 'subject:金消 newer_than:2d',   // 取込対象。過去分をまとめて入れたい時は backfill() を使う
  DONE_LABEL: 'kinsho-imported',
};

/**
 * メールの【項目】 → アプリの項目。
 * label: アプリの設定画面の「項目名」にマッチする正規表現。マッチする項目が無ければその値は無視される。
 * main:true は設定の mainKey(金消日の主項目)に入れる。
 */
const MAP = [
  { tag: '決済予定', main: true },
  { tag: '契約予定', label: /契約/ },
  { tag: '持込予定', label: /持込|承認/ },
  { tag: '銀行',     label: /銀行/ },
  { tag: '物件名',   label: /物件/ },
  { tag: '担当',     label: /担当/ },
  { tag: '同行',     label: /同行/ },
  { tag: '所属',     label: /所属/ },
];

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('run').timeBased().everyMinutes(5).create();
}

function run() { importQuery_(CONFIG.QUERY); }

/** 過去分を入れたい時だけ手動実行(日数を変えて)。 */
function backfill() { importQuery_('subject:金消 newer_than:30d'); }

function importQuery_(q) {
  const label = GmailApp.getUserLabelByName(CONFIG.DONE_LABEL) || GmailApp.createLabel(CONFIG.DONE_LABEL);
  const st = loadSettings_();
  GmailApp.search(q + ' -label:' + CONFIG.DONE_LABEL, 0, 50).forEach(th => {
    th.getMessages().forEach(m => {
      if (/^\s*(Re|RE|返信)\s*:/.test(m.getSubject())) return;
      const rec = parse_(m, st);
      if (rec) upsert_(rec);
    });
    th.addLabel(label);
  });
}

function parse_(m, st) {
  if (!/【金消】/.test(m.getSubject() + m.getPlainBody())) return null;
  const t = {};
  m.getPlainBody().split(/\r?\n/).forEach(l => {
    const x = l.match(/^【(.+?)】\s*(.*)$/);
    if (x) t[x[1].trim()] = x[2].trim();
  });
  if (!t['顧客名']) return null;
  const mailDate = m.getDate();
  const fields = {};
  MAP.forEach(r => {
    const v = t[r.tag];
    if (v == null || v === '' || /^[－-]+$/.test(v)) return;
    let f = r.main ? st.fields.find(x => x.key === st.mainKey)
                   : st.fields.find(x => r.label.test(x.label || ''));
    if (!f) return;
    fields[f.key] = convert_(f, v, mailDate);
  });
  const main = fields[st.mainKey];
  const d = main && (main.d || (typeof main === 'string' ? main : ''));
  const month = d ? d.slice(0, 7) : Utilities.formatDate(mailDate, 'Asia/Tokyo', 'yyyy-MM');
  return {
    mail_id: m.getId(), month: month,
    name: t['顧客名'].replace(/様$/, '').trim(),
    fields: fields, sort_order: mailDate.getTime() % 1e9,
  };
}

/** 項目の型に合わせて値を変換。「11月30日（月）」→ 日付。 */
function convert_(f, v, mailDate) {
  const dt = parseDate_(v, mailDate);
  if (f.type === 'datetime') return { d: dt || '', t: '', none: false };
  if (f.type === 'date') return dt || '';
  return v;
}
function parseDate_(v, base) {
  const x = v.match(/(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!x) return '';
  const by = Number(Utilities.formatDate(base, 'Asia/Tokyo', 'yyyy')), bm = Number(Utilities.formatDate(base, 'Asia/Tokyo', 'M'));
  let y = x[1] ? Number(x[1]) : by;
  const mo = Number(x[2]);
  if (!x[1] && mo < bm - 6) y += 1;      // 年なし: メール日付より大きく前の月は翌年扱い(12月→1月)
  return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + Number(x[3])).slice(-2);
}

function sb_(path, opt) {
  opt = opt || {};
  opt.headers = Object.assign({ apikey: CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' }, opt.headers || {});
  opt.muteHttpExceptions = true;
  const r = UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/rest/v1/' + path, opt);
  if (r.getResponseCode() >= 300) throw new Error(r.getResponseCode() + ' ' + r.getContentText());
  return r.getContentText();
}
function upsert_(rec) {   // 同じメールは重複させない
  sb_(CONFIG.TABLE + '?on_conflict=mail_id', { method: 'post', payload: JSON.stringify(rec), headers: { Prefer: 'resolution=ignore-duplicates' } });
}
function loadSettings_() {
  const rows = JSON.parse(sb_(CONFIG.STABLE + '?id=eq.1&select=settings'));
  const s = (rows[0] && rows[0].settings) || {};
  return { mainKey: s.mainKey || 'kinsho', fields: s.fields || [] };
}

/** 動作確認: 最新の金消メール1通を、どの項目にどう入るか表示(書き込みはしない) */
function dryRun() {
  const st = loadSettings_();
  Logger.log('設定の項目: ' + st.fields.map(f => f.label + '(' + f.type + ')').join(' / '));
  GmailApp.search('subject:金消 newer_than:30d', 0, 2).forEach(th => Logger.log(JSON.stringify(parse_(th.getMessages()[0], st))));
}
