"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Languages, Building2, Heart, History, Settings, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { APP_NAME } from "@/lib/config";
import { useAuth } from "@/lib/client/auth";
import { cx } from "./ui";

const KanjiIcon = ({ className }: { className?: string }) => <span className={className} style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "20px", lineHeight: 1, display: "inline-grid", placeItems: "center" }}>字</span>;

const NAV = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/kanji", label: "漢字", icon: KanjiIcon },
  { href: "/realestate", label: "不動産", icon: Building2 },
  { href: "/korean", label: "韓国語", icon: Languages },
  { href: "/favorites", label: "お気に入り", icon: Heart },
];
const SUB = [{ href: "/history", label: "履歴", icon: History }, { href: "/settings", label: "設定", icon: Settings }];
const active = (p: string, h: string) => (h === "/" ? p === "/" : p.startsWith(h));

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { session, configured, sync } = useAuth();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      {/* PC: サイドバー */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-1 border-r border-line bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] p-4 backdrop-blur-xl md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2 py-2">
          <span className="grad-bg grid size-9 place-items-center rounded-xl text-lg kanji-glyph">響</span>
          <span className="text-lg font-bold tracking-tight">{APP_NAME}</span>
        </Link>
        {[...NAV, ...SUB].map((n) => {
          const on = active(path, n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
              className={cx("relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition", on ? "text-text" : "text-text2 hover:bg-surface2 hover:text-text")}>
              {on && <motion.span layoutId="side-active" className="absolute inset-0 -z-10 rounded-xl border border-line bg-surface2" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <n.icon className={cx("size-5", on && "text-accent")} />{n.label}
            </Link>
          );
        })}
        <div className="mt-auto rounded-xl border border-line bg-surface p-3 text-xs text-text3">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-text2"><Sparkles className="size-3.5" />{session ? "クラウド同期中" : "ゲスト利用"}</div>
          {session ? (sync.phase === "error" ? <span className="text-[var(--danger)]">同期エラー</span> : sync.phase === "syncing" ? "同期しています…" : "最新の状態です") : configured ? "ログインすると端末間で同期できます" : "データはこの端末に保存されます"}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* スマホ: ヘッダー */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between px-4 md:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <Link href="/" className="flex items-center gap-2"><span className="grad-bg grid size-8 place-items-center rounded-lg kanji-glyph">響</span><span className="font-bold">{APP_NAME}</span></Link>
          <div className="flex gap-1">{SUB.map((n) => <Link key={n.href} href={n.href} aria-label={n.label} className={cx("grid size-10 place-items-center rounded-xl", active(path, n.href) ? "text-accent" : "text-text2")}><n.icon className="size-5" /></Link>)}</div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-32 pt-2 md:px-10 md:pb-16 md:pt-10">{children}</main>
      </div>

      {/* スマホ: 下部ナビ */}
      <nav aria-label="メインナビゲーション" className="glass pb-safe fixed inset-x-3 bottom-3 z-40 rounded-3xl p-1.5 shadow-2xl md:hidden">
        <ul className="grid grid-cols-5">
          {NAV.map((n) => {
            const on = active(path, n.href);
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={on ? "page" : undefined} className={cx("relative flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-medium transition active:scale-95", on ? "text-text" : "text-text3")}>
                  {on && <motion.span layoutId="tab-active" className="absolute inset-0 -z-10 rounded-2xl bg-surface3" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  <n.icon className={cx("size-[22px]", on && "text-accent")} />{n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
