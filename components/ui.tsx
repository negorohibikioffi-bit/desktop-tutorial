"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Heart, Search, X, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { copyText, toast } from "./toast";
import { toggleFavorite, useStore, isFavorite, type SavedItem } from "@/lib/client/store";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export function SearchBar({ value, onChange, onSubmit, placeholder, loading, autoFocus, large }: { value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string; loading?: boolean; autoFocus?: boolean; large?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); onSubmit(); ref.current?.blur(); }}
      className={cx("glass flex items-center gap-3 rounded-2xl px-4 transition focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_4px_var(--accent-soft)]", large ? "h-16" : "h-14")}>
      {loading ? <Loader2 className="size-5 shrink-0 animate-spin text-accent" /> : <Search className="size-5 shrink-0 text-text3" />}
      <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} enterKeyHint="search"
        aria-label="検索" autoComplete="off" autoCapitalize="off" spellCheck={false}
        className={cx("min-w-0 flex-1 bg-transparent outline-none placeholder:text-text3", large ? "text-lg" : "text-base")} />
      {value && <button type="button" aria-label="入力を消す" onClick={() => { onChange(""); ref.current?.focus(); }} className="grid size-7 place-items-center rounded-full bg-surface3 text-text2 hover:text-text"><X className="size-4" /></button>}
      <button type="submit" className="grad-bg h-10 shrink-0 rounded-xl px-4 text-sm font-semibold active:scale-95 transition">検索</button>
    </form>
  );
}

export function CopyButton({ text, label = "コピー", className, size = "md" }: { text: string; label?: string; className?: string; size?: "sm" | "md" | "lg" }) {
  const [done, setDone] = useState(false);
  const dim = size === "lg" ? "size-12" : size === "sm" ? "size-8" : "size-10";
  return (
    <button type="button" aria-label={`${label}: ${text}`} title={label}
      onClick={async (e) => { e.stopPropagation(); const ok = await copyText(text); if (ok) { setDone(true); toast(`「${text.length > 16 ? text.slice(0, 16) + "…" : text}」をコピーしました`); setTimeout(() => setDone(false), 1400); } else toast("コピーに失敗しました。長押しで選択してください"); }}
      className={cx("relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface2 text-text2 transition hover:text-text active:scale-90", dim, done && "!border-[var(--ok)] !text-[var(--ok)]", className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={done ? "ok" : "cp"} initial={{ scale: 0.4, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.16 }}>
          {done ? <Check className="size-[1.1em]" strokeWidth={3} /> : <Copy className="size-[1.1em]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export function FavButton({ item, className }: { item: Omit<SavedItem, "favorite" | "updatedAt" | "folder" | "key"> & { key?: string }; className?: string }) {
  const key = item.key ?? `${item.kind}:${item.ref}`;
  const fav = useStore((s) => isFavorite(s, key));
  return (
    <button type="button" aria-pressed={fav} aria-label={fav ? "お気に入りから外す" : "お気に入りに追加"}
      onClick={(e) => { e.stopPropagation(); const on = toggleFavorite(item); toast(on ? "お気に入りに追加しました" : "お気に入りから外しました"); }}
      className={cx("grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface2 transition active:scale-90", fav ? "text-[#ff6b8a]" : "text-text2 hover:text-text", className)}>
      <motion.span key={String(fav)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
        <Heart className="size-[1.1em]" fill={fav ? "currentColor" : "none"} />
      </motion.span>
    </button>
  );
}

export function Chip({ active, children, onClick, className }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={cx("shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition active:scale-95", active ? "border-transparent grad-bg font-semibold" : "border-line bg-surface2 text-text2 hover:text-text", className)}>{children}</button>;
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; className?: string }) {
  return (
    <div role="tablist" className={cx("relative inline-flex rounded-xl border border-line bg-surface2 p-1", className)}>
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)} className={cx("relative z-10 rounded-lg px-4 py-1.5 text-sm font-medium transition", value === o.id ? "text-white" : "text-text2 hover:text-text")}>
          {value === o.id && <motion.span layoutId={`seg-${options.map((x) => x.id).join("")}`} className="grad-bg absolute inset-0 -z-10 rounded-lg" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ai" | "ok" | "warn"; children: ReactNode }) {
  const t = { neutral: "bg-surface3 text-text2", ai: "bg-[color-mix(in_oklab,var(--accent-2)_20%,transparent)] text-[var(--accent-2)]", ok: "bg-[color-mix(in_oklab,var(--ok)_16%,transparent)] text-[var(--ok)]", warn: "bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] text-[var(--warn)]" }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide", t)}>{tone === "ai" && <Sparkles className="size-3" />}{children}</span>;
}

export function Notice({ tone = "warn", children, action }: { tone?: "warn" | "error" | "info"; children: ReactNode; action?: ReactNode }) {
  const c = tone === "error" ? "border-[var(--danger)]/40 bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]" : tone === "info" ? "border-line bg-surface2" : "border-[var(--warn)]/35 bg-[color-mix(in_oklab,var(--warn)_9%,transparent)]";
  return <div role={tone === "error" ? "alert" : "note"} className={cx("flex items-start gap-3 rounded-2xl border p-4 text-sm leading-relaxed", c)}><AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warn)]" /><div className="min-w-0 flex-1">{children}</div>{action}</div>;
}

export function Skeletons({ n = 3, h = 96 }: { n?: number; h?: number }) {
  return <div className="grid gap-3" aria-busy="true" aria-label="読み込み中">{Array.from({ length: n }).map((_, i) => <div key={i} className="skeleton" style={{ height: h }} />)}</div>;
}

export function Empty({ icon, title, body }: { icon: ReactNode; title: string; body?: string }) {
  return <div className="grid place-items-center gap-3 px-6 py-14 text-center"><div className="grid size-14 place-items-center rounded-2xl bg-surface2 text-text3">{icon}</div><p className="font-semibold">{title}</p>{body && <p className="max-w-sm text-sm text-text3">{body}</p>}</div>;
}

export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus?.(); };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div ref={ref} tabIndex={-1}
            className="card relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-b-none outline-none md:max-w-xl md:rounded-3xl"
            initial={{ y: 60, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.4 }} onDragEnd={(_, i) => { if (i.offset.y > 120) onClose(); }} dragListener={false}>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-gradient-to-b from-[var(--surface)] to-transparent p-3 pl-5">
              <span className="mx-auto absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-surface3 md:hidden" />
              <span className="sr-only">{title}</span><span />
              <button onClick={onClose} aria-label="閉じる" className="grid size-9 place-items-center rounded-full bg-surface2 text-text2 hover:text-text"><X className="size-4" /></button>
            </div>
            <div className="px-5 pb-8 pt-0">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
