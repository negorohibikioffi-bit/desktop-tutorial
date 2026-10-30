# credit-meter

Claude Code のクレジット使用量を常に表示する mod です。

- このセッションのコスト（米ドル）
- レート制限（5時間枠・7日間枠・利用上限）の使用率とリセット日時
- コンテキストの使用率

入力欄のすぐ上に1行で表示します（ターミナル・デスクトップは帯、スマホ・Web・VS Code は小さなパネル）。
ステータスラインにも表示し、レート制限が 80% / 90% / 100% に達すると通知します。`/credits` で今の数値を表示します。

## インストール

Claude Code のプロンプトで:

```
/plugin install credit-meter --marketplace negorohibikioffi-bit/desktop-tutorial
```

シェルから:

```bash
claude plugin install credit-meter --marketplace negorohibikioffi-bit/desktop-tutorial
```

デスクトップアプリ（`/plugin` が使えない場合）: プロンプト欄の横の + → Plugins → Add marketplace に `negorohibikioffi-bit/desktop-tutorial` を入力 → Add plugin。

インストール時の scope は **user** を選ぶと、すべてのセッションで有効になります。
