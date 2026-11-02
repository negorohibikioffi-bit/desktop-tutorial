// ジャービス用の小さなサーバー。APIキーはここ(サーバー側)だけに置く。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const client = new Anthropic(); // ANTHROPIC_API_KEY を環境変数から読む
const PORT = process.env.PORT || 3000;

const SYSTEM = `あなたは「ジャービス」。東京都港区の宅建業者AXIA JAPAN(物件仕入れ事業部・買取再販、三為取引が中心)に所属する響さんの、アシスタントかつ相棒です。
- 呼びかけは「響様」。落ち着いた丁寧な執事口調で、頼れる相棒として話す。
- 声で読み上げられるため、返事は日本語で短く(原則3文以内)、Markdown記号・箇条書き記号・絵文字は使わない。
- 得意分野は不動産実務(宅建業法、契約書・重要事項説明書の買主保護目線のチェック、手付・契約不適合責任・違約金・公租公課精算・賃貸借承継・法令上の制限など)とプログラミング。
- 法令や最新の改正は断定しすぎず、確信がない点は「要確認」と明言する。最終判断は宅地建物取引士や専門家の確認を要する旨を必要に応じて添える。
- 詳しい書面チェックはPDFや本文を受け取ってから行う。`;

const MAX_TURNS = 20;

async function chat(messages) {
  const msgs = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content)
    .slice(-MAX_TURNS);
  const res = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort: "low" }, // 音声会話なので速さ優先
    messages: msgs,
  });
  if (res.stop_reason === "refusal") return "申し訳ございません、その内容にはお答えできません。";
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

http
  .createServer(async (req, res) => {
    try {
      if (req.method === "GET" && (req.url === "/" || req.url === "/jarvis.html")) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(fs.readFileSync(path.join(here, "jarvis.html")));
      }
      if (req.method === "POST" && req.url === "/api/chat") {
        let body = "";
        for await (const c of req) { body += c; if (body.length > 1e6) throw new Error("too large"); }
        const { messages } = JSON.parse(body);
        const text = await chat(messages || []);
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ text }));
      }
      res.writeHead(404).end("not found");
    } catch (e) {
      console.error(e);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`ジャービス起動: http://localhost:${PORT}`));
