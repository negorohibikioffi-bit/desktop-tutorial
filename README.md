# Welcome to GitHub Desktop!

This is your README. READMEs are where you can communicate what your project is and how to use it.

Write your name on line 6, save it, and then head back to GitHub Desktop.

## ジャービス(JARVIS)

画面に表示されるAIアシスタント。Claudeに接続して会話します。

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # Windows PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
npm start
```

声(ジャービス風ボイス)を使う場合は、先に次も実行します。

```bash
pip install edge-tts
```

ffmpeg も必要です(Windows: `winget install ffmpeg`)。声が使えないときは、ブラウザの音声に自動で戻ります。

ブラウザで http://localhost:3000 を開き、画面を一度クリックすると起動します。
