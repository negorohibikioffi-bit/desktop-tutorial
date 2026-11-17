"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Volume2, Square, Turtle, Repeat, Sparkles, SearchX, Info } from "lucide-react";
import { SearchBar, CopyButton, FavButton, Badge, Notice, Skeletons, Empty, Chip, Segmented, cx } from "./ui";
import { useApi, useQueryParam, postJSON } from "@/lib/client/useApi";
import { addHistory } from "@/lib/client/store";
import { speak, stopSpeak, ttsSupported, koreanVoices } from "@/lib/client/tts";
import type { Phrase, Form, Slang } from "@/lib/korean/types";

type Reg = "polite" | "casual" | "formal";
const REG_LABEL: Record<Reg, string> = { polite: "丁寧（해요体）", casual: "タメ口", formal: "フォーマル" };
const SAMPLES = ["今何してる？", "めっちゃかわいい", "それガチ？", "会いたい", "お腹すいた", "ありがとう", "すごい", "それな"];
const RISK_TONE = { "なし": "ok", "やや注意": "warn", "要注意（粗い表現）": "warn" } as const;

export default function KoreanView() {
  const { q, input, setInput, submit } = useQueryParam();
  const base = useApi<{ hits: (Phrase & { score: number })[]; aiAvailable: boolean }>(q ? `/api/korean?q=${encodeURIComponent(q)}` : null);
  const [ai, setAi] = useState<{ loading: boolean; hit?: Phrase; error?: string; code?: string }>({ loading: false });
  useEffect(() => setAi({ loading: false }), [q]);
  useEffect(() => { if (q && base.data) addHistory("korean", q, base.data.hits[0]?.polite.ko); }, [q, base.data]);
  useEffect(() => () => stopSpeak(), [q]);
  async function askAI() { setAi({ loading: true }); const r = await postJSON<{ hit: Phrase }>("/api/korean", { q }); setAi({ loading: false, hit: r.data?.hit, error: r.error, code: r.code }); }

  const hits = base.data?.hits ?? [];
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">韓国語</h1>
        <p className="mt-1 text-sm text-text2">教科書だけじゃない、実際に使う韓国語。タメ口・丁寧語・若者言葉まで。</p>
      </div>
      <SearchBar value={input} onChange={setInput} onSubmit={() => submit()} placeholder="日本語で入力: 今何してる？ / 会いたい" loading={base.loading} />
      {!q && <div className="grid gap-3"><h2 className="text-sm font-semibold text-text2">試してみる</h2><div className="flex flex-wrap gap-2">{SAMPLES.map((s) => <Chip key={s} onClick={() => submit(s)}>{s}</Chip>)}</div></div>}
      {base.loading && !base.data && <Skeletons n={2} h={220} />}
      {base.error && <Notice tone="error" action={<button onClick={base.reload} className="rounded-lg bg-surface3 px-3 py-1 text-xs font-semibold">再試行</button>}>{base.error}</Notice>}
      {hits.map((p, i) => <PhraseCard key={p.id} phrase={p} defaultOpen={i === 0} q={q} />)}
      {base.data && hits.length === 0 && q && (
        <div className="grid gap-3">
          <Empty icon={<SearchX className="size-6" />} title="辞書に近い表現がありません" body="AIで翻訳できます。AIの結果は「AI生成」と明示し、スラングは実使用の確認ができているものだけを載せるよう指示しています。" />
          {!ai.hit && <button onClick={askAI} disabled={ai.loading} className="card flex items-center justify-center gap-2 p-4 font-semibold disabled:opacity-60"><Sparkles className="size-4 text-accent2" />{ai.loading ? "AIが翻訳中…" : `「${q}」をAIで翻訳する`}</button>}
          {ai.error && <Notice tone={ai.code === "ai_no_key" ? "info" : "error"}>{ai.code === "ai_no_key" ? "AI翻訳はまだ設定されていません（サーバーにAPIキーが必要です）。" : ai.error}</Notice>}
          {ai.hit && <PhraseCard phrase={ai.hit} defaultOpen q={q} />}
        </div>
      )}
    </div>
  );
}

function PhraseCard({ phrase, defaultOpen, q }: { phrase: Phrase; defaultOpen?: boolean; q: string }) {
  const regs = (["polite", "casual", "formal"] as Reg[]).filter((r) => phrase[r]?.ko);
  const [reg, setReg] = useState<Reg>(regs.includes("polite") ? "polite" : regs[0]);
  const f = phrase[reg] as Form;
  const isAI = phrase.origin === "ai";
  return (
    <motion.article layout="position" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cx("card grid gap-5 p-5", isAI && "border-dashed")}>
      <div className="flex flex-wrap items-center gap-2">
        {isAI ? <Badge tone="ai">AI生成・実使用未確認</Badge> : <Badge tone="warn">編集済み辞書・確認時期: {phrase.checkedAt ?? "未確認"}</Badge>}
        <span className="text-sm text-text3">{phrase.ja[0]}</span>
      </div>
      <Segmented<Reg> value={reg} onChange={(r) => { stopSpeak(); setReg(r); }} options={regs.map((r) => ({ id: r, label: REG_LABEL[r] }))} className="self-start max-w-full overflow-x-auto" />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={reg} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="grid gap-3">
          <p className="text-[32px] font-bold leading-tight tracking-tight md:text-4xl" lang="ko">{f.ko}</p>
          <div className="grid gap-1 text-sm"><p><span className="mr-2 inline-block w-16 text-text3">カタカナ</span><span className="text-base">{f.kana}</span></p><p><span className="mr-2 inline-block w-16 text-text3">ローマ字</span><span className="text-text2">{f.rom}</span></p></div>
          <p className="flex items-start gap-1.5 text-xs text-text3"><Info className="mt-0.5 size-3.5 shrink-0" />カタカナは近似表記です。正確な発音は音声と発音解説を優先してください。</p>
          <div className="flex items-center gap-2"><Player text={f.ko} /><div className="ml-auto flex gap-2"><CopyButton text={f.ko} label="韓国語をコピー" /><FavButton item={{ kind: "korean", ref: isAI ? `ai:${q}` : `${phrase.id}:${reg}`, title: f.ko, subtitle: `${phrase.ja[0]}（${REG_LABEL[reg]}）`, payload: isAI ? phrase : { id: phrase.id, reg } }} /></div></div>
        </motion.div>
      </AnimatePresence>

      <Section title="発音のポイント">{phrase.tips?.length ? <ul className="grid gap-2">{phrase.tips.map((t, i) => <li key={i} className="rounded-xl bg-surface2 p-3 text-sm leading-relaxed">{t}</li>)}</ul> : <p className="text-sm text-text3">—</p>}</Section>
      <Section title="ニュアンス・使う場面"><p className="text-sm leading-relaxed text-text2">{phrase.nuance}</p></Section>

      <Section title="言い方の違い">
        <div className="grid gap-2">{regs.map((r) => <button key={r} onClick={() => setReg(r)} className={cx("flex items-center justify-between rounded-xl border px-4 py-2.5 text-left text-sm transition", reg === r ? "border-accent bg-[var(--accent-soft)]" : "border-line bg-surface2")}><span className="text-text3">{REG_LABEL[r]}</span><span className="font-semibold" lang="ko">{phrase[r]!.ko}</span></button>)}</div>
      </Section>

      {phrase.slang && phrase.slang.length > 0 && (
        <Section title="ネイティブがよく使う表現・若者言葉">
          <div className="grid gap-3">{phrase.slang.map((s) => <SlangRow key={s.ko} s={s} isAI={isAI} />)}</div>
          <p className="mt-2 text-xs text-text3">{isAI ? "※ AIが提示した表現です。実際の使用状況は確認されていません。" : "※ 流行表現は変化が速く、確認時期は未確認です。使う前に最新の使われ方を確認してください。"}</p>
        </Section>
      )}
    </motion.article>
  );
}

function SlangRow({ s, isAI }: { s: Slang; isAI: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface2/70 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1"><p className="text-xl font-bold" lang="ko">{s.ko}</p><p className="text-sm">{s.kana} <span className="text-text3">/ {s.rom}</span></p></div>
        <Player text={s.ko} compact /><CopyButton text={s.ko} size="sm" label="コピー" />
      </div>
      <p className="mt-2 text-sm leading-relaxed">{s.meaning}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text3"><span>場面: {s.scene}</span><Badge tone={RISK_TONE[s.risk] ?? "neutral"}>失礼度: {s.risk}</Badge>{isAI && <Badge tone="ai">未確認</Badge>}</div>
      {s.risk_note && <p className="mt-2 text-xs text-[var(--warn)]">⚠ {s.risk_note}</p>}
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <section><h3 className="mb-2 text-xs font-semibold tracking-wide text-text3">{title}</h3>{children}</section>;

function Player({ text, compact }: { text: string; compact?: boolean }) {
  const [mode, setMode] = useState<"idle" | "normal" | "slow" | "loop">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [noVoice, setNoVoice] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; const chk = () => setNoVoice(ttsSupported() && koreanVoices().length === 0); chk(); if (ttsSupported()) speechSynthesis.onvoiceschanged = chk; return () => { mounted.current = false; stopSpeak(); }; }, []);
  const play = (m: "normal" | "slow" | "loop") => { if (mode !== "idle") { stopSpeak(); setMode("idle"); if (mode === m) return; } setErr(null); setMode(m); speak(text, { slow: m === "slow", repeat: m === "loop" ? 3 : 1, onEnd: () => mounted.current && setMode("idle"), onError: (e) => mounted.current && (setErr(e), setMode("idle")) }); };
  if (!ttsSupported()) return <span className="text-xs text-text3">この端末は音声再生に非対応です</span>;
  const btn = "grid place-items-center rounded-xl border border-line bg-surface2 transition active:scale-90";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2" role="group" aria-label="音声再生">
        <button onClick={() => play("normal")} aria-label={mode === "normal" ? "停止" : "通常速度で再生"} className={cx(btn, compact ? "size-8" : "grad-bg size-11 !border-transparent px-0")}>{mode === "normal" ? <Square className="size-4" fill="currentColor" /> : <Volume2 className={compact ? "size-4" : "size-5"} />}</button>
        {!compact && <>
          <button onClick={() => play("slow")} aria-label={mode === "slow" ? "停止" : "ゆっくり再生"} aria-pressed={mode === "slow"} className={cx(btn, "h-11 gap-1.5 px-3 text-sm", mode === "slow" && "border-accent text-accent")}>{mode === "slow" ? <Square className="size-3.5" fill="currentColor" /> : <Turtle className="size-4" />}ゆっくり</button>
          <button onClick={() => play("loop")} aria-label={mode === "loop" ? "停止" : "3回繰り返し再生"} aria-pressed={mode === "loop"} className={cx(btn, "h-11 gap-1.5 px-3 text-sm", mode === "loop" && "border-accent text-accent")}>{mode === "loop" ? <Square className="size-3.5" fill="currentColor" /> : <Repeat className="size-4" />}×3</button>
        </>}
      </div>
      {!compact && noVoice && <p className="max-w-xs text-xs text-[var(--warn)]">この端末に韓国語の音声が見つかりません。端末の設定で韓国語音声（ko-KR）を追加してください。</p>}
      {err && <p className="text-xs text-[var(--danger)]">{err}</p>}
    </div>
  );
}
