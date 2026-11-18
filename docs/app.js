const {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback
} = React;
const CFG = window.KINSHO_CONFIG || {};
const SUPABASE_URL = CFG.supabaseUrl || '';
const SUPABASE_KEY = CFG.supabaseAnonKey || '';
const TABLE = 'axia_kinsho';
const STABLE = 'axia_kinsho_settings';
const MTABLE = 'axia_kinsho_mail_log';
const CONFIGURED = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(SUPABASE_URL) && SUPABASE_KEY.length > 40;
const sb = CONFIGURED ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const LOGO = 'https://raw.githubusercontent.com/iety0214-hub/axia-tools/main/%E9%80%8F%E9%81%8E.png';
const NAVY = '#ece7d8',
  GOLD = '#d6b45f',
  LINE = '#2a3144',
  SUB = '#8d96a8';
const ON_GOLD = '#1a1405';
const BG = '#0d1017',
  PANEL = '#161b25',
  CELL = '#1b2130';
const HEAD_BG = 'linear-gradient(180deg,#070a10 0%,#111723 100%)';
const SUBTXT = '#c3c8d4';
const KINSHO_PINK = {
  bg: '#2e1a28',
  bd: '#6e3558',
  fg: '#ff9ccd'
};
const BADGE_TONES = [{
  re: /承認/,
  tone: {
    bg: '#14233d',
    bd: '#2f4d80',
    fg: '#7db3ff'
  }
}, {
  re: /契約/,
  tone: {
    bg: '#2e1a1c',
    bd: '#6b2f33',
    fg: '#ff8d86'
  }
}, {
  re: /金消/,
  tone: {
    bg: '#231a35',
    bd: '#4d3a78',
    fg: '#c3a0ff'
  }
}];
const badgeTone = label => {
  const m = BADGE_TONES.find(t => t.re.test(label || ''));
  return m ? m.tone : null;
};
const inPrint = f => typeof f.print === 'boolean' ? f.print : !/賃管|建管|賃貸管理|建物管理/.test(f.label || '');
const PROG_COLORS = ['#2f9e44', '#2f7de1', '#d6453d', '#8e5bd0', '#14a094', '#c98a1a'];
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const TYPES = [{
  v: 'text',
  l: '文字（自由入力）'
}, {
  v: 'select',
  l: '選択肢つき'
}, {
  v: 'date',
  l: '日付'
}, {
  v: 'datetime',
  l: '日付＋時刻'
}, {
  v: 'money',
  l: '金額（万円）'
}];
const fmtNum = v => {
  const n = String(v ?? '').replace(/[^\d.-]/g, '');
  if (n === '' || isNaN(Number(n))) return '';
  return Number(n).toLocaleString('ja-JP');
};
const DEFAULT_SETTINGS = {
  appTitle: '金消予定日 一覧',
  subTitle: 'AXIA JAPAN ／ 仕入れ事業部',
  nameLabel: '名前',
  mainKey: 'kinsho',
  fields: []
};
const genKey = () => 'f_' + Math.random().toString(36).slice(2, 8);
const ym = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const ymLabel = k => {
  const [y, m] = k.split('-');
  return `${y}年${Number(m)}月`;
};
const monLabel = k => `${Number(k.split('-')[1])}月`;
const addMonth = (k, n) => {
  const [y, m] = k.split('-').map(Number);
  return ym(new Date(y, m - 1 + n, 1));
};
const fmtDate = s => {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d)) return s;
  return `${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;
};
const dtVal = v => v && typeof v === 'object' ? v : {
  d: '',
  t: '',
  none: false
};
const fmtDT = v => {
  const o = dtVal(v);
  if (!o.d) return '記載なし';
  return fmtDate(o.d) + (o.t ? ' ' + o.t : ' 予定');
};
const fmtField = (f, v) => {
  if (f.type === 'datetime') return fmtDT(v);
  if (f.type === 'date') return fmtDate(v || '');
  if (f.type === 'money') {
    const n = fmtNum(v);
    return n ? n + '万円' : '';
  }
  return v || '';
};
const hasVal = (f, v) => {
  if (f.type === 'datetime') {
    return !!dtVal(v).d;
  }
  return !!(v && String(v).length);
};
const daysLeft = rawD => {
  if (!rawD) return null;
  const d = new Date(rawD + 'T00:00:00');
  if (isNaN(d)) return null;
  return Math.round((d - new Date(new Date().toDateString())) / 86400000);
};
const PAST_TONE = {
  bg: '#1c2230',
  bd: '#2a3144',
  fg: '#6b7487'
};
const leftLabel = n => n == null ? '' : n < 0 ? '済' : n === 0 ? '今日' : `あと${n}日`;
const dateTone = (on, rawD) => {
  let tone = {
    bg: '#222a3b',
    bd: '#33405a',
    fg: SUBTXT
  };
  if (on && rawD) {
    const diff = Math.floor((new Date(rawD + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000);
    if (diff <= 3) tone = {
      bg: '#2e1b1c',
      bd: '#6b2f2b',
      fg: '#ff9a92'
    };else if (diff <= 7) tone = {
      bg: '#2e2713',
      bd: '#6b5a24',
      fg: '#f0c75e'
    };else tone = {
      bg: '#16233d',
      bd: '#2d4573',
      fg: '#9db8f5'
    };
  }
  return tone;
};
const dbLoad = async () => {
  const {
    data,
    error
  } = await sb.from(TABLE).select('*').order('id');
  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
};
const dbLoadSettings = async () => {
  const {
    data,
    error
  } = await sb.from(STABLE).select('settings').eq('id', 1).single();
  if (error) {
    console.error(error);
    return null;
  }
  return data ? data.settings : null;
};
const dbSaveSettings = async s => {
  try {
    const {
      error
    } = await sb.from(STABLE).upsert({
      id: 1,
      settings: s,
      updated_at: new Date().toISOString()
    });
    if (error) {
      console.error(error);
      return {
        ok: false,
        error
      };
    }
    return {
      ok: true
    };
  } catch (e) {
    console.error(e);
    return {
      ok: false,
      error: e
    };
  }
};
const dbLoadMail = async () => {
  try {
    const {
      data,
      error
    } = await sb.from(MTABLE).select('*').order('id', {
      ascending: false
    }).limit(80);
    if (error) {
      console.warn('mail log:', error.message);
      return null;
    }
    return data || [];
  } catch (e) {
    console.warn(e);
    return null;
  }
};
const dbMailPatch = async (ids, patch) => {
  try {
    const q = sb.from(MTABLE).update(patch);
    const {
      error
    } = Array.isArray(ids) ? await q.in('id', ids) : await q.eq('id', ids);
    if (error) {
      console.error(error);
      return {
        ok: false,
        error
      };
    }
    return {
      ok: true
    };
  } catch (e) {
    console.error(e);
    return {
      ok: false,
      error: e
    };
  }
};
const dbInsert = async row => {
  try {
    const {
      data,
      error
    } = await sb.from(TABLE).insert(row).select().single();
    if (error) {
      console.error(error);
      return {
        ok: false,
        error
      };
    }
    return {
      ok: true,
      data
    };
  } catch (e) {
    console.error(e);
    return {
      ok: false,
      error: e
    };
  }
};
const dbUpdate = async (id, patch) => {
  try {
    const {
      error
    } = await sb.from(TABLE).update(patch).eq('id', id);
    if (error) {
      console.error(error);
      return {
        ok: false,
        error
      };
    }
    return {
      ok: true
    };
  } catch (e) {
    console.error(e);
    return {
      ok: false,
      error: e
    };
  }
};
const dbDelete = async id => {
  try {
    const {
      error
    } = await sb.from(TABLE).delete().eq('id', id);
    if (error) {
      console.error(error);
      return {
        ok: false,
        error
      };
    }
    return {
      ok: true
    };
  } catch (e) {
    console.error(e);
    return {
      ok: false,
      error: e
    };
  }
};
const SUBTXT_P = '#33405e';
const PAST_TONE_P = {
  bg: '#f2f3f5',
  bd: '#e1e4ea',
  fg: '#8a92a3'
};
const BADGE_TONES_P = [{
  re: /承認/,
  tone: {
    bg: '#e8f0fc',
    bd: '#b9cff0',
    fg: '#1565c0'
  }
}, {
  re: /契約/,
  tone: {
    bg: '#fdecea',
    bd: '#f3b9b3',
    fg: '#b3261e'
  }
}, {
  re: /金消/,
  tone: {
    bg: '#f3edfa',
    bd: '#d6c6ec',
    fg: '#7b4bb0'
  }
}];
const badgeToneP = label => {
  const m = BADGE_TONES_P.find(t => t.re.test(label || ''));
  return m ? m.tone : null;
};
const inp = {
  width: '100%',
  padding: '9px 10px',
  border: `1px solid #3a4358`,
  borderRadius: 8,
  fontSize: 14,
  background: PANEL
};
const inpM = {
  ...inp,
  fontFamily: 'DM Mono, monospace'
};
const navBtn = {
  padding: '8px 12px',
  border: 'none',
  borderRadius: 8,
  background: 'rgba(255,255,255,.08)',
  color: '#fff',
  fontSize: 13,
  cursor: 'pointer'
};
const subBtn = {
  flex: 1,
  padding: '11px',
  border: `1px solid ${LINE}`,
  background: PANEL,
  color: NAVY,
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer'
};
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const chipBtn = on => ({
  padding: '6px 10px',
  borderRadius: 999,
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  border: `1px solid ${on ? GOLD : LINE}`,
  background: on ? 'rgba(214,180,95,.14)' : PANEL,
  color: on ? '#e6c874' : NAVY,
  fontWeight: on ? 700 : 500
});
function Chips({
  items,
  value,
  onPick
}) {
  return React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6
    }
  }, items.map(it => React.createElement("button", {
    key: it.v,
    type: "button",
    onClick: () => onPick(it.v),
    style: chipBtn(value === it.v)
  }, it.l)));
}
const MC_HEAD = ['日', '月', '火', '水', '木', '金', '土'];
const mcCell = state => {
  const base = {
    height: 34,
    border: '1px solid transparent',
    borderRadius: 8,
    background: 'transparent',
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
    fontFamily: 'DM Mono, monospace'
  };
  if (state === 'sel') return {
    ...base,
    background: GOLD,
    color: ON_GOLD,
    fontWeight: 700
  };
  if (state === 'today') return {
    ...base,
    borderColor: GOLD,
    background: 'rgba(214,180,95,.14)',
    color: '#e6c874',
    fontWeight: 700
  };
  return base;
};
function MiniCal({
  value,
  onPick,
  onClear
}) {
  const today = isoOf(new Date());
  const [view, setView] = useState(() => (value || today).slice(0, 7));
  const seen = useRef(value);
  useEffect(() => {
    if (value !== seen.current) {
      seen.current = value;
      if (value) setView(value.slice(0, 7));
    }
  }, [value]);
  const [y, m] = view.split('-').map(Number);
  const lead = new Date(y, m - 1, 1).getDay();
  const last = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= last; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const iso = d => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const shift = n => setView(addMonth(view, n));
  const navS = {
    width: 30,
    height: 28,
    borderRadius: 8,
    border: `1px solid ${LINE}`,
    background: PANEL,
    color: NAVY,
    fontSize: 11,
    cursor: 'pointer',
    padding: 0
  };
  return React.createElement("div", {
    style: {
      marginTop: 8,
      border: `1px solid ${LINE}`,
      borderRadius: 10,
      padding: 8,
      background: PANEL
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6
    }
  }, React.createElement("button", {
    type: "button",
    onClick: () => shift(-1),
    style: navS
  }, "\u25C0"), React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: 700
    }
  }, ymLabel(view)), React.createElement("button", {
    type: "button",
    onClick: () => shift(1),
    style: navS
  }, "\u25B6")), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7,1fr)',
      gap: 2,
      marginBottom: 2
    }
  }, MC_HEAD.map((w, i) => React.createElement("div", {
    key: w,
    style: {
      textAlign: 'center',
      fontSize: 10.5,
      fontWeight: 500,
      padding: '2px 0',
      color: i === 0 ? '#ff7b72' : i === 6 ? '#6ea8ff' : SUB
    }
  }, w))), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7,1fr)',
      gap: 2
    }
  }, cells.map((d, i) => {
    if (!d) return React.createElement("div", {
      key: 'e' + i
    });
    const v = iso(d);
    const state = value === v ? 'sel' : v === today ? 'today' : '';
    const wd = i % 7;
    return React.createElement("button", {
      key: v,
      type: "button",
      onClick: () => onPick(v),
      style: {
        ...mcCell(state),
        color: state ? mcCell(state).color : wd === 0 ? '#ff7b72' : wd === 6 ? '#6ea8ff' : NAVY
      }
    }, d);
  })), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginTop: 8
    }
  }, React.createElement("button", {
    type: "button",
    onClick: () => {
      setView(today.slice(0, 7));
      onPick(today);
    },
    style: {
      ...chipBtn(value === today),
      flex: 1,
      padding: '7px 0'
    }
  }, "\u4ECA\u65E5\u306B\u3059\u308B"), value && React.createElement("button", {
    type: "button",
    onClick: onClear,
    style: {
      ...chipBtn(false),
      flex: 1,
      padding: '7px 0',
      color: '#ff7b72',
      borderColor: '#5a2d31'
    }
  }, "\u30AF\u30EA\u30A2")));
}
const icoBtn = on => ({
  width: 52,
  height: 46,
  flexShrink: 0,
  borderRadius: 10,
  cursor: 'pointer',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `1px solid ${on ? GOLD : LINE}`,
  background: on ? 'rgba(214,180,95,.14)' : PANEL,
  color: on ? '#e6c874' : NAVY
});
const IcoCal = () => React.createElement("svg", {
  width: "24",
  height: "24",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.7",
  strokeLinecap: "round"
}, React.createElement("rect", {
  x: "3",
  y: "5",
  width: "18",
  height: "16",
  rx: "2.5"
}), React.createElement("path", {
  d: "M3 10h18M8 3v4M16 3v4"
}), React.createElement("circle", {
  cx: "8.5",
  cy: "14.5",
  r: "1.1",
  fill: "currentColor",
  stroke: "none"
}), React.createElement("circle", {
  cx: "12",
  cy: "14.5",
  r: "1.1",
  fill: "currentColor",
  stroke: "none"
}), React.createElement("circle", {
  cx: "15.5",
  cy: "14.5",
  r: "1.1",
  fill: "currentColor",
  stroke: "none"
}));
const IcoClock = () => React.createElement("svg", {
  width: "24",
  height: "24",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.7",
  strokeLinecap: "round"
}, React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "9"
}), React.createElement("path", {
  d: "M12 7v5.3l3.4 2"
}));
const openPicker = el => {
  if (!el) return;
  try {
    el.showPicker();
  } catch (e) {
    el.focus();
  }
};
const TIME_15 = Array.from({
  length: (23 - 8) * 4 + 1
}, (_, i) => `${String(8 + Math.floor(i / 4)).padStart(2, '0')}:${String(i % 4 * 15).padStart(2, '0')}`);
const clrBtn = {
  width: 46,
  height: 46,
  flexShrink: 0,
  borderRadius: 10,
  cursor: 'pointer',
  padding: 0,
  border: '1px solid #5a2d31',
  background: '#2b1a1d',
  color: '#ff7b72',
  fontSize: 16,
  fontWeight: 700
};
const TIME_QUICK = ['10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];
function Cell({
  label,
  wide,
  children
}) {
  return React.createElement("div", {
    style: {
      gridColumn: wide ? '1 / -1' : 'auto',
      minWidth: 0,
      border: `1px solid ${LINE}`,
      borderRadius: 10,
      padding: '7px 8px 8px',
      background: '#1b2130'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: SUB,
      marginBottom: 3,
      fontWeight: 500,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, label), children);
}
const inpS = {
  ...inp,
  padding: '8px 9px',
  height: 40,
  borderRadius: 9,
  fontSize: 14
};
const dateS = {
  ...inpS,
  fontFamily: 'DM Mono, monospace',
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  padding: '6px 6px'
};
const clrS = {
  width: 32,
  height: 40,
  flexShrink: 0,
  borderRadius: 9,
  cursor: 'pointer',
  padding: 0,
  border: '1px solid #5a2d31',
  background: '#2b1a1d',
  color: '#ff7b72',
  fontSize: 15,
  fontWeight: 700
};
function Row({
  label,
  children
}) {
  return React.createElement("div", {
    style: {
      marginTop: 10,
      border: `1px solid ${LINE}`,
      borderRadius: 10,
      padding: 10,
      background: '#1b2130'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: SUB,
      marginBottom: 4,
      fontWeight: 500
    }
  }, label), children);
}
function TextInput({
  value,
  onCommit,
  placeholder,
  style,
  list,
  inputMode
}) {
  const [local, setLocal] = useState(value || '');
  const focused = useRef(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value !== prev.current && !focused.current) setLocal(value || '');
    prev.current = value;
  }, [value]);
  return React.createElement("input", {
    value: local,
    list: list,
    placeholder: placeholder,
    inputMode: inputMode,
    onChange: e => setLocal(e.target.value),
    onFocus: () => focused.current = true,
    onBlur: () => {
      focused.current = false;
      if (local !== (value || '')) onCommit(local);
    },
    style: {
      ...inp,
      ...style
    }
  });
}
function Card({
  r,
  settings,
  open,
  unsaved,
  mailTag,
  suggests,
  nameSuggest,
  onToggle,
  onPatch,
  onDelete,
  onDup,
  onMove
}) {
  const headRef = useRef(null);
  const anchorTop = useRef(null);
  const toggle = () => {
    anchorTop.current = headRef.current ? {
      edge: 'top',
      y: headRef.current.getBoundingClientRect().top
    } : null;
    onToggle();
  };
  const closeFromBottom = e => {
    anchorTop.current = {
      edge: 'bottom',
      y: e.currentTarget.getBoundingClientRect().bottom
    };
    onToggle();
  };
  useLayoutEffect(() => {
    const a = anchorTop.current;
    if (a == null || !headRef.current) return;
    anchorTop.current = null;
    const bar = document.querySelector('[data-sticky-bar]');
    const barBottom = bar ? bar.getBoundingClientRect().bottom : 0;
    const fix = () => {
      if (!headRef.current) return;
      const rect = headRef.current.getBoundingClientRect();
      let diff = (a.edge === 'bottom' ? rect.bottom : rect.top) - a.y;
      if (rect.top - diff < barBottom + 8) diff = rect.top - (barBottom + 8);
      if (Math.abs(diff) > 1) window.scrollBy(0, diff);
    };
    fix();
    const startY = window.scrollY;
    const t = setTimeout(() => {
      if (Math.abs(window.scrollY - startY) > 1) return;
      fix();
    }, 350);
    return () => clearTimeout(t);
  }, [open]);
  const F = settings.fields;
  const fv = r.fields || {};
  const prog = F.filter(f => f.progress).slice(0, 6);
  const done = prog.filter(f => hasVal(f, fv[f.key])).length;
  const dotSize = prog.length <= 3 ? 20 : prog.length === 4 ? 19 : prog.length === 5 ? 17 : 16;
  const dotGap = prog.length <= 4 ? 3 : 2;
  const subs = F.filter(f => f.sub);
  const isBukken = f => /物件|号室|部屋/.test(f.label || '');
  const headSubs = subs.filter(isBukken);
  const restSubs = subs.filter(f => !isBukken(f) && f.key !== settings.mainKey);
  const dateSubs = restSubs.filter(f => f.type === 'date' || f.type === 'datetime');
  const chipSubs = restSubs.filter(f => f.type !== 'date' && f.type !== 'datetime');
  const headTxt = headSubs.map(f => fmtField(f, fv[f.key])).filter(Boolean).join(' ');
  const lineItems = [...(r.name ? [{
    k: '__name',
    t: r.name,
    empty: false
  }] : []), ...chipSubs.map(f => {
    const t = fmtField(f, fv[f.key]);
    const has = !!t && t !== '未定' && t !== '記載なし';
    return {
      k: f.key,
      t: has ? t : `${f.label}：－`,
      empty: !has
    };
  })];
  const main = F.find(f => f.key === settings.mainKey);
  const mainTxt = main ? fmtField(main, fv[main.key]) : '';
  const mainOn = main && hasVal(main, fv[main.key]);
  const mainIsDate = main && (main.type === 'date' || main.type === 'datetime');
  const mainShow = !!(main && main.sub);
  const dateBadges = [...dateSubs.map(f => ({
    f,
    isMain: false
  })), ...(mainIsDate && mainShow ? [{
    f: main,
    isMain: true
  }] : [])].sort((a, b) => F.indexOf(a.f) - F.indexOf(b.f));
  const set = (k, v) => onPatch({
    fields: {
      ...fv,
      [k]: v
    }
  });
  return React.createElement("div", {
    style: {
      background: PANEL,
      borderRadius: 12,
      marginBottom: 10,
      border: `1px solid ${unsaved ? '#6b2f2b' : LINE}`,
      overflow: open ? 'visible' : 'hidden',
      boxShadow: unsaved ? '0 0 0 2px rgba(255,123,114,.14)' : '0 1px 2px rgba(0,0,0,.25)'
    }
  }, React.createElement("div", {
    ref: headRef,
    onClick: toggle,
    style: {
      padding: open ? '10px 14px' : '12px 14px',
      cursor: 'pointer',
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      flexWrap: 'wrap',
      ...(open ? {
        position: 'sticky',
        top: 'var(--barH, 0px)',
        zIndex: 5,
        background: PANEL,
        borderRadius: '12px 12px 0 0',
        borderBottom: `1px solid ${LINE}`,
        boxShadow: '0 4px 8px -6px rgba(0,0,0,.45)'
      } : {})
    }
  }, open ? React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, unsaved && React.createElement("span", {
    style: {
      flexShrink: 0,
      fontSize: 10,
      fontWeight: 700,
      color: '#fff',
      background: '#b3261e',
      borderRadius: 5,
      padding: '2px 6px'
    }
  }, "\u672A\u4FDD\u5B58"), mailTag && React.createElement("span", {
    title: "\u30E1\u30FC\u30EB\u306E\u5185\u5BB9\u3067\u81EA\u52D5\u66F4\u65B0\u3055\u308C\u307E\u3057\u305F",
    style: {
      flexShrink: 0,
      fontSize: 10,
      fontWeight: 700,
      color: ON_GOLD,
      background: GOLD,
      borderRadius: 5,
      padding: '2px 6px'
    }
  }, "\uD83D\uDCE7 \u30E1\u30FC\u30EB\u66F4\u65B0"), React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 17,
      lineHeight: 1.35,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, headTxt || '（未入力）')), React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 500,
      color: SUBTXT,
      marginTop: 2,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, lineItems.filter(it => !it.empty).map(it => it.t).join('　') || '（名前未入力）')), React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#7c8599',
      flexShrink: 0
    }
  }, done, "/", prog.length, " \u25B2")) : React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 15,
      marginBottom: 2,
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, unsaved && React.createElement("span", {
    style: {
      flexShrink: 0,
      fontSize: 10,
      fontWeight: 700,
      color: '#fff',
      background: '#b3261e',
      borderRadius: 5,
      padding: '2px 6px',
      letterSpacing: '.02em'
    }
  }, "\u672A\u4FDD\u5B58"), mailTag && React.createElement("span", {
    title: "\u30E1\u30FC\u30EB\u306E\u5185\u5BB9\u3067\u81EA\u52D5\u66F4\u65B0\u3055\u308C\u307E\u3057\u305F",
    style: {
      flexShrink: 0,
      fontSize: 10,
      fontWeight: 700,
      color: ON_GOLD,
      background: GOLD,
      borderRadius: 5,
      padding: '2px 6px'
    }
  }, "\uD83D\uDCE7 \u30E1\u30FC\u30EB\u66F4\u65B0"), React.createElement("span", {
    style: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, headTxt || '（未入力）')), !!lineItems.length && React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 4,
      marginTop: 3
    }
  }, lineItems.map(it => React.createElement("span", {
    key: it.k,
    style: {
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1.4,
      padding: '2px 8px',
      borderRadius: 6,
      background: it.empty ? '#1d2330' : '#222a3b',
      border: `1px solid ${it.empty ? '#262d3d' : '#33405a'}`,
      color: it.empty ? '#6b7487' : SUBTXT,
      whiteSpace: 'nowrap',
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, it.t)))), React.createElement("div", {
    style: {
      textAlign: 'center',
      flexShrink: 0
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      gap: dotGap,
      marginBottom: 4,
      justifyContent: 'flex-end',
      flexWrap: 'nowrap'
    }
  }, prog.map((f, pi) => {
    const ok = hasVal(f, fv[f.key]);
    return React.createElement("div", {
      key: f.key,
      title: f.label,
      style: {
        width: dotSize,
        height: dotSize,
        flexShrink: 0,
        borderRadius: '50%',
        fontSize: Math.round(dotSize / 2),
        lineHeight: dotSize + 'px',
        textAlign: 'center',
        background: ok ? PROG_COLORS[pi % PROG_COLORS.length] : '#232a3a',
        color: ok ? '#fff' : '#5d667a',
        fontWeight: 700
      }
    }, (f.label || '?').slice(0, 1));
  })), React.createElement("div", {
    style: {
      fontSize: 10,
      color: '#7c8599'
    }
  }, done, "/", prog.length, " ", open ? '▲' : '▼')), React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      marginLeft: 2
    }
  }, React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      onDelete();
    },
    title: "\u3053\u306E1\u4EF6\u3092\u524A\u9664",
    style: {
      width: 34,
      height: 34,
      borderRadius: 9,
      border: '1px solid #5a2d31',
      background: '#2b1a1d',
      color: '#ff7b72',
      fontSize: 15,
      cursor: 'pointer',
      lineHeight: '32px',
      padding: 0
    }
  }, "\uD83D\uDDD1")), React.createElement("div", {
    style: {
      width: '100%'
    }
  }, !!dateBadges.length && React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6
    }
  }, dateBadges.map(({
    f,
    isMain
  }) => {
    const v = fv[f.key];
    const on = hasVal(f, v);
    const txt = fmtField(f, v);
    const rawD = f.type === 'datetime' ? dtVal(v).d : v || '';
    const left = on ? daysLeft(rawD) : null;
    const past = left != null && left < 0;
    const tone = past ? PAST_TONE : on && badgeTone(f.label) || (isMain ? dateTone(on, rawD) : on ? KINSHO_PINK : {
      bg: '#222a3b',
      bd: '#33405a',
      fg: SUBTXT
    });
    return React.createElement("div", {
      key: f.key,
      className: "mono",
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 7,
        maxWidth: '100%',
        fontSize: 13,
        fontWeight: 700,
        background: tone.bg,
        border: `1px solid ${tone.bd}`,
        color: tone.fg
      }
    }, React.createElement("span", {
      style: {
        flexShrink: 0,
        width: 17,
        height: 17,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10.5,
        background: tone.fg,
        color: '#10131a'
      }
    }, (f.label || '?').slice(0, 1)), React.createElement("span", {
      style: {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }
    }, txt || '記載なし'), left != null && React.createElement("span", {
      style: {
        flexShrink: 0,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '.02em',
        padding: '1px 5px',
        borderRadius: 5,
        marginLeft: 1,
        background: past ? '#2a3144' : tone.fg,
        color: past ? tone.fg : '#10131a'
      }
    }, leftLabel(left)));
  })), mainShow && !mainIsDate && mainOn && React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      marginTop: 6,
      padding: '3px 10px',
      borderRadius: 7,
      maxWidth: '100%',
      background: '#2e2713',
      border: '1px solid #6b5a24',
      color: '#e6c874',
      fontSize: 13,
      fontWeight: 700
    }
  }, React.createElement("span", {
    style: {
      flexShrink: 0
    }
  }, "\u26A0"), React.createElement("span", {
    style: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, mainTxt))))), open && React.createElement("div", {
    style: {
      padding: '8px 12px 12px',
      borderTop: `1px solid ${LINE}`
    }
  }, React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
      gridAutoFlow: 'dense'
    }
  }, React.createElement(Cell, {
    label: settings.nameLabel || '名前'
  }, React.createElement(TextInput, {
    value: r.name,
    onCommit: v => onPatch({
      name: v
    }),
    placeholder: settings.nameLabel,
    style: inpS
  })), F.map((f, i) => {
    const opts = f.options || [];
    const sib = g => g && g.type === 'select' && (g.options || []).length === opts.length;
    const paired = f.type === 'select' && opts.length <= 4 && (sib(F[i - 1]) || sib(F[i + 1]));
    const wide = f.type === 'text' && f.key === 'bukken' || f.type === 'datetime' || f.type === 'select' && opts.length > 3 && !paired;
    return React.createElement(Cell, {
      key: f.key,
      label: f.label,
      wide: wide
    }, f.type === 'text' && (() => {
      const cur = fv[f.key] || '';
      if (f.key !== 'bukken') {
        return React.createElement(TextInput, {
          value: cur,
          onCommit: v => set(f.key, v),
          placeholder: f.label,
          style: inpS
        });
      }
      const sg = (suggests || {})[f.key] || [];
      const top = sg.filter(s => s !== cur).slice(0, 1);
      return React.createElement("div", null, React.createElement(TextInput, {
        value: cur,
        onCommit: v => set(f.key, v),
        placeholder: f.label,
        list: `dl_${r.id}_${f.key}`,
        style: inpS
      }), React.createElement("datalist", {
        id: `dl_${r.id}_${f.key}`
      }, sg.map(s => React.createElement("option", {
        key: s,
        value: s
      }))), !!top.length && React.createElement(Chips, {
        items: top.map(s => ({
          v: s,
          l: s
        })),
        value: cur,
        onPick: v => set(f.key, v)
      }));
    })(), f.type === 'select' && (() => {
      const cur = fv[f.key] || '';
      const extra = cur && !opts.includes(cur);
      if (opts.length && opts.length <= 6 && !extra) {
        return React.createElement("div", {
          style: {
            display: 'flex',
            flexWrap: 'wrap',
            gap: 5
          }
        }, opts.map(o => React.createElement("button", {
          key: o,
          type: "button",
          onClick: () => set(f.key, cur === o ? '' : o),
          style: chipBtn(cur === o)
        }, o)), cur && React.createElement("button", {
          type: "button",
          onClick: () => set(f.key, ''),
          style: {
            ...chipBtn(false),
            color: '#ff7b72',
            borderColor: '#5a2d31'
          }
        }, "\u30AF\u30EA\u30A2"));
      }
      return React.createElement("select", {
        value: cur,
        onChange: e => set(f.key, e.target.value),
        style: inpS
      }, React.createElement("option", {
        value: ""
      }, "\u2014 \u672A\u9078\u629E \u2014"), opts.map(o => React.createElement("option", {
        key: o,
        value: o
      }, o)), extra && React.createElement("option", {
        value: cur
      }, cur, "\uFF08\u4E00\u89A7\u5916\uFF09"));
    })(), f.type === 'money' && React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, React.createElement(TextInput, {
      value: fv[f.key] || '',
      onCommit: v => set(f.key, String(v).replace(/[^\d.-]/g, '')),
      placeholder: "\u4F8B\uFF1A1700",
      inputMode: "numeric",
      style: {
        ...inpS,
        flex: 1,
        textAlign: 'right',
        minWidth: 0
      }
    }), React.createElement("span", {
      style: {
        fontSize: 12,
        color: SUB,
        fontWeight: 600,
        flexShrink: 0
      }
    }, "\u4E07\u5186")), f.type === 'date' && React.createElement("div", {
      style: {
        display: 'flex',
        gap: 5
      }
    }, React.createElement("input", {
      type: "date",
      value: fv[f.key] || '',
      onChange: e => set(f.key, e.target.value),
      onClick: e => openPicker(e.currentTarget),
      style: dateS
    }), !!fv[f.key] && React.createElement("button", {
      type: "button",
      "aria-label": "\u65E5\u4ED8\u3092\u6D88\u3059",
      title: "\u65E5\u4ED8\u3092\u6D88\u3059",
      onClick: () => set(f.key, ''),
      style: clrS
    }, "\u2715")), f.type === 'datetime' && (() => {
      const o = dtVal(fv[f.key]);
      return React.createElement("div", null, React.createElement("div", {
        style: {
          display: 'flex',
          gap: 5
        }
      }, React.createElement("input", {
        type: "date",
        value: o.d,
        onChange: e => set(f.key, {
          ...o,
          d: e.target.value,
          none: !e.target.value
        }),
        onClick: e => openPicker(e.currentTarget),
        style: {
          ...dateS,
          flex: 3
        }
      }), React.createElement("select", {
        value: o.t || '',
        onChange: e => set(f.key, {
          ...o,
          t: e.target.value
        }),
        style: {
          ...dateS,
          flex: 2,
          color: o.t ? NAVY : '#7c8599'
        }
      }, React.createElement("option", {
        value: ""
      }, "\u6642\u523B"), o.t && !TIME_15.includes(o.t) && React.createElement("option", {
        value: o.t
      }, o.t), TIME_15.map(t => React.createElement("option", {
        key: t,
        value: t
      }, t))), !!(o.d || o.t) && React.createElement("button", {
        type: "button",
        "aria-label": "\u65E5\u4ED8\u3068\u6642\u523B\u3092\u6D88\u3059",
        title: "\u65E5\u4ED8\u3068\u6642\u523B\u3092\u307E\u3068\u3081\u3066\u6D88\u3059",
        onClick: () => set(f.key, {
          d: '',
          t: '',
          none: true
        }),
        style: clrS
      }, "\u2715")), !o.d && React.createElement("div", {
        style: {
          fontSize: 11,
          color: SUB,
          marginTop: 4
        }
      }, "\u2610 \u8A18\u8F09\u306A\u3057\uFF08\u65E5\u7A0B\u672A\u901A\u77E5\uFF09", React.createElement("span", {
        style: {
          color: '#7c8599'
        }
      }, "\u3000\u203B\u65E5\u4ED8\u3092\u5165\u308C\u308B\u3068\u81EA\u52D5\u3067\u5916\u308C\u308B")));
    })());
  })), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 10
    }
  }, React.createElement("button", {
    onClick: () => onMove(-1),
    style: {
      ...subBtn,
      padding: '10px',
      fontSize: 12,
      whiteSpace: 'nowrap'
    }
  }, "\u25C0 ", monLabel(addMonth(r.month, -1)), "\u3078\u79FB\u3059"), React.createElement("button", {
    onClick: () => onMove(1),
    style: {
      ...subBtn,
      padding: '10px',
      fontSize: 12,
      whiteSpace: 'nowrap'
    }
  }, monLabel(addMonth(r.month, 1)), "\u3078\u79FB\u3059 \u25B6")), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 8
    }
  }, React.createElement("button", {
    onClick: onDup,
    style: {
      ...subBtn,
      padding: '10px',
      fontSize: 12,
      whiteSpace: 'nowrap'
    }
  }, "\u29C9 \u3053\u306E\u884C\u3092\u8907\u88FD"), React.createElement("button", {
    onClick: closeFromBottom,
    style: {
      flex: 1,
      padding: '10px',
      border: `1px solid ${LINE}`,
      background: '#1d2330',
      color: NAVY,
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 500,
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    }
  }, "\u25B2 \u30AB\u30FC\u30C9\u3092\u9589\u3058\u308B"), React.createElement("button", {
    onClick: onDelete,
    style: {
      flex: 1,
      padding: '10px',
      border: '1px solid #5a2d31',
      background: '#2b1a1d',
      color: '#ff7b72',
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 500,
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    }
  }, "\uD83D\uDDD1 \u524A\u9664"))));
}
const MAIL_STATUS = {
  applied: {
    l: '自動で更新',
    bg: 'rgba(214,180,95,.16)',
    fg: '#e6c874'
  },
  review: {
    l: '要確認（未反映）',
    bg: '#2e2713',
    fg: '#f0c75e'
  },
  unmatched: {
    l: '該当カードなし',
    bg: '#222a3b',
    fg: '#9aa3b2'
  },
  skipped: {
    l: '対象外',
    bg: '#1c2230',
    fg: '#6b7487'
  },
  error: {
    l: 'エラー',
    bg: '#2e1b1c',
    fg: '#ff9a92'
  }
};
const fmtAt = iso => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
function MailScreen({
  log,
  settings,
  rows,
  onClose,
  onOpenRow,
  onUndo,
  onApply
}) {
  const fByKey = k => settings.fields.find(f => f.key === k);
  const show = (f, v) => {
    if (v == null || v === '') return '（空）';
    return f ? fmtField(f, v) || '（空）' : String(v);
  };
  const rowTitle = id => {
    const r = rows.find(x => x.id === id);
    if (!r) return '（削除済みのカード）';
    const fv = r.fields || {};
    const t = settings.fields.filter(f => /物件|号室|部屋/.test(f.label || '')).map(f => fmtField(f, fv[f.key])).filter(Boolean).join(' ');
    return [t, r.name].filter(Boolean).join(' ／ ') || '（未入力のカード）';
  };
  const ChangeList = ({
    map,
    proposed
  }) => React.createElement("div", {
    style: {
      marginTop: 8,
      display: 'grid',
      gap: 5
    }
  }, Object.entries(map || {}).map(([k, c]) => {
    const f = fByKey(k);
    const before = proposed ? undefined : c.before,
      after = proposed ? c : c.after;
    return React.createElement("div", {
      key: k,
      style: {
        background: CELL,
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        padding: '6px 9px',
        fontSize: 12.5
      }
    }, React.createElement("div", {
      style: {
        fontSize: 11,
        color: SUB,
        marginBottom: 2
      }
    }, f ? f.label : k), proposed ? React.createElement("div", {
      style: {
        fontWeight: 700,
        color: '#e6c874'
      }
    }, show(f, after)) : React.createElement("div", null, React.createElement("span", {
      style: {
        color: SUB
      }
    }, show(f, before)), " ", React.createElement("span", {
      style: {
        color: GOLD
      }
    }, "\u2192"), " ", React.createElement("b", {
      style: {
        color: '#e6c874'
      }
    }, show(f, after))));
  }));
  return React.createElement("div", {
    style: {
      maxWidth: 560,
      margin: '0 auto',
      paddingBottom: 60
    }
  }, React.createElement("div", {
    style: {
      background: HEAD_BG,
      color: NAVY,
      padding: '14px 16px',
      paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))',
      borderBottom: `1px solid ${GOLD}55`,
      position: 'sticky',
      top: 0,
      zIndex: 10,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700
    }
  }, "\uD83D\uDCE7 \u30E1\u30FC\u30EB\u3067\u306E\u66F4\u65B0\u5C65\u6B74"), React.createElement("button", {
    onClick: onClose,
    style: navBtn
  }, "\u2715 \u9589\u3058\u308B")), React.createElement("div", {
    style: {
      padding: 12
    }
  }, log === null && React.createElement("div", {
    style: {
      background: '#2a2616',
      border: '1px solid #5a4d22',
      borderRadius: 10,
      padding: '12px 14px',
      fontSize: 12.5,
      color: '#e2c978',
      lineHeight: 1.7
    }
  }, "\u30E1\u30FC\u30EB\u9023\u643A\u306E\u6E96\u5099\u304C\u307E\u3060\u3067\u304D\u3068\u3089\u3093\u307F\u305F\u3044\uFF08\u5C65\u6B74\u30C6\u30FC\u30D6\u30EB\u304C\u898B\u3064\u304B\u3089\u3093\uFF09\u3002", React.createElement("br", null), "README \u306E\u624B\u9806 1 \u306E SQL \u3092 Supabase \u3067\u5B9F\u884C\u3057\u3066\u306D\u3002"), log && log.length === 0 && React.createElement("div", {
    style: {
      textAlign: 'center',
      color: SUB,
      fontSize: 13,
      padding: '50px 0',
      lineHeight: 1.8
    }
  }, "\u307E\u3060\u30E1\u30FC\u30EB\u3067\u306E\u66F4\u65B0\u306F\u306A\u304B\u3088\u3002", React.createElement("br", null), "\u5BFE\u8C61\u306E\u30E1\u30FC\u30EB\u304C\u5C4A\u304F\u3068\u3001\u3053\u3053\u306B\u5C65\u6B74\u304C\u51FA\u308B\u3063\u3061\u3083\u3002"), (log || []).map(e => {
    const st = MAIL_STATUS[e.status] || MAIL_STATUS.skipped;
    const exists = e.row_id && rows.some(x => x.id === e.row_id);
    const hasChanges = e.changes && e.changes.fields && Object.keys(e.changes.fields).length;
    const hasProposed = e.proposed && e.proposed.fields && Object.keys(e.proposed.fields).length;
    return React.createElement("div", {
      key: e.id,
      style: {
        background: PANEL,
        border: `1px solid ${!e.seen && (e.status === 'applied' || e.status === 'review') ? GOLD + '88' : LINE}`,
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        opacity: e.undone ? .6 : 1
      }
    }, React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap'
      }
    }, React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 6,
        background: st.bg,
        color: st.fg
      }
    }, st.l), e.undone && React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 6,
        background: '#232a3a',
        color: SUB
      }
    }, "\u5143\u306B\u623B\u3057\u305F"), e.changes && e.changes.created && React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 6,
        background: 'rgba(214,180,95,.16)',
        color: '#e6c874'
      }
    }, "\u65B0\u898F\u30AB\u30FC\u30C9"), React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 11,
        color: SUB,
        marginLeft: 'auto'
      }
    }, fmtAt(e.created_at))), React.createElement("div", {
      style: {
        fontSize: 13.5,
        fontWeight: 700,
        marginTop: 8,
        lineHeight: 1.5
      }
    }, e.subject || '（件名なし）'), e.from_addr && React.createElement("div", {
      style: {
        fontSize: 11,
        color: SUB,
        marginTop: 2,
        wordBreak: 'break-all'
      }
    }, e.from_addr), e.summary && React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: SUBTXT,
        marginTop: 8,
        lineHeight: 1.6
      }
    }, e.summary), e.row_id && React.createElement("div", {
      style: {
        fontSize: 12,
        color: GOLD,
        marginTop: 8
      }
    }, "\u5BFE\u8C61\uFF1A", rowTitle(e.row_id)), hasChanges ? React.createElement(ChangeList, {
      map: e.changes.fields
    }) : null, !hasChanges && hasProposed ? React.createElement(ChangeList, {
      map: e.proposed.fields,
      proposed: true
    }) : null, React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        marginTop: 10,
        flexWrap: 'wrap'
      }
    }, exists && React.createElement("button", {
      onClick: () => onOpenRow(e),
      style: {
        ...subBtn,
        padding: 9,
        fontSize: 12
      }
    }, "\u30AB\u30FC\u30C9\u3092\u958B\u304F"), e.status === 'review' && hasProposed && exists && !e.undone && React.createElement("button", {
      onClick: () => onApply(e),
      style: {
        ...subBtn,
        padding: 9,
        fontSize: 12,
        background: GOLD,
        color: ON_GOLD,
        border: 'none',
        fontWeight: 700
      }
    }, "\u3053\u306E\u5185\u5BB9\u3067\u53CD\u6620"), e.status === 'applied' && hasChanges && exists && !e.undone && React.createElement("button", {
      onClick: () => onUndo(e),
      style: {
        ...subBtn,
        padding: 9,
        fontSize: 12,
        color: '#ff7b72',
        borderColor: '#5a2d31'
      }
    }, "\u21A9 \u5143\u306B\u623B\u3059")));
  })));
}
function SettingsScreen({
  settings,
  onSave,
  onClose,
  email,
  onLogout
}) {
  const [d, setD] = useState(() => JSON.parse(JSON.stringify(settings)));
  const up = p => setD(x => ({
    ...x,
    ...p
  }));
  const updF = (i, p) => setD(x => ({
    ...x,
    fields: x.fields.map((f, idx) => idx === i ? {
      ...f,
      ...p
    } : f)
  }));
  const addF = () => up({
    fields: [...d.fields, {
      key: genKey(),
      label: '',
      type: 'text',
      sub: false,
      progress: true,
      print: true,
      options: []
    }]
  });
  const delF = i => {
    if (!confirm(`「${d.fields[i].label || '(名前なし)'}」を削除する？\n※入力済みの中身も表示されんくなるよ`)) return;
    const nf = d.fields.filter((_, idx) => idx !== i);
    up({
      fields: nf,
      mainKey: d.mainKey === d.fields[i].key ? nf[0] ? nf[0].key : '' : d.mainKey
    });
  };
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= d.fields.length) return;
    const nf = [...d.fields];
    [nf[i], nf[j]] = [nf[j], nf[i]];
    up({
      fields: nf
    });
  };
  const listRef = useRef(null);
  const [dragIdx, setDragIdx] = useState(null);
  const dragRef = useRef(null);
  const reorder = (from, to) => {
    setD(x => {
      if (from === to || from < 0 || to < 0 || from >= x.fields.length || to >= x.fields.length) return x;
      const nf = [...x.fields];
      const [m] = nf.splice(from, 1);
      nf.splice(to, 0, m);
      return {
        ...x,
        fields: nf
      };
    });
  };
  const onDragStart = i => e => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    dragRef.current = i;
    setDragIdx(i);
  };
  const onDragMove = e => {
    if (dragRef.current === null || !listRef.current) return;
    e.preventDefault();
    const cards = Array.from(listRef.current.querySelectorAll('[data-fieldcard]'));
    const y = e.clientY;
    let target = dragRef.current;
    for (let k = 0; k < cards.length; k++) {
      const r = cards[k].getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) {
        target = k;
        break;
      }
      if (k === 0 && y < r.top) {
        target = 0;
        break;
      }
      if (k === cards.length - 1 && y > r.bottom) {
        target = cards.length - 1;
        break;
      }
    }
    if (target !== dragRef.current) {
      reorder(dragRef.current, target);
      dragRef.current = target;
      setDragIdx(target);
    }
  };
  const onDragEnd = e => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    dragRef.current = null;
    setDragIdx(null);
  };
  return React.createElement("div", {
    style: {
      maxWidth: 560,
      margin: '0 auto',
      paddingBottom: 100
    }
  }, React.createElement("div", {
    style: {
      background: HEAD_BG,
      color: NAVY,
      padding: '14px 16px',
      paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))',
      borderBottom: `1px solid ${GOLD}55`,
      position: 'sticky',
      top: 0,
      zIndex: 10,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700
    }
  }, "\u2699 \u9805\u76EE\u306E\u8A2D\u5B9A"), React.createElement("button", {
    onClick: onClose,
    style: navBtn
  }, "\u2715 \u9589\u3058\u308B")), React.createElement("div", {
    style: {
      padding: 12
    }
  }, React.createElement("div", {
    style: {
      background: '#2a2616',
      border: '1px solid #5a4d22',
      borderRadius: 10,
      padding: '10px 12px',
      fontSize: 12,
      color: '#e2c978',
      marginBottom: 12
    }
  }, "\u3053\u3053\u3067\u5909\u3048\u305F\u5185\u5BB9\u306F", React.createElement("b", null, "3\u540D\u5168\u54E1\u306E\u753B\u9762"), "\u306B\u53CD\u6620\u3055\u308C\u308B\u3063\u3061\u3083\u3002\u9805\u76EE\u3092\u6D88\u3059\u3068\u3001\u305D\u306E\u4E2D\u8EAB\u306F\u898B\u3048\u3093\u304F\u306A\u308B\u3051\u3093\u6CE8\u610F\u3057\u3066\u306D\u3002"), React.createElement(Sec, {
    title: "\u57FA\u672C"
  }, React.createElement(Row, {
    label: "\u30A2\u30D7\u30EA\u306E\u30BF\u30A4\u30C8\u30EB"
  }, React.createElement(TextInput, {
    value: d.appTitle,
    onCommit: v => up({
      appTitle: v
    })
  })), React.createElement(Row, {
    label: "\u30B5\u30D6\u30BF\u30A4\u30C8\u30EB"
  }, React.createElement(TextInput, {
    value: d.subTitle,
    onCommit: v => up({
      subTitle: v
    })
  })), React.createElement(Row, {
    label: "1\u5217\u76EE\uFF08\u898B\u51FA\u3057\u306B\u306A\u308B\u9805\u76EE\uFF09\u306E\u540D\u524D"
  }, React.createElement(TextInput, {
    value: d.nameLabel,
    onCommit: v => up({
      nameLabel: v
    })
  })), React.createElement(Row, {
    label: "\u30AB\u30FC\u30C9\u306B\u5927\u304D\u304F\u51FA\u3059\u9805\u76EE"
  }, React.createElement("select", {
    value: d.mainKey,
    onChange: e => up({
      mainKey: e.target.value
    }),
    style: inp
  }, React.createElement("option", {
    value: ""
  }, "\u306A\u3057"), d.fields.map(f => React.createElement("option", {
    key: f.key,
    value: f.key
  }, f.label))))), React.createElement(Sec, {
    title: "\u9805\u76EE\u4E00\u89A7"
  }, d.fields.filter(f => f.progress).length > 6 && React.createElement("div", {
    style: {
      background: '#2b1a1d',
      border: '1px solid #5a2d31',
      borderRadius: 8,
      padding: '8px 10px',
      fontSize: 11.5,
      color: '#ff7b72',
      marginBottom: 10
    }
  }, "\u300C\u9032\u6357\u306E\u4E38\u306B\u5165\u308C\u308B\u300D\u306F", React.createElement("b", null, "6\u500B\u307E\u3067"), "\u3057\u304B\u30AB\u30FC\u30C9\u306B\u51FA\u305B\u3093\u3063\u3061\u3083\u30027\u500B\u76EE\u304B\u3089\u306F\u8868\u793A\u3055\u308C\u3093\u3051\u3093\u3001\u3069\u308C\u304B\u5916\u3057\u3066\u306D\u3002"), React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: SUB,
      marginBottom: 8
    }
  }, "\u283F \u306E\u90E8\u5206\u3092\u9577\u62BC\u3057\u3057\u3066\u4E0A\u4E0B\u306B\u30C9\u30E9\u30C3\u30B0\u3059\u308B\u3068\u3001\u9806\u756A\u3092\u5165\u308C\u66FF\u3048\u3089\u308C\u308B\u3063\u3061\u3083\uFF08\u25B2\u25BC\u3067\u3082\u52D5\u304B\u305B\u308B\uFF09\u3002"), React.createElement("div", {
    ref: listRef
  }, d.fields.map((f, i) => React.createElement("div", {
    key: f.key,
    "data-fieldcard": "1",
    style: {
      border: `1px solid ${dragIdx === i ? '#5b73a8' : LINE}`,
      borderRadius: 10,
      padding: 10,
      marginBottom: 10,
      background: dragIdx === i ? '#1e2740' : '#1b2130',
      boxShadow: dragIdx === i ? '0 4px 12px rgba(0,0,0,.4)' : 'none',
      opacity: dragIdx !== null && dragIdx !== i ? .6 : 1,
      transition: 'background .12s, box-shadow .12s, opacity .12s'
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'flex-start'
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      alignItems: 'center'
    }
  }, React.createElement("button", {
    onClick: () => move(i, -1),
    disabled: i === 0,
    style: arrBtn(i === 0)
  }, "\u25B2"), React.createElement("div", {
    onPointerDown: onDragStart(i),
    onPointerMove: onDragMove,
    onPointerUp: onDragEnd,
    onPointerCancel: onDragEnd,
    title: "\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u4E26\u3079\u66FF\u3048",
    style: {
      touchAction: 'none',
      cursor: 'grab',
      userSelect: 'none',
      width: 34,
      height: 30,
      borderRadius: 8,
      border: `1px solid ${dragIdx === i ? '#5b73a8' : LINE}`,
      background: dragIdx === i ? '#2a3558' : PANEL,
      color: dragIdx === i ? NAVY : '#7c8599',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 15,
      lineHeight: 1
    }
  }, "\u283F"), React.createElement("button", {
    onClick: () => move(i, 1),
    disabled: i === d.fields.length - 1,
    style: arrBtn(i === d.fields.length - 1)
  }, "\u25BC")), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement(TextInput, {
    value: f.label,
    onCommit: v => updF(i, {
      label: v
    }),
    placeholder: "\u9805\u76EE\u540D"
  }), React.createElement("select", {
    value: f.type,
    onChange: e => updF(i, {
      type: e.target.value
    }),
    style: {
      ...inp,
      marginTop: 6
    }
  }, TYPES.map(t => React.createElement("option", {
    key: t.v,
    value: t.v
  }, t.l))), f.type === 'select' && React.createElement("div", {
    style: {
      marginTop: 8,
      background: PANEL,
      border: `1px solid ${LINE}`,
      borderRadius: 8,
      padding: 8
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: SUB,
      marginBottom: 6,
      fontWeight: 500
    }
  }, "\u30D7\u30EB\u30C0\u30A6\u30F3\u306E\u9078\u629E\u80A2\uFF08\u3053\u3053\u3092\u76F4\u3059\u3068\u5168\u54E1\u306E\u753B\u9762\u306B\u53CD\u6620\uFF09"), (f.options || []).map((o, oi) => React.createElement("div", {
    key: oi,
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 6
    }
  }, React.createElement(TextInput, {
    value: o,
    placeholder: "\u9078\u629E\u80A2",
    onCommit: v => {
      const no = [...(f.options || [])];
      if (v.trim()) no[oi] = v.trim();else no.splice(oi, 1);
      updF(i, {
        options: no
      });
    }
  }), React.createElement("button", {
    onClick: () => {
      if (!confirm(`「${o}」を選択肢から消す？\n※すでに選んどる人の分はそのまま残るよ`)) return;
      updF(i, {
        options: (f.options || []).filter((_, x) => x !== oi)
      });
    },
    style: {
      border: '1px solid #5a2d31',
      background: '#2b1a1d',
      color: '#ff7b72',
      borderRadius: 8,
      padding: '0 10px',
      fontSize: 12,
      cursor: 'pointer'
    }
  }, "\uD83D\uDDD1"))), React.createElement("button", {
    onClick: () => updF(i, {
      options: [...(f.options || []), '']
    }),
    style: {
      ...subBtn,
      width: '100%',
      borderStyle: 'dashed',
      padding: 8,
      fontSize: 12
    }
  }, "\uFF0B \u9078\u629E\u80A2\u3092\u8FFD\u52A0")), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginTop: 8,
      flexWrap: 'wrap'
    }
  }, React.createElement("label", {
    style: chk
  }, React.createElement("input", {
    type: "checkbox",
    checked: !!f.progress,
    onChange: e => updF(i, {
      progress: e.target.checked
    })
  }), "\u9032\u6357\u306E\u4E38\u306B\u5165\u308C\u308B"), React.createElement("label", {
    style: chk
  }, React.createElement("input", {
    type: "checkbox",
    checked: !!f.sub,
    onChange: e => updF(i, {
      sub: e.target.checked
    })
  }), "\u9589\u3058\u305F\u72B6\u614B\u3067\u3082\u8868\u793A"), React.createElement("label", {
    style: chk
  }, React.createElement("input", {
    type: "checkbox",
    checked: inPrint(f),
    onChange: e => updF(i, {
      print: e.target.checked
    })
  }), "\u5370\u5237\u306B\u542B\u3080"))), React.createElement("button", {
    onClick: () => delF(i),
    style: {
      border: '1px solid #5a2d31',
      background: '#2b1a1d',
      color: '#ff7b72',
      borderRadius: 8,
      padding: '6px 8px',
      fontSize: 12,
      cursor: 'pointer'
    }
  }, "\uD83D\uDDD1"))))), React.createElement("button", {
    onClick: addF,
    style: {
      ...subBtn,
      width: '100%',
      borderStyle: 'dashed'
    }
  }, "\uFF0B \u9805\u76EE\u3092\u8FFD\u52A0")), React.createElement(Sec, {
    title: "\u30A2\u30AB\u30A6\u30F3\u30C8"
  }, React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: SUBTXT,
      margin: '6px 0 10px',
      wordBreak: 'break-all'
    }
  }, "\u30ED\u30B0\u30A4\u30F3\u4E2D\uFF1A", email || '（不明）'), React.createElement("button", {
    onClick: () => {
      if (confirm('ログアウトする？')) onLogout();
    },
    style: {
      ...subBtn,
      width: '100%',
      color: '#ff7b72',
      borderColor: '#5a2d31'
    }
  }, "\u30ED\u30B0\u30A2\u30A6\u30C8"))), React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 12,
      paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
      background: 'linear-gradient(transparent,#0d1017 35%)'
    }
  }, React.createElement("div", {
    style: {
      maxWidth: 560,
      margin: '0 auto',
      display: 'flex',
      gap: 8
    }
  }, React.createElement("button", {
    onClick: onClose,
    style: {
      ...subBtn,
      flex: 1,
      padding: 14
    }
  }, "\u30AD\u30E3\u30F3\u30BB\u30EB"), React.createElement("button", {
    onClick: () => onSave(d),
    style: {
      flex: 2,
      padding: 14,
      background: `linear-gradient(180deg,#e3c577,${GOLD})`,
      color: ON_GOLD,
      border: 'none',
      borderRadius: 12,
      fontSize: 15,
      fontWeight: 700,
      cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(214,180,95,.28)'
    }
  }, "\u4FDD\u5B58\u3059\u308B"))));
}
const chk = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 12,
  color: SUB
};
const arrBtn = dis => ({
  border: `1px solid ${LINE}`,
  background: dis ? '#1c2230' : PANEL,
  color: dis ? '#4a5266' : NAVY,
  borderRadius: 6,
  width: 28,
  height: 24,
  fontSize: 10,
  cursor: dis ? 'default' : 'pointer',
  padding: 0
});
function Sec({
  title,
  children
}) {
  return React.createElement("div", {
    style: {
      background: PANEL,
      border: `1px solid ${LINE}`,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      marginBottom: 4
    }
  }, title), children);
}
function App({
  email,
  onLogout
}) {
  const [all, setAll] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [screen, setScreen] = useState('main');
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(ym(new Date()));
  const [extraMonths, setExtraMonths] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);
  const [pending, setPending] = useState({});
  const [query, setQuery] = useState('');
  const [bankPick, setBankPick] = useState('');
  const [mailLog, setMailLog] = useState([]);
  const [printPick, setPrintPick] = useState(null);
  const lock = useRef(0);
  const first = useRef(true);
  const retrying = useRef(false);
  const toastTimer = useRef(null);
  const pendingRef = useRef({});
  const flash = (m, bad) => {
    setToast({
      m,
      bad: !!bad
    });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), bad ? 3600 : 1600);
  };
  const reloadMail = useCallback(async () => {
    setMailLog(await dbLoadMail());
  }, []);
  const reload = useCallback(async () => {
    const [data, st, ml] = await Promise.all([dbLoad(), dbLoadSettings(), dbLoadMail()]);
    setMailLog(ml);
    const q = pendingRef.current;
    setAll(Object.keys(q).length ? data.map(r => q[r.id] ? {
      ...r,
      ...q[r.id]
    } : r) : data);
    if (st) setSettings({
      ...DEFAULT_SETTINGS,
      ...st
    });
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
    const ch = sb.channel('axia_kinsho_rt').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: TABLE
    }, () => {
      if (Date.now() - lock.current < 3000) return;
      reload();
    }).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: STABLE
    }, () => {
      if (Date.now() - lock.current < 3000) return;
      reload();
    }).on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: MTABLE
    }, p => {
      const n = p.new || {};
      if (n.status === 'applied') flash('📧 メールで更新：' + (n.summary || n.subject || ''));else if (n.status === 'review') flash('📧 メールの内容を要確認：' + (n.subject || ''));
      reload();
    }).subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [reload]);
  pendingRef.current = pending;
  const barObs = useRef(null);
  const barRef = useCallback(el => {
    if (barObs.current) {
      barObs.current.disconnect();
      barObs.current = null;
    }
    if (!el) return;
    const setH = () => document.documentElement.style.setProperty('--barH', el.getBoundingClientRect().height + 'px');
    setH();
    if (window.ResizeObserver) {
      barObs.current = new ResizeObserver(setH);
      barObs.current.observe(el);
    }
  }, []);
  const rows = all.filter(r => r.month === month);
  const sendPatch = useCallback(async (id, p) => {
    lock.current = Date.now();
    const res = await dbUpdate(id, p);
    if (res.ok) {
      setPending(q => {
        if (!q[id]) return q;
        const n = {
          ...q
        };
        delete n[id];
        return n;
      });
      return true;
    }
    setPending(q => ({
      ...q,
      [id]: {
        ...(q[id] || {}),
        ...p
      }
    }));
    return false;
  }, []);
  const patch = (id, p) => {
    lock.current = Date.now();
    setAll(a => a.map(r => r.id === id ? {
      ...r,
      ...p
    } : r));
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
  useEffect(() => {
    if (!Object.keys(pending).length) return;
    const t = setInterval(retryAll, 20000);
    window.addEventListener('online', retryAll);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', retryAll);
    };
  }, [pending, retryAll]);
  useEffect(() => {
    const h = e => {
      if (Object.keys(pending).length) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [pending]);
  const del = async id => {
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
    const res = await dbInsert({
      month,
      name: '',
      fields: {},
      sort_order: maxSo + 1000
    });
    if (!res.ok) return flash('⚠ 追加できんかった（通信を確認して）', true);
    setAll(a => [...a, res.data]);
    setOpenId(res.data.id);
    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 120);
  };
  const moveMonth = (r, dir) => {
    const to = addMonth(r.month, dir);
    const maxSo = all.filter(x => x.month === to).reduce((m, x) => Math.max(m, x.sort_order ?? 0), 0);
    setOpenId(null);
    setExtraMonths(e => [...e, to]);
    patch(r.id, {
      month: to,
      sort_order: maxSo + 1000
    });
  };
  const dup = async r => {
    lock.current = Date.now();
    const mf = settings.fields.find(f => f.key === settings.mainKey);
    const nf = {
      ...(r.fields || {})
    };
    if (mf) delete nf[mf.key];
    const maxSo = all.filter(x => x.month === month).reduce((m, x) => Math.max(m, x.sort_order ?? 0), 0);
    const res = await dbInsert({
      month,
      name: r.name,
      fields: nf,
      sort_order: maxSo + 1000
    });
    if (!res.ok) return flash('⚠ 複製できんかった（通信を確認して）', true);
    setAll(a => [...a, res.data]);
    setOpenId(res.data.id);
    flash('複製したばい');
    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 120);
  };
  const mainF = settings.fields.find(f => f.key === settings.mainKey);
  const apprF = settings.fields.find(f => /契約/.test(f.label || ''));
  const kinshoF = settings.fields.find(f => /金消/.test(f.label || ''));
  const dOf = (f, r) => {
    if (!f) return '';
    const v = (r.fields || {})[f.key];
    return f.type === 'datetime' ? dtVal(v).d : typeof v === 'string' ? v : '';
  };
  const tOf = (f, r) => f && f.type === 'datetime' ? dtVal((r.fields || {})[f.key]).t || '' : '';
  const sortKey = r => {
    const c = daysLeft(dOf(apprF, r)),
      k = daysLeft(dOf(kinshoF, r));
    const near = x => x == null ? 9e9 : x;
    if (k != null && k < 0) return [5, -k, ''];
    if (c != null && c >= 0) return [1, c, tOf(apprF, r), near(k), tOf(kinshoF, r)];
    if (k != null) return [2, k, tOf(kinshoF, r)];
    if (c != null) return [3, -c, ''];
    return [4, 0, ''];
  };
  const byAppr = (a, b) => {
    const x = sortKey(a),
      y = sortKey(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const p = x[i] ?? '',
        q = y[i] ?? '';
      if (p === q) continue;
      return typeof p === 'number' && typeof q === 'number' ? p - q : String(p).localeCompare(String(q));
    }
    return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
  };
  const pendingCount = Object.keys(pending).length;
  const unseenMail = (mailLog || []).filter(e => !e.seen && (e.status === 'applied' || e.status === 'review'));
  const mailRowIds = new Set(unseenMail.filter(e => e.status === 'applied' && !e.undone && e.row_id).map(e => e.row_id));
  const markSeen = async list => {
    const ids = list.map(e => e.id);
    if (!ids.length) return;
    setMailLog(l => (l || []).map(e => ids.includes(e.id) ? {
      ...e,
      seen: true
    } : e));
    await dbMailPatch(ids, {
      seen: true
    });
  };
  const openFromMail = e => {
    const r = all.find(x => x.id === e.row_id);
    if (!r) return flash('そのカードはもう無かよ', true);
    markSeen(unseenMail.filter(x => x.row_id === r.id));
    setScreen('main');
    setMonth(r.month);
    setQuery('');
    setBankPick('');
    setOpenId(r.id);
  };
  const undoMail = async e => {
    const r = all.find(x => x.id === e.row_id);
    if (!r) return flash('そのカードはもう無かよ', true);
    if (e.changes && e.changes.created) {
      if (!confirm('このメールで作ったカードを削除して、元に戻す？')) return;
      lock.current = Date.now();
      const res = await dbDelete(r.id);
      if (!res.ok) return flash('⚠ 削除できんかった（通信を確認して）', true);
      setAll(a => a.filter(x => x.id !== r.id));
      await dbMailPatch(e.id, {
        undone: true,
        seen: true
      });
      reloadMail();
      return flash('カードを削除して元に戻したばい');
    }
    if (!confirm('このメールでの更新を元に戻す？')) return;
    const fv = {
      ...(r.fields || {})
    };
    Object.entries(e.changes && e.changes.fields || {}).forEach(([k, c]) => {
      if (c.before == null) delete fv[k];else fv[k] = c.before;
    });
    patch(r.id, {
      fields: fv
    });
    await dbMailPatch(e.id, {
      undone: true,
      seen: true
    });
    reloadMail();
  };
  const applyMail = async e => {
    const r = all.find(x => x.id === e.row_id);
    if (!r) return flash('そのカードはもう無かよ', true);
    const fv = {
        ...(r.fields || {})
      },
      ch = {};
    Object.entries(e.proposed && e.proposed.fields || {}).forEach(([k, v]) => {
      ch[k] = {
        before: fv[k] ?? null,
        after: v
      };
      fv[k] = v;
    });
    patch(r.id, {
      fields: fv
    });
    await dbMailPatch(e.id, {
      status: 'applied',
      changes: {
        fields: ch
      },
      seen: true
    });
    reloadMail();
  };
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
    all.forEach(r => {
      const v = (r.name || '').trim();
      if (v) c[v] = (c[v] || 0) + 1;
    });
    return Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 20);
  }, [all]);
  const bankF = settings.fields.find(f => /銀行/.test(f.label || ''));
  const bankOpts = bankF && bankF.options || [];
  const bukkenF = settings.fields.find(f => f.key === 'bukken') || settings.fields.find(f => /物件/.test(f.label || ''));
  const AXIA_RE = /AXIA|アクシア/i;
  const isNew = r => !!bukkenF && AXIA_RE.test(String((r.fields || {})[bukkenF.key] || '')) || !!bankF && ((r.fields || {})[bankF.key] || '') === 'SBI';
  const K_NEW = 'type::new',
    K_USED = 'type::used';
  const chipGroups = [[''], bukkenF ? [K_NEW, K_USED] : [], bankOpts].filter(g => g.length);
  const chipLabel = b => b === K_NEW ? '新築' : b === K_USED ? '中古' : b;
  const matchBank = (r, b) => {
    if (b === K_NEW) return isNew(r);
    if (b === K_USED) return !isNew(r);
    return ((r.fields || {})[bankF.key] || '') === b;
  };
  const hit = r => {
    if (bankPick && bankF && !matchBank(r, bankPick)) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const fv = r.fields || {};
    const txt = [r.name || '', ...settings.fields.map(f => fmtField(f, fv[f.key]))].join(' ').toLowerCase();
    return q.split(/\s+/).every(w => txt.includes(w));
  };
  const sorted = [...rows].filter(hit).sort(byAppr);
  const otherMonthHits = query.trim() ? all.filter(r => r.month !== month && hit(r)).length : 0;
  const exportCols = () => {
    const F = settings.fields;
    const isBukken = f => /物件|号室|部屋/.test(f.label || '');
    const fld = f => ({
      label: f.label,
      get: r => fmtField(f, (r.fields || {})[f.key]),
      f
    });
    return [...F.filter(isBukken).map(fld), {
      label: settings.nameLabel || '名前',
      get: r => r.name || ''
    }, ...F.filter(f => !isBukken(f)).map(fld)];
  };
  const printTable = months => {
    const ms = (months && months.length ? [...months] : [month]).sort();
    const target = ms.flatMap(k => all.filter(r => r.month === k && hit(r)).sort(byAppr));
    if (!target.length) return flash('印刷する行がなかばい');
    const cols = exportCols().filter(c => !c.f || inPrint(c.f));
    const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const cell = (c, r, txt) => {
      const f = c.f;
      if (!f || f.type !== 'date' && f.type !== 'datetime' || !txt) return esc(txt);
      const v = (r.fields || {})[f.key];
      const rawD = f.type === 'datetime' ? dtVal(v).d : v || '';
      const left = daysLeft(rawD);
      if (left == null) return esc(txt);
      const past = left < 0;
      const tone = past ? PAST_TONE_P : badgeToneP(f.label) || {
        bg: '#eef1f7',
        bd: '#d8dee9',
        fg: SUBTXT_P
      };
      return `<span style="color:${tone.fg}">${esc(txt)}</span>` + `<span class="tag" style="background:${past ? '#e6e9ee' : tone.fg};color:${past ? tone.fg : '#fff'}">${esc(leftLabel(left))}</span>`;
    };
    const nameIdx = cols.findIndex(c => c.label === (settings.nameLabel || '名前'));
    const th = cols.map((c, ci) => `<th${ci === nameIdx || /銀行/.test(c.label || '') ? ' class="nm"' : ''}>${esc(c.label)}</th>`).join('');
    const multi = ms.length > 1;
    let curM = null,
      zebra = 0;
    const tr = target.map(r => {
      let band = '';
      if (multi && r.month !== curM) {
        curM = r.month;
        zebra = 0;
        const n = target.filter(x => x.month === curM).length;
        band = `<tr class="band"><td colspan="${cols.length}">${esc(ymLabel(curM))}　（${n}件）</td></tr>`;
      }
      const row = `<tr${zebra++ % 2 ? ' class="alt"' : ''}>` + cols.map((c, ci) => {
        const txt = c.get(r);
        const nowrap = ci === nameIdx || /銀行/.test(c.label || '');
        return `<td class="${ci === 0 || ci === nameIdx ? 'l' : 'c'}${nowrap ? ' nm' : ''}">${cell(c, r, txt) || '&nbsp;'}</td>`;
      }).join('') + '</tr>';
      return band + row;
    }).join('');
    const titleM = !multi ? ymLabel(ms[0]) : ms.length <= 3 ? ms.map(ymLabel).join('・') : `${ymLabel(ms[0])}〜${ymLabel(ms[ms.length - 1])}（${ms.length}ヶ月分）`;
    const P1_ROWS = 10;
    const PAGE_MM = 210 - 12 * 2;
    const HEAD_MM = 19;
    const TH_MM = 8;
    const BAND_MM = 7;
    const SAFE_MM = 3;
    const p1Bands = multi ? new Set(target.slice(0, P1_ROWS).map(r => r.month)).size : 0;
    const ROW_MM = Math.floor((PAGE_MM - HEAD_MM - TH_MM - SAFE_MM - p1Bands * BAND_MM) / P1_ROWS * 10) / 10;
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
    const old = document.getElementById('__printFrame');
    if (old) old.remove();
    const fr = document.createElement('iframe');
    fr.id = '__printFrame';
    fr.setAttribute('aria-hidden', 'true');
    fr.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;border:0;';
    document.body.appendChild(fr);
    const doc = fr.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    let done = false;
    const cleanup = () => {
      setTimeout(() => {
        const el = document.getElementById('__printFrame');
        if (el) el.remove();
      }, 500);
    };
    const go = () => {
      if (done) return;
      done = true;
      try {
        fr.contentWindow.focus();
        fr.contentWindow.onafterprint = cleanup;
        fr.contentWindow.print();
        setTimeout(cleanup, 60000);
      } catch (e) {
        flash('⚠ 印刷ダイアログが出せんかった', true);
        cleanup();
      }
    };
    const img = doc.querySelector('img');
    if (img && !img.complete) {
      img.onload = go;
      img.onerror = go;
      setTimeout(go, 2500);
    } else setTimeout(go, 400);
  };
  const carryOver = async () => {
    const prev = addMonth(month, -1);
    const src = all.filter(r => r.month === prev && !(mainF && hasVal(mainF, (r.fields || {})[mainF.key])));
    if (!src.length) return flash('繰越対象なし');
    lock.current = Date.now();
    let so = all.filter(r => r.month === month).reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0);
    let ok = 0,
      ng = 0;
    for (const r of src) {
      const nf = {
        ...(r.fields || {})
      };
      if (mainF) delete nf[mainF.key];
      so += 1000;
      const res = await dbInsert({
        month,
        name: r.name,
        fields: nf,
        sort_order: so
      });
      if (res.ok) {
        setAll(a => [...a, res.data]);
        ok++;
      } else ng++;
    }
    flash(ng ? `⚠ ${ok}件は繰越できたけど${ng}件が失敗（通信を確認して）` : `${ok}件を繰越`, !!ng);
  };
  const saveSettings = async s => {
    lock.current = Date.now();
    setSettings(s);
    const res = await dbSaveSettings(s);
    setScreen('main');
    flash(res.ok ? '設定を保存したばい' : '⚠ 設定が保存できとらん（もう一回保存して）', !res.ok);
  };
  const monthKeys = Array.from(new Set([...all.map(r => r.month), ...extraMonths, month, ym(new Date())])).sort();
  const goMonth = n => {
    const next = addMonth(month, n);
    setExtraMonths(e => [...e, next]);
    setMonth(next);
    setOpenId(null);
  };
  const progF = settings.fields.filter(f => f.progress);
  const doneCount = rows.filter(r => progF.length && progF.every(f => hasVal(f, (r.fields || {})[f.key]))).length;
  if (screen === 'mail') {
    return React.createElement(MailScreen, {
      log: mailLog,
      settings: settings,
      rows: all,
      onClose: () => {
        markSeen(unseenMail.filter(e => e.status !== 'review'));
        setScreen('main');
      },
      onOpenRow: openFromMail,
      onUndo: undoMail,
      onApply: applyMail
    });
  }
  if (screen === 'settings') {
    return React.createElement(SettingsScreen, {
      settings: settings,
      onSave: saveSettings,
      onClose: () => setScreen('main'),
      email: email,
      onLogout: onLogout
    });
  }
  return React.createElement("div", {
    style: {
      maxWidth: 560,
      margin: '0 auto',
      paddingBottom: 90
    }
  }, React.createElement("div", {
    "data-sticky-bar": true,
    ref: barRef,
    style: {
      background: HEAD_BG,
      color: NAVY,
      padding: '14px 16px',
      paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))',
      borderBottom: `1px solid ${GOLD}55`,
      boxShadow: '0 6px 18px rgba(0,0,0,.35)',
      position: 'sticky',
      top: 0,
      zIndex: 10
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      letterSpacing: '.02em'
    }
  }, settings.appTitle), React.createElement("div", {
    style: {
      fontSize: 11,
      opacity: .7,
      marginTop: 2
    }
  }, settings.subTitle)), React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, React.createElement("button", {
    onClick: () => setPrintPick([month]),
    title: "\u5370\u5237\u3059\u308B",
    style: {
      ...navBtn,
      fontSize: 16,
      padding: '6px 10px'
    }
  }, "\uD83D\uDDA8"), React.createElement("button", {
    onClick: () => setScreen('mail'),
    title: "\u30E1\u30FC\u30EB\u3067\u306E\u66F4\u65B0\u5C65\u6B74",
    style: {
      ...navBtn,
      fontSize: 16,
      padding: '6px 10px',
      position: 'relative'
    }
  }, "\uD83D\uDCE7", !!unseenMail.length && React.createElement("span", {
    style: {
      position: 'absolute',
      top: -5,
      right: -5,
      minWidth: 17,
      height: 17,
      borderRadius: 9,
      background: GOLD,
      color: ON_GOLD,
      fontSize: 10.5,
      fontWeight: 700,
      lineHeight: '17px',
      textAlign: 'center',
      padding: '0 4px'
    }
  }, unseenMail.length)), React.createElement("button", {
    onClick: () => setScreen('settings'),
    style: {
      ...navBtn,
      fontSize: 16,
      padding: '6px 10px'
    }
  }, "\u2699"), React.createElement("img", {
    src: LOGO,
    alt: "AXIA JAPAN",
    style: {
      height: 30,
      opacity: .95
    },
    onError: e => e.target.style.display = 'none'
  }))), React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 12
    }
  }, React.createElement("button", {
    onClick: () => goMonth(-1),
    style: navBtn
  }, "\u25C0"), React.createElement("select", {
    value: month,
    onChange: e => {
      setMonth(e.target.value);
      setOpenId(null);
    },
    style: {
      flex: 1,
      padding: '8px 10px',
      borderRadius: 8,
      border: 'none',
      background: 'rgba(255,255,255,.08)',
      color: '#fff',
      fontSize: 15,
      fontWeight: 700,
      textAlign: 'center'
    }
  }, monthKeys.map(k => React.createElement("option", {
    key: k,
    value: k,
    style: {
      color: '#000'
    }
  }, ymLabel(k)))), React.createElement("button", {
    onClick: () => goMonth(1),
    style: navBtn
  }, "\u25B6")), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginTop: 8
    }
  }, React.createElement("input", {
    value: query,
    onChange: e => setQuery(e.target.value),
    placeholder: "\uD83D\uDD0D \u7269\u4EF6\u540D\u30FB\u540D\u524D\u30FB\u9280\u884C\u306A\u3069\u3067\u7D5E\u308A\u8FBC\u307F",
    style: {
      flex: 1,
      padding: '8px 10px',
      borderRadius: 8,
      border: 'none',
      background: 'rgba(255,255,255,.08)',
      color: '#fff',
      fontSize: 13
    }
  }), query && React.createElement("button", {
    onClick: () => setQuery(''),
    style: navBtn
  }, "\u2715")), !!bankOpts.length && React.createElement("div", {
    style: {
      display: 'flex',
      gap: 5,
      marginTop: 8,
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center'
    }
  }, chipGroups.map((g, gi) => React.createElement(React.Fragment, {
    key: gi
  }, gi > 0 && React.createElement("span", {
    style: {
      width: 1,
      height: 18,
      background: 'rgba(255,255,255,.3)',
      margin: '0 3px'
    }
  }), g.map(b => {
    const on = bankPick === b;
    const n = b ? rows.filter(r => matchBank(r, b)).length : rows.length;
    return React.createElement("button", {
      key: b || '__all',
      onClick: () => setBankPick(b),
      style: {
        padding: '5px 11px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        border: `1px solid ${on ? GOLD : 'rgba(255,255,255,.25)'}`,
        background: on ? GOLD : 'rgba(255,255,255,.07)',
        color: on ? ON_GOLD : NAVY
      }
    }, b ? chipLabel(b) : '全部', " ", n);
  })))), React.createElement("div", {
    style: {
      fontSize: 11,
      opacity: .75,
      marginTop: 8,
      textAlign: 'center'
    }
  }, "\u5168 ", rows.length, " \u4EF6", query || bankPick ? ` ／ 該当 ${sorted.length} 件` : '', " \uFF0F \u5168\u9805\u76EE\u305D\u308D\u3044 ", doneCount, " \u4EF6 \u30FB \u30C1\u30FC\u30E0\u540C\u671F\u4E2D", mailLog !== null ? ' ・ メール連携' : '', " \u30FB v14.0.0")), !!pendingCount && React.createElement("div", {
    style: {
      margin: '0 12px',
      background: '#2e1b1c',
      border: '1px solid #6b2f2b',
      borderRadius: 10,
      padding: '9px 12px',
      fontSize: 12.5,
      color: '#ff9a92',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 12
    }
  }, React.createElement("span", {
    style: {
      flex: 1,
      lineHeight: 1.5
    }
  }, "\u26A0 ", React.createElement("b", null, pendingCount, "\u4EF6"), "\u304C\u307E\u3060\u4FDD\u5B58\u3067\u304D\u3068\u3089\u3093\u300220\u79D2\u304A\u304D\u306B\u81EA\u52D5\u3067\u518D\u9001\u3057\u3088\u308B\u3063\u3061\u3083\u3002"), React.createElement("button", {
    onClick: retryAll,
    style: {
      border: '1px solid #ff7b72',
      background: PANEL,
      color: '#ff7b72',
      borderRadius: 8,
      padding: '6px 12px',
      fontSize: 12,
      fontWeight: 700,
      cursor: 'pointer',
      flexShrink: 0
    }
  }, "\u4ECA\u3059\u3050\u518D\u9001")), React.createElement("div", {
    style: {
      padding: '12px 12px 0'
    }
  }, loading && React.createElement("div", {
    style: {
      textAlign: 'center',
      color: '#7c8599',
      fontSize: 13,
      padding: '50px 0'
    }
  }, "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026"), !loading && sorted.length === 0 && React.createElement("div", {
    style: {
      textAlign: 'center',
      color: '#7c8599',
      fontSize: 13,
      padding: '50px 0',
      lineHeight: 1.8
    }
  }, query.trim() ? React.createElement(React.Fragment, null, "\u300C", query, "\u300D\u306B\u5408\u3046\u884C\u306F", ymLabel(month), "\u306B\u306F\u306A\u304B\u3088\u3002", React.createElement("br", null), otherMonthHits ? `ほかの月には ${otherMonthHits} 件あるっちゃ。` : '') : React.createElement(React.Fragment, null, "\u3053\u306E\u6708\u306E\u30C7\u30FC\u30BF\u306F\u307E\u3060\u306A\u304B\u3088\u3002", React.createElement("br", null), "\u4E0B\u306E\u300C\uFF0B \u8FFD\u52A0\u300D\u304B\u3089\u5165\u308C\u3066\u306D\u3002")), !loading && sorted.length > 0 && !!otherMonthHits && React.createElement("div", {
    style: {
      textAlign: 'center',
      color: '#7c8599',
      fontSize: 11.5,
      marginBottom: 8
    }
  }, "\u307B\u304B\u306E\u6708\u306B\u3082 ", otherMonthHits, " \u4EF6\u30D2\u30C3\u30C8\u3057\u3068\u308B\u3088"), sorted.map((r, i) => React.createElement(Card, {
    key: r.id,
    r: r,
    settings: settings,
    open: openId === r.id,
    unsaved: !!pending[r.id],
    suggests: suggests,
    nameSuggest: nameSuggest,
    mailTag: mailRowIds.has(r.id),
    onToggle: () => {
      if (openId !== r.id && mailRowIds.has(r.id)) markSeen(unseenMail.filter(x => x.row_id === r.id));
      setOpenId(openId === r.id ? null : r.id);
    },
    onPatch: p => patch(r.id, p),
    onDelete: () => del(r.id),
    onDup: () => dup(r),
    onMove: d => moveMonth(r, d)
  })), !loading && React.createElement("div", null, React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 14
    }
  }, React.createElement("button", {
    onClick: carryOver,
    style: subBtn
  }, "\u21AA \u524D\u6708\u304B\u3089\u7E70\u8D8A")))), React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 12,
      paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
      background: 'linear-gradient(transparent,#0d1017 35%)'
    }
  }, React.createElement("div", {
    style: {
      maxWidth: 560,
      margin: '0 auto'
    }
  }, React.createElement("button", {
    onClick: add,
    style: {
      width: '100%',
      padding: '14px',
      background: `linear-gradient(180deg,#e3c577,${GOLD})`,
      color: ON_GOLD,
      border: 'none',
      borderRadius: 12,
      fontSize: 15,
      fontWeight: 700,
      cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(214,180,95,.28)'
    }
  }, "\uFF0B \u8FFD\u52A0"))), printPick && React.createElement("div", {
    onClick: () => setPrintPick(null),
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,.6)',
      zIndex: 30,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center'
    }
  }, React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: PANEL,
      width: '100%',
      maxWidth: 560,
      borderRadius: '16px 16px 0 0',
      padding: '16px 16px 20px',
      maxHeight: '82vh',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 -6px 24px rgba(0,0,0,.18)'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: NAVY
    }
  }, "\u5370\u5237\u3059\u308B\u6708\u3092\u9078\u3093\u3067\u306D"), React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: '#8d96a8',
      marginTop: 4,
      lineHeight: 1.6
    }
  }, "\u8907\u6570\u9078\u3076\u3068\u3001\u6539\u30DA\u30FC\u30B8\u305B\u305A\u6708\u306E\u533A\u5207\u308A\u3092\u631F\u3093\u3067\u7D9A\u3051\u3066\u5370\u5237\u3059\u308B\u3063\u3061\u3083\u3002"), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      margin: '12px 0 10px'
    }
  }, React.createElement("button", {
    onClick: () => setPrintPick([month]),
    style: {
      ...subBtn,
      padding: '8px'
    }
  }, "\u4ECA\u6708\u3060\u3051"), React.createElement("button", {
    onClick: () => setPrintPick(monthKeys.filter(k => all.some(r => r.month === k))),
    style: {
      ...subBtn,
      padding: '8px'
    }
  }, "\u30C7\u30FC\u30BF\u306E\u3042\u308B\u6708\u305C\u3093\u3076")), React.createElement("div", {
    style: {
      overflowY: 'auto',
      border: `1px solid ${LINE}`,
      borderRadius: 10,
      flex: 1
    }
  }, monthKeys.map(k => {
    const n = all.filter(r => r.month === k && hit(r)).length;
    const on = printPick.includes(k);
    return React.createElement("label", {
      key: k,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 12px',
        borderBottom: `1px solid ${LINE}`,
        cursor: n ? 'pointer' : 'default',
        background: on ? '#1e2740' : PANEL,
        opacity: n ? 1 : .45
      }
    }, React.createElement("input", {
      type: "checkbox",
      checked: on,
      disabled: !n,
      onChange: () => setPrintPick(p => on ? p.filter(x => x !== k) : [...p, k]),
      style: {
        width: 17,
        height: 17,
        accentColor: GOLD
      }
    }), React.createElement("span", {
      style: {
        flex: 1,
        fontSize: 14,
        fontWeight: on ? 700 : 500,
        color: '#111'
      }
    }, ymLabel(k)), React.createElement("span", {
      style: {
        fontSize: 12,
        color: '#8d96a8'
      }
    }, n ? `${fmtNum(n)} 件` : 'データなし'));
  })), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 12
    }
  }, React.createElement("button", {
    onClick: () => setPrintPick(null),
    style: subBtn
  }, "\u3084\u3081\u308B"), React.createElement("button", {
    disabled: !printPick.length,
    onClick: () => {
      const ms = [...printPick];
      setPrintPick(null);
      setTimeout(() => printTable(ms), 60);
    },
    style: {
      ...subBtn,
      background: printPick.length ? GOLD : '#2a3144',
      color: printPick.length ? ON_GOLD : SUB,
      border: 'none',
      fontWeight: 700,
      cursor: printPick.length ? 'pointer' : 'default'
    }
  }, "\uD83D\uDDA8 \u3053\u306E ", fmtNum(printPick.length), " \u30F6\u6708\u3092\u5370\u5237")))), toast && React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 78,
      left: '50%',
      transform: 'translateX(-50%)',
      background: toast.bad ? '#b3261e' : '#222b3f',
      color: toast.bad ? '#fff' : NAVY,
      border: toast.bad ? 'none' : `1px solid ${GOLD}66`,
      padding: '9px 18px',
      borderRadius: 20,
      fontSize: 13,
      zIndex: 20,
      maxWidth: '92vw',
      textAlign: 'center',
      lineHeight: 1.5,
      boxShadow: '0 4px 14px rgba(0,0,0,.22)'
    }
  }, toast.m));
}
function NotConfigured() {
  return React.createElement("div", {
    style: {
      maxWidth: 520,
      margin: '0 auto',
      padding: '60px 20px',
      lineHeight: 1.9
    }
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: GOLD,
      marginBottom: 12
    }
  }, "\u63A5\u7D9A\u5148\u304C\u307E\u3060\u8A2D\u5B9A\u3055\u308C\u3068\u3089\u3093"), React.createElement("div", {
    style: {
      fontSize: 14,
      color: SUBTXT
    }
  }, React.createElement("b", null, "config.js"), " \u306B\u3001Supabase \u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u306E ", React.createElement("b", null, "Project URL"), " \u3068 ", React.createElement("b", null, "anon \u30AD\u30FC"), " \u3092\u66F8\u3044\u3066\u306D\u3002", React.createElement("br", null), "\uFF08Supabase \u2192 Project Settings \u2192 API \u306B\u51FA\u3068\u308B\u3002\u624B\u9806\u306F README \u306E\u300C\u624B\u98060\u300D\uFF09"));
}
function LoginScreen() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const {
        error
      } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password: pw
      });
      if (error) setErr(/invalid/i.test(error.message) ? 'メールアドレスかパスワードが違うっちゃ' : 'ログインできんかった：' + error.message);
    } catch (e2) {
      setErr('通信に失敗した。電波を確認してね');
    }
    setBusy(false);
  };
  return React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }
  }, React.createElement("form", {
    onSubmit: go,
    style: {
      width: '100%',
      maxWidth: 380,
      background: PANEL,
      border: `1px solid ${GOLD}55`,
      borderRadius: 16,
      padding: '28px 22px',
      boxShadow: '0 10px 30px rgba(0,0,0,.45)'
    }
  }, React.createElement("div", {
    style: {
      textAlign: 'center',
      marginBottom: 20
    }
  }, React.createElement("img", {
    src: "icons/icon-192.png",
    alt: "",
    style: {
      width: 64,
      height: 64,
      borderRadius: 14
    }
  }), React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      marginTop: 10,
      color: GOLD
    }
  }, "\u91D1\u6D88\u4E88\u5B9A\u65E5 \u4E00\u89A7"), React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: SUB,
      marginTop: 4
    }
  }, "AXIA JAPAN \uFF0F \u4ED5\u5165\u308C\u4E8B\u696D\u90E8")), React.createElement("label", {
    style: {
      fontSize: 11.5,
      color: SUB
    }
  }, "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9"), React.createElement("input", {
    type: "email",
    autoComplete: "username",
    required: true,
    value: email,
    onChange: e => setEmail(e.target.value),
    style: {
      ...inp,
      marginBottom: 12,
      marginTop: 4
    }
  }), React.createElement("label", {
    style: {
      fontSize: 11.5,
      color: SUB
    }
  }, "\u30D1\u30B9\u30EF\u30FC\u30C9"), React.createElement("input", {
    type: "password",
    autoComplete: "current-password",
    required: true,
    value: pw,
    onChange: e => setPw(e.target.value),
    style: {
      ...inp,
      marginBottom: 14,
      marginTop: 4
    }
  }), !!err && React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: '#ff9a92',
      background: '#2e1b1c',
      border: '1px solid #6b2f2b',
      borderRadius: 8,
      padding: '8px 10px',
      marginBottom: 12,
      lineHeight: 1.5
    }
  }, err), React.createElement("button", {
    type: "submit",
    disabled: busy,
    style: {
      width: '100%',
      padding: 14,
      background: `linear-gradient(180deg,#e3c577,${GOLD})`,
      color: ON_GOLD,
      border: 'none',
      borderRadius: 12,
      fontSize: 15,
      fontWeight: 700,
      cursor: busy ? 'default' : 'pointer',
      opacity: busy ? .6 : 1
    }
  }, busy ? 'ログイン中…' : 'ログイン')));
}
function Root() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    sb.auth.getSession().then(({
      data
    }) => setSession(data.session || null));
    const {
      data
    } = sb.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return React.createElement("div", {
    style: {
      textAlign: 'center',
      color: SUB,
      fontSize: 13,
      padding: '80px 0'
    }
  }, "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026");
  if (!session) return React.createElement(LoginScreen, null);
  return React.createElement(App, {
    key: session.user.id,
    email: session.user.email,
    onLogout: () => sb.auth.signOut()
  });
}
ReactDOM.createRoot(document.getElementById('root')).render(CONFIGURED ? React.createElement(Root, null) : React.createElement(NotConfigured, null));