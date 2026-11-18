/**
 * 金消アプリ メール連携（Google Apps Script）
 *
 * このスクリプトを動かした Google アカウント（negoro.hibiki.offi@gmail.com）の受信メールのうち、
 * 対象のもの（下の wanted_ に当てはまる）を1分おきに探して、Supabase の Edge Function（mail-ingest）へ送り、
 * 案件カードを自動更新する。Gmail 側のラベルやフィルタの設定は要らん。
 *
 * ・FROM_DATE 以降のメールが対象。古い順に、1分あたり MAX_SEND_PER_RUN 通ずつ送る
 *   （過去分が多いときは、数分かけて順番に取り込まれる）
 * 使い方は ../README.md の「手順3」を見てね。
 */

// ★取り込みの開始日。この日以降に届いたメールが対象（YYYY/MM/DD）
const FROM_DATE = '2026/11/01';

// ★ここだけ自分の環境に合わせて書き換える
const CONFIG = {
  ENDPOINT: 'https://kufcrnopolzebfogdugq.supabase.co/functions/v1/mail-ingest',
  // 大まかに拾う検索条件（Gmail の検索窓に入れるのと同じ書き方）。厳密な絞り込みは下の wanted_ がやる
  QUERY: 'in:anywhere -in:spam -in:trash -from:me after:' + FROM_DATE + ' ' +
    '-from:(rakuten-sec.co.jp OR openhouse-group.com OR mecyes.co.jp) ' +   // 営業・ニュースメールは除外（増えたらここに足す）
    '(from:(support@cloudsign.jp OR noreply@gmosign.com OR gatestokyo.co.jp) ' +
    'OR subject:(決済 OR 事前承認 OR 本承認 OR 申込 OR 契約 OR 電話面談 OR 金消 OR 物件振替 OR 物件確定 OR オープン))',
  PAGE: 100,                 // 検索1ページあたりのスレッド数
  MAX_PAGES: 5,              // 最大 PAGE × MAX_PAGES スレッドまで見る
  MAX_SEND_PER_RUN: 15,      // 1回（1分）に送る最大通数
};

// Gmail の検索は「【】」の記号を区別できんので、検索で大まかに拾ったあと、ここで厳密に絞る。
//  ① 件名が「【種類】…」で始まる（種類＝アプリのプルダウンの9つ）
//  ② 電子契約（クラウドサイン／GMOサイン）・GATES からのメール
//  ③ 件名に「決済」を含む
const STAGE_RE = /^\s*(?:(?:re|fw|fwd|再送|訂正|修正)\s*[:：]?\s*)*[【\[]\s*(事前承認|本承認|申込|契約|電話面談|金消|物件振替|物件確定|オープン)/i;
const TRUSTED_FROM_RE = /cloudsign\.jp|gmosign\.com|gatestokyo\.co\.jp/i;
function wanted_(msg) {
  const subject = msg.getSubject() || '';
  return STAGE_RE.test(subject) || TRUSTED_FROM_RE.test(msg.getFrom()) || /決済/.test(subject);
}

// 合言葉は、コードに直書きせず「スクリプト プロパティ」に入れる（README 手順3-3）
function secret_() {
  const s = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!s) throw new Error('スクリプト プロパティに INGEST_SECRET が入っとらん');
  return s;
}

/** 検索に当たった全メッセージ（FROM_DATE 以降）を、古い順に並べて返す */
function collect_() {
  const out = [];
  for (let page = 0; page < CONFIG.MAX_PAGES; page++) {
    const threads = GmailApp.search(CONFIG.QUERY, page * CONFIG.PAGE, CONFIG.PAGE);
    if (!threads.length) break;
    threads.forEach(th => th.getMessages().forEach(m => out.push(m)));
    if (threads.length < CONFIG.PAGE) break;
  }
  out.sort((a, b) => a.getDate() - b.getDate());
  return out;
}

function processMails() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;               // 前回の処理がまだ動いとるときは、重ならんよう抜ける
  try {
    const props = PropertiesService.getScriptProperties();
    let done = [];
    try { done = JSON.parse(props.getProperty('DONE_IDS') || '[]'); } catch (e) { done = []; }
    const doneSet = new Set(done);
    const me = Session.getActiveUser().getEmail().toLowerCase();

    const todo = collect_().filter(msg => {
      const id = msg.getId();
      if (doneSet.has(id)) return false;
      if (msg.getFrom().toLowerCase().indexOf(me) !== -1) { doneSet.add(id); return false; }   // 自分が送ったメールは対象外
      if (!wanted_(msg)) return false;                                                          // 件名が対象の形でないメールは送らん
      return true;
    });

    let sent = 0;
    for (const msg of todo.slice(0, CONFIG.MAX_SEND_PER_RUN)) {
      const id = msg.getId();
      const res = UrlFetchApp.fetch(CONFIG.ENDPOINT, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-ingest-secret': secret_() },
        muteHttpExceptions: true,
        payload: JSON.stringify({
          message_id: id,
          from: msg.getFrom(),
          subject: msg.getSubject(),
          date: Utilities.formatDate(msg.getDate(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX"),
          body: msg.getPlainBody().slice(0, 12000),
        }),
      });
      const code = res.getResponseCode();
      if (code === 200) { doneSet.add(id); sent++; }
      else if (code === 401 || code === 500) { console.error('設定エラー ' + code + ': ' + res.getContentText().slice(0, 200)); break; }  // 合言葉や設定のミス。続けても無駄
      else { console.error('一時エラー ' + code + '（次の周期で再送）: ' + res.getContentText().slice(0, 200)); }
    }
    props.setProperty('DONE_IDS', JSON.stringify(Array.from(doneSet).slice(-450)));   // プロパティ上限(9KB)に収まる数。重複送信は Supabase 側でも弾く
    if (sent || todo.length) console.log('送信 ' + sent + ' 通 ／ 残り ' + Math.max(0, todo.length - sent) + ' 通');
  } finally {
    lock.releaseLock();
  }
}

/** 最初に1回だけ実行：1分おきに processMails を動かす設定を作る */
function setup() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'processMails').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('processMails').timeBased().everyMinutes(1).create();
  console.log('1分おきの自動実行を設定した');
}

/** 動作確認用：FROM_DATE 以降で「送る対象」になるメールを、古い順に一覧で出すだけ（Supabase には送らん） */
function dryRun() {
  const all = collect_();
  let n = 0, skipped = 0;
  all.forEach(m => {
    if (wanted_(m)) { n++; console.log('送る  | ' + Utilities.formatDate(m.getDate(), 'Asia/Tokyo', 'M/d HH:mm') + ' | ' + m.getFrom() + ' | ' + m.getSubject()); }
    else skipped++;
  });
  console.log(FROM_DATE + ' 以降 ／ 送る対象：' + n + ' 通 ／ 形が違うので送らん：' + skipped + ' 通（1分に ' + CONFIG.MAX_SEND_PER_RUN + ' 通ずつ送る）');
}
