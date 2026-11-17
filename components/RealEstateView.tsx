"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, GitCompareArrows, ExternalLink, Sparkles, SearchX, Scale } from "lucide-react";
import { SearchBar, CopyButton, FavButton, Badge, Notice, Skeletons, Empty, Chip, cx } from "./ui";
import { useApi, useQueryParam, postJSON } from "@/lib/client/useApi";
import { addHistory } from "@/lib/client/store";
import type { Term, Comparison } from "@/lib/realestate/types";

type TermHit = Term & { relatedTerms: { id: string; name: string }[]; why?: string };
type Cmp = { a: TermHit; b: TermHit; data: Comparison | null };
type Resp = { hits: TermHit[]; compare: Cmp | null };
type AiTerm = { name: string; aliases?: string[]; short: string; detail: string; example: string; cautions: string[]; known?: boolean };
type AiCmp = { summary: string; rows: { label: string; a: string; b: string }[]; cautions: string[] };

const SAMPLES = ["サブリース", "集金代行", "三為契約", "抵当権抹消", "重要事項説明書", "固定資産税精算金", "サブリースと集金代行の違い"];

export default function RealEstateView() {
  const { q, input, setInput, submit } = useQueryParam();
  const [tray, setTray] = useState<TermHit[]>([]);
  const [cmpKey, setCmpKey] = useState<string | null>(null);
  const base = useApi<Resp>(q ? `/api/realestate?q=${encodeURIComponent(q)}` : null);
  const tray2 = useApi<Resp>(cmpKey ? `/api/realestate?cmp=${cmpKey}` : null);
  useEffect(() => { if (q && base.data) addHistory("term", q, base.data.hits[0]?.name); }, [q, base.data]);
  useEffect(() => { setCmpKey(null); }, [q]);

  const compare = tray2.data?.compare ?? base.data?.compare ?? null;
  const toggleTray = (t: TermHit) => setTray((cur) => (cur.find((x) => x.id === t.id) ? cur.filter((x) => x.id !== t.id) : [...cur, t].slice(-2)));

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">不動産用語辞典</h1>
        <p className="mt-1 text-sm text-text2">意味・実務例・注意点まで。「AとBの違い」で比較もできます。</p>
      </div>
      <SearchBar value={input} onChange={setInput} onSubmit={() => submit()} placeholder="例: サブリース / サブリースと集金代行の違い" loading={base.loading} />

      {!q && <div className="grid gap-3"><h2 className="text-sm font-semibold text-text2">試してみる</h2><div className="flex flex-wrap gap-2">{SAMPLES.map((s) => <Chip key={s} onClick={() => submit(s)}>{s}</Chip>)}</div></div>}
      {base.loading && !base.data && <Skeletons n={3} h={130} />}
      {base.error && <Notice tone="error" action={<button onClick={base.reload} className="rounded-lg bg-surface3 px-3 py-1 text-xs font-semibold">再試行</button>}>{base.error}</Notice>}

      {compare && <CompareCard cmp={compare} onSearch={submit} />}

      {base.data && base.data.hits.length > 0 && (
        <section className="grid gap-3" aria-label="検索結果">
          <h2 className="text-sm font-semibold text-text2">検索結果 {base.data.hits.length}件</h2>
          {base.data.hits.map((t, i) => <TermCard key={t.id} term={t} defaultOpen={i === 0} onSearch={submit} inTray={!!tray.find((x) => x.id === t.id)} onTray={() => toggleTray(t)} />)}
        </section>
      )}

      {base.data && base.data.hits.length === 0 && q && !compare && !base.loading && <NotFound q={q} />}

      <AnimatePresence>
        {tray.length > 0 && (
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="glass fixed inset-x-4 bottom-24 z-30 mx-auto flex max-w-xl items-center gap-3 rounded-2xl p-3 shadow-2xl md:bottom-6">
            <GitCompareArrows className="size-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1 truncate text-sm">{tray.map((t) => t.name.split("（")[0]).join(" ⇄ ")}{tray.length === 1 && <span className="text-text3"> — もう1つ選んでください</span>}</div>
            <button disabled={tray.length < 2} onClick={() => { setCmpKey(tray.map((t) => t.id).join(",")); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="grad-bg rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40">比較する</button>
            <button onClick={() => { setTray([]); setCmpKey(null); }} className="text-sm text-text3">クリア</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotFound({ q }: { q: string }) {
  const [state, setState] = useState<{ loading: boolean; data?: AiTerm; error?: string; code?: string }>({ loading: false });
  useEffect(() => setState({ loading: false }), [q]);
  async function ask() { setState({ loading: true }); const r = await postJSON<AiTerm>("/api/realestate/ai", { q }); setState({ loading: false, data: r.data, error: r.error, code: r.code }); }
  return (
    <div className="grid gap-3">
      <Empty icon={<SearchX className="size-6" />} title="辞書に該当する用語がありません" body="表記ゆれの可能性があります。別の言い方でも試すか、AIに解説を依頼できます（AI生成は確認済み情報と区別して表示します）。" />
      {!state.data && <button onClick={ask} disabled={state.loading} className="card flex items-center justify-center gap-2 p-4 font-semibold disabled:opacity-60"><Sparkles className="size-4 text-accent2" />{state.loading ? "AIが解説を作成中…" : `「${q}」をAIで解説する`}</button>}
      {state.error && <Notice tone={state.code === "ai_no_key" ? "info" : "error"}>{state.code === "ai_no_key" ? "AI解説はまだ設定されていません（サーバーにAPIキーが必要です）。" : state.error}</Notice>}
      {state.data && (state.data.known === false
        ? <Notice>AIは「{q}」を不動産用語として確認できませんでした。表記を確認してください。</Notice>
        : <div className="card grid gap-3 border-dashed p-5">
            <div className="flex flex-wrap items-center gap-2"><Badge tone="ai">AI生成・未確認</Badge><h3 className="text-lg font-bold">{state.data.name}</h3><CopyButton text={`${state.data.name}\n${state.data.short}\n${state.data.detail}`} size="sm" label="解説をコピー" /></div>
            <p className="font-medium">{state.data.short}</p><p className="text-sm leading-relaxed text-text2">{state.data.detail}</p>
            {state.data.example && <p className="rounded-xl bg-surface2 p-3 text-sm"><b className="text-text3">使用例　</b>{state.data.example}</p>}
            {state.data.cautions?.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-text2">{state.data.cautions.map((c, i) => <li key={i}>{c}</li>)}</ul>}
            <p className="text-xs text-text3">※ AIが生成した説明です。公的資料での確認は行われていません。実務で使う前に原典（法令・通達）を確認してください。</p>
          </div>)}
    </div>
  );
}

function SourcesBlock({ term }: { term: Term }) {
  return (
    <div className="grid gap-2 text-xs text-text3">
      <div className="flex flex-wrap items-center gap-2">
        {term.status === "verified" ? <Badge tone="ok">公的資料で確認済み</Badge> : <Badge tone="warn">編集済み草案・原典未確認</Badge>}
        <span>最終確認日: {term.checkedAt ?? "未確認"}</span>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">{term.sources.map((s) => <li key={s.label}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">{s.label}<ExternalLink className="size-3" /></a> : s.label}</li>)}</ul>
      <p>法改正で内容が変わる場合があります。実務では必ず最新の法令・原典で確認してください。</p>
    </div>
  );
}

function TermCard({ term, defaultOpen, onSearch, inTray, onTray }: { term: TermHit; defaultOpen?: boolean; onSearch: (q: string) => void; inTray: boolean; onTray: () => void }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const full = `${term.name}\n${term.short}\n\n${term.detail}\n\n【使用例】${term.example}\n\n【注意点】\n${term.cautions.map((c) => "・" + c).join("\n")}`;
  return (
    <motion.article layout="position" className="card overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <div className="mb-1 flex flex-wrap items-center gap-2"><Badge>{term.category}</Badge>{term.status !== "verified" && <Badge tone="warn">原典未確認</Badge>}</div>
          <h3 className="text-lg font-bold leading-snug">{term.name}</h3>
          {term.aliases.length > 0 && <p className="mt-0.5 text-xs text-text3">別名: {term.aliases.join("・")}</p>}
          <p className="mt-2 leading-relaxed text-text2">{term.short}</p>
        </button>
        <div className="flex shrink-0 flex-col gap-2"><CopyButton text={full} label="解説をコピー" /><FavButton item={{ kind: "term", ref: term.id, title: term.name, subtitle: term.short }} /></div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="grid gap-4 border-t border-line p-4 pt-4">
              <Block title="詳細解説"><p className="leading-relaxed">{term.detail}</p></Block>
              <Block title="実務での使用例"><p className="rounded-xl bg-surface2 p-3 leading-relaxed">{term.example}</p></Block>
              <Block title="注意点"><ul className="grid gap-2">{term.cautions.map((c, i) => <li key={i} className="flex gap-2 rounded-xl border border-[var(--warn)]/25 bg-[color-mix(in_oklab,var(--warn)_7%,transparent)] p-3 text-sm leading-relaxed"><span aria-hidden>⚠️</span>{c}</li>)}</ul></Block>
              {term.relatedTerms.length > 0 && <Block title="関連用語"><div className="flex flex-wrap gap-2">{term.relatedTerms.map((r) => <Chip key={r.id} onClick={() => onSearch(r.name.split("（")[0])}>{r.name.split("（")[0]}</Chip>)}</div></Block>}
              <SourcesBlock term={term} />
              <button onClick={onTray} className={cx("flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-[.98]", inTray ? "border-accent text-accent" : "border-line text-text2")}><Scale className="size-4" />{inTray ? "比較リストに追加済み" : "他の用語と比較する"}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={() => setOpen(!open)} aria-label={open ? "閉じる" : "詳細を開く"} className="flex w-full justify-center border-t border-line py-1.5 text-text3"><ChevronDown className={cx("size-5 transition", open && "rotate-180")} /></button>
    </motion.article>
  );
}
const Block = ({ title, children }: { title: string; children: React.ReactNode }) => <section><h4 className="mb-1.5 text-xs font-semibold tracking-wide text-text3">{title}</h4>{children}</section>;

function CompareCard({ cmp, onSearch }: { cmp: Cmp; onSearch: (q: string) => void }) {
  const [ai, setAi] = useState<{ loading: boolean; data?: AiCmp; error?: string; code?: string }>({ loading: false });
  const an = cmp.a.name.split("（")[0], bn = cmp.b.name.split("（")[0];
  useEffect(() => setAi({ loading: false }), [cmp.a.id, cmp.b.id]);
  const data = cmp.data; const aiData = ai.data;
  const rows = data?.rows ?? aiData?.rows ?? [];
  async function ask() { setAi({ loading: true }); const r = await postJSON<AiCmp>("/api/realestate/compare", { a: an, b: bn }); setAi({ loading: false, data: r.data, error: r.error, code: r.code }); }
  const copy = `${an} と ${bn} の違い\n${data?.summary ?? aiData?.summary ?? ""}\n` + rows.map((r) => `■${r.label}\n  ${an}: ${r.a}\n  ${bn}: ${r.b}`).join("\n");
  return (
    <section aria-label="比較" className="card grid gap-4 p-5" style={{ borderColor: "color-mix(in oklab, var(--accent) 40%, transparent)" }}>
      <div className="flex flex-wrap items-center gap-2"><GitCompareArrows className="size-5 text-accent" /><h2 className="text-lg font-bold"><span className="grad-text">{an}</span> と <span className="grad-text">{bn}</span> の違い</h2>{rows.length > 0 && <CopyButton text={copy} size="sm" label="比較をコピー" className="ml-auto" />}</div>
      {data ? <><Badge tone="warn">編集済み草案・原典未確認</Badge></> : aiData ? <Badge tone="ai">AI生成・未確認</Badge> : null}
      {(data?.summary ?? aiData?.summary) && <p className="rounded-xl bg-surface2 p-3 leading-relaxed">{data?.summary ?? aiData?.summary}</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
          <thead><tr className="text-left text-text3"><th className="w-28 pb-2 font-medium">観点</th><th className="pb-2 font-semibold text-text">{an}</th><th className="pb-2 font-semibold text-text">{bn}</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="align-top"><th className="border-t border-line py-3 pr-3 text-left font-medium text-text3">{r.label}</th><td className="border-t border-line py-3 pr-3 leading-relaxed">{r.a}</td><td className="border-t border-line py-3 leading-relaxed">{r.b}</td></tr>)}</tbody>
        </table></div>
      )}
      {!data && !aiData && (
        <div className="grid gap-2"><p className="text-sm text-text2">この組み合わせの比較表は未作成です。AIで比較表を作れます（確認済み情報とは区別して表示）。</p>
          <button onClick={ask} disabled={ai.loading} className="grad-bg rounded-xl py-3 font-semibold disabled:opacity-60">{ai.loading ? "AIが作成中…" : "AIで比較表を作る"}</button>
          {ai.error && <Notice tone={ai.code === "ai_no_key" ? "info" : "error"}>{ai.code === "ai_no_key" ? "AIが未設定です（サーバーにAPIキーが必要です）。" : ai.error}</Notice>}</div>
      )}
      {(data?.cautions ?? aiData?.cautions ?? []).map((c, i) => <Notice key={i}>{c}</Notice>)}
      <div className="flex flex-wrap gap-2 text-sm"><Chip onClick={() => onSearch(an)}>{an}の詳細</Chip><Chip onClick={() => onSearch(bn)}>{bn}の詳細</Chip></div>
    </section>
  );
}
