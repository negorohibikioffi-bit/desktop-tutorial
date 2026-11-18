# 金消予定日 一覧（AXIA JAPAN）— アプリ版 v14

元の `AXIA_Kinsho.html` を、次の3点で作り直したもの。

| やりたいこと | どうなった |
|---|---|
| アプリ化 | PWA 化（ホーム画面に追加 → 枠なしで起動／アイコン／オフラインでも画面は開く） |
| メールが入ると変更される | Gmail に届いた対象メールを AI が読み、該当カードの日程を自動更新（履歴・元に戻す付き） |
| 元の機能はすべて動く | 一覧・検索・銀行/新築中古フィルタ・カード編集・複製・月移動・繰越・設定画面・印刷・チーム同期を**ロジック変更なし**で維持 |
| 見た目 | ダーク＋ゴールドに刷新（印刷物だけは紙なので従来の白地） |

```
axia-kinsho/
├─ index.html / app.js / sw.js / manifest.webmanifest   ← アプリ本体（これを公開する）
├─ vendor/ icons/                                        ← 同梱ライブラリ・アイコン
├─ src/app.jsx  build.mjs                                ← ソース（編集はここ）→ `npm run build` で app.js を作る
├─ supabase/migrations/001_mail_log.sql                  ← 手順1：履歴テーブル
├─ supabase/functions/mail-ingest/                       ← 手順2：メールを読んで更新する関数
└─ gas/Code.gs                                           ← 手順3：Gmail → 関数へ送るスクリプト
```

---

## A. アプリとして使う（メール連携なしでも、これだけで動く）

1. `axia-kinsho/` フォルダの中身を、静的ホスティング（GitHub Pages / Netlify / Cloudflare Pages など）に置いて公開する。
   - 例：Netlify Drop にフォルダごとドラッグ。
   - **https で公開すること**（Service Worker とホーム画面追加に必須）。
2. スマホでそのURLを開く。
   - **Android (Chrome)**：上に出る「📲 アプリとして追加」→「追加」。
   - **iPhone (Safari)**：共有ボタン →「ホーム画面に追加」。
3. データは元のアプリと同じ Supabase を使うので、**今ある案件・設定がそのまま見える**。

> ソースを直したとき：`cd axia-kinsho && npm install && npm run build`（`app.js` が更新される）。
> 公開後に更新を出すときは、`sw.js` の `VER` と `index.html` の `app.js?v=` を一緒に上げると確実。

---

## B. メール連携のセットアップ（最初の1回だけ）

流れ：**Gmail にメールが届く → Apps Script が1分以内に拾う → Supabase の関数が AI で読む → カードを更新 → アプリに 📧 通知**

### 手順1：履歴テーブルを作る
Supabase ダッシュボード → SQL Editor に `supabase/migrations/001_mail_log.sql` を貼って Run。

### 手順2：Edge Function をデプロイ
Supabase CLI で（プロジェクトを `supabase link` 済みとして）：

```bash
supabase secrets set INGEST_SECRET="（長いランダム文字列。手順3でも使う）"
supabase secrets set ANTHROPIC_API_KEY="（Anthropic の API キー）"
supabase functions deploy mail-ingest --no-verify-jwt
```

`--no-verify-jwt` は付ける（Apps Script は Supabase のログインを持たんので、代わりに `INGEST_SECRET` で守る）。

### 手順3：Gmail → 関数 をつなぐ
1. Gmail で **ラベル「金消取込」** を作る。
2. **フィルタ** を作って、拾いたいメールに自動でそのラベルを付ける。
   ラベルが付いたメールだけが AI に送られる。**フィルタを絞るほど安全で安上がり。**
   Gmail の検索窓の右端 ▾ →「条件に一致するメールのフィルタを作成」に、次の検索条件を貼る：
   ```
   from:(support@cloudsign.jp OR noreply@gmosign.com OR gatestokyo.co.jp) OR subject:(決済 OR 金消 OR 金銭消費貸借 OR 融資承認 OR 承認通知 OR 申込完了 OR 申込受付 OR 報告 OR 完了報告)
   ```
   →「ラベルを付ける：金消取込」（「受信トレイをスキップ」は付けない）。
   - 営業メール・メルマガ（オープンハウス等）や、楽天銀行の「評価依頼」回答は対象外にしてある。
     もし巻き込まれても、AI側で `relevant=false` として履歴に「対象外」と残るだけで、カードは変わらん。
   - 取引先が増えたら `from:( … )` にドメインを足す。
3. <https://script.google.com> で新規プロジェクトを作り、`gas/Code.gs` を貼る。
   左の ⚙ プロジェクトの設定 →「スクリプト プロパティ」に `INGEST_SECRET` = 手順2と同じ文字列 を追加。
4. 関数 `setup` を1回実行（Gmail の権限を許可）→ 1分おきの自動実行が設定される。
   `dryRun` を実行すると、対象メールが何通あるかだけ確認できる（送信はしない）。

### 動作テスト
```bash
curl -X POST "https://<プロジェクトID>.supabase.co/functions/v1/mail-ingest" \
  -H "x-ingest-secret: <INGEST_SECRET>" -H "content-type: application/json" \
  -d '{"message_id":"test-1","from":"test@example.com","subject":"金消日程のご連絡（山田様 AXIA白金台）","body":"山田様 AXIA白金台の金消を11月25日13:30に設定しました。","date":"2026-11-18T10:00:00+09:00"}'
```
→ アプリの 📧 に履歴が出る（該当する案件が無ければ「該当カードなし」になる）。

---

## C. 安全装置（誤更新を防ぐ仕組み）

- **自動で反映するのは条件を全部満たしたときだけ**
  AIが「高確度」と判断 ＋ メール内に **物件名・名前・号室のうち2つ以上が実在** ＋ 日付・選択肢が正しい形式。
  満たさんときは **「要確認」** に回り、📧 画面で内容を見て「この内容で反映」を押すまで何も変わらん。
- **全部の更新は履歴に残り、ワンタップで「↩ 元に戻す」** できる。更新されたカードには 📧 タグが付く。
- 関数は **既存カードの項目を更新するだけ**（新規作成・削除・名前の変更はしない）。
- メール本文は **「信頼できないデータ」として AI に渡す**（本文中の指示には従わない）。
- 二重処理防止（Gmail のメッセージID）／ 合言葉（`INGEST_SECRET`）／ 本文は DB に保存しない。
- 全件を手動確認にしたいときは `supabase secrets set AUTO_APPLY=false`。

## D. 知っておいてほしいこと

- **メール本文（お客様名・物件名を含む）は、読み取りのため Anthropic の API に送られる。** 社内の情報取扱ルールに照らして問題ないか、使い始める前に確認してね。
- 履歴テーブルは、アプリの公開キー（anon）で読める作り（既存の案件テーブルと同じ公開範囲）。保存するのは件名・送信元・要約・変更前後の値だけ。
- Gmail ラベルを付けるフィルタは Gmail 側の仕様で、受信から数秒〜数十秒後に付く。実際の反映はそこから最大1分程度。
- テスト：`node --experimental-strip-types supabase/functions/mail-ingest/logic.test.ts`（判断ロジックの単体テスト）。
