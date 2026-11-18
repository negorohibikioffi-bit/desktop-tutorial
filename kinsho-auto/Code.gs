/**
 * AXIA 金消予定日(自動更新版) — negoro.hibiki.offi@gmail.com のGmailを読み、Supabaseへ追記する。
 * 設定: 下の CONFIG を埋め、setupTrigger() を1回実行（5分ごとに run が動く）。
 * 初回は run() を手動実行して権限(Gmail/外部通信)を承認する。
 */
const CONFIG = {
  SUPABASE_URL: 'https://rmqsapkwtngsusqaldpe.supabase.co',
  SUPABASE_KEY: 'sb_publishable_VXflIxa8nyBLGpzv8SFHOA_d_qL4_1Z',
  TABLE: 'axia_kinsho_auto',
  STABLE: 'axia_kinsho_auto_settings',
  // ★金消メールの検索条件(サンプルを見て確定)。例: 'from:xxx@bank.co.jp subject:金消'
  QUERY: 'subject:金消 newer_than:7d',
  DONE_LABEL: 'kinsho-imported',   // 取込済みスレッドに付ける目印
};

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('run').timeBased().everyMinutes(5).create();
}

function run() {
  const label = GmailApp.getUserLabelByName(CONFIG.DONE_LABEL) || GmailApp.createLabel(CONFIG.DONE_LABEL);
  const fieldKeys = loadFieldKeys_();           // 画面設定の「項目名 → キー」
  GmailApp.search(CONFIG.QUERY + ' -label:' + CONFIG.DONE_LABEL, 0, 30).forEach(th => {
    th.getMessages().forEach(m => {
      const rec = parse_(m, fieldKeys);
      if (rec) upsert_(rec);
    });
    th.addLabel(label);
  });
}

/** ★本文の読み取りルール(サンプルを見て確定)。null を返すと無視。 */
function parse_(m, keys) {
  const body = m.getPlainBody();
  const name = (body.match(/(?:お客様名|氏名|お名前)[:：]\s*(.+)/) || [])[1];
  const d = (body.match(/金消[^\n]*?(\d{4})[\/年.-](\d{1,2})[\/月.-](\d{1,2})/) || []);
  if (!name || !d[1]) return null;
  const date = d[1] + '-' + ('0' + d[2]).slice(-2) + '-' + ('0' + d[3]).slice(-2);
  const fields = {};
  fields[keys.kinsho || 'kinsho'] = { d: date, t: '', none: false };   // 日付＋時刻型
  return { mail_id: m.getId(), month: date.slice(0, 7), name: name.trim(), fields: fields, sort_order: Date.now() };
}

function sb_(path, opt) {
  opt = opt || {};
  opt.headers = Object.assign({ apikey: CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' }, opt.headers || {});
  opt.muteHttpExceptions = true;
  const r = UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/rest/v1/' + path, opt);
  if (r.getResponseCode() >= 300) throw new Error(r.getResponseCode() + ' ' + r.getContentText());
  return r.getContentText();
}
function upsert_(rec) {   // mail_id が同じなら重複させない
  sb_(CONFIG.TABLE + '?on_conflict=mail_id', { method: 'post', payload: JSON.stringify(rec), headers: { Prefer: 'resolution=ignore-duplicates' } });
}
function loadFieldKeys_() {
  const rows = JSON.parse(sb_(CONFIG.STABLE + '?id=eq.1&select=settings'));
  const out = {};
  if (rows[0] && rows[0].settings && rows[0].settings.fields)
    rows[0].settings.fields.forEach(f => { out[f.label] = f.key; if (/金消/.test(f.label)) out.kinsho = f.key; });
  return out;
}
