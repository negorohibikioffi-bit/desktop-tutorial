"use client";
type T = { id: number; msg: string };
const subs = new Set<(t: T) => void>();
let id = 0;
export const toast = (msg: string) => { const t = { id: ++id, msg }; subs.forEach((s) => s(t)); };
export const onToast = (f: (t: T) => void) => { subs.add(f); return () => { subs.delete(f); }; };
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; } catch { return false; }
  }
}
