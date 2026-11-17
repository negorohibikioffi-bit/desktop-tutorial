"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUpRight, Building2, Languages, Clock } from "lucide-react";
import { SearchBar, Segmented } from "./ui";
import { KINDS, APP_NAME, APP_TAGLINE, type Kind } from "@/lib/config";
import { useStore, activeHistory, activeFavorites } from "@/lib/client/store";

const CARDS = [
  { kind: "kanji" as Kind, title: "漢字検索", desc: "「さんずいに青」で清が見つかる。部首・構成要素・読みから。", ex: "さんずいに青 → 清", glyph: "字" },
  { kind: "term" as Kind, title: "不動産用語辞典", desc: "意味・実務例・注意点・関連用語。2語の比較もワンタップ。", ex: "サブリース vs 集金代行", icon: Building2 },
  { kind: "korean" as Kind, title: "韓国語", desc: "ネイティブが使う自然な表現。音声・スラング・タメ口と敬語。", ex: "それガチ？ → 그거 진짜야?", icon: Languages },
];

export default function HomeView() {
  const router = useRouter();
  const [mode, setMode] = useState<Kind>("kanji");
  const [q, setQ] = useState("");
  const meta = KINDS.find((k) => k.id === mode)!;
  const recent = useStore((s) => activeHistory(s).slice(0, 6));
  const favCount = useStore((s) => activeFavorites(s).length);
  const go = () => { const v = q.trim(); router.push(v ? `${meta.path}?q=${encodeURIComponent(v)}` : meta.path); };

  return (
    <div className="grid gap-8">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="grid gap-5 pt-2 md:pt-6">
        <div>
          <p className="text-sm font-medium text-text3">{APP_NAME}</p>
          <h1 className="mt-1 text-[34px] font-bold leading-[1.15] tracking-tight md:text-5xl">調べる、<span className="grad-text">すぐ。</span><br className="md:hidden" />美しく。</h1>
          <p className="mt-3 text-text2">{APP_TAGLINE}</p>
        </div>
        <div className="grid gap-3">
          <Segmented<Kind> value={mode} onChange={setMode} options={KINDS.map((k) => ({ id: k.id, label: k.short }))} className="self-start" />
          <SearchBar large value={q} onChange={setQ} onSubmit={go} placeholder={`${meta.label}を検索 — 例: ${meta.hint}`} />
        </div>
      </motion.section>

      <section aria-label="機能" className="grid gap-3 md:grid-cols-3">
        {CARDS.map((c, i) => (
          <motion.div key={c.kind} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.06 }}>
            <Link href={KINDS.find((k) => k.id === c.kind)!.path} className="card group relative flex h-full flex-col gap-3 overflow-hidden p-5 transition hover:border-[var(--line-strong)] active:scale-[.99]">
              <div className="flex items-center justify-between"><span className="grad-bg grid size-11 place-items-center rounded-2xl text-xl">{c.glyph ? <span className="kanji-glyph font-bold">{c.glyph}</span> : c.icon && <c.icon className="size-5" />}</span><ArrowUpRight className="size-5 text-text3 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-text" /></div>
              <h2 className="text-lg font-bold">{c.title}</h2>
              <p className="text-sm leading-relaxed text-text2">{c.desc}</p>
              <p className="mt-auto rounded-lg bg-surface2 px-3 py-1.5 text-xs text-text3">{c.ex}</p>
            </Link>
          </motion.div>
        ))}
      </section>

      {recent.length > 0 && (
        <section aria-label="最近調べたもの" className="grid gap-3">
          <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold text-text2"><Clock className="size-4" />最近調べたもの</h2><Link href="/history" className="text-sm text-accent">すべて見る</Link></div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {recent.map((h) => { const m = KINDS.find((k) => k.id === h.kind)!; return <Link key={h.id} href={`${m.path}?q=${encodeURIComponent(h.query)}`} className="flex shrink-0 items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm transition active:scale-95"><span className="text-xs text-text3">{m.short}</span>{h.query}</Link>; })}
          </div>
        </section>
      )}
      {favCount > 0 && <Link href="/favorites" className="card flex items-center justify-between p-4 text-sm"><span>お気に入り <b className="ml-1 text-accent">{favCount}</b> 件</span><ArrowUpRight className="size-4 text-text3" /></Link>}
    </div>
  );
}
