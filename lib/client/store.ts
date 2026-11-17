"use client";
import { useRef, useSyncExternalStore } from "react";
import type { Kind } from "../config";

export type SavedItem = {
  key: string; kind: Kind; ref: string; title: string; subtitle: string;
  payload?: unknown; favorite: boolean; folder: string | null; updatedAt: number; deleted?: boolean;
};
export type HistoryItem = { id: string; kind: Kind; query: string; label?: string; at: number; deleted?: boolean };
export type Settings = {
  theme: "dark" | "light" | "system"; ttsRate: number; ttsSlowRate: number; ttsRepeat: number; voiceURI: string | null; reduceMotion: boolean | null; updatedAt: number;
};
export type State = { items: Record<string, SavedItem>; history: HistoryItem[]; settings: Settings; syncedAt: number | null };

const KEY = "lexa:v1";
export const DEFAULT_SETTINGS: Settings = { theme: "dark", ttsRate: 0.95, ttsSlowRate: 0.6, ttsRepeat: 1, voiceURI: null, reduceMotion: null, updatedAt: 0 };
const EMPTY: State = { items: {}, history: [], settings: DEFAULT_SETTINGS, syncedAt: null };

let state: State = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();
const changeHooks = new Set<(s: State) => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const p = JSON.parse(raw) as Partial<State>; state = { ...EMPTY, ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } }; }
  } catch { /* 壊れたデータは無視して初期化 */ }
}
function persist(notify = true) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 容量超過・プライベートモード */ }
  listeners.forEach((l) => l());
  if (notify) changeHooks.forEach((h) => h(state));
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => { if (e.key === KEY && e.newValue) { try { state = JSON.parse(e.newValue); listeners.forEach((l) => l()); } catch { /* noop */ } } });
}

export const getState = () => { load(); return state; };
export function useStore<T>(sel: (s: State) => T): T {
  // 派生値(配列など)が毎回新しい参照になると useSyncExternalStore が無限ループするため、state が同じなら前回の結果を返す
  const cache = useRef<{ s: State; v: T } | null>(null);
  const get = () => {
    const s = getState();
    if (cache.current && cache.current.s === s) return cache.current.v;
    const v = sel(s); cache.current = { s, v }; return v;
  };
  const server = useRef<T | null>(null);
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    get,
    () => (server.current ??= sel(EMPTY)),
  );
}
export const onLocalChange = (h: (s: State) => void) => { changeHooks.add(h); return () => changeHooks.delete(h); };
/** 同期エンジン専用: 通知フックを呼ばずに状態を置き換える（無限ループ防止） */
export function replaceState(next: State) { load(); state = next; persist(false); }
export function clearLocal() { load(); state = { ...EMPTY, settings: state.settings }; persist(true); }

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

export function toggleFavorite(item: Omit<SavedItem, "favorite" | "updatedAt" | "folder" | "key"> & { key?: string }) {
  load();
  const key = item.key ?? `${item.kind}:${item.ref}`;
  const cur = state.items[key];
  const fav = !(cur && cur.favorite && !cur.deleted);
  state = { ...state, items: { ...state.items, [key]: { ...cur, ...item, key, folder: cur?.folder ?? null, favorite: fav, deleted: !fav, updatedAt: Date.now() } } };
  persist();
  return fav;
}
export function setFolder(key: string, folder: string | null) {
  load();
  const cur = state.items[key]; if (!cur) return;
  state = { ...state, items: { ...state.items, [key]: { ...cur, folder, updatedAt: Date.now() } } };
  persist();
}
export function addHistory(kind: Kind, query: string, label?: string) {
  load();
  const q = query.trim(); if (!q) return;
  const dup = state.history.find((h) => !h.deleted && h.kind === kind && h.query === q && Date.now() - h.at < 60_000);
  if (dup) return;
  state = { ...state, history: [{ id: uid(), kind, query: q, label, at: Date.now() }, ...state.history].slice(0, 500) };
  persist();
}
export function clearHistory() {
  load();
  state = { ...state, history: state.history.map((h) => ({ ...h, deleted: true, at: h.at })) };
  // 論理削除を保持して端末間に伝播。ローカルでは不要になった分を後で間引く
  persist();
}
export function removeHistory(id: string) {
  load();
  state = { ...state, history: state.history.map((h) => (h.id === id ? { ...h, deleted: true } : h)) };
  persist();
}
export function updateSettings(patch: Partial<Settings>) {
  load();
  state = { ...state, settings: { ...state.settings, ...patch, updatedAt: Date.now() } };
  persist();
}
export const isFavorite = (s: State, key: string) => !!s.items[key] && s.items[key].favorite && !s.items[key].deleted;
export const activeHistory = (s: State) => s.history.filter((h) => !h.deleted).sort((a, b) => b.at - a.at);
export const activeFavorites = (s: State) => Object.values(s.items).filter((i) => i.favorite && !i.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
