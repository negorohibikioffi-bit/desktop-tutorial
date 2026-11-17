"use client";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { AuthProvider } from "@/lib/client/auth";
import { useStore } from "@/lib/client/store";
import { onToast } from "./toast";

function ThemeSync() {
  const theme = useStore((s) => s.settings.theme);
  const rm = useStore((s) => s.settings.reduceMotion);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem("lexa:theme", theme); } catch {} }, [theme]);
  useEffect(() => { document.documentElement.dataset.reduceMotion = String(rm === true); }, [rm]);
  useEffect(() => { if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);
  return null;
}

function Toaster() {
  const [t, setT] = useState<{ id: number; msg: string } | null>(null);
  useEffect(() => onToast((x) => { setT(x); setTimeout(() => setT((c) => (c?.id === x.id ? null : c)), 1800); }), []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center md:bottom-8">
      <AnimatePresence>
        {t && (
          <motion.div key={t.id} initial={{ y: 16, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 8, opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 32 }}
            className="glass flex max-w-[90vw] items-center gap-2 rounded-full px-4 py-2.5 text-sm shadow-xl">
            <CheckCircle2 className="size-4 shrink-0 text-[var(--ok)]" /><span className="truncate">{t.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider><ThemeSync />{children}<Toaster /></AuthProvider>
    </MotionConfig>
  );
}
