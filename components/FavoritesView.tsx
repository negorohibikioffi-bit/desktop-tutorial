"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, FolderOpen, Trash2 } from "lucide-react";
import { Chip, Empty, CopyButton, Badge } from "./ui";
import { KINDS, kindMeta, type Kind } from "@/lib/config";
import { useStore, activeFavorites, toggleFavorite, setFolder, type SavedItem } from "@/lib/client/store";
import { toast } from "./toast";

function hrefOf(i: SavedItem) {
  const m = kindMeta(i.kind);
  let q = i.ref;
  if (i.kind === "term") q = i.title.split("（")[0];
  if (i.kind === "korean") { const p = i.payload as { ja?: string[] } | undefined; q = p?.ja?.[0] ?? i.subtitle.split("（")[0]; }
  return `${m.path}?q=${encodeURIComponent(q)}`;
}

export default function FavoritesView() {
  const items = useStore((s) => activeFavorites(s));
  const [kind, setKind] = useState<Kind | "all">("all");
  const [folder, setFolderFilter] = useState<string | "all" | "none">("all");
  const [editing, setEditing] = useState<string | null>(null);
  const folders = useMemo(() => [...new Set(items.map((i) => i.folder).filter(Boolean) as string[])], [items]);
  const list = items.filter((i) => (kind === "all" || i.kind === kind) && (folder === "all" || (folder === "none" ? !i.folder : i.folder === folder)));

  return (
    <div className="grid gap-5">
      <div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">お気に入り</h1><p className="mt-1 text-sm text-text2">漢字・不動産用語・韓国語をまとめて管理。フォルダで分類できます。</p></div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <Chip active={kind === "all"} onClick={() => setKind("all")}>すべて {items.length}</Chip>
        {KINDS.map((k) => <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>{k.label} {items.filter((i) => i.kind === k.id).length}</Chip>)}
      </div>
      {folders.length > 0 && <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1"><Chip active={folder === "all"} onClick={() => setFolderFilter("all")}>全フォルダ</Chip><Chip active={folder === "none"} onClick={() => setFolderFilter("none")}>未分類</Chip>{folders.map((f) => <Chip key={f} active={folder === f} onClick={() => setFolderFilter(f)}><FolderOpen className="mr-1 inline size-3.5" />{f}</Chip>)}</div>}

      {list.length === 0 ? <Empty icon={<Heart className="size-6" />} title="お気に入りはまだありません" body="検索結果のハートをタップすると、ここに保存されます。" /> : (
        <ul className="grid gap-3">
          <AnimatePresence initial={false}>
            {list.map((i) => (
              <motion.li key={i.key} layout exit={{ opacity: 0, x: -30 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-4">
                <div className="flex items-center gap-3">
                  <Link href={hrefOf(i)} className="flex min-w-0 flex-1 items-center gap-4">
                    {i.kind === "kanji" ? <span className="kanji-glyph grid size-14 shrink-0 place-items-center rounded-2xl bg-surface2 text-4xl">{i.title}</span> : <Badge>{kindMeta(i.kind).short}</Badge>}
                    <span className="min-w-0"><span className={`block truncate font-semibold ${i.kind === "korean" ? "text-lg" : ""}`}>{i.kind === "kanji" ? i.subtitle || i.title : i.title}</span>{i.kind !== "kanji" && <span className="block truncate text-sm text-text3">{i.subtitle}</span>}{i.folder && <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-accent"><FolderOpen className="size-3" />{i.folder}</span>}</span>
                  </Link>
                  <CopyButton text={i.title} size="sm" />
                  <button aria-label="フォルダを設定" onClick={() => setEditing(editing === i.key ? null : i.key)} className="grid size-8 place-items-center rounded-xl border border-line bg-surface2 text-text2"><FolderOpen className="size-4" /></button>
                  <button aria-label="お気に入りから外す" onClick={() => { toggleFavorite({ kind: i.kind, ref: i.ref, title: i.title, subtitle: i.subtitle }); toast("お気に入りから外しました"); }} className="grid size-8 place-items-center rounded-xl border border-line bg-surface2 text-text2"><Trash2 className="size-4" /></button>
                </div>
                {editing === i.key && <FolderEditor folders={folders} current={i.folder} onPick={(f) => { setFolder(i.key, f); setEditing(null); }} />}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function FolderEditor({ folders, current, onPick }: { folders: string[]; current: string | null; onPick: (f: string | null) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="mt-3 grid gap-2 border-t border-line pt-3">
      <div className="flex flex-wrap gap-2">{folders.map((f) => <Chip key={f} active={current === f} onClick={() => onPick(f)}>{f}</Chip>)}{current && <Chip onClick={() => onPick(null)}>未分類に戻す</Chip>}</div>
      <form onSubmit={(e) => { e.preventDefault(); const t = v.trim().slice(0, 24); if (t) onPick(t); }} className="flex gap-2"><input value={v} onChange={(e) => setV(e.target.value)} placeholder="新しいフォルダ名" aria-label="新しいフォルダ名" className="min-w-0 flex-1 rounded-xl border border-line bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent" /><button className="grad-bg rounded-xl px-4 text-sm font-semibold">作成</button></form>
    </div>
  );
}
