"use client";
import { getState } from "./store";

export const ttsSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;
let token = 0;

export function koreanVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("ko"));
}
export function pickVoice(): SpeechSynthesisVoice | undefined {
  const vs = koreanVoices(); const pref = getState().settings.voiceURI;
  return vs.find((v) => v.voiceURI === pref) ?? vs.find((v) => /google|siri|yuna|sunhi/i.test(v.name)) ?? vs[0];
}
export function stopSpeak() { token++; if (ttsSupported()) speechSynthesis.cancel(); }

/** 端末内蔵の韓国語音声で再生。mode: normal/slow、repeat回数。完了/中断で onEnd。 */
export function speak(text: string, opts: { slow?: boolean; repeat?: number; onEnd?: () => void; onError?: (msg: string) => void } = {}) {
  if (!ttsSupported()) { opts.onError?.("この端末は音声再生に対応していません"); return; }
  stopSpeak();
  const my = token;
  const st = getState().settings;
  const times = Math.max(1, opts.repeat ?? st.ttsRepeat);
  let n = 0;
  const next = () => {
    if (my !== token) return;
    if (n >= times) { opts.onEnd?.(); return; }
    n++;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR"; u.rate = opts.slow ? st.ttsSlowRate : st.ttsRate;
    const v = pickVoice(); if (v) u.voice = v;
    u.onend = () => setTimeout(next, 350);
    u.onerror = (e) => { if (my === token && e.error !== "interrupted" && e.error !== "canceled") { opts.onError?.("音声の再生に失敗しました"); } opts.onEnd?.(); };
    speechSynthesis.speak(u);
  };
  next();
}
