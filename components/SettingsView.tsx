"use client";
import { useEffect, useState } from "react";
import { Cloud, CloudOff, LogOut, RefreshCw, Volume2, Download, Trash2, Mail } from "lucide-react";
import { Segmented, Notice, Badge, cx } from "./ui";
import { useAuth } from "@/lib/client/auth";
import { getSupabase } from "@/lib/client/supabase";
import { syncNow } from "@/lib/client/sync";
import { useStore, updateSettings, clearHistory, clearLocal, getState, activeFavorites, activeHistory } from "@/lib/client/store";
import { koreanVoices, speak, ttsSupported } from "@/lib/client/tts";
import { toast } from "./toast";
import { APP_NAME } from "@/lib/config";

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="card grid gap-4 p-5"><h2 className="text-sm font-semibold text-text2">{title}</h2>{children}</section>;
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm">{label}</span>{children}</div>;

export default function SettingsView() {
  const st = useStore((s) => s.settings);
  const favs = useStore((s) => activeFavorites(s).length);
  const hist = useStore((s) => activeHistory(s).length);
  const syncedAt = useStore((s) => s.syncedAt);
  const { session, configured, sync, ready } = useAuth();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [tts, setTts] = useState(true); // SSRとの不一致を避けるためマウント後に判定
  const [confirmDel, setConfirmDel] = useState<null | "history" | "all">(null);
  useEffect(() => { setTts(ttsSupported()); const f = () => setVoices(koreanVoices()); f(); if (ttsSupported()) speechSynthesis.onvoiceschanged = f; }, []);

  function exportData() {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${APP_NAME.toLowerCase()}-backup.json`; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">設定</h1>

      <Card title="アカウントと同期">
        {!configured ? (
          <Notice tone="info">クラウド同期はまだ設定されていません（Supabaseの環境変数が未設定）。現在はゲストとして、データはこの端末のみに保存されます。設定手順は README を参照してください。</Notice>
        ) : !ready ? <div className="skeleton h-16" /> : session ? (
          <>
            <Row label="ログイン中"><span className="truncate text-sm text-text2">{session.user.email}</span></Row>
            <Row label="同期状態">
              <span className="flex items-center gap-2 text-sm">{sync.phase === "error" ? <CloudOff className="size-4 text-[var(--danger)]" /> : <Cloud className="size-4 text-[var(--ok)]" />}
                {sync.phase === "syncing" ? "同期中…" : sync.phase === "error" ? "同期エラー" : sync.phase === "offline" ? "オフライン" : "最新"}
                {(sync.lastAt ?? syncedAt) && <span className="text-text3">{new Date((sync.lastAt ?? syncedAt)!).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>}</span>
            </Row>
            {sync.phase === "error" && <Notice tone="error">{sync.message ?? "同期に失敗しました。ネットワークを確認して再試行してください。"}</Notice>}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { const sb = getSupabase(); if (sb) void syncNow(sb, session.user.id).then(() => toast("同期しました")); }} className="flex items-center gap-2 rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm font-semibold"><RefreshCw className="size-4" />今すぐ同期</button>
              <button onClick={async () => { await getSupabase()?.auth.signOut(); clearLocal(); toast("ログアウトしました（この端末のデータを消去）"); }} className="flex items-center gap-2 rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm"><LogOut className="size-4" />ログアウト</button>
            </div>
            <p className="text-xs text-text3">ログアウトすると、共有端末での情報漏えいを防ぐためこの端末のデータを消去します。データはクラウドに残り、再ログインで復元されます。</p>
          </>
        ) : <AuthForm />}
      </Card>

      <Card title="表示">
        <Row label="テーマ"><Segmented value={st.theme} onChange={(theme) => updateSettings({ theme })} options={[{ id: "dark", label: "ダーク" }, { id: "light", label: "ライト" }, { id: "system", label: "自動" }]} /></Row>
        <Row label="アニメーション"><Segmented value={st.reduceMotion === null ? "auto" : st.reduceMotion ? "off" : "on"} onChange={(v) => updateSettings({ reduceMotion: v === "auto" ? null : v === "off" })} options={[{ id: "auto", label: "端末に合わせる" }, { id: "on", label: "オン" }, { id: "off", label: "減らす" }]} /></Row>
      </Card>

      <Card title="音声（韓国語）">
        {!tts ? <Notice>この端末・ブラウザは音声再生に対応していません。</Notice> : <>
          <Row label="音声"><select value={st.voiceURI ?? ""} onChange={(e) => updateSettings({ voiceURI: e.target.value || null })} className="max-w-[60%] rounded-xl border border-line bg-surface2 px-3 py-2 text-sm"><option value="">自動</option>{voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}</select></Row>
          {voices.length === 0 && <Notice>この端末に韓国語の音声が見つかりません。端末の設定から韓国語（ko-KR）の音声を追加してください。</Notice>}
          <Slider label="通常速度" value={st.ttsRate} min={0.6} max={1.3} onChange={(v) => updateSettings({ ttsRate: v })} />
          <Slider label="ゆっくり再生" value={st.ttsSlowRate} min={0.3} max={0.9} onChange={(v) => updateSettings({ ttsSlowRate: v })} />
          <Row label="繰り返し回数"><Segmented value={String(st.ttsRepeat)} onChange={(v) => updateSettings({ ttsRepeat: Number(v) })} options={["1", "2", "3"].map((n) => ({ id: n, label: `${n}回` }))} /></Row>
          <button onClick={() => speak("안녕하세요. 만나서 반갑습니다.")} className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface2 py-2.5 text-sm font-semibold"><Volume2 className="size-4" />試し聞き</button>
        </>}
      </Card>

      <Card title="データ">
        <Row label="お気に入り / 履歴"><span className="text-sm text-text2">{favs}件 / {hist}件</span></Row>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportData} className="flex items-center gap-2 rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm"><Download className="size-4" />バックアップを書き出す</button>
          {confirmDel === "history" ? <><button onClick={() => { clearHistory(); setConfirmDel(null); toast("履歴を削除しました"); }} className="rounded-xl bg-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-white">履歴を全て削除</button><button onClick={() => setConfirmDel(null)} className="rounded-xl bg-surface2 px-4 py-2.5 text-sm">やめる</button></> : <button onClick={() => setConfirmDel("history")} className="flex items-center gap-2 rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm"><Trash2 className="size-4" />履歴を削除</button>}
        </div>
        {session && <p className="text-xs text-text3">ログイン中の削除は、同期により他の端末にも反映されます。</p>}
      </Card>

      <Card title="このアプリについて">
        <Row label="バージョン"><span className="text-sm text-text3">0.1.0</span></Row>
        <p className="text-xs leading-relaxed text-text3">漢字データ: KANJIDIC（EDRDG, CC BY-SA 4.0）および CJKVI-IDS 由来。不動産用語は編集済みの草案で、法令の原典確認が必要です。韓国語のスラングは確認時期が未確認のものを含みます。</p>
      </Card>
    </div>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return <Row label={label}><div className="flex w-1/2 items-center gap-3"><input type="range" aria-label={label} min={min} max={max} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" /><span className="w-10 text-right text-sm text-text3">{value.toFixed(2)}</span></div></Row>;
}

function AuthForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const local = useStore((s) => activeFavorites(s).length + activeHistory(s).length);
  const sb = getSupabase()!;
  async function run(kind: "pw" | "magic") {
    setBusy(true); setMsg(null);
    try {
      if (kind === "magic") { const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + "/settings" } }); if (error) throw error; setMsg({ ok: true, t: "ログイン用リンクをメールで送信しました。" }); }
      else if (mode === "up") { const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin + "/settings" } }); if (error) throw error; setMsg({ ok: true, t: data.session ? "登録しました。" : "確認メールを送信しました。メール内のリンクを開いてください。" }); }
      else { const { error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error; }
    } catch (e) { setMsg({ ok: false, t: friendly((e as Error).message) }); } finally { setBusy(false); }
  }
  const input = "w-full rounded-xl border border-line bg-surface2 px-4 py-3 text-base outline-none focus:border-accent";
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run("pw"); }} className="grid gap-3">
      <div className="flex items-center gap-2"><Badge>ゲスト利用中</Badge><span className="text-xs text-text3">ログインすると端末間で同期されます</span></div>
      <Segmented value={mode} onChange={setMode} options={[{ id: "in", label: "ログイン" }, { id: "up", label: "新規登録" }]} className="self-start" />
      <input type="email" required autoComplete="email" placeholder="メールアドレス" aria-label="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
      <input type="password" required minLength={8} autoComplete={mode === "up" ? "new-password" : "current-password"} placeholder="パスワード（8文字以上）" aria-label="パスワード" value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
      <button disabled={busy} className={cx("grad-bg rounded-xl py-3 font-semibold", busy && "opacity-60")}>{busy ? "処理中…" : mode === "in" ? "ログイン" : "アカウントを作成"}</button>
      <button type="button" disabled={busy || !email} onClick={() => void run("magic")} className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface2 py-2.5 text-sm disabled:opacity-50"><Mail className="size-4" />メールのリンクでログイン</button>
      {msg && <Notice tone={msg.ok ? "info" : "error"}>{msg.t}</Notice>}
      {local > 0 && <p className="text-xs text-text3">この端末のゲストデータ（{local}件）は、ログイン後にアカウントへ自動で統合・移行されます。</p>}
    </form>
  );
}
function friendly(m: string) {
  if (/invalid login/i.test(m)) return "メールアドレスまたはパスワードが違います。";
  if (/already registered/i.test(m)) return "このメールアドレスは登録済みです。ログインしてください。";
  if (/rate limit/i.test(m)) return "短時間に試行しすぎました。しばらくしてからお試しください。";
  if (/fetch|network/i.test(m)) return "通信に失敗しました。ネットワークを確認してください。";
  return m;
}
