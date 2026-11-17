"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getState, replaceState, onLocalChange, type State, type SavedItem, type HistoryItem } from "./store";

export type SyncStatus = { phase: "off" | "idle" | "syncing" | "error" | "offline"; lastAt: number | null; message?: string };
let status: SyncStatus = { phase: "off", lastAt: null };
const subs = new Set<(s: SyncStatus) => void>();
const setStatus = (s: SyncStatus) => { status = s; subs.forEach((f) => f(s)); };
export const getSyncStatus = () => status;
export const subscribeSync = (f: (s: SyncStatus) => void) => { subs.add(f); return () => { subs.delete(f); }; };

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (s: string) => new Date(s).getTime();

/** 端末のローカル状態とクラウドを「最終更新が新しい方を採用」でマージし、双方向に反映する。 */
export async function syncNow(sb: SupabaseClient, userId: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) { setStatus({ ...status, phase: "offline" }); return; }
  setStatus({ ...status, phase: "syncing" });
  try {
    const local = getState();
    const [items, hist, settings] = await Promise.all([
      sb.from("saved_items").select("*").eq("user_id", userId),
      sb.from("search_history").select("*").eq("user_id", userId).order("at", { ascending: false }).limit(1000),
      sb.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    if (items.error) throw items.error; if (hist.error) throw hist.error; if (settings.error) throw settings.error;

    // saved_items
    const mergedItems: Record<string, SavedItem> = { ...local.items };
    const pushItems: SavedItem[] = [];
    const remoteByKey = new Map((items.data ?? []).map((r) => [r.key as string, r]));
    for (const r of items.data ?? []) {
      const remote: SavedItem = { key: r.key, kind: r.kind, ref: r.ref, title: r.title, subtitle: r.subtitle ?? "", payload: r.payload ?? undefined, favorite: r.favorite, folder: r.folder, deleted: r.deleted, updatedAt: ms(r.updated_at) };
      const l = local.items[r.key];
      if (!l || remote.updatedAt > l.updatedAt) mergedItems[r.key] = remote;
    }
    for (const l of Object.values(local.items)) {
      const r = remoteByKey.get(l.key);
      if (!r || l.updatedAt > ms(r.updated_at)) pushItems.push(l);
    }
    // history（追記型。idで突合し、削除フラグはどちらかがtrueなら削除）
    const histMap = new Map<string, HistoryItem>(local.history.map((h) => [h.id, h]));
    const remoteHist = new Map((hist.data ?? []).map((r) => [r.id as string, r]));
    const pushHist: HistoryItem[] = [];
    for (const r of hist.data ?? []) {
      const l = histMap.get(r.id);
      histMap.set(r.id, { id: r.id, kind: r.kind, query: r.query, label: r.label ?? undefined, at: ms(r.at), deleted: !!(r.deleted || l?.deleted) });
      if (l?.deleted && !r.deleted) pushHist.push({ ...l });
    }
    for (const l of local.history) if (!remoteHist.has(l.id)) pushHist.push(l);
    const mergedHist = [...histMap.values()].sort((a, b) => b.at - a.at).slice(0, 1000);
    // settings
    let mergedSettings = local.settings; let pushSettings = false;
    if (settings.data) {
      const rAt = ms(settings.data.updated_at);
      if (rAt > local.settings.updatedAt) mergedSettings = { ...local.settings, ...(settings.data.data as object), updatedAt: rAt };
      else if (local.settings.updatedAt > rAt) pushSettings = true;
    } else if (local.settings.updatedAt > 0) pushSettings = true;

    if (pushItems.length) {
      const { error } = await sb.from("saved_items").upsert(pushItems.map((i) => ({ user_id: userId, key: i.key, kind: i.kind, ref: i.ref, title: i.title, subtitle: i.subtitle, payload: i.payload ?? null, favorite: i.favorite, folder: i.folder, deleted: !!i.deleted, updated_at: iso(i.updatedAt) })));
      if (error) throw error;
    }
    if (pushHist.length) {
      const { error } = await sb.from("search_history").upsert(pushHist.map((h) => ({ user_id: userId, id: h.id, kind: h.kind, query: h.query, label: h.label ?? null, at: iso(h.at), deleted: !!h.deleted })));
      if (error) throw error;
    }
    if (pushSettings) {
      const { updatedAt, ...data } = local.settings;
      const { error } = await sb.from("user_settings").upsert({ user_id: userId, data, updated_at: iso(updatedAt) });
      if (error) throw error;
    }
    const next: State = { items: mergedItems, history: mergedHist, settings: mergedSettings, syncedAt: Date.now() };
    replaceState(next);
    setStatus({ phase: "idle", lastAt: Date.now() });
  } catch (e) {
    setStatus({ phase: "error", lastAt: status.lastAt, message: (e as { message?: string })?.message ?? "同期に失敗しました" });
  }
}

let stop: (() => void) | null = null;
/** ログイン中: 変更をデバウンス同期し、フォーカス復帰・オンライン復帰・定期で取り込む */
export function startSync(sb: SupabaseClient, userId: string) {
  stopSync();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => void syncNow(sb, userId);
  const off = onLocalChange(() => { clearTimeout(timer); timer = setTimeout(run, 1500); });
  const onFocus = () => { if (document.visibilityState === "visible") run(); };
  const interval = setInterval(run, 60_000);
  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", onFocus);
  run();
  stop = () => { off(); clearTimeout(timer); clearInterval(interval); window.removeEventListener("online", run); document.removeEventListener("visibilitychange", onFocus); };
}
export function stopSync() { stop?.(); stop = null; setStatus({ phase: "off", lastAt: status.lastAt }); }
