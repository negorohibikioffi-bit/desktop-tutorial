const { useState, useEffect, useLayoutEffect, useRef, useCallback } = React;

/* ===== Supabase ===== */
// 接続先は config.js に書く（自分の Supabase プロジェクトの URL と anon キー）
const CFG = window.KINSHO_CONFIG || {};
const SUPABASE_URL = CFG.supabaseUrl || '';
const SUPABASE_KEY = CFG.supabaseAnonKey || '';
const TABLE = 'axia_kinsho';
const STABLE = 'axia_kinsho_settings';
const MTABLE = 'axia_kinsho_mail_log';     // メールで自動更新した履歴
const CONFIGURED = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(SUPABASE_URL) && SUPABASE_KEY.length > 40;
const sb = CONFIGURED ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

/* ===== 定数 ===== */
const LOGO = 'https://raw.githubusercontent.com/iety0214-hub/axia-tools/main/%E9%80%8F%E9%81%8E.png';
/* ===== テーマ：ダーク＋ゴールド ===== */
// ※ NAVY は元の名前のまま残しとるけど、中身は「本文の文字色」（明るいアイボリー）
const NAVY = '#ece7d8', GOLD = '#d6b45f', LINE = '#2a3144', SUB = '#8d96a8';
const ON_GOLD = '#1a1405';                 // ゴールド地の上に載せる文字色
const BG = '#0d1017', PANEL = '#161b25', CELL = '#1b2130';
const HEAD_BG = 'linear-gradient(180deg,#070a10 0%,#111723 100%)';
const SUBTXT = '#c3c8d4';              // カードの氏名・銀行など（濃いめ）
const KINSHO_PINK = { bg: '#2e1a28', bd: '#6e3558', fg: '#ff9ccd' };  // 金消日バッジは期日に関係なくピンク固定
// 承認・契約・金消の日付バッジは項目ごとに色を分ける（進捗の丸と同じ系統の色）
const BADGE_TONES = [
  { re: /承認/, tone: { bg: '#14233d', bd: '#2f4d80', fg: '#7db3ff' } },
  { re: /契約/, tone: { bg: '#2e1a1c', bd: '#6b2f33', fg: '#ff8d86' } },
  { re: /金消/, tone: { bg: '#231a35', bd: '#4d3a78', fg: '#c3a0ff' } },
];
const badgeTone = (label) => { const m = BADGE_TONES.find(t => t.re.test(label || '')); return m ? m.tone : null; };
// 印刷に含めるか（設定画面のチェック）。まだ一度も設定しとらん項目は、賃貸管理・建物管理（旧：賃管・建管）だけ外す
const inPrint = (f) => (typeof f.print === 'boolean' ? f.print : !/賃管|建管|賃貸管理|建物管理/.test(f.label || ''));
const PROG_COLORS = ['#2f9e44', '#2f7de1', '#d6453d', '#8e5bd0', '#14a094', '#c98a1a'];  // 承・契・金＋追加分
const WD = ['日','月','火','水','木','金','土'];
const TYPES = [
  { v: 'text', l: '文字（自由入力）' },
  { v: 'select', l: '選択肢つき' },
  { v: 'date', l: '日付' },
  { v: 'datetime', l: '日付＋時刻' },
  { v: 'money', l: '金額（万円）' },
];
// 4桁以上は3桁区切りカンマを入れる
const fmtNum = (v) => {
  const n = String(v ?? '').replace(/[^\d.-]/g, '');
  if (n === '' || isNaN(Number(n))) return '';
  return Number(n).toLocaleString('ja-JP');
};

const DEFAULT_SETTINGS = {
  appTitle: '金消予定日 一覧',
  subTitle: 'AXIA JAPAN ／ 仕入れ事業部',
  nameLabel: '名前',
  mainKey: 'kinsho',
  fields: [],
};

/* ===== ユーティリティ ===== */
const genKey = () => 'f_' + Math.random().toString(36).slice(2, 8);
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const ymLabel = (k) => { const [y, m] = k.split('-'); return `${y}年${Number(m)}月`; };
const monLabel = (k) => `${Number(k.split('-')[1])}月`;   // ボタン用の短い表記
const addMonth = (k, n) => { const [y, m] = k.split('-').map(Number); return ym(new Date(y, m - 1 + n, 1)); };

const fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d)) return s;
  return `${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;
};
const dtVal = (v) => (v && typeof v === 'object') ? v : { d: '', t: '', none: false };
// 日付が空なら自動で「記載なし」。日付が入っとったら自動で解除。
const fmtDT = (v) => {
  const o = dtVal(v);
  if (!o.d) return '記載なし';
  return fmtDate(o.d) + (o.t ? ' ' + o.t : ' 予定');
};
const fmtField = (f, v) => {
  if (f.type === 'datetime') return fmtDT(v);
  if (f.type === 'date') return fmtDate(v || '');
  if (f.type === 'money') { const n = fmtNum(v); return n ? n + '万円' : ''; }
  return v || '';
};
const hasVal = (f, v) => {
  if (f.type === 'datetime') { return !!dtVal(v).d; }
  return !!(v && String(v).length);
};
// 期日までの残り日数で色分け：3日以内＝赤／7日以内＝黄／それ以外＝紺（未入力は灰）
// 今日を基準に、その日まであと何日か（マイナスなら過ぎとる）
const daysLeft = (rawD) => {
  if (!rawD) return null;
  const d = new Date(rawD + 'T00:00:00');
  if (isNaN(d)) return null;
  return Math.round((d - new Date(new Date().toDateString())) / 86400000);
};
// 過ぎた日付は「済」の灰色にして、これから来る日だけ色を残す
const PAST_TONE = { bg: '#1c2230', bd: '#2a3144', fg: '#6b7487' };
const leftLabel = (n) => (n == null ? '' : n < 0 ? '済' : n === 0 ? '今日' : `あと${n}日`);
const dateTone = (on, rawD) => {
  let tone = { bg: '#222a3b', bd: '#33405a', fg: SUBTXT };
  if (on && rawD) {
    const diff = Math.floor((new Date(rawD + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000);
    if (diff <= 3) tone = { bg: '#2e1b1c', bd: '#6b2f2b', fg: '#ff9a92' };
    else if (diff <= 7) tone = { bg: '#2e2713', bd: '#6b5a24', fg: '#f0c75e' };
    else tone = { bg: '#16233d', bd: '#2d4573', fg: '#9db8f5' };
  }
  return tone;
};

/* ===== DB ===== */
const dbLoad = async () => {
  const { data, error } = await sb.from(TABLE).select('*').order('id');
  if (error) { console.error(error); return []; }
  return data || [];
};
const dbLoadSettings = async () => {
  const { data, error } = await sb.from(STABLE).select('settings').eq('id', 1).single();
  if (error) { console.error(error); return null; }
  return data ? data.settings : null;
};
const dbSaveSettings = async (s) => {
  try {
    const { error } = await sb.from(STABLE).upsert({ id: 1, settings: s, updated_at: new Date().toISOString() });
    if (error) { console.error(error); return { ok: false, error }; }
    return { ok: true };
  } catch (e) { console.error(e); return { ok: false, error: e }; }
};
/* ----- メール取り込みの履歴（テーブルが無い間は null を返して、画面側で案内を出す） ----- */
const dbLoadMail = async () => {
  try {
    const { data, error } = await sb.from(MTABLE).select('*').order('id', { ascending: false }).limit(80);
    if (error) { console.warn('mail log:', error.message); return null; }
    return data || [];
  } catch (e) { console.warn(e); return null; }
};
const dbMailPatch = async (ids, patch) => {
  try {
    const q = sb.from(MTABLE).update(patch);
    const { error } = Array.isArray(ids) ? await q.in('id', ids) : await q.eq('id', ids);
    if (error) { console.error(error); return { ok: false, error }; }
    return { ok: true };
  } catch (e) { console.error(e); return { ok: false, error: e }; }
};
const dbInsert = async (row) => {
  try {
    const { data, error } = await sb.from(TABLE).insert(row).select().single();
    if (error) { console.error(error); return { ok: false, error }; }
    return { ok: true, data };
  } catch (e) { console.error(e); return { ok: false, error: e }; }
};
const dbUpdate = async (id, patch) => {
  try {
    const { error } = await sb.from(TABLE).update(patch).eq('id', id);
    if (error) { console.error(error); return { ok: false, error }; }
    return { ok: true };
  } catch (e) { console.error(e); return { ok: false, error: e }; }
};
const dbDelete = async (id) => {
  try {
    const { error } = await sb.from(TABLE).delete().eq('id', id);
    if (error) { console.error(error); return { ok: false, error }; }
    return { ok: true };
  } catch (e) { console.error(e); return { ok: false, error: e }; }
};


/* ===== 印刷用の配色（紙は白地なので、元の明るい配色のまま） ===== */
const SUBTXT_P = '#33405e';
const PAST_TONE_P = { bg: '#f2f3f5', bd: '#e1e4ea', fg: '#8a92a3' };
const BADGE_TONES_P = [
  { re: /承認/, tone: { bg: '#e8f0fc', bd: '#b9cff0', fg: '#1565c0' } },
  { re: /契約/, tone: { bg: '#fdecea', bd: '#f3b9b3', fg: '#b3261e' } },
  { re: /金消/, tone: { bg: '#f3edfa', bd: '#d6c6ec', fg: '#7b4bb0' } },
];
const badgeToneP = (label) => { const m = BADGE_TONES_P.find(t => t.re.test(label || '')); return m ? m.tone : null; };

/* ===== 共通スタイル ===== */
const inp = { width: '100%', padding: '9px 10px', border: `1px solid #3a4358`, borderRadius: 8, fontSize: 14, background: PANEL };
const inpM = { ...inp, fontFamily: 'DM Mono, monospace' };
const navBtn = { padding: '8px 12px', border: 'none', borderRadius: 8, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 13, cursor: 'pointer' };
const subBtn = { flex: 1, padding: '11px', border: `1px solid ${LINE}`, background: PANEL, color: NAVY, borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer' };

/* ===== 入力の手間を減らす小さな部品 ===== */
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const chipBtn = (on) => ({
  padding: '6px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${on ? GOLD : LINE}`, background: on ? 'rgba(214,180,95,.14)' : PANEL,
  color: on ? '#e6c874' : NAVY, fontWeight: on ? 700 : 500
});
function Chips({ items, value, onPick }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {items.map(it => (
        <button key={it.v} type="button" onClick={() => onPick(it.v)} style={chipBtn(value === it.v)}>{it.l}</button>
      ))}
    </div>
  );
}
// 日付欄の下に常時出しとくミニカレンダー（今日も含めてタップで選ぶ）
const MC_HEAD = ['日','月','火','水','木','金','土'];
const mcCell = (state) => {
  const base = {
    height: 34, border: '1px solid transparent', borderRadius: 8, background: 'transparent',
    fontSize: 13, cursor: 'pointer', padding: 0, lineHeight: 1, fontFamily: 'DM Mono, monospace'
  };
  if (state === 'sel')   return { ...base, background: GOLD, color: ON_GOLD, fontWeight: 700 };
  if (state === 'today') return { ...base, borderColor: GOLD, background: 'rgba(214,180,95,.14)', color: '#e6c874', fontWeight: 700 };
  return base;
};
function MiniCal({ value, onPick, onClear }) {
  const today = isoOf(new Date());
  const [view, setView] = useState(() => (value || today).slice(0, 7));
  const seen = useRef(value);
  useEffect(() => {
    if (value !== seen.current) { seen.current = value; if (value) setView(value.slice(0, 7)); }
  }, [value]);

  const [y, m] = view.split('-').map(Number);
  const lead = new Date(y, m - 1, 1).getDay();
  const last = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= last; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  const iso = (d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const shift = (n) => setView(addMonth(view, n));
  const navS = { width: 30, height: 28, borderRadius: 8, border: `1px solid ${LINE}`, background: PANEL, color: NAVY, fontSize: 11, cursor: 'pointer', padding: 0 };

  return (
    <div style={{ marginTop: 8, border: `1px solid ${LINE}`, borderRadius: 10, padding: 8, background: PANEL }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <button type="button" onClick={() => shift(-1)} style={navS}>◀</button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{ymLabel(view)}</div>
        <button type="button" onClick={() => shift(1)} style={navS}>▶</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 2 }}>
        {MC_HEAD.map((w, i) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 500, padding: '2px 0', color: i === 0 ? '#ff7b72' : i === 6 ? '#6ea8ff' : SUB }}>{w}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={'e' + i} />;
          const v = iso(d);
          const state = value === v ? 'sel' : v === today ? 'today' : '';
          const wd = i % 7;
          return (
            <button key={v} type="button" onClick={() => onPick(v)}
              style={{ ...mcCell(state), color: state ? mcCell(state).color : wd === 0 ? '#ff7b72' : wd === 6 ? '#6ea8ff' : NAVY }}>
              {d}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button type="button" onClick={() => { setView(today.slice(0, 7)); onPick(today); }}
          style={{ ...chipBtn(value === today), flex: 1, padding: '7px 0' }}>今日にする</button>
        {value && <button type="button" onClick={onClear} style={{ ...chipBtn(false), flex: 1, padding: '7px 0', color: '#ff7b72', borderColor: '#5a2d31' }}>クリア</button>}
      </div>
    </div>
  );
}
const icoBtn = (on) => ({
  width: 52, height: 46, flexShrink: 0, borderRadius: 10, cursor: 'pointer', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: `1px solid ${on ? GOLD : LINE}`, background: on ? 'rgba(214,180,95,.14)' : PANEL,
  color: on ? '#e6c874' : NAVY
});
const IcoCal = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" />
    <circle cx="8.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);
const IcoClock = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5.3l3.4 2" />
  </svg>
);
// 時計ボタン：スマホ標準の時刻ピッカーを直接開く
const openPicker = (el) => { if (!el) return; try { el.showPicker(); } catch (e) { el.focus(); } };
// 時刻は15分刻みだけ選べるようにする（00:00〜23:45）
// 時刻は 8:00〜23:00 の15分刻みだけ（それ以外は使わんけん、プルダウンを短くする）
const TIME_15 = Array.from({ length: (23 - 8) * 4 + 1 }, (_, i) => `${String(8 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
const clrBtn = { width: 46, height: 46, flexShrink: 0, borderRadius: 10, cursor: 'pointer', padding: 0, border: '1px solid #5a2d31', background: '#2b1a1d', color: '#ff7b72', fontSize: 16, fontWeight: 700 };
const TIME_QUICK = ['10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];

// 開いたカードの入力欄1マス（2列グリッド用）。wide＝横幅いっぱい
function Cell({ label, wide, children }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : 'auto', minWidth: 0, border: `1px solid ${LINE}`, borderRadius: 10, padding: '7px 8px 8px', background: '#1b2130' }}>
      <div style={{ fontSize: 11, color: SUB, marginBottom: 3, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      {children}
    </div>
  );
}
// 開いたカード用の詰めた入力欄（高さ40px）
const inpS = { ...inp, padding: '8px 9px', height: 40, borderRadius: 9, fontSize: 14 };
const dateS = { ...inpS, fontFamily: 'DM Mono, monospace', flex: 1, minWidth: 0, fontSize: 13, padding: '6px 6px' };
const clrS = { width: 32, height: 40, flexShrink: 0, borderRadius: 9, cursor: 'pointer', padding: 0, border: '1px solid #5a2d31', background: '#2b1a1d', color: '#ff7b72', fontSize: 15, fontWeight: 700 };

function Row({ label, children }) {
  return (
    <div style={{ marginTop: 10, border: `1px solid ${LINE}`, borderRadius: 10, padding: 10, background: '#1b2130' }}>
      <div style={{ fontSize: 11, color: SUB, marginBottom: 4, fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}

/* ===== blur時コミット入力 ===== */
function TextInput({ value, onCommit, placeholder, style, list, inputMode }) {
  const [local, setLocal] = useState(value || '');
  const focused = useRef(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value !== prev.current && !focused.current) setLocal(value || '');
    prev.current = value;
  }, [value]);
  return (
    <input
      value={local} list={list} placeholder={placeholder} inputMode={inputMode}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => focused.current = true}
      onBlur={() => { focused.current = false; if (local !== (value || '')) onCommit(local); }}
      style={{ ...inp, ...style }}
    />
  );
}

/* ===== カード ===== */
function Card({ r, settings, open, unsaved, mailTag, suggests, nameSuggest, onToggle, onPatch, onDelete, onDup, onMove }) {
  // 開閉しても、タップしたカードの見出しが画面上の同じ位置に留まるようにする
  // （上の開いとったカードが閉じて、タップしたカードが上にずれるのを防ぐ）
  const headRef = useRef(null);
  const anchorTop = useRef(null);
  const toggle = () => {
    anchorTop.current = headRef.current ? { edge: 'top', y: headRef.current.getBoundingClientRect().top } : null;
    onToggle();
  };
  // 下の「カードを閉じる」から閉じた時は、閉じたカードが押したボタンの位置に来るようにする
  // （そのままだとページが縮んで一番下まで飛び、カードが画面の外に消える）
  const closeFromBottom = (e) => {
    anchorTop.current = { edge: 'bottom', y: e.currentTarget.getBoundingClientRect().bottom };
    onToggle();
  };
  useLayoutEffect(() => {
    const a = anchorTop.current;
    if (a == null || !headRef.current) return;
    anchorTop.current = null;
    // 上に固定しとる紺色のヘッダーの下端（ここより上に来ると隠れる）
    const bar = document.querySelector('[data-sticky-bar]');
    const barBottom = bar ? bar.getBoundingClientRect().bottom : 0;
    const fix = () => {
      if (!headRef.current) return;
      const rect = headRef.current.getBoundingClientRect();
      let diff = (a.edge === 'bottom' ? rect.bottom : rect.top) - a.y;
      // 位置を合わせた結果、見出しがヘッダーの裏に隠れるなら、見出しがヘッダーのすぐ下に来るようにする
      if (rect.top - diff < barBottom + 8) diff = rect.top - (barBottom + 8);
      if (Math.abs(diff) > 1) window.scrollBy(0, diff);
    };
    fix();
    // 描画直後や通信の再読み込みで遅れてずれた分も、少し後にもう一度だけ直す
    const startY = window.scrollY;
    const t = setTimeout(() => { if (Math.abs(window.scrollY - startY) > 1) return; fix(); }, 350);
    return () => clearTimeout(t);
  }, [open]);
  const F = settings.fields;
  const fv = r.fields || {};
  const prog = F.filter(f => f.progress).slice(0, 6);   // 横一列に収めるため最大6個
  const done = prog.filter(f => hasVal(f, fv[f.key])).length;
  // 個数が増えても1段に収まるように、丸のサイズと間隔を自動で詰める
  const dotSize = prog.length <= 3 ? 20 : prog.length === 4 ? 19 : prog.length === 5 ? 17 : 16;
  const dotGap = prog.length <= 4 ? 3 : 2;
  const subs = F.filter(f => f.sub);
  // 見出しに出す項目（物件名・号室／部屋番号）と、名前の右に並べる項目（銀行など）に分ける
  const isBukken = (f) => /物件|号室|部屋/.test(f.label || '');
  const headSubs = subs.filter(isBukken);
  // 金消予定日（main）は下の色付きバッジで別途出すので、灰色チップ側には出さない（二重表示防止）
  const restSubs = subs.filter(f => !isBukken(f) && f.key !== settings.mainKey);
  // 日付系のsub項目（金消予定日など）は灰色チップじゃなく、期日で色が変わるバッジ表示にする
  const dateSubs = restSubs.filter(f => f.type === 'date' || f.type === 'datetime');
  const chipSubs = restSubs.filter(f => f.type !== 'date' && f.type !== 'datetime');
  const headTxt = headSubs.map(f => fmtField(f, fv[f.key])).filter(Boolean).join(' ');
  // 名前 ＋ サブ項目（日付系以外）。値が空の項目は「項目名：－」で出して、設定が効いとることが分かるようにする
  const lineItems = [
    ...(r.name ? [{ k: '__name', t: r.name, empty: false }] : []),
    ...chipSubs.map(f => {
      const t = fmtField(f, fv[f.key]);
      const has = !!t && t !== '未定' && t !== '記載なし';
      return { k: f.key, t: has ? t : `${f.label}：－`, empty: !has };
    })
  ];
  const main = F.find(f => f.key === settings.mainKey);
  const mainTxt = main ? fmtField(main, fv[main.key]) : '';
  const mainOn = main && hasVal(main, fv[main.key]);
  const mainIsDate = main && (main.type === 'date' || main.type === 'datetime');
  // メイン項目も「閉じた状態でも表示」のチェックに従う（外したらバッジを出さん）
  const mainShow = !!(main && main.sub);
  // 日付系バッジ（金消予定日・承認日など）は入力欄の並び順で表示する
  const dateBadges = [
    ...dateSubs.map(f => ({ f, isMain: false })),
    ...(mainIsDate && mainShow ? [{ f: main, isMain: true }] : []),
  ].sort((a, b) => F.indexOf(a.f) - F.indexOf(b.f));

  const set = (k, v) => onPatch({ fields: { ...fv, [k]: v } });

  return (
    <div style={{ background: PANEL, borderRadius: 12, marginBottom: 10, border: `1px solid ${unsaved ? '#6b2f2b' : LINE}`, overflow: open ? 'visible' : 'hidden', boxShadow: unsaved ? '0 0 0 2px rgba(255,123,114,.14)' : '0 1px 2px rgba(0,0,0,.25)' }}>
      <div ref={headRef} onClick={toggle} style={{ padding: open ? '10px 14px' : '12px 14px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        // 開いとる間は「物件名 ／ 名前」の1行だけを紺色ヘッダーのすぐ下に固定して、入力欄が見える範囲を広く取る
        ...(open ? { position: 'sticky', top: 'var(--barH, 0px)', zIndex: 5, background: PANEL, borderRadius: '12px 12px 0 0', borderBottom: `1px solid ${LINE}`, boxShadow: '0 4px 8px -6px rgba(0,0,0,.45)' } : {}) }}>
        {open ? (
          <>
            {/* 2行：上＝物件名（大きめ）、下＝名前と銀行など。右に進み具合 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {unsaved && <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#fff', background: '#b3261e', borderRadius: 5, padding: '2px 6px' }}>未保存</span>}
                {mailTag && <span title="メールの内容で自動更新されました" style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: ON_GOLD, background: GOLD, borderRadius: 5, padding: '2px 6px' }}>📧 メール更新</span>}
                <span style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{headTxt || '（未入力）'}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: SUBTXT, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lineItems.filter(it => !it.empty).map(it => it.t).join('　') || '（名前未入力）'}
              </div>
            </div>
            <span style={{ fontSize: 12, color: '#7c8599', flexShrink: 0 }}>{done}/{prog.length} ▲</span>
          </>
        ) : (
          <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              {unsaved && <span style={{
                flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#fff', background: '#b3261e',
                borderRadius: 5, padding: '2px 6px', letterSpacing: '.02em'
              }}>未保存</span>}
              {mailTag && <span title="メールの内容で自動更新されました" style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: ON_GOLD, background: GOLD, borderRadius: 5, padding: '2px 6px' }}>📧 メール更新</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{headTxt || '（未入力）'}</span>
            </div>
            {!!lineItems.length && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                {lineItems.map(it => (
                  <span key={it.k} style={{
                    fontSize: 12, fontWeight: 500, lineHeight: 1.4,
                    padding: '2px 8px', borderRadius: 6,
                    background: it.empty ? '#1d2330' : '#222a3b',
                    border: `1px solid ${it.empty ? '#262d3d' : '#33405a'}`,
                    color: it.empty ? '#6b7487' : SUBTXT,
                    whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}>{it.t}</span>
                ))}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: dotGap, marginBottom: 4, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
              {prog.map((f, pi) => {
                const ok = hasVal(f, fv[f.key]);
                return (
                  <div key={f.key} title={f.label} style={{
                    width: dotSize, height: dotSize, flexShrink: 0, borderRadius: '50%',
                    fontSize: Math.round(dotSize / 2), lineHeight: dotSize + 'px', textAlign: 'center',
                    background: ok ? PROG_COLORS[pi % PROG_COLORS.length] : '#232a3a',
                    color: ok ? '#fff' : '#5d667a', fontWeight: 700
                  }}>{(f.label || '?').slice(0, 1)}</div>
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: '#7c8599' }}>{done}/{prog.length} {open ? '▲' : '▼'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 2 }}>
            <button onClick={e => { e.stopPropagation(); onDelete(); }} title="この1件を削除" style={{
              width: 34, height: 34, borderRadius: 9, border: '1px solid #5a2d31',
              background: '#2b1a1d', color: '#ff7b72', fontSize: 15, cursor: 'pointer', lineHeight: '32px', padding: 0
            }}>🗑</button>
          </div>
          {/* 日付バッジはカードの横幅いっぱいに置く（右の丸と同じ行やと、スマホで日付が切れるけん） */}
          <div style={{ width: '100%' }}>
              {!!dateBadges.length && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {dateBadges.map(({ f, isMain }) => {
                    const v = fv[f.key];
                    const on = hasVal(f, v);
                    const txt = fmtField(f, v);
                    const rawD = f.type === 'datetime' ? dtVal(v).d : (v || '');
                    const left = on ? daysLeft(rawD) : null;
                    const past = left != null && left < 0;
                    const tone = past ? PAST_TONE : ((on && badgeTone(f.label)) || (isMain
                      ? dateTone(on, rawD)
                      : (on ? KINSHO_PINK : { bg: '#222a3b', bd: '#33405a', fg: SUBTXT })));
                    return (
                      <div key={f.key} className="mono" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 7, maxWidth: '100%', fontSize: 13, fontWeight: 700,
                        background: tone.bg, border: `1px solid ${tone.bd}`, color: tone.fg
                      }}>
                        <span style={{
                          flexShrink: 0, width: 17, height: 17, borderRadius: '50%',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10.5, background: tone.fg, color: '#10131a'
                        }}>{(f.label || '?').slice(0, 1)}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txt || '記載なし'}</span>
                        {left != null && (
                          <span style={{
                            flexShrink: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em',
                            padding: '1px 5px', borderRadius: 5, marginLeft: 1,
                            background: past ? '#2a3144' : tone.fg, color: past ? tone.fg : '#10131a'
                          }}>{leftLabel(left)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {mainShow && !mainIsDate && mainOn && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6,
                  padding: '3px 10px', borderRadius: 7, maxWidth: '100%',
                  background: '#2e2713', border: '1px solid #6b5a24', color: '#e6c874',
                  fontSize: 13, fontWeight: 700
                }}>
                  <span style={{ flexShrink: 0 }}>⚠</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mainTxt}</span>
                </div>
              )}
          </div>
          </>
        )}
      </div>

      {open && (
        <div style={{ padding: '8px 12px 12px', borderTop: `1px solid ${LINE}` }}>
          {/* 2列のグリッド。物件名・時刻つき日付・選択肢の多いプルダウンだけ横幅いっぱい（span 2）にする */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, gridAutoFlow: 'dense' }}>
            <Cell label={settings.nameLabel || '名前'}>
              <TextInput value={r.name} onCommit={v => onPatch({ name: v })} placeholder={settings.nameLabel} style={inpS} />
            </Cell>

            {F.map((f, i) => {
              const opts = f.options || [];
              // 賃貸管理・建物管理みたいに「同じ数の選択肢を持つプルダウンが隣り合っとる対」は半分幅で横に並べる
              const sib = (g) => g && g.type === 'select' && (g.options || []).length === opts.length;
              const paired = f.type === 'select' && opts.length <= 4 && (sib(F[i - 1]) || sib(F[i + 1]));
              const wide = (f.type === 'text' && f.key === 'bukken') || f.type === 'datetime'
                || (f.type === 'select' && opts.length > 3 && !paired);
              return (
                <Cell key={f.key} label={f.label} wide={wide}>
                  {f.type === 'text' && (() => {
                    const cur = fv[f.key] || '';
                    // 候補チップ（サジェスト）は「物件名」だけに残す。ほかの文字項目は普通の入力欄のみ
                    if (f.key !== 'bukken') {
                      return <TextInput value={cur} onCommit={v => set(f.key, v)} placeholder={f.label} style={inpS} />;
                    }
                    const sg = (suggests || {})[f.key] || [];
                    // 出現回数が最も多い1件だけをチップにする（履歴が増えても選択肢は増やさない）
                    const top = sg.filter(s => s !== cur).slice(0, 1);
                    return (
                      <div>
                        <TextInput value={cur} onCommit={v => set(f.key, v)} placeholder={f.label} list={`dl_${r.id}_${f.key}`} style={inpS} />
                        <datalist id={`dl_${r.id}_${f.key}`}>{sg.map(s => <option key={s} value={s} />)}</datalist>
                        {!!top.length && (
                          <Chips items={top.map(s => ({ v: s, l: s }))} value={cur} onPick={v => set(f.key, v)} />
                        )}
                      </div>
                    );
                  })()}
                  {f.type === 'select' && (() => {
                    const cur = fv[f.key] || '';
                    const extra = cur && !opts.includes(cur);
                    // 選択肢が少なければ、プルダウンを開かずに1タップで選べるようにする
                    if (opts.length && opts.length <= 6 && !extra) {
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {opts.map(o => (
                            <button key={o} type="button" onClick={() => set(f.key, cur === o ? '' : o)} style={chipBtn(cur === o)}>{o}</button>
                          ))}
                          {cur && <button type="button" onClick={() => set(f.key, '')} style={{ ...chipBtn(false), color: '#ff7b72', borderColor: '#5a2d31' }}>クリア</button>}
                        </div>
                      );
                    }
                    return (
                      <select value={cur} onChange={e => set(f.key, e.target.value)} style={inpS}>
                        <option value="">— 未選択 —</option>
                        {opts.map(o => <option key={o} value={o}>{o}</option>)}
                        {extra && <option value={cur}>{cur}（一覧外）</option>}
                      </select>
                    );
                  })()}
                  {f.type === 'money' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TextInput value={fv[f.key] || ''} onCommit={v => set(f.key, String(v).replace(/[^\d.-]/g, ''))} placeholder="例：1700" inputMode="numeric" style={{ ...inpS, flex: 1, textAlign: 'right', minWidth: 0 }} />
                      <span style={{ fontSize: 12, color: SUB, fontWeight: 600, flexShrink: 0 }}>万円</span>
                    </div>
                  )}
                  {f.type === 'date' && (
                    // 日付欄をタップしたらスマホ標準の日付選択を開く（自前カレンダーはやめた）
                    <div style={{ display: 'flex', gap: 5 }}>
                      <input type="date" value={fv[f.key] || ''} onChange={e => set(f.key, e.target.value)}
                        onClick={e => openPicker(e.currentTarget)} style={dateS} />
                      {!!fv[f.key] && <button type="button" aria-label="日付を消す" title="日付を消す"
                        onClick={() => set(f.key, '')} style={clrS}>✕</button>}
                    </div>
                  )}
                  {f.type === 'datetime' && (() => {
                    const o = dtVal(fv[f.key]);
                    return (
                      <div>
                        {/* 日付と時刻を同じ行に並べる。✕は日付も時刻もまとめて消す */}
                        <div style={{ display: 'flex', gap: 5 }}>
                          <input type="date" value={o.d} onChange={e => set(f.key, { ...o, d: e.target.value, none: !e.target.value })}
                            onClick={e => openPicker(e.currentTarget)} style={{ ...dateS, flex: 3 }} />
                          <select value={o.t || ''} onChange={e => set(f.key, { ...o, t: e.target.value })}
                            style={{ ...dateS, flex: 2, color: o.t ? NAVY : '#7c8599' }}>
                            <option value="">時刻</option>
                            {/* 以前に15分刻み以外で入れた時刻も消えんように残す */}
                            {o.t && !TIME_15.includes(o.t) && <option value={o.t}>{o.t}</option>}
                            {TIME_15.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          {!!(o.d || o.t) && <button type="button" aria-label="日付と時刻を消す" title="日付と時刻をまとめて消す"
                            onClick={() => set(f.key, { d: '', t: '', none: true })} style={clrS}>✕</button>}
                        </div>
                        {!o.d && (
                          <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>☐ 記載なし（日程未通知）<span style={{ color: '#7c8599' }}>　※日付を入れると自動で外れる</span></div>
                        )}
                      </div>
                    );
                  })()}
                </Cell>
              );
            })}
          </div>

          {/* この1件だけを前の月・次の月へ移す */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => onMove(-1)} style={{ ...subBtn, padding: '10px', fontSize: 12, whiteSpace: 'nowrap' }}>
              ◀ {monLabel(addMonth(r.month, -1))}へ移す
            </button>
            <button onClick={() => onMove(1)} style={{ ...subBtn, padding: '10px', fontSize: 12, whiteSpace: 'nowrap' }}>
              {monLabel(addMonth(r.month, 1))}へ移す ▶
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={onDup} style={{ ...subBtn, padding: '10px', fontSize: 12, whiteSpace: 'nowrap' }}>⧉ この行を複製</button>
            <button onClick={closeFromBottom} style={{
              flex: 1, padding: '10px', border: `1px solid ${LINE}`, background: '#1d2330',
              color: NAVY, borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap'
            }}>▲ カードを閉じる</button>
            <button onClick={onDelete} style={{
              flex: 1, padding: '10px', border: '1px solid #5a2d31', background: '#2b1a1d',
              color: '#ff7b72', borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap'
            }}>🗑 削除</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== メール更新の履歴画面 ===== */
const MAIL_STATUS = {
  applied:   { l: '自動で更新', bg: 'rgba(214,180,95,.16)', fg: '#e6c874' },
  review:    { l: '要確認（未反映）', bg: '#2e2713', fg: '#f0c75e' },
  unmatched: { l: '該当カードなし', bg: '#222a3b', fg: '#9aa3b2' },
  skipped:   { l: '対象外', bg: '#1c2230', fg: '#6b7487' },
  error:     { l: 'エラー', bg: '#2e1b1c', fg: '#ff9a92' },
};
const fmtAt = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
function MailScreen({ log, settings, rows, onClose, onOpenRow, onUndo, onApply }) {
  const fByKey = (k) => settings.fields.find(f => f.key === k);
  const show = (f, v) => {
    if (v == null || v === '') return '（空）';
    return f ? (fmtField(f, v) || '（空）') : String(v);
  };
  const rowTitle = (id) => {
    const r = rows.find(x => x.id === id);
    if (!r) return '（削除済みのカード）';
    const fv = r.fields || {};
    const t = settings.fields.filter(f => /物件|号室|部屋/.test(f.label || '')).map(f => fmtField(f, fv[f.key])).filter(Boolean).join(' ');
    return [t, r.name].filter(Boolean).join(' ／ ') || '（未入力のカード）';
  };
  const ChangeList = ({ map, proposed }) => (
    <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
      {Object.entries(map || {}).map(([k, c]) => {
        const f = fByKey(k);
        const before = proposed ? undefined : c.before, after = proposed ? c : c.after;
        return (
          <div key={k} style={{ background: CELL, border: `1px solid ${LINE}`, borderRadius: 8, padding: '6px 9px', fontSize: 12.5 }}>
            <div style={{ fontSize: 11, color: SUB, marginBottom: 2 }}>{f ? f.label : k}</div>
            {proposed
              ? <div style={{ fontWeight: 700, color: '#e6c874' }}>{show(f, after)}</div>
              : <div><span style={{ color: SUB }}>{show(f, before)}</span> <span style={{ color: GOLD }}>→</span> <b style={{ color: '#e6c874' }}>{show(f, after)}</b></div>}
          </div>
        );
      })}
    </div>
  );
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ background: HEAD_BG, color: NAVY, padding: '14px 16px', paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))', borderBottom: `1px solid ${GOLD}55`, position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>📧 メールでの更新履歴</div>
        <button onClick={onClose} style={navBtn}>✕ 閉じる</button>
      </div>
      <div style={{ padding: 12 }}>
        {log === null && (
          <div style={{ background: '#2a2616', border: '1px solid #5a4d22', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: '#e2c978', lineHeight: 1.7 }}>
            メール連携の準備がまだできとらんみたい（履歴テーブルが見つからん）。<br />
            README の手順 1 の SQL を Supabase で実行してね。
          </div>
        )}
        {log && log.length === 0 && (
          <div style={{ textAlign: 'center', color: SUB, fontSize: 13, padding: '50px 0', lineHeight: 1.8 }}>
            まだメールでの更新はなかよ。<br />対象のメールが届くと、ここに履歴が出るっちゃ。
          </div>
        )}
        {(log || []).map(e => {
          const st = MAIL_STATUS[e.status] || MAIL_STATUS.skipped;
          const exists = e.row_id && rows.some(x => x.id === e.row_id);
          const hasChanges = e.changes && e.changes.fields && Object.keys(e.changes.fields).length;
          const hasProposed = e.proposed && e.proposed.fields && Object.keys(e.proposed.fields).length;
          return (
            <div key={e.id} style={{ background: PANEL, border: `1px solid ${!e.seen && (e.status === 'applied' || e.status === 'review') ? GOLD + '88' : LINE}`, borderRadius: 12, padding: 12, marginBottom: 10, opacity: e.undone ? .6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: st.bg, color: st.fg }}>{st.l}</span>
                {e.undone && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#232a3a', color: SUB }}>元に戻した</span>}
                {e.changes && e.changes.created && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(214,180,95,.16)', color: '#e6c874' }}>新規カード</span>}
                <span className="mono" style={{ fontSize: 11, color: SUB, marginLeft: 'auto' }}>{fmtAt(e.created_at)}</span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 8, lineHeight: 1.5 }}>{e.subject || '（件名なし）'}</div>
              {e.from_addr && <div style={{ fontSize: 11, color: SUB, marginTop: 2, wordBreak: 'break-all' }}>{e.from_addr}</div>}
              {e.summary && <div style={{ fontSize: 12.5, color: SUBTXT, marginTop: 8, lineHeight: 1.6 }}>{e.summary}</div>}
              {e.row_id && <div style={{ fontSize: 12, color: GOLD, marginTop: 8 }}>対象：{rowTitle(e.row_id)}</div>}
              {hasChanges ? <ChangeList map={e.changes.fields} /> : null}
              {!hasChanges && hasProposed ? <ChangeList map={e.proposed.fields} proposed /> : null}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {exists && <button onClick={() => onOpenRow(e)} style={{ ...subBtn, padding: 9, fontSize: 12 }}>カードを開く</button>}
                {e.status === 'review' && hasProposed && exists && !e.undone &&
                  <button onClick={() => onApply(e)} style={{ ...subBtn, padding: 9, fontSize: 12, background: GOLD, color: ON_GOLD, border: 'none', fontWeight: 700 }}>この内容で反映</button>}
                {e.status === 'applied' && hasChanges && exists && !e.undone &&
                  <button onClick={() => onUndo(e)} style={{ ...subBtn, padding: 9, fontSize: 12, color: '#ff7b72', borderColor: '#5a2d31' }}>↩ 元に戻す</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===== 設定画面 ===== */
function SettingsScreen({ settings, onSave, onClose, email, onLogout }) {
  const [d, setD] = useState(() => JSON.parse(JSON.stringify(settings)));
  const up = (p) => setD(x => ({ ...x, ...p }));
  const updF = (i, p) => setD(x => ({ ...x, fields: x.fields.map((f, idx) => idx === i ? { ...f, ...p } : f) }));
  const addF = () => up({ fields: [...d.fields, { key: genKey(), label: '', type: 'text', sub: false, progress: true, print: true, options: [] }] });
  const delF = (i) => {
    if (!confirm(`「${d.fields[i].label || '(名前なし)'}」を削除する？\n※入力済みの中身も表示されんくなるよ`)) return;
    const nf = d.fields.filter((_, idx) => idx !== i);
    up({ fields: nf, mainKey: d.mainKey === d.fields[i].key ? (nf[0] ? nf[0].key : '') : d.mainKey });
  };
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= d.fields.length) return;
    const nf = [...d.fields];
    [nf[i], nf[j]] = [nf[j], nf[i]];
    up({ fields: nf });
  };

  // ===== ドラッグで並べ替え（マウス・タッチ両対応）=====
  const listRef = useRef(null);
  const [dragIdx, setDragIdx] = useState(null);
  const dragRef = useRef(null);

  const reorder = (from, to) => {
    setD(x => {
      if (from === to || from < 0 || to < 0 || from >= x.fields.length || to >= x.fields.length) return x;
      const nf = [...x.fields];
      const [m] = nf.splice(from, 1);
      nf.splice(to, 0, m);
      return { ...x, fields: nf };
    });
  };

  const onDragStart = (i) => (e) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    dragRef.current = i;
    setDragIdx(i);
  };

  const onDragMove = (e) => {
    if (dragRef.current === null || !listRef.current) return;
    e.preventDefault();
    const cards = Array.from(listRef.current.querySelectorAll('[data-fieldcard]'));
    const y = e.clientY;
    let target = dragRef.current;
    for (let k = 0; k < cards.length; k++) {
      const r = cards[k].getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) { target = k; break; }
      if (k === 0 && y < r.top) { target = 0; break; }
      if (k === cards.length - 1 && y > r.bottom) { target = cards.length - 1; break; }
    }
    if (target !== dragRef.current) {
      reorder(dragRef.current, target);
      dragRef.current = target;
      setDragIdx(target);
    }
  };

  const onDragEnd = (e) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    dragRef.current = null;
    setDragIdx(null);
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 100 }}>
      <div style={{ background: HEAD_BG, color: NAVY, padding: '14px 16px', paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))', borderBottom: `1px solid ${GOLD}55`, position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>⚙ 項目の設定</div>
        <button onClick={onClose} style={navBtn}>✕ 閉じる</button>
      </div>

      <div style={{ padding: 12 }}>
        <div style={{ background: '#2a2616', border: '1px solid #5a4d22', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#e2c978', marginBottom: 12 }}>
          ここで変えた内容は<b>3名全員の画面</b>に反映されるっちゃ。項目を消すと、その中身は見えんくなるけん注意してね。
        </div>

        <Sec title="基本">
          <Row label="アプリのタイトル"><TextInput value={d.appTitle} onCommit={v => up({ appTitle: v })} /></Row>
          <Row label="サブタイトル"><TextInput value={d.subTitle} onCommit={v => up({ subTitle: v })} /></Row>
          <Row label="1列目（見出しになる項目）の名前"><TextInput value={d.nameLabel} onCommit={v => up({ nameLabel: v })} /></Row>
          <Row label="カードに大きく出す項目">
            <select value={d.mainKey} onChange={e => up({ mainKey: e.target.value })} style={inp}>
              <option value="">なし</option>
              {d.fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </Row>
        </Sec>

        <Sec title="項目一覧">
          {d.fields.filter(f => f.progress).length > 6 && (
            <div style={{ background: '#2b1a1d', border: '1px solid #5a2d31', borderRadius: 8, padding: '8px 10px', fontSize: 11.5, color: '#ff7b72', marginBottom: 10 }}>
              「進捗の丸に入れる」は<b>6個まで</b>しかカードに出せんっちゃ。7個目からは表示されんけん、どれか外してね。
            </div>
          )}
          <div style={{ fontSize: 11.5, color: SUB, marginBottom: 8 }}>
            ⠿ の部分を長押しして上下にドラッグすると、順番を入れ替えられるっちゃ（▲▼でも動かせる）。
          </div>
          <div ref={listRef}>
          {d.fields.map((f, i) => (
            <div key={f.key} data-fieldcard="1" style={{
              border: `1px solid ${dragIdx === i ? '#5b73a8' : LINE}`, borderRadius: 10, padding: 10, marginBottom: 10,
              background: dragIdx === i ? '#1e2740' : '#1b2130',
              boxShadow: dragIdx === i ? '0 4px 12px rgba(0,0,0,.4)' : 'none',
              opacity: dragIdx !== null && dragIdx !== i ? .6 : 1,
              transition: 'background .12s, box-shadow .12s, opacity .12s'
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                  <button onClick={() => move(i, -1)} disabled={i === 0} style={arrBtn(i === 0)}>▲</button>
                  <div
                    onPointerDown={onDragStart(i)}
                    onPointerMove={onDragMove}
                    onPointerUp={onDragEnd}
                    onPointerCancel={onDragEnd}
                    title="ドラッグして並べ替え"
                    style={{
                      touchAction: 'none', cursor: 'grab', userSelect: 'none',
                      width: 34, height: 30, borderRadius: 8,
                      border: `1px solid ${dragIdx === i ? '#5b73a8' : LINE}`,
                      background: dragIdx === i ? '#2a3558' : PANEL,
                      color: dragIdx === i ? NAVY : '#7c8599',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 15, lineHeight: 1
                    }}>⠿</div>
                  <button onClick={() => move(i, 1)} disabled={i === d.fields.length - 1} style={arrBtn(i === d.fields.length - 1)}>▼</button>
                </div>
                <div style={{ flex: 1 }}>
                  <TextInput value={f.label} onCommit={v => updF(i, { label: v })} placeholder="項目名" />
                  <select value={f.type} onChange={e => updF(i, { type: e.target.value })} style={{ ...inp, marginTop: 6 }}>
                    {TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </select>
                  {f.type === 'select' && (
                    <div style={{ marginTop: 8, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 8, padding: 8 }}>
                      <div style={{ fontSize: 11, color: SUB, marginBottom: 6, fontWeight: 500 }}>
                        プルダウンの選択肢（ここを直すと全員の画面に反映）
                      </div>
                      {(f.options || []).map((o, oi) => (
                        <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <TextInput value={o} placeholder="選択肢" onCommit={v => {
                            const no = [...(f.options || [])];
                            if (v.trim()) no[oi] = v.trim(); else no.splice(oi, 1);
                            updF(i, { options: no });
                          }} />
                          <button onClick={() => {
                            if (!confirm(`「${o}」を選択肢から消す？\n※すでに選んどる人の分はそのまま残るよ`)) return;
                            updF(i, { options: (f.options || []).filter((_, x) => x !== oi) });
                          }} style={{ border: '1px solid #5a2d31', background: '#2b1a1d', color: '#ff7b72', borderRadius: 8, padding: '0 10px', fontSize: 12, cursor: 'pointer' }}>🗑</button>
                        </div>
                      ))}
                      <button onClick={() => updF(i, { options: [...(f.options || []), ''] })}
                        style={{ ...subBtn, width: '100%', borderStyle: 'dashed', padding: 8, fontSize: 12 }}>＋ 選択肢を追加</button>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                    <label style={chk}>
                      <input type="checkbox" checked={!!f.progress} onChange={e => updF(i, { progress: e.target.checked })} />
                      進捗の丸に入れる
                    </label>
                    <label style={chk}>
                      <input type="checkbox" checked={!!f.sub} onChange={e => updF(i, { sub: e.target.checked })} />
                      閉じた状態でも表示
                    </label>
                    <label style={chk}>
                      <input type="checkbox" checked={inPrint(f)} onChange={e => updF(i, { print: e.target.checked })} />
                      印刷に含む
                    </label>
                  </div>
                </div>
                <button onClick={() => delF(i)} style={{ border: '1px solid #5a2d31', background: '#2b1a1d', color: '#ff7b72', borderRadius: 8, padding: '6px 8px', fontSize: 12, cursor: 'pointer' }}>🗑</button>
              </div>
            </div>
          ))}
          </div>
          <button onClick={addF} style={{ ...subBtn, width: '100%', borderStyle: 'dashed' }}>＋ 項目を追加</button>
        </Sec>

        {!!onLogout && <Sec title="アカウント">
          <div style={{ fontSize: 12.5, color: SUBTXT, margin: '6px 0 10px', wordBreak: 'break-all' }}>ログイン中：{email || '（不明）'}</div>
          <button onClick={() => { if (confirm('ログアウトする？')) onLogout(); }} style={{ ...subBtn, width: '100%', color: '#ff7b72', borderColor: '#5a2d31' }}>ログアウト</button>
        </Sec>}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 12, paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', background: 'linear-gradient(transparent,#0d1017 35%)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ ...subBtn, flex: 1, padding: 14 }}>キャンセル</button>
          <button onClick={() => onSave(d)} style={{
            flex: 2, padding: 14, background: `linear-gradient(180deg,#e3c577,${GOLD})`, color: ON_GOLD, border: 'none',
            borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(214,180,95,.28)'
          }}>保存する</button>
        </div>
      </div>
    </div>
  );
}


const chk = { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: SUB };
const arrBtn = (dis) => ({
  border: `1px solid ${LINE}`, background: dis ? '#1c2230' : PANEL, color: dis ? '#4a5266' : NAVY,
  borderRadius: 6, width: 28, height: 24, fontSize: 10, cursor: dis ? 'default' : 'pointer', padding: 0
});

function Sec({ title, children }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

/* ===== 本体 ===== */
function App({ email, onLogout }) {
  const [all, setAll] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [screen, setScreen] = useState('main');
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(ym(new Date()));
  const [extraMonths, setExtraMonths] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);
  const [pending, setPending] = useState({});   // 保存に失敗して未送信のパッチ {id: patch}
  const [query, setQuery] = useState('');
  const [bankPick, setBankPick] = useState('');   // 銀行で絞り込み（空＝全部）
  const [mailLog, setMailLog] = useState([]);       // メール更新の履歴（null＝テーブル未作成）
  const [printPick, setPrintPick] = useState(null); // 印刷する月を選ぶ画面（null＝閉じとる／配列＝選択中の月）
  const lock = useRef(0);
  const first = useRef(true);
  const retrying = useRef(false);
  const toastTimer = useRef(null);
  const pendingRef = useRef({});

  const flash = (m, bad) => {
    setToast({ m, bad: !!bad });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), bad ? 3600 : 1600);
  };

  const reloadMail = useCallback(async () => { setMailLog(await dbLoadMail()); }, []);

  const reload = useCallback(async () => {
    const [data, st, ml] = await Promise.all([dbLoad(), dbLoadSettings(), dbLoadMail()]);
    setMailLog(ml);
    // 未保存で手元にしかない入力は、サーバの値で上書きせずに残す
    const q = pendingRef.current;
    setAll(Object.keys(q).length ? data.map(r => q[r.id] ? { ...r, ...q[r.id] } : r) : data);
    if (st) setSettings({ ...DEFAULT_SETTINGS, ...st });
    setLoading(false);
    if (first.current) {
      first.current = false;
      const ks = Array.from(new Set(data.map(r => r.month))).sort();
      const now = ym(new Date());
      if (!ks.includes(now) && ks.length) setMonth(ks[ks.length - 1]);
    }
  }, []);

  useEffect(() => {
    reload();
    const ch = sb.channel('axia_kinsho_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
        if (Date.now() - lock.current < 3000) return;
        reload();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: STABLE }, () => {
        if (Date.now() - lock.current < 3000) return;
        reload();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: MTABLE }, (p) => {
        const n = p.new || {};
        // メールで更新された瞬間に、画面にも知らせる
        if (n.status === 'applied') flash('📧 メールで更新：' + (n.summary || n.subject || ''));
        else if (n.status === 'review') flash('📧 メールの内容を要確認：' + (n.subject || ''));
        reload();
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [reload]);

  pendingRef.current = pending;

  // 紺色ヘッダーの高さを --barH に入れて、開いたカードの見出しをその真下に固定する
  const barObs = useRef(null);
  const barRef = useCallback((el) => {
    if (barObs.current) { barObs.current.disconnect(); barObs.current = null; }
    if (!el) return;
    const setH = () => document.documentElement.style.setProperty('--barH', el.getBoundingClientRect().height + 'px');
    setH();
    if (window.ResizeObserver) { barObs.current = new ResizeObserver(setH); barObs.current.observe(el); }
  }, []);

  const rows = all.filter(r => r.month === month);

  // ===== 未保存キュー：保存に失敗した分をためて自動で再送する =====
  const sendPatch = useCallback(async (id, p) => {
    lock.current = Date.now();
    const res = await dbUpdate(id, p);
    if (res.ok) {
      setPending(q => {
        if (!q[id]) return q;
        const n = { ...q }; delete n[id]; return n;
      });
      return true;
    }
    // 失敗分は行ごとにマージして保持（あとでまとめて再送）
    setPending(q => ({ ...q, [id]: { ...(q[id] || {}), ...p } }));
    return false;
  }, []);

  const patch = (id, p) => {
    lock.current = Date.now();
    setAll(a => a.map(r => r.id === id ? { ...r, ...p } : r));
    sendPatch(id, p).then(ok => flash(ok ? '保存したばい' : '⚠ 保存できとらん（自動で再送するけん画面は閉じんで）', !ok));
  };

  const retryAll = useCallback(async () => {
    const ids = Object.keys(pending);
    if (!ids.length || retrying.current) return;
    retrying.current = true;
    let ng = 0;
    for (const id of ids) {
      const ok = await sendPatch(Number(id), pending[id]);
      if (!ok) ng++;
    }
    retrying.current = false;
    if (!ng) flash('未保存の分、保存できたばい');
  }, [pending, sendPatch]);

  // オンライン復帰時と20秒おきに再送を試す
  useEffect(() => {
    if (!Object.keys(pending).length) return;
    const t = setInterval(retryAll, 20000);
    window.addEventListener('online', retryAll);
    return () => { clearInterval(t); window.removeEventListener('online', retryAll); };
  }, [pending, retryAll]);

  // 未保存が残っとる状態でタブを閉じようとしたら止める
  useEffect(() => {
    const h = (e) => { if (Object.keys(pending).length) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [pending]);

  const del = async (id) => {
    if (!confirm('この行を削除する？')) return;
    lock.current = Date.now();
    const backup = all.find(r => r.id === id);
    setAll(a => a.filter(r => r.id !== id));
    setOpenId(null);
    const res = await dbDelete(id);
    if (!res.ok) {
      if (backup) setAll(a => [...a, backup]);
      return flash('⚠ 削除できんかった（通信を確認して）', true);
    }
    flash('削除したばい');
  };
  const add = async () => {
    lock.current = Date.now();
    const maxSo = all.filter(r => r.month === month).reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0);
    const res = await dbInsert({ month, name: '', fields: {}, sort_order: maxSo + 1000 });
    if (!res.ok) return flash('⚠ 追加できんかった（通信を確認して）', true);
    setAll(a => [...a, res.data]);
    setOpenId(res.data.id);
    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 120);
  };

  // 同じ条件の案件を作るとき用：中身ごとコピーして1行増やす（主要日付だけは空にする）
  // この1件を前後の月へ移す。移した先では一番下に置く
  const moveMonth = (r, dir) => {
    const to = addMonth(r.month, dir);
    const maxSo = all.filter(x => x.month === to).reduce((m, x) => Math.max(m, x.sort_order ?? 0), 0);
    setOpenId(null);
    setExtraMonths(e => [...e, to]);
    patch(r.id, { month: to, sort_order: maxSo + 1000 });
  };

  const dup = async (r) => {
    lock.current = Date.now();
    const mf = settings.fields.find(f => f.key === settings.mainKey);
    const nf = { ...(r.fields || {}) };
    if (mf) delete nf[mf.key];
    const maxSo = all.filter(x => x.month === month).reduce((m, x) => Math.max(m, x.sort_order ?? 0), 0);
    const res = await dbInsert({ month, name: r.name, fields: nf, sort_order: maxSo + 1000 });
    if (!res.ok) return flash('⚠ 複製できんかった（通信を確認して）', true);
    setAll(a => [...a, res.data]);
    setOpenId(res.data.id);
    flash('複製したばい');
    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 120);
  };

  const mainF = settings.fields.find(f => f.key === settings.mainKey);
  // 並び順：まだ来とらん日付がある案件を上にまとめる
  //   ① 契約日がこれから（今日を含む）→ 契約日の近い順（同じ日なら金消日の近い順）
  //   ② 契約日は過ぎた（または空）が金消日がこれから → 金消日の近い順
  //   ③ 契約日が過ぎて金消日が空 → 契約日の新しい順
  //   ④ 契約日も金消日も空
  //   ⑤ 金消日が過ぎた（済）案件 → いちばん下（金消日の新しい順）
  const apprF = settings.fields.find(f => /契約/.test(f.label || ''));
  const kinshoF = settings.fields.find(f => /金消/.test(f.label || ''));
  const dOf = (f, r) => {
    if (!f) return '';
    const v = (r.fields || {})[f.key];
    return f.type === 'datetime' ? dtVal(v).d : (typeof v === 'string' ? v : '');
  };
  const tOf = (f, r) => (f && f.type === 'datetime') ? (dtVal((r.fields || {})[f.key]).t || '') : '';
  const sortKey = (r) => {
    const c = daysLeft(dOf(apprF, r)), k = daysLeft(dOf(kinshoF, r));
    const near = (x) => x == null ? 9e9 : x;   // 日付が空なら同じ段の後ろ
    if (k != null && k < 0) return [5, -k, ''];
    if (c != null && c >= 0) return [1, c, tOf(apprF, r), near(k), tOf(kinshoF, r)];
    if (k != null) return [2, k, tOf(kinshoF, r)];
    if (c != null) return [3, -c, ''];
    return [4, 0, ''];
  };
  const byAppr = (a, b) => {
    const x = sortKey(a), y = sortKey(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const p = x[i] ?? '', q = y[i] ?? '';
      if (p === q) continue;
      return typeof p === 'number' && typeof q === 'number' ? p - q : String(p).localeCompare(String(q));
    }
    return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
  };
  const pendingCount = Object.keys(pending).length;

  // ===== メール更新：未読の数・カードのタグ・元に戻す・要確認の反映 =====
  const unseenMail = (mailLog || []).filter(e => !e.seen && (e.status === 'applied' || e.status === 'review'));
  const mailRowIds = new Set(unseenMail.filter(e => e.status === 'applied' && !e.undone && e.row_id).map(e => e.row_id));
  const markSeen = async (list) => {
    const ids = list.map(e => e.id);
    if (!ids.length) return;
    setMailLog(l => (l || []).map(e => ids.includes(e.id) ? { ...e, seen: true } : e));
    await dbMailPatch(ids, { seen: true });
  };
  const openFromMail = (e) => {
    const r = all.find(x => x.id === e.row_id);
    if (!r) return flash('そのカードはもう無かよ', true);
    markSeen(unseenMail.filter(x => x.row_id === r.id));
    setScreen('main'); setMonth(r.month); setQuery(''); setBankPick(''); setOpenId(r.id);
  };
  const undoMail = async (e) => {
    const r = all.find(x => x.id === e.row_id);
    if (!r) return flash('そのカードはもう無かよ', true);
    // メールで新規作成したカードは、元に戻す＝カードごと削除
    if (e.changes && e.changes.created) {
      if (!confirm('このメールで作ったカードを削除して、元に戻す？')) return;
      lock.current = Date.now();
      const res = await dbDelete(r.id);
      if (!res.ok) return flash('⚠ 削除できんかった（通信を確認して）', true);
      setAll(a => a.filter(x => x.id !== r.id));
      await dbMailPatch(e.id, { undone: true, seen: true });
      reloadMail();
      return flash('カードを削除して元に戻したばい');
    }
    if (!confirm('このメールでの更新を元に戻す？')) return;
    const fv = { ...(r.fields || {}) };
    Object.entries((e.changes && e.changes.fields) || {}).forEach(([k, c]) => {
      if (c.before == null) delete fv[k]; else fv[k] = c.before;
    });
    patch(r.id, { fields: fv });
    await dbMailPatch(e.id, { undone: true, seen: true });
    reloadMail();
  };
  const applyMail = async (e) => {
    const r = all.find(x => x.id === e.row_id);
    if (!r) return flash('そのカードはもう無かよ', true);
    const fv = { ...(r.fields || {}) }, ch = {};
    Object.entries((e.proposed && e.proposed.fields) || {}).forEach(([k, v]) => { ch[k] = { before: fv[k] ?? null, after: v }; fv[k] = v; });
    patch(r.id, { fields: fv });
    await dbMailPatch(e.id, { status: 'applied', changes: { fields: ch }, seen: true });
    reloadMail();
  };

  // 過去に入力した値を候補にして、2回目からは選ぶだけで済むようにする
  const suggests = React.useMemo(() => {
    const m = {};
    settings.fields.filter(f => f.type === 'text').forEach(f => {
      const c = {};
      all.forEach(r => {
        const v = ((r.fields || {})[f.key] || '').trim();
        if (v) c[v] = (c[v] || 0) + 1;
      });
      m[f.key] = Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 20);
    });
    return m;
  }, [all, settings.fields]);
  const nameSuggest = React.useMemo(() => {
    const c = {};
    all.forEach(r => { const v = (r.name || '').trim(); if (v) c[v] = (c[v] || 0) + 1; });
    return Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 20);
  }, [all]);

  // 検索：名前と全項目の中身をまとめて対象にする
  const bankF = settings.fields.find(f => /銀行/.test(f.label || ''));
  const bankOpts = (bankF && bankF.options) || [];
  // 物件種別：AXIAシリーズ（物件名に AXIA／アクシア）または銀行がSBIなら新築、それ以外は中古
  const bukkenF = settings.fields.find(f => f.key === 'bukken') || settings.fields.find(f => /物件/.test(f.label || ''));
  const AXIA_RE = /AXIA|アクシア/i;
  const isNew = (r) => (!!bukkenF && AXIA_RE.test(String((r.fields || {})[bukkenF.key] || '')))
    || (!!bankF && ((r.fields || {})[bankF.key] || '') === 'SBI');
  const K_NEW = 'type::new', K_USED = 'type::used';
  // ボタンは ①全部 ／ ②新築・中古 ／ ③銀行 の3グループ
  const chipGroups = [[''], bukkenF ? [K_NEW, K_USED] : [], bankOpts].filter(g => g.length);
  const chipLabel = (b) => b === K_NEW ? '新築' : b === K_USED ? '中古' : b;
  const matchBank = (r, b) => {
    if (b === K_NEW) return isNew(r);
    if (b === K_USED) return !isNew(r);
    return ((r.fields || {})[bankF.key] || '') === b;
  };
  const hit = (r) => {
    if (bankPick && bankF && !matchBank(r, bankPick)) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const fv = r.fields || {};
    const txt = [r.name || '', ...settings.fields.map(f => fmtField(f, fv[f.key]))].join(' ').toLowerCase();
    return q.split(/\s+/).every(w => txt.includes(w));
  };
  const sorted = [...rows].filter(hit).sort(byAppr);
  const otherMonthHits = query.trim() ? all.filter(r => r.month !== month && hit(r)).length : 0;

  // 出力用の列順：物件名・号室 → 名前 → 残りの項目
  const exportCols = () => {
    const F = settings.fields;
    const isBukken = (f) => /物件|号室|部屋/.test(f.label || '');
    const fld = (f) => ({ label: f.label, get: (r) => fmtField(f, (r.fields || {})[f.key]), f });
    return [
      ...F.filter(isBukken).map(fld),
      { label: settings.nameLabel || '名前', get: (r) => r.name || '' },
      ...F.filter(f => !isBukken(f)).map(fld),
    ];
  };

  // 印刷用の表を裏側のiframeに作って、その場で印刷ダイアログを出す（タブは開かん）
  // months＝印刷したい月の配列。複数選んだときは改ページせず、月の区切り帯を挟んで続けて流し込む
  const printTable = (months) => {
    const ms = (months && months.length ? [...months] : [month]).sort();
    // 選んだ月の行を「月順 → その月の契約日が近い順」でひとつなぎにする
    const target = ms.flatMap(k =>
      all.filter(r => r.month === k && hit(r)).sort(byAppr)
    );
    if (!target.length) return flash('印刷する行がなかばい');
    // 設定で「印刷に含む」を外した項目は紙には出さん（名前の列はいつも出す）
    const cols = exportCols().filter(c => !c.f || inPrint(c.f));
    const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 日付のセルは画面のカードと同じ見え方にする：
    // 過ぎた日は灰色＋「済」、これから来る日は項目の色のまま「今日」「あと◯日」を添える
    const cell = (c, r, txt) => {
      const f = c.f;
      if (!f || (f.type !== 'date' && f.type !== 'datetime') || !txt) return esc(txt);
      const v = (r.fields || {})[f.key];
      const rawD = f.type === 'datetime' ? dtVal(v).d : (v || '');
      const left = daysLeft(rawD);
      if (left == null) return esc(txt);
      const past = left < 0;
      const tone = past ? PAST_TONE_P : (badgeToneP(f.label) || { bg: '#eef1f7', bd: '#d8dee9', fg: SUBTXT_P });
      return `<span style="color:${tone.fg}">${esc(txt)}</span>`
        + `<span class="tag" style="background:${past ? '#e6e9ee' : tone.fg};color:${past ? tone.fg : '#fff'}">${esc(leftLabel(left))}</span>`;
    };
    const nameIdx = cols.findIndex(c => c.label === (settings.nameLabel || '名前'));
    const th = cols.map((c, ci) => `<th${ci === nameIdx || /銀行/.test(c.label || '') ? ' class="nm"' : ''}>${esc(c.label)}</th>`).join('');
    const multi = ms.length > 1;
    let curM = null, zebra = 0;
    const tr = target.map(r => {
      let band = '';
      if (multi && r.month !== curM) {
        curM = r.month; zebra = 0;
        const n = target.filter(x => x.month === curM).length;
        band = `<tr class="band"><td colspan="${cols.length}">${esc(ymLabel(curM))}　（${n}件）</td></tr>`;
      }
      const row = `<tr${zebra++ % 2 ? ' class="alt"' : ''}>` + cols.map((c, ci) => {
        const txt = c.get(r);
        // 名前と銀行は途中で折り返さん（姓と名の間のスペースや「楽天」で改行させんため）
        const nowrap = ci === nameIdx || /銀行/.test(c.label || '');
        return `<td class="${ci === 0 || ci === nameIdx ? 'l' : 'c'}${nowrap ? ' nm' : ''}">${cell(c, r, txt) || '&nbsp;'}</td>`;
      }).join('') + '</tr>';
      return band + row;
    }).join('');
    const titleM = !multi ? ymLabel(ms[0])
      : (ms.length <= 3 ? ms.map(ymLabel).join('・')
        : `${ymLabel(ms[0])}〜${ymLabel(ms[ms.length - 1])}（${ms.length}ヶ月分）`);
    // ── 紙面の割り付け（1ページ目にちょうど10件入るよう行の高さを逆算する）──
    // A4横（高さ210mm）から上下余白24mmを引いた186mmが使える範囲。
    // 1ページ目はここから「見出しブロック＋表ヘッダー＋1ページ目に出る月の区切り帯」を引いて、
    // 残りを10等分する。2ページ目からは見出しブロックが無いぶん、同じ行の高さのまま入るだけ入る。
    const P1_ROWS = 10;                 // 1ページ目に入れたい件数
    const PAGE_MM = 210 - 12 * 2;       // 紙の高さ − 上下余白
    const HEAD_MM = 19;                 // タイトル行（ロゴを横に抱き合わせ）＋作成日の固定高さ
    const TH_MM = 8;                    // 表ヘッダーの高さ（毎ページ繰り返す）
    const BAND_MM = 7;                  // 月の区切り帯の高さ
    const SAFE_MM = 3;                  // 端の丸め誤差で1行こぼれんための逃げ
    // 1ページ目に何本の区切り帯が入るかは、最初の10件が何ヶ月にまたがるかで決まる
    const p1Bands = multi ? new Set(target.slice(0, P1_ROWS).map(r => r.month)).size : 0;
    const ROW_MM = Math.floor(
      ((PAGE_MM - HEAD_MM - TH_MM - SAFE_MM - p1Bands * BAND_MM) / P1_ROWS) * 10) / 10;
    const t = new Date();
    const dstr = `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日`;
    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<title>${esc(settings.appTitle || '一覧')}_${esc(ms.join('_'))}</title>
<style>
@page { size: A4 landscape; margin: 12mm 14mm; }
* { box-sizing: border-box; }
body { margin:0; font-family:"Yu Gothic","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif; color:#111;
     -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.head { position:relative; height:${HEAD_MM}mm; overflow:hidden; }
.logo { position:absolute; right:0; top:0; margin:0; }
.logo img { width:12mm; height:auto; }
h1 { font-size:14pt; text-align:center; margin:0 0 1.5mm; padding:0 16mm;
     letter-spacing:.04em; line-height:1.25; }
.meta { text-align:right; font-size:9pt; color:#555; margin:0; padding-right:14mm; }
table { border-collapse:collapse; width:100%; }
th.nm { white-space:nowrap; }
th { background:#1F3864; color:#fff; font-size:10pt; font-weight:600;
     height:${TH_MM}mm; padding:0 1.5mm; vertical-align:middle;
     border:.3mm solid #9AA3B2; text-align:center; }
td { font-size:11pt; height:${ROW_MM}mm; padding:0 1.5mm; vertical-align:middle;
     border:.3mm solid #C7CDD8; }
td.c { text-align:center; } td.l { text-align:left; }
td.nm { white-space:nowrap; }
.tag { display:inline-block; margin-left:1.5mm; padding:0 1.2mm; border-radius:1mm;
     font-size:8pt; font-weight:700; line-height:1.5; vertical-align:.3mm; }
tr.alt td { background:#F2F4F8; }
tr.band td { background:#DDE3EE; color:#1F3864; font-size:10pt; font-weight:700;
     height:${BAND_MM}mm; text-align:left; padding:0 2mm; vertical-align:middle;
     letter-spacing:.04em; border:.3mm solid #9AA3B2; }
thead { display:table-header-group; }
tr { page-break-inside:avoid; }
tr.band { page-break-after:avoid; }
</style></head><body>
<div class="head">
<p class="logo"><img src="${LOGO}" alt=""></p>
<h1>${esc(settings.appTitle || '一覧')}（${esc(titleM)}${bankPick ? '／' + esc(chipLabel(bankPick)) : ''}）</h1>
<p class="meta">${esc(settings.subTitle || '')}　作成日：${dstr}</p>
</div>
<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
</body></html>`;
    // 新規タブは開かず、見えない枠（iframe）に印刷用の表を流し込んで、そのまま印刷プレビューを出す
    const old = document.getElementById('__printFrame');
    if (old) old.remove();
    const fr = document.createElement('iframe');
    fr.id = '__printFrame';
    fr.setAttribute('aria-hidden', 'true');
    fr.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;border:0;';
    document.body.appendChild(fr);
    const doc = fr.contentWindow.document;
    doc.open(); doc.write(html); doc.close();

    let done = false;
    const cleanup = () => { setTimeout(() => { const el = document.getElementById('__printFrame'); if (el) el.remove(); }, 500); };
    const go = () => {
      if (done) return; done = true;
      try {
        fr.contentWindow.focus();
        fr.contentWindow.onafterprint = cleanup;
        fr.contentWindow.print();
        setTimeout(cleanup, 60000); // 念のための後始末
      } catch (e) { flash('⚠ 印刷ダイアログが出せんかった', true); cleanup(); }
    };
    // ロゴの読み込みを待ってから印刷ダイアログ
    const img = doc.querySelector('img');
    if (img && !img.complete) { img.onload = go; img.onerror = go; setTimeout(go, 2500); }
    else setTimeout(go, 400);
  };

  const carryOver = async () => {
    const prev = addMonth(month, -1);
    const src = all.filter(r => r.month === prev && !(mainF && hasVal(mainF, (r.fields || {})[mainF.key])));
    if (!src.length) return flash('繰越対象なし');
    lock.current = Date.now();
    let so = all.filter(r => r.month === month).reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0);
    let ok = 0, ng = 0;
    for (const r of src) {
      const nf = { ...(r.fields || {}) };
      if (mainF) delete nf[mainF.key];
      so += 1000;
      const res = await dbInsert({ month, name: r.name, fields: nf, sort_order: so });
      if (res.ok) { setAll(a => [...a, res.data]); ok++; } else ng++;
    }
    flash(ng ? `⚠ ${ok}件は繰越できたけど${ng}件が失敗（通信を確認して）` : `${ok}件を繰越`, !!ng);
  };

  const saveSettings = async (s) => {
    lock.current = Date.now();
    setSettings(s);
    const res = await dbSaveSettings(s);
    setScreen('main');
    flash(res.ok ? '設定を保存したばい' : '⚠ 設定が保存できとらん（もう一回保存して）', !res.ok);
  };

  const monthKeys = Array.from(new Set([...all.map(r => r.month), ...extraMonths, month, ym(new Date())])).sort();
  const goMonth = (n) => { const next = addMonth(month, n); setExtraMonths(e => [...e, next]); setMonth(next); setOpenId(null); };

  const progF = settings.fields.filter(f => f.progress);
  const doneCount = rows.filter(r => progF.length && progF.every(f => hasVal(f, (r.fields || {})[f.key]))).length;

  if (screen === 'mail') {
    return <MailScreen log={mailLog} settings={settings} rows={all}
      onClose={() => { markSeen(unseenMail.filter(e => e.status !== 'review')); setScreen('main'); }}
      onOpenRow={openFromMail} onUndo={undoMail} onApply={applyMail} />;
  }
  if (screen === 'settings') {
    return <SettingsScreen settings={settings} onSave={saveSettings} onClose={() => setScreen('main')} email={email} onLogout={onLogout} />;
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 90 }}>
      <div data-sticky-bar ref={barRef} style={{ background: HEAD_BG, color: NAVY, padding: '14px 16px', paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))', borderBottom: `1px solid ${GOLD}55`, boxShadow: '0 6px 18px rgba(0,0,0,.35)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '.02em' }}>{settings.appTitle}</div>
            <div style={{ fontSize: 11, opacity: .7, marginTop: 2 }}>{settings.subTitle}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setPrintPick([month])} title="印刷する" style={{ ...navBtn, fontSize: 16, padding: '6px 10px' }}>🖨</button>
            <button onClick={() => setScreen('mail')} title="メールでの更新履歴" style={{ ...navBtn, fontSize: 16, padding: '6px 10px', position: 'relative' }}>
              📧{!!unseenMail.length && <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, borderRadius: 9, background: GOLD, color: ON_GOLD, fontSize: 10.5, fontWeight: 700, lineHeight: '17px', textAlign: 'center', padding: '0 4px' }}>{unseenMail.length}</span>}
            </button>
            <button onClick={() => setScreen('settings')} style={{ ...navBtn, fontSize: 16, padding: '6px 10px' }}>⚙</button>
            <img src={LOGO} alt="AXIA JAPAN" style={{ height: 30, opacity: .95 }} onError={e => e.target.style.display = 'none'} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <button onClick={() => goMonth(-1)} style={navBtn}>◀</button>
          <select value={month} onChange={e => { setMonth(e.target.value); setOpenId(null); }}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 15, fontWeight: 700, textAlign: 'center' }}>
            {monthKeys.map(k => <option key={k} value={k} style={{ color: '#000' }}>{ymLabel(k)}</option>)}
          </select>
          <button onClick={() => goMonth(1)} style={navBtn}>▶</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 物件名・名前・銀行などで絞り込み"
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, border: 'none',
              background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 13
            }} />
          {query && <button onClick={() => setQuery('')} style={navBtn}>✕</button>}
        </div>
        {/* 銀行で絞り込み。選んどる間は印刷もその銀行の分だけになる */}
        {!!bankOpts.length && (
          <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
            {chipGroups.map((g, gi) => (
              <React.Fragment key={gi}>
                {gi > 0 && <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,.3)', margin: '0 3px' }} />}
                {g.map(b => {
                  const on = bankPick === b;
                  const n = b ? rows.filter(r => matchBank(r, b)).length : rows.length;
                  return (
                    <button key={b || '__all'} onClick={() => setBankPick(b)} style={{
                      padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${on ? GOLD : 'rgba(255,255,255,.25)'}`,
                      background: on ? GOLD : 'rgba(255,255,255,.07)', color: on ? ON_GOLD : NAVY,
                    }}>{b ? chipLabel(b) : '全部'} {n}</button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, opacity: .75, marginTop: 8, textAlign: 'center' }}>
          全 {rows.length} 件{(query || bankPick) ? ` ／ 該当 ${sorted.length} 件` : ''} ／ 全項目そろい {doneCount} 件 ・ チーム同期中{mailLog !== null ? ' ・ メール連携' : ''} ・ v14.0.0
        </div>
      </div>

      {!!pendingCount && (
        <div style={{
          margin: '0 12px',
          background: '#2e1b1c', border: '1px solid #6b2f2b', borderRadius: 10,
          padding: '9px 12px', fontSize: 12.5, color: '#ff9a92',
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 12
        }}>
          <span style={{ flex: 1, lineHeight: 1.5 }}>
            ⚠ <b>{pendingCount}件</b>がまだ保存できとらん。20秒おきに自動で再送しよるっちゃ。
          </span>
          <button onClick={retryAll} style={{
            border: '1px solid #ff7b72', background: PANEL, color: '#ff7b72',
            borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0
          }}>今すぐ再送</button>
        </div>
      )}

      <div style={{ padding: '12px 12px 0' }}>
        {loading && <div style={{ textAlign: 'center', color: '#7c8599', fontSize: 13, padding: '50px 0' }}>読み込み中…</div>}
        {!loading && sorted.length === 0 && (
          <div style={{ textAlign: 'center', color: '#7c8599', fontSize: 13, padding: '50px 0', lineHeight: 1.8 }}>
            {query.trim()
              ? <>「{query}」に合う行は{ymLabel(month)}にはなかよ。<br />{otherMonthHits ? `ほかの月には ${otherMonthHits} 件あるっちゃ。` : ''}</>
              : <>この月のデータはまだなかよ。<br />下の「＋ 追加」から入れてね。</>}
          </div>
        )}
        {!loading && sorted.length > 0 && !!otherMonthHits && (
          <div style={{ textAlign: 'center', color: '#7c8599', fontSize: 11.5, marginBottom: 8 }}>
            ほかの月にも {otherMonthHits} 件ヒットしとるよ
          </div>
        )}
        {sorted.map((r, i) => (
          <Card key={r.id} r={r} settings={settings} open={openId === r.id}
            unsaved={!!pending[r.id]} suggests={suggests} nameSuggest={nameSuggest}
            mailTag={mailRowIds.has(r.id)}
            onToggle={() => { if (openId !== r.id && mailRowIds.has(r.id)) markSeen(unseenMail.filter(x => x.row_id === r.id)); setOpenId(openId === r.id ? null : r.id); }}
            onPatch={p => patch(r.id, p)} onDelete={() => del(r.id)}
            onDup={() => dup(r)} onMove={d => moveMonth(r, d)} />
        ))}
        {!loading && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={carryOver} style={subBtn}>↪ 前月から繰越</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 12, paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', background: 'linear-gradient(transparent,#0d1017 35%)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <button onClick={add} style={{
            width: '100%', padding: '14px', background: `linear-gradient(180deg,#e3c577,${GOLD})`, color: ON_GOLD, border: 'none',
            borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(214,180,95,.28)'
          }}>＋ 追加</button>
        </div>
      </div>

      {printPick && (
        <div onClick={() => setPrintPick(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 30,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: PANEL, width: '100%', maxWidth: 560, borderRadius: '16px 16px 0 0',
            padding: '16px 16px 20px', maxHeight: '82vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 -6px 24px rgba(0,0,0,.18)'
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>印刷する月を選んでね</div>
            <div style={{ fontSize: 11.5, color: '#8d96a8', marginTop: 4, lineHeight: 1.6 }}>
              複数選ぶと、改ページせず月の区切りを挟んで続けて印刷するっちゃ。
            </div>
            <div style={{ display: 'flex', gap: 8, margin: '12px 0 10px' }}>
              <button onClick={() => setPrintPick([month])} style={{ ...subBtn, padding: '8px' }}>今月だけ</button>
              <button onClick={() => setPrintPick(monthKeys.filter(k => all.some(r => r.month === k)))}
                style={{ ...subBtn, padding: '8px' }}>データのある月ぜんぶ</button>
            </div>
            <div style={{ overflowY: 'auto', border: `1px solid ${LINE}`, borderRadius: 10, flex: 1 }}>
              {monthKeys.map(k => {
                const n = all.filter(r => r.month === k && hit(r)).length;
                const on = printPick.includes(k);
                return (
                  <label key={k} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
                    borderBottom: `1px solid ${LINE}`, cursor: n ? 'pointer' : 'default',
                    background: on ? '#1e2740' : PANEL, opacity: n ? 1 : .45
                  }}>
                    <input type="checkbox" checked={on} disabled={!n}
                      onChange={() => setPrintPick(p => on ? p.filter(x => x !== k) : [...p, k])}
                      style={{ width: 17, height: 17, accentColor: GOLD }} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: on ? 700 : 500, color: '#111' }}>{ymLabel(k)}</span>
                    <span style={{ fontSize: 12, color: '#8d96a8' }}>{n ? `${fmtNum(n)} 件` : 'データなし'}</span>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => setPrintPick(null)} style={subBtn}>やめる</button>
              <button disabled={!printPick.length}
                onClick={() => { const ms = [...printPick]; setPrintPick(null); setTimeout(() => printTable(ms), 60); }}
                style={{
                  ...subBtn, background: printPick.length ? GOLD : '#2a3144', color: printPick.length ? ON_GOLD : SUB,
                  border: 'none', fontWeight: 700, cursor: printPick.length ? 'pointer' : 'default'
                }}>🖨 この {fmtNum(printPick.length)} ヶ月を印刷</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 78, left: '50%', transform: 'translateX(-50%)',
          background: toast.bad ? '#b3261e' : '#222b3f', color: toast.bad ? '#fff' : NAVY, border: toast.bad ? 'none' : `1px solid ${GOLD}66`, padding: '9px 18px', borderRadius: 20,
          fontSize: 13, zIndex: 20, maxWidth: '92vw', textAlign: 'center', lineHeight: 1.5,
          boxShadow: '0 4px 14px rgba(0,0,0,.22)'
        }}>{toast.m}</div>
      )}
    </div>
  );
}

function NotConfigured() {
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '60px 20px', lineHeight: 1.9 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: GOLD, marginBottom: 12 }}>接続先がまだ設定されとらん</div>
      <div style={{ fontSize: 14, color: SUBTXT }}>
        <b>config.js</b> に、Supabase プロジェクトの <b>Project URL</b> と <b>anon キー</b> を書いてね。<br />
        （Supabase → Project Settings → API に出とる。手順は README の「手順0」）
      </div>
    </div>
  );
}
/* ===== ログイン（チーム共用のアカウントでログインした人だけがデータを見られる） ===== */
function LoginScreen() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw });
      if (error) setErr(/invalid/i.test(error.message) ? 'メールアドレスかパスワードが違うっちゃ' : 'ログインできんかった：' + error.message);
    } catch (e2) { setErr('通信に失敗した。電波を確認してね'); }
    setBusy(false);
  };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form onSubmit={go} style={{ width: '100%', maxWidth: 380, background: PANEL, border: `1px solid ${GOLD}55`, borderRadius: 16, padding: '28px 22px', boxShadow: '0 10px 30px rgba(0,0,0,.45)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src="icons/icon-192.png" alt="" style={{ width: 64, height: 64, borderRadius: 14 }} />
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 10, color: GOLD }}>金消予定日 一覧</div>
          <div style={{ fontSize: 11.5, color: SUB, marginTop: 4 }}>AXIA JAPAN ／ 仕入れ事業部</div>
        </div>
        <label style={{ fontSize: 11.5, color: SUB }}>メールアドレス</label>
        <input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} style={{ ...inp, marginBottom: 12, marginTop: 4 }} />
        <label style={{ fontSize: 11.5, color: SUB }}>パスワード</label>
        <input type="password" autoComplete="current-password" required value={pw} onChange={e => setPw(e.target.value)} style={{ ...inp, marginBottom: 14, marginTop: 4 }} />
        {!!err && <div style={{ fontSize: 12.5, color: '#ff9a92', background: '#2e1b1c', border: '1px solid #6b2f2b', borderRadius: 8, padding: '8px 10px', marginBottom: 12, lineHeight: 1.5 }}>{err}</div>}
        <button type="submit" disabled={busy} style={{ width: '100%', padding: 14, background: `linear-gradient(180deg,#e3c577,${GOLD})`, color: ON_GOLD, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1 }}>{busy ? 'ログイン中…' : 'ログイン'}</button>
      </form>
    </div>
  );
}

function Root() {
  // ログインは config.js の requireLogin が true のときだけ（初期値はオフ＝ログインなし）
  if (!CFG.requireLogin) return <App />;
  const [session, setSession] = useState(undefined);   // undefined＝確認中 ／ null＝未ログイン
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div style={{ textAlign: 'center', color: SUB, fontSize: 13, padding: '80px 0' }}>読み込み中…</div>;
  if (!session) return <LoginScreen />;
  return <App key={session.user.id} email={session.user.email} onLogout={() => sb.auth.signOut()} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(CONFIGURED ? <Root /> : <NotConfigured />);
