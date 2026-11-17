# Lexa（仮称）— 漢字・不動産用語・韓国語の統合辞書アプリ

Next.js 16 / TypeScript / Tailwind v4 / Framer Motion / Supabase。PWA対応。アプリ名は `NEXT_PUBLIC_APP_NAME` で変更可。

## 起動
```bash
npm install
cp .env.example .env.local   # 必要に応じて編集
npm run dev                  # http://localhost:3000
npm test                     # 検索ロジックのテスト
npm run data:kanji           # 漢字データの再生成（要ネットワーク）
```

## 実装状況（正直な現状）
| 項目 | 状態 |
|---|---|
| 漢字検索（自然言語・部首・構成要素・読み・英語意味） | ✅ 実データ3,122字で動作・テスト済 |
| 漢字AI補助（実在漢字のみ採用・「AI推定」表示） | ⚠️ 実装済・APIキー未設定のため**実機未検証** |
| 不動産用語辞典・比較機能 | ✅ 動作。ただし**27語・編集済み草案で原典未確認**（画面にも表示） |
| 不動産AI解説/比較（未収録語） | ⚠️ 実装済・**未検証**（AI生成と明示） |
| 韓国語（丁寧/タメ口/フォーマル/スラング/発音解説） | ✅ 19フレーズ。スラングの確認時期は「未確認」と表示 |
| 韓国語音声 | ✅ 端末内蔵TTS（通常/ゆっくり/繰り返し）。**サーバーTTSは未実装** |
| 韓国語AI翻訳（未収録文） | ⚠️ 実装済・**未検証** |
| お気に入り・履歴・フォルダ・設定・コピー | ✅ ローカル保存で動作 |
| Supabase認証・同期・RLS | ⚠️ コード/SQL実装済・**実Supabaseでの動作は未検証** |
| PWA（manifest/SW/アイコン） | ✅ 実装済。オフライン動作は限定的 |
| レート制限・キャッシュ・AI日次上限 | ✅（インスタンス単位。本番はRedis等へ） |

## Supabase セットアップ
1. プロジェクト作成 → `supabase/migrations/0001_init.sql` をSQL Editorで実行（RLS有効）
2. `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Authentication → URL設定に本番/ローカルURLを追加

## AI
`ANTHROPIC_API_KEY` はサーバー専用（`NEXT_PUBLIC_`を付けない）。未設定でも辞書検索は動作。

## ライセンス注意（公開前に要確認）
漢字読み・意味は KANJIDIC（EDRDG, CC BY-SA 4.0）、構成要素は CJKVI-IDS 由来。再配布条件の確認が必要です。
