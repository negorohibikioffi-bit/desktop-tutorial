"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type ApiState<T> = { data: T | null; error: string | null; code: string | null; loading: boolean; reload: () => void };

async function request<T>(url: string, init: RequestInit | undefined, signal: AbortSignal): Promise<{ data?: T; error?: string; code?: string }> {
  try {
    const res = await fetch(url, { ...init, signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: body?.message ?? `サーバーエラー (${res.status})`, code: body?.error ?? String(res.status) };
    return { data: body as T };
  } catch (e) {
    if ((e as Error).name === "AbortError") return {};
    return { error: "通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。", code: "network" };
  }
}

/** url が null の間は何もしない。url 変更で自動再取得し、古いリクエストは破棄する。 */
export function useApi<T>(url: string | null, init?: RequestInit): ApiState<T> {
  const [st, setSt] = useState<{ data: T | null; error: string | null; code: string | null; loading: boolean }>({ data: null, error: null, code: null, loading: false });
  const [tick, setTick] = useState(0);
  const initRef = useRef(init); initRef.current = init;
  useEffect(() => {
    if (!url) { setSt({ data: null, error: null, code: null, loading: false }); return; }
    const ctrl = new AbortController();
    setSt((s) => ({ ...s, loading: true, error: null, code: null }));
    request<T>(url, initRef.current, ctrl.signal).then((r) => { if (!ctrl.signal.aborted) setSt({ data: r.data ?? null, error: r.error ?? null, code: r.code ?? null, loading: false }); });
    return () => ctrl.abort();
  }, [url, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...st, reload };
}

export async function postJSON<T>(url: string, body: unknown): Promise<{ data?: T; error?: string; code?: string }> {
  return request<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, new AbortController().signal);
}

/** URLの ?q= と入力欄を同期させる共通フック */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
export function useQueryParam() {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const [input, setInput] = useState(q);
  useEffect(() => setInput(q), [q]);
  const submit = useCallback((v?: string) => { const val = (v ?? input).trim(); setInput(val); router.push(val ? `${path}?q=${encodeURIComponent(val)}` : path, { scroll: false }); }, [input, path, router]);
  return { q, input, setInput, submit };
}
