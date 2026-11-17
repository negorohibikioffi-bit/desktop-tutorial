"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { History as HistoryIcon, X, Trash2 } from "lucide-react";
import { Chip, Empty } from "./ui";
import { KINDS, kindMeta, type Kind } from "@/lib/config";
import { useStore, activeHistory, removeHistory, clearHistory } from "@/lib/client/store";

const dayLabel = (t: number) => {
  const d = new Date(t), n = new Date(); const diff = Math.floor((new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  return diff === 0 ? "今日" : diff === 1 ? "昨日" : d.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
};

export default function HistoryView() {
  const all = useStore((s) => activeHistory(s));
  const [kind, setKind] = useState<Kind | "all">("all");
  const [confirm, setConfirm] = useState(false);
  const list = all.filter((h) => kind === "all" || h.kind === kind);
  const groups = useMemo(() => { const m = new Map<string, typeof list>(); for (const h of list) { const k = dayLabel(h.at); m.set(k, [...(m.get(k) ?? []), h]); } return [...m]; }, [list]);
  return (
    <div className="grid gap-5">
      <div className="flex items-end justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">検索履歴</h1><p className="mt-1 text-sm text-text2">調べた内容を時系列で。タップでもう一度検索。</p></div>
        {all.length > 0 && (confirm ? <div className="flex gap-2 text-sm"><button onClick={() => { clearHistory(); setConfirm(false); }} className="rounded-xl bg-[var(--danger)] px-3 py-2 font-semibold text-white">全削除する</button><button onClick={() => setConfirm(false)} className="rounded-xl bg-surface2 px-3 py-2">やめる</button></div> : <button onClick={() => setConfirm(true)} className="flex items-center gap-1.5 rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-text2"><Trash2 className="size-4" />全削除</button>)}</div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar"><Chip active={kind === "all"} onClick={() => setKind("all")}>すべて</Chip>{KINDS.map((k) => <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</Chip>)}</div>
      {list.length === 0 ? <Empty icon={<HistoryIcon className="size-6" />} title="履歴はありません" body="検索すると、ここに自動で記録されます。" /> : groups.map(([label, hs]) => (
        <section key={label} className="grid gap-2"><h2 className="text-xs font-semibold text-text3">{label}</h2>
          <ul className="card divide-y divide-[var(--line)] overflow-hidden">{hs.map((h) => (
            <li key={h.id} className="flex items-center"><Link href={`${kindMeta(h.kind).path}?q=${encodeURIComponent(h.query)}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 active:bg-surface2"><span className="w-14 shrink-0 text-xs text-text3">{kindMeta(h.kind).short}</span><span className="min-w-0 flex-1 truncate">{h.query}</span>{h.label && h.label !== h.query && <span className={`shrink-0 text-text2 ${h.kind === "kanji" ? "kanji-glyph text-xl" : "text-sm"}`}>{h.label}</span>}<span className="shrink-0 text-xs text-text3">{new Date(h.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span></Link>
              <button aria-label="この履歴を削除" onClick={() => removeHistory(h.id)} className="grid size-12 place-items-center text-text3 hover:text-text"><X className="size-4" /></button></li>))}</ul></section>
      ))}
    </div>
  );
}
