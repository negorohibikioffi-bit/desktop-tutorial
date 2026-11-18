# 金消予定日 一覧（AXIA JAPAN）— アプリ版 v14

元の `AXIA_Kinsho.html` を、次の形に作り直したもの。

| やりたいこと | どうなった |
|---|---|
| アプリ化 | PWA 化（ホーム画面に追加 → 枠なしで起動／アイコン／オフラインでも画面は開く） |
| メールが入ると変更される | Gmail に届いた対象メールを AI が読み、該当カードの日程を自動更新（履歴・元に戻す付き） |
| 元の機能はすべて動く | 一覧・検索・銀行/新築中古フィルタ・カード編集・複製・月移動・繰越・設定画面・印刷・チーム同期を**ロジック変更なし**で維持 |
| 見た目 | ダーク＋ゴールドに刷新（印刷物だけは紙なので従来の白地） |

```
axia-kinsho/
├─ index.html / app.js / sw.js / manifest.webmanifest / config.js   ← アプリ本体（これを公開する）。接続先は config.js
├─ vendor/ icons/                                                    ← 同梱ライブラリ・アイコン
├─ src/app.jsx  build.mjs                                            ← ソース（編集はここ）→ `npm run build` で app.js を作る
├─ supabase/migrations/000_base.sql                                  ← 手順1：テーブル作成（最初の項目設定つき）
├─ supabase/migrations/001_mail_log.sql                              ← 手順1：メール履歴テーブル
├─ supabase/migrations/002_stage_fields.sql                          ← 手順1：進捗メール用の日付項目
├─ dist/mail-ingest.single.ts                                        ← 手順2：メールを読んで更新する関数（1ファイル版）
└─ gas/Code.gs                                                       ← 手順3：Gmail → 関数へ送るスクリプト
```

> 元の金消アプリの Supabase とは**別のプロジェクト**を使う前提（案件データは空から始まる）。

---

## 手順0：Supabase のプロジェクトを作る
1. <https://supabase.com/dashboard> で **New organization**（名前は何でもよい。プランは Free でOK）。
2. **New project**：名前 `axia-kinsho`、リージョン **Northeast Asia (Tokyo)**、データベースのパスワードは控えておく。
3. できたら左下 ⚙ **Project Settings → API** を開き、次の2つを控える：
   - **Project URL**（`https://xxxxxxxx.supabase.co`）
   - **anon public** キー（長い文字列）。※ `service_role` は**使わない・書かない**。
4. `config.js` の2か所を、控えた値に書き換える。

## 手順1：テーブルを作る
Supabase → **SQL Editor** → New query に、**次の順で1本ずつ**貼って Run：
1. `supabase/migrations/000_base.sql`（案件テーブル・設定・最初の項目）
2. `supabase/migrations/001_mail_log.sql`（メール履歴）
3. `supabase/migrations/002_stage_fields.sql`（進捗メール9種類ぶんの日付項目。足りんものだけ追加）

どちらも「Success」と出ればOK（再実行しても壊れん）。

> 最初の項目は 物件名／号室／申込日／承認日／契約日／金消予定日／決済日／銀行／賃貸管理／建物管理。
> アプリの ⚙ から、名前・順番・追加・削除をいつでも変えられる。

## 手順2：メールを読む関数を入れる（ダッシュボードだけでOK）
1. 左メニュー **Edge Functions → Deploy a new function → Via Editor**。
2. 関数名を **`mail-ingest`** にして、`dist/mail-ingest.single.ts` の中身を**全部**貼り付けて Deploy。
3. 関数の **Settings（Details）で「Verify JWT」をオフ**にして保存（Apps Script は Supabase のログインを持たんので、代わりに合言葉で守る）。
4. 左メニュー **Edge Functions → Secrets**（または Project Settings → Edge Functions）に2つ登録：
   - `INGEST_SECRET` … 長いランダム文字列（手順3でも使う。例：パスワード生成で30文字以上）
   - （任意）`ANTHROPIC_API_KEY` … **無くてもよい（無料で動く）。** 入れると、ルールで読めんメールだけ AI が読む（有料）
   - （任意）`AUTO_APPLY` = `false` … 全件を「要確認」にして、手動で反映したいとき

## 手順3：Gmail（negoro.hibiki.offi@gmail.com）→ 関数 をつなぐ
Gmail のラベルやフィルタは**要らん**。スクリプトが検索条件でメールを直接拾う。
1. **negoro.hibiki.offi@gmail.com でログインした状態で** <https://script.google.com> →「新しいプロジェクト」。
2. `gas/Code.gs` の中身を貼り、先頭 `CONFIG.ENDPOINT` を `https://（自分のProject URLのID）.supabase.co/functions/v1/mail-ingest` に書き換える。
   拾う条件は `QUERY`（クラウドサイン・GMOサイン・GATES、件名に 決済/金消/申込/報告/締結完了 など）。
3. 左の ⚙「プロジェクトの設定」→「スクリプト プロパティ」に `INGEST_SECRET` = 手順2と同じ文字列 を追加。
4. 関数 `dryRun` を実行（初回は Gmail の権限を許可）→ ログに「いま拾われるメールの件名」が出る。**想定外のメールが混ざっとらんか確認**して、混ざるなら `QUERY` を絞る。
5. 関数 `setup` を1回実行 → 1分おきの自動実行が設定される。

> 対象は過去2日以内のメールだけ。処理済みのメールIDは覚えとるので、同じメールを二重に送ることはない。

### 動作テスト
```bash
curl -X POST "https://<プロジェクトID>.supabase.co/functions/v1/mail-ingest" \
  -H "x-ingest-secret: <INGEST_SECRET>" -H "content-type: application/json" \
  -d '{"message_id":"test-1","from":"test@example.com","subject":"決済日のご連絡（山田様 AXIA白金台）","body":"山田様 AXIA白金台の決済を11月30日に設定しました。","date":"2026-11-18T10:00:00+09:00"}'
```
→ アプリの 📧 に履歴が出る（該当する案件が無ければ「該当カードなし」になる）。

---

## 手順4：アプリを公開して、スマホに入れる
1. `axia-kinsho/` フォルダの中身（`config.js` 書き換え後）を、**https の**静的ホスティング（Netlify Drop / Cloudflare Pages / GitHub Pages など）に置く。
   - 例：Netlify Drop にフォルダごとドラッグ。
2. スマホでそのURLを開く。
   - **Android (Chrome)**：上に出る「📲 アプリとして追加」→「追加」。
   - **iPhone (Safari)**：共有ボタン →「ホーム画面に追加」。

> ソースを直したとき：`cd axia-kinsho && npm install && npm run build`（`app.js` が更新される）。
> 関数を直したとき：`npm run bundle-fn` で `dist/mail-ingest.single.ts` を作り直して貼り替える。
> 公開後に更新を出すときは、`sw.js` の `VER` と `index.html` の `app.js?v=` を一緒に上げると確実。

---

## 進捗メール（件名が `【種類】物件名 号室`）

アプリの「種類」プルダウンの**9種類すべて**を、件名の `【…】` で見分けて、対応する日付項目を埋める。

| 件名の種類 | 埋める項目 |
|---|---|
| 【事前承認】 | 事前承認日 | 
| 【本承認】 | 本承認日（無ければ 承認日） |
| 【申込】 | 申込日 |
| 【契約】 | 契約日 |
| 【電話面談】 | 電話面談日 |
| 【金消】 | 金消予定日 |
| 【物件振替】 | 物件振替日 |
| 【物件確定】 | 物件確定日 |
| 【オープン】 | オープン日 |

- 日付は **件名の末尾の日付（例：`【金消】○○ 101 11/30 14:00`） ＞ 本文のその種類の直後の日付 ＞ 受信日** の順で使う。
- `【本承認完了】`、`Re:` 付きも同じ扱い。
- 同じ物件名・号室のカードがあれば、その項目だけ更新。**無ければ新規カードを今月に作る**（名前は空。履歴の「元に戻す」で削除できる）。
- 項目が足りんときは、**手順1の `002_stage_fields.sql`** を SQL Editor で実行する（足りん項目だけ追加。何回流してもOK）。

## 無料で動く範囲（AIなし）

AI の鍵を入れんでも、次の**決まった型のメール**は、ルールで読み取って自動更新する（費用0円・本文は外部に出ん）：

| メール | 反映先 |
|---|---|
| クラウドサイン「合意締結が完了」／GMOサイン「電子署名完了」で、書類名に**売買契約**が入るもの | **契約日**（＝受信日） |
| 「…を【2026年11月30日】にて決済お受けいたしました」のような**決済日の確定** | **決済日** |

- 管理委託契約書・取引完了確認書など、売買契約書以外の署名完了は更新しない。
- 銀行の承認連絡など、型がばらばらのメールは「対象外」として履歴に残るだけ（→ 後から `ANTHROPIC_API_KEY` を足せば、AI が読む）。
- 案件の特定は、メール内の**物件名・号室・お客様名**と一致するかで機械的に行う（2項目以上一致＝自動反映、1項目＝要確認）。

## 安全装置（誤更新を防ぐ仕組み）

- **自動で反映するのは条件を全部満たしたときだけ**
  （ルール読み取り／AI）が「高確度」と判断 ＋ メール内に **物件名・名前・号室のうち2つ以上が実在** ＋ 日付・選択肢が正しい形式。
  満たさんときは **「要確認」** に回り、📧 画面で内容を見て「この内容で反映」を押すまで何も変わらん。
- **全部の更新は履歴に残り、ワンタップで「↩ 元に戻す」** できる。更新されたカードには 📧 タグが付く。
- 関数は **既存カードの項目を更新するだけ**（新規作成・削除・名前の変更はしない）。
- メール本文は **「信頼できないデータ」として AI に渡す**（本文中の指示には従わない）。
- 二重処理防止（Gmail のメッセージID）／ 合言葉（`INGEST_SECRET`）／ 本文は DB に保存しない。

## 知っておいてほしいこと

- **AI の鍵を入れんかぎり、メール本文は Google（Gmail）と自分の Supabase の外に出ん。** 鍵を入れた場合のみ、ルールで読めんメールの本文が Anthropic の API に送られる（使う前に社内ルールを確認）。
- このアプリは**ログイン無しのチーム共用**（元のアプリと同じ）。**Project URL と anon キーを知っとる人は案件を読み書きできる**ので、公開URLやキーをチーム外に出さんこと。
- 履歴テーブルも同じ公開範囲。保存するのは件名・送信元・要約・変更前後の値だけ。
- 判断ロジックのテスト：`node --experimental-strip-types supabase/functions/mail-ingest/logic.test.ts`
