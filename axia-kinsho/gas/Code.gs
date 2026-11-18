/**
 * 金消アプリ メール連携（Google Apps Script）
 *
 * Gmail に「金消取込」ラベルのついたメールが届くと、1分以内に Supabase の
 * Edge Function（mail-ingest）へ送って、案件カードを自動更新する。
 *
 * 使い方は ../README.md の「手順3」を見てね。
 */

// ★ここだけ自分の環境に合わせて書き換える
const CONFIG = {
  ENDPOINT: 'https://zrqdoorolwvjlwuatlkc.supabase.co/functions/v1/mail-ingest',
  LABEL: '金消取込',          // Gmail のフィルタで自動的につけるラベル名
  LOOKBACK: 'newer_than:2d',  // 何日前までのメールを見るか
  MAX_THREADS: 30,
};

// 合言葉は、コードに直書きせず「スクリプト プロパティ」に入れる（README 手順3-3）
function secret_() {
  const s = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!s) throw new Error('スクリプト プロパティに INGEST_SECRET が入っとらん');
  return s;
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

    const threads = GmailApp.search('label:' + CONFIG.LABEL + ' ' + CONFIG.LOOKBACK, 0, CONFIG.MAX_THREADS);
    let sent = 0;
    for (const th of threads) {
      for (const msg of th.getMessages()) {
        const id = msg.getId();
        if (doneSet.has(id)) continue;
        if (msg.getFrom().toLowerCase().indexOf(me) !== -1) { doneSet.add(id); continue; }   // 自分が送ったメールは対象外

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
        else if (code === 401 || code === 500) { console.error('設定エラー ' + code + ': ' + res.getContentText().slice(0, 200)); return; }  // 合言葉や鍵の設定ミス。続けても無駄
        else { console.error('一時エラー ' + code + '（次の周期で再送）: ' + res.getContentText().slice(0, 200)); }
      }
    }
    props.setProperty('DONE_IDS', JSON.stringify(Array.from(doneSet).slice(-400)));
    if (sent) console.log(sent + ' 通を送信');
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

/** 動作確認用：直近のメールで何通が対象になるかだけ数える（送信はせん） */
function dryRun() {
  const threads = GmailApp.search('label:' + CONFIG.LABEL + ' ' + CONFIG.LOOKBACK, 0, CONFIG.MAX_THREADS);
  const n = threads.reduce((a, t) => a + t.getMessages().length, 0);
  console.log('対象：' + threads.length + ' スレッド / ' + n + ' 通');
}
