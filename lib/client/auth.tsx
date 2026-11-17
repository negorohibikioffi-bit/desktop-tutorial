"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { startSync, stopSync, subscribeSync, getSyncStatus, type SyncStatus } from "./sync";

type Ctx = { session: Session | null; ready: boolean; configured: boolean; sync: SyncStatus };
const AuthCtx = createContext<Ctx>({ session: null, ready: false, configured: false, sync: { phase: "off", lastAt: null } });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncStatus>(getSyncStatus());
  const sb = typeof window !== "undefined" ? getSupabase() : null;

  useEffect(() => subscribeSync(setSync), []);
  useEffect(() => {
    if (!sb) { setReady(true); return; }
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);
  useEffect(() => {
    if (!sb) return;
    if (session?.user) startSync(sb, session.user.id); else stopSync();
    return () => stopSync();
  }, [sb, session?.user?.id, session?.user]);

  return <AuthCtx.Provider value={{ session, ready, configured: !!sb, sync }}>{children}</AuthCtx.Provider>;
}
