"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Wand2, SearchX, ChevronRight } from "lucide-react";
import { SearchBar, CopyButton, FavButton, Badge, Notice, Skeletons, Empty, Sheet, Chip } from "./ui";
import { useApi, useQueryParam, useServerStatus } from "@/lib/client/useApi";
import { addHistory } from "@/lib/client/store";
import { POPULAR_RADICALS } from "@/lib/kanji/radicals";
import type { KanjiRecord, ParsedQuery } from "@/lib/kanji/search";

type Hit = KanjiRecord & { matchType: string; reason?: string };
type Resp = { parsed: ParsedQuery | null; hits: Hit[]; ai: Hit[] };

const MATCH_LABEL: Record<string, string> = { exact: "完全一致", component: "構成要素", reading: "読み", meaning: "意味", ai: "AI推定" };
const clean = (r: string) => r.replace(/[-]/g, "").replace(".", "（") + (r.includes(".") ? "）" : "");

export default function KanjiView() {
  const { q, input, setInput, submit } = useQueryParam();
  const status = useServerStatus();
  const [wantAI, setWantAI] = useState(false);
  const [open, setOpen] = useState<Hit | null>(null);
  useEffect(() => setWantAI(false), [q]);
  const base = useApi<Resp>(q ? `/api/kanji?q=${encodeURIComponent(q)}` : null);
  const ai = useApi<Resp>(q && wantAI ? `/api/kanji?q=${encodeURIComponent(q)}&ai=1` : null);

  useEffect(() => { if (q && base.data) addHistory("kanji", q, base.data.hits[0]?.c); }, [q, base.data]);
  const confirmed = base.data?.hits ?? [];
  const aiHits = ai.data?.ai ?? [];
  const interp = base.data?.parsed;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">漢字を探す</h1>
        <p className="mt-1 text-sm text-text2">部首・構成要素・読みから。「さんずいに青」のように話しかける感覚で。</p>
      </div>
      <SearchBar value={input} onChange={setInput} onSubmit={() => submit()} placeholder="例: さんずいに青 / にんべんに言 / せい" loading={base.loading} />

      {!q && (
        <section aria-label="部首から探す" className="grid gap-3">
          <h2 className="text-sm font-semibold text-text2">部首から探す</h2>
          <div className="flex flex-wrap gap-2">
            {POPULAR_RADICALS.map((r) => <Chip key={r.name} onClick={() => submit(r.ch)}><span className="kanji-glyph mr-1.5 text-base">{r.ch}</span>{r.name}</Chip>)}
          </div>
          <h2 className="mt-3 text-sm font-semibold text-text2">試してみる</h2>
          <div className="flex flex-wrap gap-2">{["さんずいに青", "にんべんに言", "くさかんむりに早", "しんにょうに告", "せい", "water"].map((s) => <Chip key={s} onClick={() => submit(s)}>{s}</Chip>)}</div>
        </section>
      )}

      {q && base.loading && !base.data && <Skeletons n={4} h={120} />}
      {base.error && <Notice tone="error" action={<button onClick={base.reload} className="rounded-lg bg-surface3 px-3 py-1 text-xs font-semibold">再試行</button>}>{base.error}</Notice>}

      {interp && (interp.components.length > 0 || interp.reading) && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-text2">
          解釈:
          {interp.components.map((c) => <span key={c} className="kanji-glyph rounded-lg border border-line bg-surface2 px-2.5 py-0.5 text-lg text-text">{c}</span>)}
          {interp.reading && <span className="rounded-lg border border-line bg-surface2 px-2.5 py-0.5 text-text">読み「{interp.reading}」</span>}
        </p>
      )}

      {base.data && confirmed.length > 0 && (
        <section aria-label="検索結果" className="grid gap-3">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-text2">候補 {confirmed.length}件<span className="ml-2 font-normal text-text3">（辞書データによる確定結果）</span></h2></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {confirmed.map((h, i) => <KanjiCard key={h.c} hit={h} i={i} onOpen={() => setOpen(h)} />)}
          </div>
        </section>
      )}

      {base.data && confirmed.length === 0 && q && !base.loading && (
        <Empty icon={<SearchX className="size-6" />} title="辞書データに該当する漢字が見つかりません" body="別の言い方（部首名や読み、例:「さんずい」「せい」）でも試してみてください。" />
      )}

      {base.data && q && status.ai && (
        <div className="grid gap-3">
          {!wantAI && <button onClick={() => setWantAI(true)} className="card flex items-center gap-3 p-4 text-left transition active:scale-[.99]"><span className="grad-bg grid size-10 place-items-center rounded-xl"><Wand2 className="size-5" /></span><span className="flex-1"><span className="block font-semibold">AIでもっと探す</span><span className="block text-sm text-text3">曖昧な説明を解釈して候補を提案します</span></span><ChevronRight className="size-5 text-text3" /></button>}
          {wantAI && ai.loading && <Skeletons n={1} h={90} />}
          {wantAI && ai.error && <Notice tone={ai.code === "ai_no_key" ? "info" : "error"}>{ai.code === "ai_no_key" ? "AI検索はまだ設定されていません（サーバーにAPIキーが必要です）。辞書による検索は通常どおり使えます。" : ai.error}</Notice>}
          {wantAI && ai.data && (aiHits.length === 0 ? <Notice tone="info">AIからの追加候補はありませんでした。</Notice> : (
            <section aria-label="AI推定の候補" className="grid gap-3">
              <div className="flex items-center gap-2"><Badge tone="ai">AI推定</Badge><span className="text-sm text-text3">辞書に実在する漢字のみ表示。確定結果ではありません</span></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{aiHits.map((h, i) => <KanjiCard key={h.c} hit={h} i={i} ai onOpen={() => setOpen(h)} />)}</div>
            </section>
          ))}
        </div>
      )}

      <KanjiDetail aiOn={status.ai} hit={open} onClose={() => setOpen(null)} onSearch={(s) => { setOpen(null); submit(s); }} />
    </div>
  );
}

function KanjiCard({ hit, i, ai, onOpen }: { hit: Hit; i: number; ai?: boolean; onOpen: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.25 }}
      className={`card group relative overflow-hidden ${ai ? "border-dashed" : ""}`}>
      <button onClick={onOpen} aria-label={`${hit.c} の詳細`} className="block w-full p-3 pb-2 text-left transition active:scale-[.98]">
        <div className="mb-1 flex items-center justify-between"><Badge tone={ai ? "ai" : "neutral"}>{MATCH_LABEL[hit.matchType] ?? hit.matchType}</Badge>{hit.j && <span className="text-[10px] font-semibold text-text3">N{hit.j}</span>}</div>
        <div className="kanji-glyph py-2 text-center text-[64px] leading-none">{hit.c}</div>
        <div className="mt-1 line-clamp-1 text-center text-xs text-text2">{[...hit.on.slice(0, 1), ...hit.kun.slice(0, 1).map(clean)].join("・")}</div>
      </button>
      <div className="flex justify-center pb-3"><CopyButton text={hit.c} size="sm" label={`${hit.c}をコピー`} /></div>
    </motion.div>
  );
}

function KanjiDetail({ aiOn, hit, onClose, onSearch }: { aiOn: boolean; hit: Hit | null; onClose: () => void; onSearch: (q: string) => void }) {
  const [ex, setEx] = useState<{ meaning: string; examples: string[] } | null>(null);
  const [exErr, setExErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { setEx(null); setExErr(null); setLoading(false); }, [hit?.c]);
  const parts = useMemo(() => hit?.d ?? [], [hit]);
  async function explain() {
    if (!hit) return; setLoading(true); setExErr(null);
    const res = await fetch(`/api/kanji/explain?c=${encodeURIComponent(hit.c)}`).then(async (x) => ({ ok: x.ok, b: await x.json().catch(() => null) })).catch(() => null);
    if (!res) setExErr("通信に失敗しました。もう一度お試しください。"); else if (!res.ok) setExErr(res.b?.error === "ai_no_key" ? "AIが未設定のため日本語の意味は表示できません（英語の意味は辞書データです）。" : res.b?.message ?? "取得に失敗しました"); else setEx(res.b);
    setLoading(false);
  }
  return (
    <Sheet open={!!hit} onClose={onClose} title={hit ? `${hit.c} の詳細` : ""}>
      {hit && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
          <div className="flex items-center gap-4">
            <div className="kanji-glyph grid size-32 shrink-0 place-items-center rounded-3xl bg-surface2 text-[88px] leading-none ring-1 ring-line" aria-label={`漢字 ${hit.c}`}>{hit.c}</div>
            <div className="grid min-w-0 flex-1 gap-2">
              <div className="flex flex-wrap gap-1.5">{hit.matchType === "ai" ? <Badge tone="ai">AI推定</Badge> : <Badge tone="ok">辞書データ</Badge>}{hit.g && <Badge>{hit.g <= 6 ? `小${hit.g}` : "中学以上"}</Badge>}{hit.j && <Badge>JLPT N{hit.j}</Badge>}{hit.s && <Badge>{hit.s}画</Badge>}</div>
              {hit.reason && <p className="text-xs text-text3">AIの根拠: {hit.reason}</p>}
              <div className="flex gap-2"><CopyButton text={hit.c} size="lg" label="漢字をコピー" /><FavButton item={{ kind: "kanji", ref: hit.c, title: hit.c, subtitle: [...hit.on.slice(0, 2), ...hit.kun.slice(0, 1).map(clean)].join("・") }} className="!size-12" /></div>
            </div>
          </div>
          <dl className="grid grid-cols-[minmax(0,1fr)] gap-3 text-sm">
            <Row label="音読み" value={hit.on.length ? hit.on.join("、") : "—"} copy={hit.on[0]} />
            <Row label="訓読み" value={hit.kun.length ? hit.kun.map(clean).join("、") : "—"} />
            <Row label="意味（英語）" value={hit.m.slice(0, 6).join(", ") || "—"} />
          </dl>
          {ex ? (
            <div className="rounded-2xl border border-line bg-surface2 p-4 text-sm"><div className="mb-1 flex items-center gap-2"><Badge tone="ai">AI解説</Badge></div><p className="leading-relaxed">{ex.meaning}</p>{ex.examples?.length > 0 && <p className="mt-2 text-text2">熟語: {ex.examples.join("、")}</p>}</div>
          ) : !aiOn ? null : (
            <div className="grid gap-2"><button onClick={explain} disabled={loading} className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface2 py-3 text-sm font-semibold transition active:scale-[.98] disabled:opacity-60"><Sparkles className="size-4 text-accent2" />{loading ? "取得中…" : "日本語の意味・熟語をAIで見る"}</button>{exErr && <p className="text-xs text-text3">{exErr}</p>}</div>
          )}
          {parts.length > 0 && (
            <div><h3 className="mb-2 text-xs font-semibold text-text3">構成要素{hit.ids && <span className="ml-2 font-normal">（{hit.ids}）</span>}</h3>
              <div className="flex flex-wrap gap-2">{parts.map((p) => <button key={p} onClick={() => onSearch(p)} className="kanji-glyph rounded-xl border border-line bg-surface2 px-3.5 py-1.5 text-2xl transition active:scale-95" aria-label={`${p} を含む漢字を探す`}>{p}</button>)}</div>
              <p className="mt-2 text-xs text-text3">タップすると、その部品を含む漢字を探せます。</p></div>
          )}
        </div>
      )}
    </Sheet>
  );
}
function Row({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return <div className="flex items-start gap-3 rounded-xl bg-surface2/60 px-4 py-3"><dt className="w-20 shrink-0 text-text3">{label}</dt><dd className="flex-1 leading-relaxed">{value}</dd>{copy && <CopyButton text={copy} size="sm" />}</div>;
}
